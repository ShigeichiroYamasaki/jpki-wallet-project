import { createServer } from 'node:http'
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { readFile, mkdir, chmod } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { spawn } from 'node:child_process'
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server'
import { getAddress, isAddress, verifyMessage, verifyTypedData } from 'viem'
import { createSiweMessage } from 'viem/siwe'
import { issuer, canonical, operationTypedData, verifyBundle } from './evidence.mjs'
import { verifyMockJpki } from '../scaffold/mock-jpki.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const token = () => randomBytes(32).toString('base64url')
const hash = x => createHash('sha256').update(x).digest('hex')
const equal = (a,b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a),Buffer.from(b))
class Failure extends Error { constructor(code,status=400) { super(code); this.status=status } }

export async function nativeCard(operation, input) {
  return new Promise(resolve => {
    const child = spawn(join(here,'.venv/bin/python'), ['-W','ignore::DeprecationWarning',join(here,'native/card.py'),operation], { stdio: ['pipe','pipe','ignore'] })
    let output='', done=false
    const finish=result=>{ if(done)return;done=true;clearTimeout(timer);resolve(result) }
    const timer=setTimeout(()=>{child.kill('SIGTERM');finish({code:'TIMEOUT'})}, operation==='sign'?120000:10000)
    child.stdout.on('data',chunk=>{output+=chunk; if(output.length>16384){child.kill();finish({code:'LOCAL_HELPER_FAILED'})}})
    child.on('error',()=>finish({code:'LOCAL_HELPER_UNAVAILABLE'}))
    child.on('close',()=>{try{finish(JSON.parse(output))}catch{finish({code:'LOCAL_HELPER_FAILED'})}})
    child.stdin.on('error',()=>{})
    child.stdin.end(input ? JSON.stringify(input):'')
  })
}

export async function createApp({port=18080,dataDir=join(here,'.local'),card=nativeCard,now=Date.now}={}) {
  process.umask(0o077)
  await mkdir(dataDir,{recursive:true,mode:0o700})
  await chmod(dataDir,0o700)
  const db=new DatabaseSync(join(dataDir,'prototype.sqlite'))
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS credentials(id TEXT PRIMARY KEY,public_key TEXT NOT NULL,counter INTEGER NOT NULL,device_type TEXT NOT NULL,backed_up INTEGER NOT NULL,transports TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,kind TEXT NOT NULL,result TEXT NOT NULL,created_at TEXT NOT NULL);`)
  if (!db.prepare('SELECT value FROM settings WHERE key=?').get('userID')) db.prepare('INSERT INTO settings VALUES(?,?)').run('userID',token())
  db.exec('CREATE TABLE IF NOT EXISTS operations(id TEXT PRIMARY KEY,bundle TEXT NOT NULL,created_at TEXT NOT NULL)')
  const testIssuer=issuer(db)
  const userID=Buffer.from(db.prepare('SELECT value FROM settings WHERE key=?').get('userID').value,'base64url')
  const sessions=new Map()
  let nativeBusy=false
  const origin=`http://localhost:${port}`
  const rows=()=>db.prepare('SELECT * FROM credentials').all()
  const event=(kind,result)=>db.prepare('INSERT INTO events(kind,result,created_at) VALUES(?,?,?)').run(kind,result,new Date(now()).toISOString())
  const consume=(session,type)=>{
    const pending=session.pending;delete session.pending
    if(!pending || pending.type!==type)throw new Failure('CHALLENGE_NOT_FOUND',409)
    if(pending.expires<=now())throw new Failure('CHALLENGE_EXPIRED',410)
    return pending
  }
  const assertAuth=session=>{if(!session.authAt || now()-session.authAt>300000)throw new Failure('PASSKEY_AUTH_REQUIRED',401)}
  const cleanup=setInterval(()=>{
    for(const [id,s] of sessions)if(s.expires<=now())sessions.delete(id)
    db.prepare('DELETE FROM events WHERE created_at < ?').run(new Date(now()-30*86400000).toISOString())
    db.prepare('DELETE FROM operations WHERE created_at < ?').run(new Date(now()-30*86400000).toISOString())
  },60000).unref()
  const server=createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store')
    res.setHeader('X-Content-Type-Options','nosniff')
    res.setHeader('Referrer-Policy','no-referrer')
    res.setHeader('X-Frame-Options','DENY')
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
    const send=(status,data)=>{if(res.writableEnded)return;res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data))}
    try {
      if(req.headers.host!==`localhost:${port}`)throw new Failure('LOCALHOST_REQUIRED',403)
      if(req.headers['sec-fetch-site'] && !['none','same-origin'].includes(req.headers['sec-fetch-site']))throw new Failure('CROSS_SITE_REJECTED',403)
      const path=new URL(req.url,origin).pathname
      const assets={'/':'index.html','/app/':'index.html','/app/app.js':'app.js','/app/style.css':'style.css'}
      if(req.method==='GET' && (assets[path] || path==='/app/webauthn.js')) {
        const file=path==='/app/webauthn.js'?join(here,'node_modules/@simplewebauthn/browser/dist/bundle/index.umd.min.js'):join(here,'public',assets[path])
        const body=await readFile(file)
        res.writeHead(200,{'Content-Type':path.endsWith('.js')?'text/javascript; charset=utf-8':path.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8'});res.end(body);return
      }
      if(path==='/healthz' && req.method==='GET'){send(200,{status:'alive',mode:'local-mac',provider:'mock'});return}
      const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('jw_local='))?.slice(9)
      let session=cookie && sessions.get(hash(cookie))
      if(session?.expires<=now()){sessions.delete(hash(cookie));session=undefined}
      if(path==='/api/bootstrap' && req.method==='GET') {
        if(!session){
          if(sessions.size>=100)throw new Failure('TOO_MANY_SESSIONS',429)
          const secret=token();session={csrf:token(),expires:now()+600000,authAt:0,count:0,window:now()};sessions.set(hash(secret),session)
          res.setHeader('Set-Cookie',`jw_local=${secret}; HttpOnly; SameSite=Strict; Path=/; Max-Age=600`)
        }
        send(200,{csrf:session.csrf,origin,rpID:'localhost',credentialCount:rows().length,authenticated:!!session.authAt && now()-session.authAt<300000,provider:'mock',mode:'local-mac',sessionExpiresAt:session.expires});return
      }
      if(!path.startsWith('/api/'))throw new Failure('NOT_FOUND',404)
      if(!session)throw new Failure('SESSION_EXPIRED',401)
      if(req.method!=='POST')throw new Failure('METHOD_NOT_ALLOWED',405)
      if(req.headers.origin!==origin || !equal(req.headers['x-csrf-token'],session.csrf))throw new Failure('ORIGIN_OR_CSRF_REJECTED',403)
      if(now()-session.window>60000){session.window=now();session.count=0}
      if(++session.count>60)throw new Failure('RATE_LIMITED',429)
      if(!(req.headers['content-type']||'').startsWith('application/json'))throw new Failure('JSON_REQUIRED',415)
      let chunks=[],size=0
      for await(const chunk of req){size+=chunk.length;if(size>32768)throw new Failure('BODY_TOO_LARGE',413);chunks.push(chunk)}
      let input
      try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw new Failure('INVALID_JSON')}
      if(!input || typeof input!=='object' || Array.isArray(input))throw new Failure('INVALID_INPUT')
      const empty=()=>{if(Object.keys(input).length)throw new Failure('UNEXPECTED_FIELDS')}
      if(path==='/api/passkeys/register/options') {
        empty();const creds=rows();if(creds.length){assertAuth(session)}
        if(creds.length>=5)throw new Failure('CREDENTIAL_LIMIT',409)
        const options=await generateRegistrationOptions({rpName:'JPKI Wallet Mac Prototype',rpID:'localhost',userName:'mac-local-test',userDisplayName:'このMacの試験用パスキー',userID,attestationType:'none',timeout:120000,supportedAlgorithmIDs:[-7],preferredAuthenticatorType:'localDevice',authenticatorSelection:{authenticatorAttachment:'platform',residentKey:'required',userVerification:'required'},excludeCredentials:creds.map(c=>({id:c.id,transports:JSON.parse(c.transports)}))})
        session.pending={type:'register',challenge:options.challenge,expires:now()+120000,initialCount:creds.length}
        send(200,options);return
      }
      if(path==='/api/passkeys/register/verify') {
        const pending=consume(session,'register')
        if(rows().length)assertAuth(session)
        let result
        try{result=await verifyRegistrationResponse({response:input,expectedChallenge:pending.challenge,expectedOrigin:origin,expectedRPID:'localhost',requireUserVerification:true,supportedAlgorithmIDs:[-7]})}catch{throw new Failure('REGISTRATION_REJECTED',422)}
        if(!result.verified || !result.registrationInfo.userVerified)throw new Failure('REGISTRATION_REJECTED',422)
        const c=result.registrationInfo.credential
        db.prepare('INSERT INTO credentials VALUES(?,?,?,?,?,?,?)').run(c.id,Buffer.from(c.publicKey).toString('base64url'),c.counter,result.registrationInfo.credentialDeviceType,Number(result.registrationInfo.credentialBackedUp),JSON.stringify(c.transports||[]),new Date(now()).toISOString())
        event('passkey_registration','verified')
        // Registration is not counted as a successful subsequent authentication.
        send(200,{verified:true,userVerified:true,credentialCount:rows().length,next:'authenticate',biometricMethod:'not_disclosed'});return
      }
      if(path==='/api/passkeys/auth/options') {
        empty();if(!rows().length)throw new Failure('NO_REGISTERED_PASSKEY',409)
        const options=await generateAuthenticationOptions({rpID:'localhost',timeout:120000,userVerification:'required',allowCredentials:rows().map(c=>({id:c.id,transports:JSON.parse(c.transports)}))})
        options.hints=['client-device']
        session.pending={type:'auth',challenge:options.challenge,expires:now()+120000}
        send(200,options);return
      }
      if(path==='/api/passkeys/auth/verify') {
        const pending=consume(session,'auth')
        const c=typeof input.id==='string' && db.prepare('SELECT * FROM credentials WHERE id=?').get(input.id)
        if(!c)throw new Failure('UNKNOWN_CREDENTIAL',422)
        if(input.response?.userHandle && !equal(input.response.userHandle,userID.toString('base64url')))throw new Failure('USER_HANDLE_REJECTED',422)
        let result
        try{result=await verifyAuthenticationResponse({response:input,expectedChallenge:pending.challenge,expectedOrigin:origin,expectedRPID:'localhost',requireUserVerification:true,credential:{id:c.id,publicKey:Buffer.from(c.public_key,'base64url'),counter:c.counter,transports:JSON.parse(c.transports)}})}catch{throw new Failure('AUTHENTICATION_REJECTED',422)}
        if(!result.verified || !result.authenticationInfo.userVerified)throw new Failure('AUTHENTICATION_REJECTED',422)
        db.prepare('UPDATE credentials SET counter=?,device_type=?,backed_up=? WHERE id=?').run(result.authenticationInfo.newCounter,result.authenticationInfo.credentialDeviceType,Number(result.authenticationInfo.credentialBackedUp),c.id)
        session.authAt=now();session.credentialId=c.id
        const receipt={verified:true,userVerified:true,origin,rpID:'localhost',verifiedAt:new Date(now()).toISOString(),credentialDeviceType:result.authenticationInfo.credentialDeviceType,biometricMethod:'not_disclosed',signatureVerified:true}
        session.lastAuthentication=receipt;event('passkey_authentication','verified');send(200,receipt);return
      }
      if(path==='/api/card/probe') {
        empty();if(nativeBusy)throw new Failure('CARD_BUSY',409)
        nativeBusy=true
        try{send(200,await card('probe'))}finally{nativeBusy=false}return
      }
      if(path==='/api/card/sign') {
        if(Object.keys(input).length!==1 || input.consent!=='local-test-only')throw new Failure('EXPLICIT_CONSENT_REQUIRED')
        assertAuth(session);if(nativeBusy)throw new Failure('CARD_BUSY',409)
        if(session.lastSignAt && now()-session.lastSignAt<30000)throw new Failure('SIGN_COOLDOWN',429)
        session.lastSignAt=now();nativeBusy=true
        try {
          const result=await card('sign',{requestId:randomBytes(16).toString('hex'),challenge:randomBytes(32).toString('hex'),expiresAt:Math.floor(now()/1000)+115})
          // Only an allowlisted projection crosses the local helper boundary.
          const safe={code:result.code,signatureVerified:result.signatureVerified===true,pfVerified:false,certificateValidity:'not_checked',scope:'local-test-only'}
          send(200,safe)
        } finally{nativeBusy=false}return
      }
      if(path==='/api/mock/verify') {
        assertAuth(session)
        if(Object.keys(input).some(k=>!['scenario','person'].includes(k)))throw new Failure('UNEXPECTED_FIELDS')
        const intent={version:1,provider:'mock',person:input.person,credentialHash:hash(session.credentialId),nonce:token()}
        let result
        try{result=verifyMockJpki({...input,intentHash:hash(JSON.stringify(intent))})}catch{throw new Failure('INVALID_MOCK_INPUT')}
        session.lastMock={...result,credentialHash:hash(session.credentialId)};delete session.wallet;delete session.walletPending;delete session.operation;delete session.bundle
        send(200,result);return
      }
      if(path==='/api/wallet/options') {
        assertAuth(session)
        if(session.lastMock?.outcome!=='verified' || session.lastMock.credentialHash!==hash(session.credentialId))throw new Failure('MOCK_IDENTITY_REQUIRED',409)
        if(Object.keys(input).some(k=>!['address','chainId'].includes(k)) || !isAddress(input.address||'') || !Number.isSafeInteger(input.chainId) || input.chainId<1)throw new Failure('INVALID_WALLET')
        const address=getAddress(input.address)
        const binding={version:1,scope:'simulation-only',subject:session.lastMock.mockSubjectId,credentialHash:hash(session.credentialId),wallet:address,chainId:input.chainId,origin,nonce:randomBytes(16).toString('hex')}
        const bindingHash=hash(canonical(binding)),expires=now()+120000
        const message=createSiweMessage({domain:`localhost:${port}`,address,statement:'Simulation only. No real rights or funds are transferred.',uri:origin+'/app/',version:'1',chainId:input.chainId,nonce:binding.nonce,issuedAt:new Date(now()),expirationTime:new Date(expires),resources:['urn:jw:binding:'+bindingHash]})
        session.walletPending={binding,bindingHash,message,expires};delete session.wallet;delete session.operation
        send(200,{message,address});return
      }
      if(path==='/api/wallet/verify') {
        assertAuth(session);const pending=session.walletPending;delete session.walletPending
        if(!pending || pending.expires<=now())throw new Failure('WALLET_CHALLENGE_EXPIRED',410)
        if(Object.keys(input).length!==1 || typeof input.signature!=='string')throw new Failure('INVALID_WALLET_SIGNATURE')
        let ok=false;try{ok=await verifyMessage({address:pending.binding.wallet,message:pending.message,signature:input.signature})}catch{}
        if(!ok)throw new Failure('WALLET_SIGNATURE_REJECTED',422)
        session.wallet={address:pending.binding.wallet,chainId:pending.binding.chainId,binding:pending.binding,bindingHash:pending.bindingHash,siweMessage:pending.message,siweSignature:input.signature}
        send(200,{verified:true,address:session.wallet.address,scope:'simulation-only'});return
      }
      if(path==='/api/operation/options') {
        empty();assertAuth(session)
        if(!session.wallet || session.lastMock?.outcome!=='verified' || session.lastMock.credentialHash!==hash(session.credentialId) || session.wallet.binding.subject!==session.lastMock.mockSubjectId || session.wallet.binding.credentialHash!==hash(session.credentialId))throw new Failure('WALLET_BINDING_REQUIRED',409)
        const intent={version:1,scope:'simulation-only',operationId:randomBytes(16).toString('hex'),subject:session.lastMock.mockSubjectId,credentialHash:hash(session.credentialId),bindingHash:session.wallet.bindingHash,workId:'mock:demo-track-001',action:'approve-demo-license',counterparty:'mock:listener',terms:'test-only-no-legal-license',wallet:session.wallet.address,chainId:session.wallet.chainId,nonce:'0x'+randomBytes(32).toString('hex'),expiresAt:Math.floor((now()+120000)/1000)}
        const intentHash=hash(canonical(intent)),challenge=Buffer.from('jw-operation-v1:'+intentHash+':'+intent.nonce)
        const c=rows().find(c=>c.id===session.credentialId)
        const options=await generateAuthenticationOptions({rpID:'localhost',challenge,userVerification:'required',timeout:120000,allowCredentials:[{id:c.id,transports:JSON.parse(c.transports)}]})
        session.pending={type:'operation',challenge:options.challenge,expires:intent.expiresAt*1000}
        session.operation={intent,intentHash}
        send(200,{intent,passkeyOptions:options,typedData:operationTypedData(intent)});return
      }
      if(path==='/api/operation/approve') {
        assertAuth(session);const pending=consume(session,'operation'),op=session.operation;delete session.operation
        if(!op || !session.wallet || Object.keys(input).some(k=>!['assertion','walletSignature'].includes(k)))throw new Failure('OPERATION_NOT_FOUND',409)
        const c=rows().find(c=>c.id===session.credentialId)
        if(!c || input.assertion?.id!==c.id)throw new Failure('UNKNOWN_CREDENTIAL',422)
        let auth,ok=false
        try {
          auth=await verifyAuthenticationResponse({response:input.assertion,expectedChallenge:pending.challenge,expectedOrigin:origin,expectedRPID:'localhost',requireUserVerification:true,credential:{id:c.id,publicKey:Buffer.from(c.public_key,'base64url'),counter:c.counter}})
          ok=await verifyTypedData({...operationTypedData(op.intent),address:session.wallet.address,signature:input.walletSignature})
        }catch{throw new Failure('OPERATION_SIGNATURE_REJECTED',422)}
        if(!auth.verified||!auth.authenticationInfo.userVerified||!ok)throw new Failure('OPERATION_SIGNATURE_REJECTED',422)
        if(now()>=op.intent.expiresAt*1000)throw new Failure('CHALLENGE_EXPIRED',410)
        const acceptedAt=new Date(now()).toISOString()
        const mockCredentials=[
          {kind:'identity',subject:op.intent.subject,provider:'mock',isMock:true},
          {kind:'key-binding',subject:op.intent.subject,credentialHash:op.intent.credentialHash,wallet:op.intent.wallet},
          {kind:'rights',subject:op.intent.subject,workId:op.intent.workId,allowedAction:op.intent.action,basis:'synthetic-fixture-only'}
        ].map(claim=>testIssuer.seal({...claim,profile:'jw-mock-credential-v1',scope:'simulation-only',issuedAt:acceptedAt}))
        const payload={scope:'simulation-only',acceptedAt,origin,intent:op.intent,intentHash:op.intentHash,challenge:pending.challenge,identity:session.lastMock,mockCredentials,passkey:{id:c.id,publicKey:c.public_key,previousCounter:c.counter,assertion:input.assertion},wallet:{...session.wallet,operationSignature:input.walletSignature},execution:{status:'SIMULATED_CONFIRMED',simulationRunId:op.intent.operationId}}
        const bundle={format:'jw-mock-evidence-v1',signed:testIssuer.seal(payload)}
        db.exec('BEGIN IMMEDIATE')
        try{
          db.prepare('INSERT INTO operations VALUES(?,?,?)').run(op.intent.operationId,JSON.stringify(bundle),acceptedAt)
          db.prepare('UPDATE credentials SET counter=? WHERE id=?').run(auth.authenticationInfo.newCounter,c.id)
          db.exec('COMMIT')
        }catch(e){db.exec('ROLLBACK');throw e}
        session.bundle=bundle
        send(200,{status:'SIMULATED_CONFIRMED',operationId:op.intent.operationId,verification:await verifyBundle(bundle,testIssuer.publicKey)});return
      }
      if(path==='/api/evidence/export') {
        empty();assertAuth(session);if(!session.bundle)throw new Failure('NO_EVIDENCE',409)
        send(200,{bundle:session.bundle,trustedIssuerPublicKey:testIssuer.publicKey});return
      }
      if(path==='/api/report') {
        empty();assertAuth(session)
        send(200,{version:1,scope:'local-prototype-test-report',authentication:session.lastAuthentication,identity:session.lastMock||{provider:'mock',outcome:'not_tested'},cardEvidenceIncluded:false,rightsGranted:false,legalPresumptionEvaluated:false});return
      }
      if(path==='/api/passkeys/delete') {
        empty();assertAuth(session)
        db.prepare('DELETE FROM credentials WHERE id=?').run(session.credentialId)
        for(const s of sessions.values()){s.authAt=0;delete s.pending;delete s.credentialId;delete s.lastAuthentication;delete s.lastMock;delete s.wallet;delete s.walletPending;delete s.operation;delete s.bundle}
        event('passkey_deletion','deleted');send(200,{deleted:true,credentialCount:rows().length});return
      }
      throw new Failure('NOT_FOUND',404)
    }catch(error){send(error instanceof Failure?error.status:500,{code:error instanceof Failure?error.message:'INTERNAL_ERROR'})}
  })
  server.requestTimeout=150000;server.headersTimeout=10000
  server.on('close',()=>{clearInterval(cleanup);db.close()})
  return {server,origin}
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const {server,origin}=await createApp()
  server.listen(18080,'127.0.0.1',()=>console.log(`JPKI Wallet Mac prototype: ${origin}/app/ (PF=mock)`))
  process.on('SIGINT',()=>server.close(()=>process.exit(0)))
  process.on('SIGTERM',()=>server.close(()=>process.exit(0)))
}

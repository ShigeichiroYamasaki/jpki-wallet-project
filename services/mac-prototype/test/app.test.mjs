import { test } from 'node:test'
import { request } from 'node:http'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateKeyPairSync, randomBytes, createHash, sign } from 'node:crypto'
import { encodeCBOR } from '@levischuck/tiny-cbor'
import { privateKeyToAccount } from 'viem/accounts'
import { verifyBundle } from '../evidence.mjs'
import { createApp } from '../server.mjs'

const sha=x=>createHash('sha256').update(x).digest()
const b64=x=>Buffer.from(x).toString('base64url')
function authenticator(origin) {
  const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'})
  const jwk=publicKey.export({format:'jwk'}),id=randomBytes(32)
  const cose=encodeCBOR(new Map([[1,2],[3,-7],[-1,1],[-2,Buffer.from(jwk.x,'base64url')],[-3,Buffer.from(jwk.y,'base64url')]]))
  function client(challenge,type,atOrigin=origin){return Buffer.from(JSON.stringify({type,challenge,origin:atOrigin,crossOrigin:false}))}
  return {id:b64(id),
    registration(options){const len=Buffer.alloc(2);len.writeUInt16BE(id.length);return {id:b64(id),rawId:b64(id),type:'public-key',authenticatorAttachment:'platform',clientExtensionResults:{},response:{clientDataJSON:b64(client(options.challenge,'webauthn.create')),transports:['internal'],attestationObject:b64(encodeCBOR(new Map([['fmt','none'],['attStmt',new Map()],['authData',Buffer.concat([sha('localhost'),Buffer.from([0x45]),Buffer.alloc(4),Buffer.alloc(16),len,id,cose])]])))}}},
    authentication(options,{uv=true,rp='localhost',atOrigin=origin,counter=1}={}){const n=Buffer.alloc(4);n.writeUInt32BE(counter);const data=Buffer.concat([sha(rp),Buffer.from([uv?5:1]),n]);const c=client(options.challenge,'webauthn.get',atOrigin);return {id:b64(id),rawId:b64(id),type:'public-key',clientExtensionResults:{},response:{clientDataJSON:b64(c),authenticatorData:b64(data),signature:b64(sign('sha256',Buffer.concat([data,sha(c)]),privateKey))}}}
  }
}

test('HTTP + real cryptographic WebAuthn verification with a software test authenticator',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'jw-mac-test-'))
  const port=19387,origin=`http://localhost:${port}`;let clock=Date.now(),signCalls=0
  const {server}=await createApp({port,dataDir:dir,now:()=>clock,card:async(operation)=>{
    if(operation==='sign'){signCalls++;return {code:'LOCAL_SIGNATURE_VERIFIED',signatureVerified:true,pin:'never-export',certificate:'never-export'}}
    return {code:'CARD_ABSENT',readers:[{name:'test-reader',cardPresent:false}],jpkiInstalled:true}
  }})
  await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve))
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true})})
  let cookie,csrf
  async function bootstrap(){const r=await fetch(`${origin}/api/bootstrap`);cookie=r.headers.get('set-cookie').split(';')[0];csrf=(await r.json()).csrf}
  async function post(path,input={},headers={}){const r=await fetch(`${origin}/api/${path}`,{method:'POST',headers:{Cookie:cookie,Origin:origin,'X-CSRF-Token':csrf,'Content-Type':'application/json',...headers},body:JSON.stringify(input)});return {status:r.status,data:await r.json()}}
  await bootstrap()
  await t.test('rejects hostile Origin, missing CSRF, Host rebinding and cross-site reads',async()=>{
    assert.equal((await post('card/probe',{}, {Origin:'https://evil.example'})).status,403)
    assert.equal((await post('card/probe',{}, {'X-CSRF-Token':'wrong'})).status,403)
    assert.equal(await new Promise(resolve=>{const req=request(origin+'/api/bootstrap',{headers:{Host:'evil.example'}},res=>{res.resume();resolve(res.statusCode)});req.end()}),403)
    assert.equal((await fetch(`${origin}/api/bootstrap`,{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403)
  })
  const auth=authenticator(origin)
  await t.test('registration verifies an actual attestation structure, then consumes its challenge',async()=>{
    const options=await post('passkeys/register/options');assert.equal(options.data.authenticatorSelection.userVerification,'required');assert.equal(options.data.authenticatorSelection.authenticatorAttachment,'platform')
    const response=auth.registration(options.data)
    const r=await post('passkeys/register/verify',response);assert.equal(r.status,200);assert.equal(r.data.verified,true)
    assert.equal((await post('passkeys/register/verify',response)).status,409)
    assert.equal((await post('report')).status,401)
  })
  await t.test('rejects missing UV, wrong Origin, wrong RP and invalid signatures',async()=>{
    for(const flags of [{uv:false},{rp:'evil.example'},{atOrigin:'https://evil.example'}, {tamper:true}]){
      const o=await post('passkeys/auth/options');const r=auth.authentication(o.data,flags)
      if(flags.tamper)r.response.signature=b64(randomBytes(70))
      assert.equal((await post('passkeys/auth/verify',r)).status,422)
    }
  })
  await t.test('challenge is bound to the browser session',async()=>{
    const o=await post('passkeys/auth/options');const response=auth.authentication(o.data)
    const saved={cookie,csrf};await bootstrap()
    assert.equal((await post('passkeys/auth/verify',response)).status,409)
    cookie=saved.cookie;csrf=saved.csrf
    const r=await post('passkeys/auth/verify',response);assert.equal(r.data.signatureVerified,true);assert.equal(r.data.userVerified,true)
    assert.equal((await post('passkeys/auth/verify',response)).status,409)
  })
  await t.test('mock identity remains simulation-only and card outputs are projected',async()=>{
    const r=await post('mock/verify',{scenario:'valid',person:'person-a'});assert.equal(r.data.isMock,true)
    assert.equal((await post('mock/verify',{scenario:'valid',person:'person-a',certificate:'real'})).status,400)
    assert.equal((await post('card/sign',{consent:'yes'})).status,400)
    const signed=await post('card/sign',{consent:'local-test-only'});assert.equal(signed.data.pfVerified,false);assert.equal(signed.data.certificate,undefined);assert.equal(signed.data.pin,undefined);assert.equal(signCalls,1)
    const report=await post('report');assert.equal(report.data.cardEvidenceIncluded,false);assert.equal(report.data.rightsGranted,false)
  })
  await t.test('SIWE, dual-signed simulated operation and independent evidence verification',async()=>{
    const wallet=privateKeyToAccount('0x'+randomBytes(32).toString('hex'))
    const options=await post('wallet/options',{address:wallet.address,chainId:31337});assert.equal(options.status,200)
    const signature=await wallet.signMessage({message:options.data.message})
    assert.equal((await post('wallet/verify',{signature})).data.verified,true)
    const op=await post('operation/options');assert.equal(op.status,200)
    const approval={assertion:auth.authentication(op.data.passkeyOptions,{counter:2}),walletSignature:await wallet.signTypedData(op.data.typedData)}
    const result=await post('operation/approve',approval);assert.equal(result.status,200);assert.equal(result.data.verification.verified,true)
    assert.equal((await post('operation/approve',approval)).status,409)
    const exported=(await post('evidence/export')).data
    assert.equal((await verifyBundle(exported.bundle,exported.trustedIssuerPublicKey)).verified,true)
    const tampered=structuredClone(exported.bundle);tampered.signed.payload.intent.workId='real:other'
    assert.equal((await verifyBundle(tampered,exported.trustedIssuerPublicKey)).verified,false)
    assert.equal((await verifyBundle(exported.bundle,'not-a-trusted-key')).verified,false)
  })
  await t.test('expired challenges are refused',async()=>{
    const o=await post('passkeys/auth/options');clock+=121000
    assert.equal((await post('passkeys/auth/verify',auth.authentication(o.data,{counter:3}))).status,410)
  })
  await t.test('delete invalidates authentication; replay after deletion cannot authenticate',async()=>{
    const o=await post('passkeys/auth/options');const response=auth.authentication(o.data,{counter:3});assert.equal((await post('passkeys/auth/verify',response)).status,200)
    assert.equal((await post('passkeys/delete')).data.deleted,true)
    assert.equal((await post('report')).status,401)
    assert.equal((await post('passkeys/auth/options')).status,409)
  })
})

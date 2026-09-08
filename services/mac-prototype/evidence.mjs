import { createHash, generateKeyPairSync, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'
import { verifyAuthenticationResponse } from '@simplewebauthn/server'
import { verifyTypedData, verifyMessage } from 'viem'
import { parseSiweMessage } from 'viem/siwe'

export const digest=x=>createHash('sha256').update(x).digest('hex')
export const canonical=x=>{
  if(x===null||typeof x!=='object')return JSON.stringify(x)
  if(Array.isArray(x))return '['+x.map(canonical).join(',')+']'
  return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}'
}
export function issuer(db){
  let saved=db.prepare('SELECT value FROM settings WHERE key=?').get('issuerPrivateKey')?.value
  if(!saved){saved=generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'});db.prepare('INSERT INTO settings VALUES(?,?)').run('issuerPrivateKey',saved)}
  const privateKey=createPrivateKey(saved),publicKey=createPublicKey(privateKey).export({type:'spki',format:'pem'})
  return {publicKey,seal:payload=>({payload,signature:sign(null,Buffer.from(canonical(payload)),privateKey).toString('base64url')})}
}
export function operationTypedData(intent){return {
  domain:{name:'JPKI Wallet SIMULATION ONLY',version:'1',chainId:intent.chainId,verifyingContract:'0x0000000000000000000000000000000000000000'},
  types:{EIP712Domain:[{name:'name',type:'string'},{name:'version',type:'string'},{name:'chainId',type:'uint256'},{name:'verifyingContract',type:'address'}],SimulationApproval:[{name:'intentHash',type:'bytes32'},{name:'nonce',type:'bytes32'},{name:'expiresAt',type:'uint256'}]},
  primaryType:'SimulationApproval',message:{intentHash:'0x'+digest(canonical(intent)),nonce:intent.nonce,expiresAt:intent.expiresAt}
}}
export async function verifyBundle(bundle,trustedKey){
  const fail=code=>({verified:false,code})
  if(!bundle || !trustedKey || bundle.format!=='jw-mock-evidence-v1')return fail('INVALID_PACKAGE')
  let signatureOK=false
  try{signatureOK=verify(null,Buffer.from(canonical(bundle.signed.payload)),trustedKey,Buffer.from(bundle.signed.signature,'base64url'))}catch{return fail('ISSUER_SIGNATURE_INVALID')}
  if(!signatureOK)return fail('ISSUER_SIGNATURE_INVALID')
  const p=bundle.signed.payload
  if(p.scope!=='simulation-only'||p.identity?.provider!=='mock'||!p.identity.isMock||p.identity.outcome!=='verified'||p.execution?.status!=='SIMULATED_CONFIRMED')return fail('SIMULATION_MARKER_INVALID')
  if(p.intent.action!=='approve-demo-license'||p.intent.workId!=='mock:demo-track-001'||p.intent.subject!==p.identity.mockSubjectId||p.intent.wallet!==p.wallet.address)return fail('INTENT_SCOPE_MISMATCH')
  if(!Number.isFinite(Date.parse(p.acceptedAt)) || Date.parse(p.acceptedAt)>p.intent.expiresAt*1000)return fail('EXPIRED_AT_ACCEPTANCE')
  if(digest(canonical(p.intent))!==p.intentHash || p.challenge!==Buffer.from('jw-operation-v1:'+p.intentHash+':'+p.intent.nonce).toString('base64url'))return fail('INTENT_HASH_MISMATCH')
  let site;try{site=new URL(p.origin)}catch{return fail('INVALID_ORIGIN')}
  if(site.origin!==p.origin || (site.protocol!=='https:'&&!/^http:\/\/localhost:\d+$/.test(p.origin)))return fail('INVALID_ORIGIN')
  if(digest(canonical(p.wallet.binding))!==p.intent.bindingHash || p.wallet.bindingHash!==p.intent.bindingHash || p.wallet.binding.subject!==p.intent.subject || p.wallet.binding.credentialHash!==p.intent.credentialHash || p.wallet.binding.wallet!==p.wallet.address || p.wallet.binding.chainId!==p.intent.chainId)return fail('BINDING_MISMATCH')
  if(p.wallet.binding.appURL&&new URL(p.wallet.binding.appURL).origin!==p.origin)return fail('BINDING_ORIGIN_MISMATCH')
  const siwe=parseSiweMessage(p.wallet.siweMessage)
  if(siwe.address?.toLowerCase()!==p.wallet.address.toLowerCase() || siwe.chainId!==p.intent.chainId || siwe.domain!==new URL(p.origin).host || siwe.uri!==(p.wallet.binding.appURL||p.origin+'/app/') || siwe.nonce!==p.wallet.binding.nonce || !siwe.resources?.includes('urn:jw:binding:'+p.intent.bindingHash))return fail('SIWE_INTENT_MISMATCH')
  if(!Array.isArray(p.mockCredentials)||p.mockCredentials.length!==3)return fail('CREDENTIALS_MISSING')
  for(const credential of p.mockCredentials){
    if(credential.payload.scope!=='simulation-only' || credential.payload.subject!==p.intent.subject || !verify(null,Buffer.from(canonical(credential.payload)),trustedKey,Buffer.from(credential.signature,'base64url')))return fail('MOCK_CREDENTIAL_INVALID')
  }
  const rights=p.mockCredentials.find(c=>c.payload.kind==='rights')?.payload
  if(rights?.workId!==p.intent.workId||rights.allowedAction!==p.intent.action||rights.basis!=='synthetic-fixture-only')return fail('RIGHTS_SCOPE_INVALID')
  const pub=Buffer.from(p.passkey.publicKey,'base64url')
  if(p.identity.credentialHash!==digest(p.passkey.id) || p.intent.credentialHash!==digest(p.passkey.id))return fail('CREDENTIAL_MISMATCH')
  let auth
  try{auth=await verifyAuthenticationResponse({response:p.passkey.assertion,expectedChallenge:p.challenge,expectedOrigin:p.origin,expectedRPID:site.hostname,requireUserVerification:true,credential:{id:p.passkey.id,publicKey:pub,counter:p.passkey.previousCounter}})}catch{return fail('PASSKEY_SIGNATURE_INVALID')}
  if(!auth.verified||!auth.authenticationInfo.userVerified)return fail('PASSKEY_UV_INVALID')
  try{
    if(!await verifyMessage({address:p.wallet.address,message:p.wallet.siweMessage,signature:p.wallet.siweSignature}))return fail('WALLET_BINDING_INVALID')
    if(!await verifyTypedData({...operationTypedData(p.intent),address:p.wallet.address,signature:p.wallet.operationSignature}))return fail('WALLET_OPERATION_INVALID')
  }catch{return fail('WALLET_SIGNATURE_INVALID')}
  return {verified:true,scope:'simulation-only',issuerSignature:true,passkeySignature:true,userVerification:true,walletSignatures:true,execution:'simulated',identity:'mock',historicalValidity:'NPO-test-issuer-assertion-only',legalPresumption:'not_evaluated',realRightsGranted:false}
}

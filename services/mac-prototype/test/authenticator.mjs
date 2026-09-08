import {generateKeyPairSync,randomBytes,createHash,sign} from 'node:crypto'
import {encodeCBOR} from '@levischuck/tiny-cbor'
const sha=x=>createHash('sha256').update(x).digest()
const b64=x=>Buffer.from(x).toString('base64url')
export function authenticator(origin) {
  const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'})
  const jwk=publicKey.export({format:'jwk'}),id=randomBytes(32)
  const cose=encodeCBOR(new Map([[1,2],[3,-7],[-1,1],[-2,Buffer.from(jwk.x,'base64url')],[-3,Buffer.from(jwk.y,'base64url')]]))
  function client(challenge,type,atOrigin=origin){return Buffer.from(JSON.stringify({type,challenge,origin:atOrigin,crossOrigin:false}))}
  return {id:b64(id),
    registration(options){const len=Buffer.alloc(2);len.writeUInt16BE(id.length);return {id:b64(id),rawId:b64(id),type:'public-key',authenticatorAttachment:'platform',clientExtensionResults:{},response:{clientDataJSON:b64(client(options.challenge,'webauthn.create')),transports:['internal'],attestationObject:b64(encodeCBOR(new Map([['fmt','none'],['attStmt',new Map()],['authData',Buffer.concat([sha(new URL(origin).hostname),Buffer.from([0x45]),Buffer.alloc(4),Buffer.alloc(16),len,id,cose])]])))}}},
    authentication(options,{uv=true,rp=new URL(origin).hostname,atOrigin=origin,counter=1}={}){const n=Buffer.alloc(4);n.writeUInt32BE(counter);const data=Buffer.concat([sha(rp),Buffer.from([uv?5:1]),n]);const c=client(options.challenge,'webauthn.get',atOrigin);return {id:b64(id),rawId:b64(id),type:'public-key',clientExtensionResults:{},response:{clientDataJSON:b64(c),authenticatorData:b64(data),signature:b64(sign('sha256',Buffer.concat([data,sha(c)]),privateKey))}}}
  }
}


import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {runInNewContext} from 'node:vm'
const source=await readFile(new URL('../../cloud-prototype/public/app.js',import.meta.url),'utf8')
for(const failure of [false,true])test(`card-first onboarding automatically confirms identity; failure=${failure}`,async()=>{
 const elements=new Map();const el=id=>{if(!elements.has(id))elements.set(id,{dataset:{}});return elements.get(id)}
 let authenticated=false,fail=failure,confirmations=0
 runInNewContext(source,{document:{getElementById:el,documentElement:{dataset:{}}},window:{PublicKeyCredential:class{},isSecureContext:true},URL,
  SimpleWebAuthnBrowser:{startRegistration:async()=>({}),startAuthentication:async()=>({})},
  fetch:async path=>{
   let data={},status=200
   if(path==='/api/passkeys/auth/verify')authenticated=true
   if(path==='/api/bootstrap')data={csrf:'test',authenticated}
   if(path==='/api/mock/verify'){confirmations++;if(fail){status=503;data={code:'STATE_STORAGE_UNAVAILABLE'}}else data={outcome:'verified'}}
   return {ok:status===200,status,json:async()=>data}
  }
 })
 await new Promise(r=>setImmediate(r))
 assert.equal(el('register').disabled,true);assert.match(el('wallet-help').textContent,/仮想カード/)
 el('card-place').onclick();await el('card-read').onclick()
 assert.equal(el('register').disabled,false);assert.equal(el('wallet').disabled,true)
 await el('register').onclick();assert.equal(el('wallet').disabled,true);assert.match(el('wallet-help').textContent,/ログイン/)
 await el('login').onclick();assert.equal(confirmations,1)
 if(failure){assert.equal(el('wallet').disabled,true);assert.equal(el('identity').hidden,false);assert.match(el('wallet-help').textContent,/再試行/);fail=false;await el('identity').onclick()}
 assert.equal(el('wallet').disabled,false);assert.equal(el('identity').hidden,true)
})

import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {runInNewContext} from 'node:vm'
const code=await readFile(new URL('../../cloud-prototype/public/app.js',import.meta.url),'utf8')
test('mobile SDK connects without injected provider; signature requires separate click',async()=>{
 const nodes=new Map();const el=id=>{if(!nodes.has(id))nodes.set(id,{dataset:{}});return nodes.get(id)}
 const requests=[],events={},provider={on:(event,fn)=>events[event]=fn,request:async args=>{requests.push(args);return '0xsigned'}}
 const posts=[]
 const replies={'/api/bootstrap':{csrf:'test',authenticated:true},'/api/mock/verify':{outcome:'verified'},'/api/wallet/options':{message:'trial',address:'0x0000000000000000000000000000000000000001'},'/api/wallet/verify':{verified:true}}
 const context={document:{getElementById:el,documentElement:{dataset:{}}},window:{PublicKeyCredential:class{},isSecureContext:true,JWWallet:{prepare:async()=>{},connect:async()=>({provider,accounts:['0x0000000000000000000000000000000000000001'],chainId:'0x1'})}},fetch:async(path,options)=>{posts.push(path);return {ok:true,status:200,json:async()=>replies[path]}},URL,TextEncoder}
 runInNewContext(code,context);await new Promise(r=>setImmediate(r))
 el('card-place').onclick();await el('card-read').onclick();assert.equal(el('wallet').disabled,false);assert.equal(posts.filter(p=>p==='/api/mock/verify').length,1)
 await el('wallet').onclick();assert.equal(requests.length,0);assert.equal(el('wallet-sign').disabled,false);assert.equal(el('operation').disabled,true)
 await el('wallet-sign').onclick();assert.equal(requests[0].method,'personal_sign');assert.equal(el('operation').disabled,false);assert.ok(posts.includes('/api/wallet/verify'))
 events.accountsChanged();assert.equal(el('operation').disabled,true);assert.equal(el('wallet-sign').disabled,true)
})

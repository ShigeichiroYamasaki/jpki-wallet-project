import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {runInNewContext} from 'node:vm'
test('virtual card works without API and cannot enable identity or wallet',async()=>{
 const nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,{dataset:{}});return nodes.get(id)}
 let requests=0
 runInNewContext(await readFile(new URL('../../cloud-prototype/public/app.js',import.meta.url),'utf8'),{
 document:{getElementById:get,documentElement:{dataset:{hosting:'github-pages'}}},window:{},fetch:async()=>{requests++;return {ok:true,json:async()=>({apiOrigin:''})}},URL
 })
 await new Promise(resolve=>setImmediate(resolve))
 assert.match(get('status').textContent,/準備中/)
 assert.equal(get('card-place').disabled,false)
 assert.equal(get('card-read').disabled,true)
 get('card-place').onclick();assert.equal(get('card-read').disabled,false)
 await get('card-read').onclick();assert.match(get('card-progress').textContent,/仮想読み取り完了/)
 assert.equal(get('identity').disabled,true);assert.equal(get('wallet').disabled,true)
 assert.equal(requests,1)
})

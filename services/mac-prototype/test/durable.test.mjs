import {test} from 'node:test'
import assert from 'node:assert/strict'
import {request} from 'node:http'
import {durableServer} from '../../cloud-prototype/durable.mjs'
import {authenticator} from './authenticator.mjs'
const origin='https://shigeichiroyamasaki.github.io',apiOrigin='https://api.example.test',apiHost=new URL(apiOrigin).host
test('durable state survives server replacement; failed writes never report success',async t=>{
 let state=null,generation=0,fail=false
 const store={load:async()=>({state:structuredClone(state),generation}),save:async(s,g)=>{if(fail||g!==generation){const e=new Error();e.code='CONFLICT';throw e}state=structuredClone(s);generation++}}
 let server,base
 async function start(){server=durableServer({store,origin,apiOrigin});await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port}
 await start();t.after(()=>new Promise(r=>server.close(r)))
 async function call(path,{method='GET',headers={},body}={}){return new Promise((resolve,reject)=>{const req=request(base+path,{method,headers:{Host:apiHost,...headers}},res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,data:JSON.parse(text)}))});req.on('error',reject);req.end(body)})}
 async function get(){return (await call('/api/bootstrap',{headers:{Origin:origin}})).data}
 let session=await get()
 async function post(path,input={}){return call('/api/'+path,{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+session.sessionToken,'X-CSRF-Token':session.csrf,'Content-Type':'application/json'},body:JSON.stringify(input)})}
 const a=authenticator(origin);const o=await post('passkeys/register/options')
 const registration=await post('passkeys/register/verify',a.registration(o.data));assert.equal(registration.status,200,JSON.stringify(registration.data))
 await new Promise(r=>server.close(r));await start()
 const login=await post('passkeys/auth/options');assert.equal((await post('passkeys/auth/verify',a.authentication(login.data))).status,200)
 assert.equal((await post('mock/verify',{person:'person-a',scenario:'valid'})).status,200)
 fail=true;assert.equal((await post('passkeys/delete')).status,409);fail=false
 assert.equal((await post('report')).status,200)
 const forbidden=await call('/api/bootstrap',{headers:{Origin:'https://evil.example'}});assert.equal(forbidden.status,403)
 const wrongHost=await call('/api/bootstrap',{headers:{Host:'evil.example',Origin:origin}});assert.equal(wrongHost.status,403)
 const oversized=await call('/api/mock/verify',{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+session.sessionToken,'X-CSRF-Token':session.csrf,'Content-Type':'application/json'},body:JSON.stringify({padding:'x'.repeat(33000)})});assert.equal(oversized.status,413)
 assert.equal((await post('card/probe')).status,404)
})

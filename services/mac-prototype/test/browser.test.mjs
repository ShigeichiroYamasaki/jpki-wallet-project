import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {runInNewContext} from 'node:vm'
const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8')
async function boot({supported=true,platform=true,count=0,authenticated=false,bootstrapOK=true,missingProbe=false}={}){
 const elements=new Map()
 const get=id=>{if(!elements.has(id))elements.set(id,{replaceChildren(){}});return elements.get(id)}
 const PK=missingProbe?{}:{isUserVerifyingPlatformAuthenticatorAvailable:async()=>platform}
 const context={document:{getElementById:get},window:{PublicKeyCredential:supported?PK:undefined,isSecureContext:true},PublicKeyCredential:PK,fetch:async path=>({ok:bootstrapOK,json:async()=>path==='/api/bootstrap'?{credentialCount:count,authenticated,csrf:'test',origin:'http://localhost:18080'}:{readers:[],code:'READER_NOT_FOUND'}})}
 runInNewContext(source,context)
 await new Promise(resolve=>setImmediate(resolve))
 return get
}
test('unsupported browser explains disabled registration',async()=>{const el=await boot({supported:false});assert.equal(el('register').disabled,true);assert.match(el('registration-help').textContent,/SafariまたはChrome/);assert.equal(el('registration-help').hidden,false)})
test('undetected platform authenticator gives actionable explanation',async()=>{const el=await boot({platform:false});assert.equal(el('register').disabled,true);assert.match(el('registration-help').textContent,/端末内の認証器を検出できない/)})
test('missing capability method does not abort bootstrap',async()=>{const el=await boot({missingProbe:true});assert.equal(el('register').disabled,true);assert.equal(el('origin').textContent,'http://localhost:18080')})
test('ready browser allows initial registration',async()=>{const el=await boot();assert.equal(el('register').disabled,false);assert.equal(el('registration-help').hidden,true)})
test('additional registration requires authentication and explains it',async()=>{const el=await boot({count:1});assert.equal(el('register').disabled,true);assert.equal(el('authenticate').disabled,false);assert.match(el('registration-help').textContent,/追加登録/);const authenticated=await boot({count:1,authenticated:true});assert.equal(authenticated('register').disabled,false)})
test('failed bootstrap cannot enable registration',async()=>{const el=await boot({bootstrapOK:false});assert.equal(el('register').disabled,true);assert.match(el('global').textContent,/接続できません/)})

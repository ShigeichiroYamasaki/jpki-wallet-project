import {createServer,request} from 'node:http'
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createApp} from '../mac-prototype/server.mjs'

// Every request works on a private snapshot. A response is released only after
// conditional persistence succeeds; concurrent revisions cannot overwrite state.
export function durableServer({store,origin,apiOrigin,appPath='/jpki-wallet-project/prototype/'}){
 return createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store')
  res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin')
  const fail=(status,code)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify({code}))}
  if(req.url==='/healthz'&&req.method==='GET'){res.end('{"status":"alive","provider":"mock"}');return}
  if(req.headers.origin!==origin)return fail(403,'ORIGIN_REJECTED')
  if(!req.url?.startsWith('/api/'))return fail(404,'NOT_FOUND')
  if(!['GET','POST','OPTIONS'].includes(req.method))return fail(405,'METHOD_NOT_ALLOWED')
  let dir,app
  try{
   let size=0;const chunks=[]
   for await(const chunk of req){size+=chunk.length;if(size>32768)return fail(413,'BODY_TOO_LARGE');chunks.push(chunk)}
   const current=await store.load()
   dir=await mkdtemp(join(tmpdir(),'jw-request-'))
   if(current.state?.database)await writeFile(join(dir,'prototype.sqlite'),Buffer.from(current.state.database,'base64'),{mode:0o600})
   app=await createApp({dataDir:dir,cloudOrigin:origin,apiOrigin,appPath,initialSessions:current.state?.sessions||[]})
   await new Promise((resolve,reject)=>{app.server.once('error',reject);app.server.listen(0,'127.0.0.1',resolve)})
   const response=await new Promise((resolve,reject)=>{
    const headers={...req.headers,host:new URL(apiOrigin).host};delete headers.connection;delete headers['transfer-encoding'];headers['content-length']=String(size)
    const outgoing=request({hostname:'127.0.0.1',port:app.server.address().port,path:req.url,method:req.method,headers},incoming=>{
     const pieces=[];incoming.on('data',c=>pieces.push(c));incoming.on('end',()=>resolve({status:incoming.statusCode,headers:incoming.headers,body:Buffer.concat(pieces)}))
    });outgoing.on('error',reject);outgoing.end(Buffer.concat(chunks))
   })
   const sessions=app.sessionSnapshot()
   await new Promise(resolve=>app.server.close(resolve));app=null
   if(req.method!=='OPTIONS'){
    const database=(await readFile(join(dir,'prototype.sqlite'))).toString('base64')
    await store.save({database,sessions},current.generation)
   }
   delete response.headers.connection;delete response.headers['transfer-encoding']
   res.writeHead(response.status,response.headers);res.end(response.body)
  }catch(error){fail(error.code==='CONFLICT'?409:503,error.code==='CONFLICT'?'STATE_CONFLICT':'STATE_STORAGE_UNAVAILABLE')}
  finally{if(app)await new Promise(resolve=>app.server.close(resolve));if(dir)await rm(dir,{recursive:true,force:true})}
 })
}

export function gcsStore(bucket){
 let cachedToken,expires=0
 async function headers(){if(Date.now()>expires){const r=await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',{headers:{'Metadata-Flavor':'Google'},signal:AbortSignal.timeout(5000)});if(!r.ok)throw new Error('METADATA');const data=await r.json();cachedToken=data.access_token;expires=Date.now()+(data.expires_in-60)*1000}return {Authorization:'Bearer '+cachedToken}}
 const object='prototype-state.json'
 const base=`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${object}`
 return {
  async load(){
   const auth=await headers();const r=await fetch(base,{headers:auth,signal:AbortSignal.timeout(10000)})
   if(r.status===404)return {state:null,generation:'0'}
   if(!r.ok)throw new Error('STORAGE_READ');const meta=await r.json()
   const data=await fetch(base+'?alt=media&generation='+meta.generation,{headers:auth,signal:AbortSignal.timeout(10000)})
   if(!data.ok)throw new Error('STORAGE_READ');return {state:await data.json(),generation:meta.generation}
  },
  async save(state,generation){
   const body=JSON.stringify(state);if(Buffer.byteLength(body)>8*1024*1024)throw new Error('STATE_LIMIT')
   const r=await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=media&name=${object}&ifGenerationMatch=${generation}`,{method:'POST',headers:{...await headers(),'Content-Type':'application/json'},body,signal:AbortSignal.timeout(10000)})
   if(r.status===412){const e=new Error('CONFLICT');e.code='CONFLICT';throw e}
   if(!r.ok)throw new Error('STORAGE_WRITE')
  }
 }
}

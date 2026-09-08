import {createApp} from '../mac-prototype/server.mjs'
import {fileURLToPath} from 'node:url'
const origin=process.env.PUBLIC_ORIGIN
if(!origin)throw new Error('Set PUBLIC_ORIGIN to the public HTTPS origin')
const port=Number(process.env.PORT||3000)
const {server}=await createApp({port,cloudOrigin:origin,apiOrigin:process.env.API_ORIGIN,appPath:process.env.APP_PATH||'/app/',dataDir:process.env.DATA_DIR||'/data',publicDir:fileURLToPath(new URL('./public/',import.meta.url))})
server.listen(port,'0.0.0.0',()=>console.log(`Cloud prototype ready: ${origin} (PF=mock)`))
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)))

import {durableServer,gcsStore} from './durable.mjs'
const {PUBLIC_ORIGIN,API_ORIGIN,STATE_BUCKET,PORT='8080'}=process.env
if(!PUBLIC_ORIGIN||!API_ORIGIN||!STATE_BUCKET)throw new Error('Missing deployment settings')
const server=durableServer({store:gcsStore(STATE_BUCKET),origin:PUBLIC_ORIGIN,apiOrigin:API_ORIGIN})
server.requestTimeout=45000;server.headersTimeout=10000
server.listen(Number(PORT),'0.0.0.0')
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)))

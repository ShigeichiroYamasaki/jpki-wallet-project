import { readFile } from 'node:fs/promises'
import { verifyBundle } from './evidence.mjs'
if(process.argv.length!==4){console.error('Usage: node verify-evidence.mjs evidence.json trusted-issuer.pem');process.exit(2)}
try{
  const result=await verifyBundle(JSON.parse(await readFile(process.argv[2],'utf8')),await readFile(process.argv[3],'utf8'))
  console.log(JSON.stringify(result,null,2));process.exitCode=result.verified?0:1
}catch{console.error('INVALID_EVIDENCE_FILE');process.exitCode=1}

import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises'
const out=new URL('../docs/public/prototype/',import.meta.url)
const source=new URL('../services/cloud-prototype/public/',import.meta.url)
const apiOrigin=process.env.JW_API_ORIGIN||''
if(apiOrigin){const u=new URL(apiOrigin);if(u.protocol!=='https:'||u.origin!==apiOrigin)throw new Error('JW_API_ORIGIN must be an HTTPS origin')}
await mkdir(out,{recursive:true})
const html=(await readFile(new URL('index.html',source),'utf8')).replace('<html lang="ja">','<html lang="ja" data-hosting="github-pages">').replaceAll('/app/','./')
await writeFile(new URL('index.html',out),html)
for(const name of ['app.js','style.css'])await copyFile(new URL(name,source),new URL(name,out))
await copyFile(new URL('../services/mac-prototype/node_modules/@simplewebauthn/browser/dist/bundle/index.umd.min.js',import.meta.url),new URL('webauthn.js',out))
await writeFile(new URL('config.json',out),JSON.stringify({apiOrigin})+'\n')

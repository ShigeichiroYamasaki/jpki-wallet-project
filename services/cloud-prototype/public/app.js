let apiBase=''
const authHeaders=()=>session?.sessionToken?{Authorization:'Bearer '+session.sessionToken}:{}
const $=id=>document.getElementById(id)
let cardState='empty'
let selectedProvider,preparedSignature
function clearWallet(){wallet=evidence=false;preparedSignature=undefined;$('address').textContent='';controls()}
let session,busy=false,supported=false,identity=false,wallet=false,evidence=false
function controls(){
 const cardReady=cardState==='read',authenticated=!!session?.authenticated
 $('card-place').disabled=busy||cardReady
 $('card-read').disabled=busy||cardState!=='placed'
 for(const [id,ready] of Object.entries({register:cardReady&&supported&&!!session&&!authenticated,login:cardReady&&supported&&!!session,identity:authenticated&&cardReady&&!identity,wallet:authenticated&&identity,'wallet-sign':authenticated&&identity&&!!preparedSignature,operation:authenticated&&wallet,export:authenticated&&evidence}))$(id).disabled=busy||!ready
 $('identity').hidden=!(authenticated&&cardReady&&!identity&&!busy)
 $('passkey-help').textContent=!cardReady?'先に①の仮想カードをセットして読み取ってください。':!session?'認証APIへの接続が完了していません。ページ上部のメッセージを確認してください。':!supported?'このブラウザではパスキーを利用できません。iPhoneではSafariで開いてください。':authenticated?'ログイン済みです。仮想カードの確認結果を登録すると③へ進めます。':'初めての方は登録後に「パスキーでログイン」を押してください。登録済みの方はそのままログインできます。'
 $('wallet-help').textContent=busy?'処理中です。ページ上部の案内を確認してください。':!cardReady?'① 仮想カードの読み取りが必要です。':!authenticated?'② パスキーでのログインが必要です。登録だけでは接続できません。':!identity?'仮想カードの確認結果が未登録です。②の「仮想カードの確認を再試行」を押してください。':wallet?'ウォレット署名の検証が完了しました。':preparedSignature?'接続済みです。「ウォレットで署名」を押してください。':'接続できます。「ウォレットに接続」を押してください。'
}
async function completeIdentity(){
 if(cardState!=='read'||!session?.authenticated)return
 identity=wallet=evidence=false;preparedSignature=undefined
 say('仮想カードの確認結果を登録しています…')
 const result=await api('mock/verify',{person:'person-a',scenario:'valid'})
 identity=result.outcome==='verified'
 if(!identity)throw new Error('仮想カードの確認が完了しませんでした。確認を再試行してください。')
 say('ログインと仮想カードの確認が完了しました。③「ウォレットに接続」へ進んでください。')
}
function say(text){$('status').textContent=text}
async function bootstrap(){const r=await fetch(apiBase+'/api/bootstrap',{headers:authHeaders(),credentials:apiBase?'omit':'same-origin'});if(!r.ok)throw new Error('接続できません。ページを再読み込みしてください。');session=await r.json()}
async function api(path,body={}){const r=await fetch(apiBase+'/api/'+path,{method:'POST',credentials:apiBase?'omit':'same-origin',headers:{...authHeaders(),'Content-Type':'application/json','X-CSRF-Token':session.csrf},body:JSON.stringify(body)});const data=await r.json();if(!r.ok){if(r.status===401){session.authenticated=false;identity=wallet=evidence=false}throw new Error(data.code==='STATE_CONFLICT'?'別の操作と競合しました。もう一度ボタンを押してください。':data.code==='STATE_STORAGE_UNAVAILABLE'?'保存先へ接続できませんでした。少し待ってから再試行してください。':data.code==='SESSION_EXPIRED'?'セッションが終了しました。ページを再読み込みしてログインしてください。':data.code==='PASSKEY_AUTH_REQUIRED'?'もう一度パスキーでログインしてください。':'操作を完了できませんでした：'+data.code)}return data}
async function run(fn){if(busy)return;busy=true;controls();try{await fn()}catch(e){say(e.code===4001?'MetaMaskで操作がキャンセルされました。もう一度接続してください。':e.code===-32002?'MetaMaskに確認待ちの操作があります。アプリを開いて確認してください。':e.name==='NotAllowedError'?'認証が取り消されたか、利用できませんでした。通常のブラウザと端末のパスキー設定を確認してください。':e.message)}finally{busy=false;controls()}}
$('register').onclick=()=>run(async()=>{const options=await api('passkeys/register/options');await api('passkeys/register/verify',await SimpleWebAuthnBrowser.startRegistration({optionsJSON:options}));say('登録できました。「パスキーでログイン」を押してください。')})
$('login').onclick=()=>run(async()=>{identity=wallet=evidence=false;preparedSignature=undefined;const options=await api('passkeys/auth/options');await api('passkeys/auth/verify',await SimpleWebAuthnBrowser.startAuthentication({optionsJSON:options}));await bootstrap();await completeIdentity()})
$('card-place').onclick=()=>{if(busy||identity)return;cardState='placed';$('card-reader').dataset.state='placed';$('card-progress').textContent='仮想カードをセットしました。「仮想カードを読み取る」を押してください。';controls()}
$('card-read').onclick=()=>run(async()=>{if(cardState!=='placed')return;cardState='read';$('card-reader').dataset.state='read';$('card-progress').textContent='仮想読み取り完了：サンプル利用者 A。次は②のパスキー登録・ログインへ進んでください。実カードの読み取りや検証は行っていません。';if(session?.authenticated)await completeIdentity();else say('仮想カードを読み取りました。②のパスキー登録・ログインへ進んでください。')})
$('identity').onclick=()=>run(completeIdentity)
$('wallet').onclick=()=>run(async()=>{
 clearWallet();say('MetaMaskで接続を承認し、Safariのこのタブへ戻ってください。PCではウォレット拡張を確認してください。')
 let connection
 if(window.JWWallet)connection=await window.JWWallet.connect()
 else if(window.ethereum){const provider=window.ethereum;connection={provider,accounts:await provider.request({method:'eth_requestAccounts'}),chainId:await provider.request({method:'eth_chainId'})}}
 else throw new Error('MetaMask接続機能を読み込めませんでした。Safariでページを再読み込みしてください。')
 if(selectedProvider!==connection.provider){selectedProvider=connection.provider;for(const event of ['accountsChanged','chainChanged','disconnect'])selectedProvider.on?.(event,clearWallet)}
 preparedSignature=await api('wallet/options',{address:connection.accounts[0],chainId:Number(connection.chainId)})
 $('address').textContent=preparedSignature.address
 say('接続できました。「ウォレットで署名」を押してください。署名の有効時間は2分です。')
})
$('wallet-sign').onclick=()=>run(async()=>{
 if(!preparedSignature||!selectedProvider)throw new Error('先にウォレットを接続してください。')
 const options=preparedSignature;preparedSignature=undefined
 say('MetaMaskで署名を承認し、Safariのこのタブへ戻ってください。')
 const message='0x'+Array.from(new TextEncoder().encode(options.message),b=>b.toString(16).padStart(2,'0')).join('')
 const signature=await selectedProvider.request({method:'personal_sign',params:[message,options.address]})
 const result=await api('wallet/verify',{signature});wallet=result.verified
 say('ウォレット署名を検証しました。接続の体験が完了しました。')
})
$('operation').onclick=()=>run(async()=>{evidence=false;const options=await api('operation/options');$('result').hidden=false;$('result').textContent=JSON.stringify(options.intent,null,2);if(!confirm('合成作品の許諾試験に署名します。実際の権利移転・送金はありません。続けますか？'))return;const assertion=await SimpleWebAuthnBrowser.startAuthentication({optionsJSON:options.passkeyOptions});const walletSignature=await selectedProvider.request({method:'eth_signTypedData_v4',params:[options.intent.wallet,JSON.stringify(options.typedData)]});const result=await api('operation/approve',{assertion,walletSignature});evidence=result.verification.verified;say(evidence?'両方の署名と模擬操作の証拠を検証しました。':'証拠の検証に失敗しました。')})
function save(text,name){const url=URL.createObjectURL(new Blob([text],{type:'text/plain'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
$('export').onclick=()=>run(async()=>{const result=await api('evidence/export');save(JSON.stringify(result,null,2),'jw-cloud-evidence-with-public-key.json');say('証拠と試験発行者の公開鍵を保存しました。独立検証では発行者の公開鍵を別経路で確認してください。')})
async function init(){if(document.documentElement.dataset.hosting==='github-pages'){const r=await fetch('./config.json');if(!r.ok)throw new Error('接続設定を取得できません。');const config=await r.json();if(!config.apiOrigin)throw new Error('クラウドAPIは準備中です。公開後にこのページから利用できます。');const target=new URL(config.apiOrigin);if(target.protocol!=='https:'||target.origin!==config.apiOrigin)throw new Error('API接続設定が正しくありません。');apiBase=target.origin}supported=!!window.PublicKeyCredential&&window.isSecureContext;await bootstrap();say(supported?'① 仮想カードをセットして読み取ってください。':'このブラウザではパスキーを利用できません。通常の対応ブラウザで開いてください。');controls()}
window.JWWallet?.prepare().catch(()=>{})
init().catch(e=>{say(e.message);controls()})

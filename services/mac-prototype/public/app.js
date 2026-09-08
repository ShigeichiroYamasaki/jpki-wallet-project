const $=id=>document.getElementById(id)
let state, supported=false, platform=false, capabilityChecked=false, busy=false, cardPresent=false, walletBound=false, mockAccepted=false, evidenceReady=false
const messages={SESSION_EXPIRED:'セッションが期限切れです。ページを再読み込みしてください。',PASSKEY_AUTH_REQUIRED:'先にパスキーで認証してください。',NO_REGISTERED_PASSKEY:'先にパスキーを登録してください。',REGISTRATION_REJECTED:'登録応答を検証できませんでした。新しい登録操作からやり直してください。',AUTHENTICATION_REJECTED:'署名・利用者検証を確認できませんでした。新しい認証操作からやり直してください。',READER_NOT_FOUND:'リーダーが見つかりません。USB接続と対応ドライバを確認してください。',CARD_ABSENT:'リーダーは接続されています。カードをセットしてください。',CARD_PRESENT:'カードがセットされています。',PCSC_UNAVAILABLE:'macOSのスマートカードサービスに接続できません。リーダーを接続し、起動スクリプトをMacのターミナルから実行してください。',JPKI_NOT_INSTALLED:'JPKI利用者ソフトが見つかりません。',PIN_REJECTED:'暗証番号が一致しませんでした。自動再試行していません。番号をご確認ください。',PIN_FORMAT_INVALID:'署名用暗証番号は6〜16桁の英数字です。カードへの照合は行っていません。',CARD_LOCKED:'カードの暗証番号がロックされています。',USER_CANCELLED:'操作を取り消しました。',TIMEOUT:'処理が時間切れになりました。',LOCAL_SIGNATURE_VERIFIED:'カードの署名をローカルで検証しました。証明書の有効性・失効は未確認です。',LOCAL_HELPER_UNAVAILABLE:'ローカル処理を起動できません。初回セットアップを実行してください。',LOCAL_HELPER_FAILED:'カード連携処理を完了できませんでした。対応環境をご確認ください。',JPKI_API_FAILED:'JPKI APIが処理を完了できませんでした。ソフトの対応とカードの状態をご確認ください。',SELECT_ONE_CARD:'カードが入ったリーダーを1台にしてください。',UNSUPPORTED_KEY_TYPE:'このカードの鍵方式にはまだ対応していません。',SIGN_COOLDOWN:'連続実行を避けるため、30秒待ってから操作してください。'}
function status(id,text,good=false){$(id).textContent=text;$(id).className='status'+(good?' good':'')}
async function api(path,input={}){
 const r=await fetch('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':state.csrf},body:JSON.stringify(input)})
 const result=await r.json();if(!r.ok)throw new Error(messages[result.code]||result.code);return result
}
function registrationHelp(){
 if(!capabilityChecked)return 'ブラウザのパスキー対応を確認しています。'
 if(!supported)return 'このブラウザではWebAuthnを利用できないため、登録できません。SafariまたはChromeのアドレス欄に http://localhost:18080/app/ を貼り付けて開いてください。'
 if(!platform)return 'このブラウザで端末内の認証器を検出できないため、登録できません。Codex内で開いている場合はSafariまたはChromeで http://localhost:18080/app/ を開いてください。そこでも未検出の場合は、macOSのTouch ID設定とブラウザのパスキー設定を確認してください。'
 if(!state)return 'サーバーとの接続が完了していません。エラー表示を確認し、ページを再読み込みしてください。'
 if(state.credentialCount>0&&!state.authenticated)return '登録済みパスキーがあります。追加登録するには、先に「パスキーで認証」を押してください。'
 return ''
}
function controls(){
 const help=registrationHelp();$('registration-help').textContent=help;$('registration-help').hidden=!help

 $('register').disabled=busy||!state||!supported||!platform||(state?.credentialCount>0&&!state?.authenticated)
 $('authenticate').disabled=busy||!supported||!state?.credentialCount
 $('probe').disabled=busy||!state
 for(const id of ['mock','report','delete'])$(id).disabled=busy||!state?.authenticated
 $('wallet').disabled=busy||!state?.authenticated||!mockAccepted
 $('operation').disabled=busy||!state?.authenticated||!walletBound
 for(const id of ['evidence','issuer'])$(id).disabled=busy||!state?.authenticated||!evidenceReady
 $('sign').disabled=busy||!state?.authenticated||!cardPresent||!$('consent').checked
 $('credential-count').textContent=`このアプリに登録されたパスキー：${state?.credentialCount||0}件`
}
async function perform(fn){if(busy)return;busy=true;controls();$('global').textContent='';try{await fn()}catch(e){$('global').textContent=(e.name==='NotAllowedError'||e.code==='ERROR_CEREMONY_ABORTED')?'操作が取り消されたか、時間切れです。Touch IDの画面を確認し、ボタンから再実行してください。':e.message}finally{busy=false;controls()}}
async function refresh(){const r=await fetch('/api/bootstrap');if(!r.ok)throw new Error('アプリに接続できません。localhostで開いてください。');state=await r.json();$('origin').textContent=state.origin;controls()}
$('register').onclick=()=>perform(async()=>{
 status('passkey-status','macOSのパスキー登録画面で、ユーザPCのTouch IDを選んでください。')
 const options=await api('passkeys/register/options')
 const response=await SimpleWebAuthnBrowser.startRegistration({optionsJSON:options})
 const result=await api('passkeys/register/verify',response)
 state.credentialCount=result.credentialCount;status('passkey-status','登録を検証しました。続いて「パスキーで認証」を押してください。',true)
})
$('authenticate').onclick=()=>perform(async()=>{
 state.authenticated=false;walletBound=false;mockAccepted=false;evidenceReady=false;$('auth-result').hidden=true
 status('passkey-status','Touch IDに指を触れて認証してください。')
 const options=await api('passkeys/auth/options')
 const response=await SimpleWebAuthnBrowser.startAuthentication({optionsJSON:options})
 const result=await api('passkeys/auth/verify',response)
 state.authenticated=true;status('passkey-status','パスキー認証成功：署名・利用者検証を確認しました。',true)
 const pairs=[['公開鍵署名','検証成功'],['利用者検証（UV）',result.userVerified?'成功':'失敗'],['RP ID',result.rpID],['検証時刻',new Date(result.verifiedAt).toLocaleString()],['認証器の種別',result.credentialDeviceType],['指紋／パスワードの区別','WebAuthnからは取得不可']]
 $('auth-result').replaceChildren(...pairs.flatMap(([k,v])=>{let a=document.createElement('dt'),b=document.createElement('dd');a.textContent=k;b.textContent=v;return[a,b]}));$('auth-result').hidden=false
})
async function probe(){
 const result=await api('card/probe');cardPresent=(result.readers||[]).some(r=>r.cardPresent===true)
 status('card-status',messages[result.code]||result.code,cardPresent)
 $('readers').replaceChildren(...(result.readers||[]).map(r=>{const li=document.createElement('li');li.textContent=`${r.name} — ${r.cardPresent===true?'カードあり':r.cardPresent===false?'カードなし':'状態不明'}`;return li}))
 $('jpki').textContent=result.jpkiInstalled?'JPKI利用者ソフト：インストール済み（実カード署名は別試験）':'';controls()
}
$('probe').onclick=()=>perform(probe)
$('consent').onchange=controls
$('sign').onclick=()=>perform(async()=>{
 status('sign-result','Macの暗証番号入力ダイアログを確認してください。暗証番号をWebやチャットへ入力しないでください。')
 const result=await api('card/sign',{consent:'local-test-only'})
 status('sign-result',messages[result.code]||result.code,result.signatureVerified);$('consent').checked=false
})
$('mock').onclick=()=>perform(async()=>{const result=await api('mock/verify',{person:$('person').value,scenario:$('scenario').value});$('mock-result').textContent=JSON.stringify(result,null,2);mockAccepted=result.outcome==='verified';walletBound=false;evidenceReady=false})
$('report').onclick=()=>perform(async()=>{const data=await api('report'),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='jpki-wallet-local-test.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)})
$('delete').onclick=()=>perform(async()=>{if(!confirm('直前に認証したパスキーの登録をこのアプリから削除しますか？'))return;await api('passkeys/delete');await refresh();$('auth-result').hidden=true;status('passkey-status','アプリ側の登録を削除しました。')})
async function init(){
 supported=!!window.PublicKeyCredential&&window.isSecureContext
 $('webauthn').textContent=supported?'利用可能':'このブラウザでは利用不可'
 try{
  platform=supported&&typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable==='function'&&await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
 }catch{platform=false}
 capabilityChecked=true
 controls()
 $('platform').textContent=platform?'利用者検証付き認証器が利用可能':'未検出・設定確認が必要'
 await refresh();status('passkey-status',state.credentialCount?'登録済みパスキーで認証できます。':'最初にパスキーを登録してください。');controls()
}
function saveJSON(data,name){saveText(JSON.stringify(data,null,2),name,'application/json')}
function saveText(data,name,type='text/plain'){const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
$('wallet').onclick=()=>perform(async()=>{
 if(!window.ethereum)throw new Error('ウォレット拡張が見つかりません。対応拡張のあるChrome等で開いてください。')
 walletBound=false;evidenceReady=false
 const accounts=await ethereum.request({method:'eth_requestAccounts'}),chainId=Number(await ethereum.request({method:'eth_chainId'}))
 const options=await api('wallet/options',{address:accounts[0],chainId})
 const hex='0x'+Array.from(new TextEncoder().encode(options.message),b=>b.toString(16).padStart(2,'0')).join('')
 const signature=await ethereum.request({method:'personal_sign',params:[hex,options.address]})
 const result=await api('wallet/verify',{signature});walletBound=result.verified
 status('wallet-status','SIWE署名を検証しました：'+result.address,true)
})
$('operation').onclick=()=>perform(async()=>{
 const options=await api('operation/options')
 $('operation-result').textContent=JSON.stringify(options.intent,null,2)
 if(!confirm('表示した合成作品の試験操作に署名します。実際の権利移転・送金はありません。続けますか？'))return
 const assertion=await SimpleWebAuthnBrowser.startAuthentication({optionsJSON:options.passkeyOptions})
 const walletSignature=await ethereum.request({method:'eth_signTypedData_v4',params:[options.intent.wallet,JSON.stringify(options.typedData)]})
 const result=await api('operation/approve',{assertion,walletSignature})
 evidenceReady=result.verification.verified
 $('operation-result').textContent=JSON.stringify(result,null,2)
})
$('evidence').onclick=()=>perform(async()=>{const result=await api('evidence/export');saveJSON(result.bundle,'jw-mock-evidence.json')})
$('issuer').onclick=()=>perform(async()=>{const result=await api('evidence/export');saveText(result.trustedIssuerPublicKey,'jw-test-issuer.pem')})
init().catch(e=>{$('global').textContent=e.message;controls()})

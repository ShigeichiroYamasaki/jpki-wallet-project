# Mac実機プロトタイプ v0.1

このMacのブラウザでパスキーを登録・認証し、カードリーダーを確認するローカルアプリです。2026年9月8日。

## 起動

リポジトリの `Start-JPKI-Prototype.command` をFinderでダブルクリックしてください。初回セットアップが必要な別Macでは、リポジトリ直下で `./scripts/setup-mac-prototype.sh` を実行します。Node.js 24以上、Python 3.11以上が必要です。

SafariまたはChromeで **http://localhost:18080/app/** を開きます。`127.0.0.1` 表記、別ポート、GitHub Pages、VitePressの5173番は認証Originとして使用しません。終了は起動したターミナルでControl+Cです。実行環境によりCodex内からのOS機能アクセスが制限されるため、カード連携はMacのターミナルから起動してください。

1. 「パスキーを登録」でmacOSの画面を開き、このMacのTouch IDを選択します。
2. 「パスキーで認証」で新しい署名を生成します。成功すると署名検証・UV・RP ID・時刻が表示されます。
3. カードリーダーを接続してカードを置き、「接続状態を確認」を押します。
4. ローカル署名を試す場合は同意欄を選び、ネイティブダイアログで署名用暗証番号を入力します。PINをブラウザ・チャットに入力しないでください。
5. PF模倣を実行します。成功・更新・失効・期限切れ・署名不一致・結果不明・障害を選べます。
6. ウォレット拡張があるブラウザではSIWEと模擬操作を試せます。送金・コントラクト呼出しはありません。

ブラウザが返すUVは指紋に限定されません。Touch IDかMacパスワードかの区別はサーバーから取得できないため、利用者自身の操作確認と暗号学的な検証結果を分けます。

## 現在の確認範囲

- ソフトウェア認証器の実ECDSA署名でHTTP登録・認証、Origin/RP ID/UV、失効challenge・再送・別セッションを試験。
- 合成カードによるRSA署名・検証とPIN失敗時の非再試行を試験。
- EOAテスト鍵によるSIWE、同じintentに対するWebAuthnとEIP-712、模擬実行、証拠の独立検証を試験。
- このMacでのPC/SC接続は `PCSC_UNAVAILABLE`。実カード・実Touch IDの成功はまだ未確認。macOS側のリーダー一覧も検出なしという確認結果です。
- 画面へのHTTP疎通は確認。自動ブラウザ操作は環境制限で未完了です。

## 実カードの境界

macOSのPCSC.frameworkでリーダー／カード状態を取得します。署名はインストール済みJPKIアプリの公開PKCS#11 APIを使用し、SHA-256 DigestInfo + CKM_RSA_PKCSをローカルで検証します。対応は署名用RSA鍵のみ。署名対象は固定された非契約の試験文書＋ランダム値です。署名用暗証番号を1回だけ照合し、誤入力時は自動再試行しません。

証明書・署名原本・PINはPythonネイティブ処理のメモリ内に限定し、HTTPへ返しません。証明書の信頼チェーン・有効期限・失効は検証せず、実PFに接続しません。秘密鍵の読出しや個人番号の読出しは行いません。SDK利用条件・実機対応と法的評価は本番導入前の別確認です。

## ローカル配置と保護

ブラウザ → localhostのNode API → PC/SC／JPKIネイティブヘルパー。クラウドへ接続せず、DockerのP0や既存GCEは変更しません。今回の実機用プロファイルはSQLite、`.local/`（0700）とDB（0600相当）に試験用公開鍵・最小イベント・合成操作証拠・試験発行鍵を保持します。資格情報と発行鍵を本番へ移行してはいけません。

127.0.0.1だけへbindし、HostとOriginを固定、CSRF・SameSite・HttpOnly・Fetch Metadataを検査します。ネイティブ署名は直近5分のパスキー認証と明示同意が必要です。カード処理は同時1件、署名再要求は30秒間隔。ネイティブプロセスは120秒で終了します。HTTP localhost専用のためCookie Secureは付けません。本番構成では使用禁止です。同じOS利用者権限を侵害したプロセスからの保護は保証しません。

セッションは10分・メモリのみ。credential公開鍵は利用者削除まで保存、最小イベントと合成操作証拠は30日で削除します。証拠はSQLiteに保存され、アプリ独自の暗号化証拠庫は未実装です。FileVaultの有効化状況は未確認。証拠・鍵の本格運用は今後の工程です。これは合成データを扱うローカル試験に限定した仕様差分です。

## 証拠の検証

画面から `jw-mock-evidence.json` と `jw-test-issuer.pem` を保存し、次を実行します。

```sh
node services/mac-prototype/verify-evidence.mjs /path/to/jw-mock-evidence.json /path/to/jw-test-issuer.pem
```

検証者は発行者公開鍵を信頼できる別経路で確認してください。同梱鍵を無条件に信頼する方式ではありません。証拠は独自の `jw-mock-evidence-v1`、credentialは `jw-mock-credential-v1` です。W3C VCの相互運用、実権利、独立したタイムスタンプ・過去の失効証明は提供しません。

## テスト

```sh
npm --prefix services/mac-prototype test
services/mac-prototype/.venv/bin/python -W ignore::DeprecationWarning services/mac-prototype/test/card_test.py
```

これらの自動試験は実際のTouch IDやカードを使いません。実機成功は利用者操作を伴う別の受入条件です。

# クラウド利用体験版（PF模倣）

一般ユーザがサーバーを起動せず、HTTPSサイトからパスキー登録・ログイン、PF模倣、ウォレット署名、模擬操作の二重署名を体験する実装。

## 配置

管理者がリポジトリのルートで実行する。利用者には公開URLのみを案内する。

```sh
PUBLIC_HOST=利用するホスト名 docker compose -f infra/docker/compose.cloud.yml up -d --build
```

画面は https://shigeichiroyamasaki.github.io/jpki-wallet-project/prototype/ に配置。cacanet.orgは使用しない。上のComposeのPUBLIC_HOSTはAPI側のHTTPSホスト名であり、GitHub Pagesのホスト名を指定してはいけない。API側のTLS到達性を確保する構成例として保持する。公開APIのエンドポイントは未配置。公開IPv4を割り当てない方針は継続し、接続経路を別途確定する。

既存Google Cloudプロジェクトは sy-creator-first-demo-20260820。以前の共有VMは負荷のため試験停止しているので、このComposeを既存サービスへそのまま追加しない。容量・ネットワーク・公開経路を確認して配置先を決める。無料枠内であることを保証する構成ではない。

## 設定と保存

- PUBLIC_ORIGIN：画面のHTTPSオリジン `https://shigeichiroyamasaki.github.io`。RP IDはそのホスト名。
- APP_PATH：`/jpki-wallet-project/prototype/`。ウォレット署名のURIに利用。
- API_ORIGIN：別途配置したAPIのHTTPSオリジン。Hostを完全一致で検査。
- JW_API_ORIGIN：GitHubリポジトリのActions変数。API_ORIGINと同じ値を指定しPagesを再ビルド。未設定時は準備中を表示。
- DATA_DIR：SQLiteと試験発行者の鍵の保存先。Dockerでは専用volume /data。ローカル試験DBをコピーしない。
- リバースプロキシからHostを保持し、アプリの3000番ポートを外部公開しない。
- 別オリジンではCORSを画面Originの完全一致に限定し、メモリ内BearerセッションとCSRFを使用。第三者CookieとlocalStorageには依存しない。同一オリジン配置ではSecure / HttpOnly / SameSite=Strict Cookieを使用。
- 利用者ごとのランダムなuserHandleとcredential所有者を保存。未ログイン時はdiscoverable credentialで認証し、全利用者のcredential一覧を公開しない。
- パスキー登録後、別チャレンジによる認証が必要。認証は5分、セッションは10分。サーバー再起動後は再ログイン。
- セッションはメモリ内のため単一インスタンスで動作。横展開・アカウント復旧・不正大量登録対策・実PF接続は未対応。
- 証拠とイベントは30日後に削除。credentialは削除操作まで保持。証拠と公開鍵の同梱ファイルのみでは発行者を信頼できないため、独立検証時には公開鍵を別経路で照合する。

## 利用者の操作

1. ウォレット拡張のある通常ブラウザでサイトを開く。
2. 初回登録後「パスキーでログイン」。localhost用パスキーは使えないため新規登録。
3. 「模倣で次へ進む」。合成人物person-aを使う。実人物の識別ではなく全員共通の試験fixture。
4. ウォレットを接続しSIWE署名。拡張が提供するwindow.ethereumを使用。モバイルウォレット接続、複数拡張の選択は未対応。
5. 任意で合成作品の操作内容を確認し、パスキーとウォレット双方で署名。証拠を保存。

カードリーダー・PIN入力・実カード署名はクラウド版に含まない。通常起動では実カードAPIを無効化する。過去の実カード検証実装は履歴として保持する。スマホ本人確認は連携先選定後の別実装であり、模倣を実本人確認と表示しない。

## 検証

```sh
npm --prefix services/mac-prototype test
docker build -f services/cloud-prototype/Dockerfile -t jw-cloud-prototype:local .
```

統合テストはローカル／HTTPS公開オリジン設定の両方で暗号署名を検証する。HTTPSオリジンのテストはHTTPテスト接続にHost/Originを与える方式で、実TLS・実端末での成功を意味しない。

GitHub PagesのRP IDは同じアカウントの他Pagesサイトと共有される。公開するスクリプトも同じ信頼境界として管理する。Cloud Run採用時はSQLite永続化とセッション管理の再設計が必要であり、このコンテナをそのまま一時ストレージへ配置しない。

参加者向けUIは仮想カードをセット・読み取りする方式。カード操作はAPI未接続でも体験可能だが、APIでの模倣結果の受理とは区別して表示する。実カード・PIN・NFC・カメラは使用しない。

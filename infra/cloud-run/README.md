# GitHub Pages用の公開API

- Google Cloud project: sy-creator-first-demo-20260820
- Cloud Run service: jw-wallet-api / us-west1
- Runtime: services/cloud-prototype/run.mjs（Docker / Node.js 24）
- PUBLIC_ORIGIN: https://shigeichiroyamasaki.github.io
- STATE_BUCKET: sy-creator-first-demo-20260820-jw-state（非公開・公開アクセス防止）
- Service account: jw-wallet-api@sy-creator-first-demo-20260820.iam.gserviceaccount.com
- Artifact Registry: us-west1-docker.pkg.dev/sy-creator-first-demo-20260820/jw-prototype/api

Cloud Runの標準HTTPS URLを利用し、独自ドメイン・公開IPv4・既存VMへの追加配置を不要にする。最小0・最大1インスタンス、同時実行1、リクエスト課金で小規模試験向け。無料枠対象でもプロジェクト全体の使用量次第で費用は生じ得る。

## 永続化

各リクエストでCloud StorageからSQLiteとセッションのスナップショットを読み、隔離した一時ディレクトリで処理する。処理後、世代番号一致条件で新しい状態を保存できた場合のみ結果を返す。競合は409、保存障害は503。保存前の成功応答は利用者へ返さない。セッションや鍵をログに出さない。

これによりCloud Runの一時ファイルシステムに永続性を依存しない。旧リビジョンとの競合も世代番号で防ぐ。大規模用途向けのDB設計ではない。状態JSONの上限は8MiB、セッション最大100・有効期限10分。上限超過時は失敗扱いとなるため、参加者増加時には永続DBへの移行が必要。

保存オブジェクトには試験発行者の秘密鍵・公開鍵登録・セッションが含まれる。ダウンロードや内容のログ出力、Gitへの登録をしない。GCSのIAMと暗号化を利用する。実カード・PIN・本人の基本4情報は扱わない。

## 更新

Cloud Buildへの送信対象はDockerfileが必要とするソースのみとする。ローカル実験DB、node_modules、.venv、秘密値を含めない。イメージをビルドしてCloud Runの実行コマンドに `node services/cloud-prototype/run.mjs` を指定する。

APIの実URLをAPI_ORIGINに設定し、GitHub Actionsのリポジトリ変数JW_API_ORIGINにも設定する。リビジョン更新後、healthzだけでなくbootstrap、CORS、実署名構造の登録・認証・仮想カード模倣を確認する。画面の再読み込み後は再ログインが必要。

## 停止・切り戻し

Cloud Runの直前の正常リビジョンへトラフィックを戻す。ストレージの状態形式を変更する更新では互換性を確認する。停止時は公開アクセスを止めるかPagesのAPI設定を解除し、保存バケットは削除しない。既存VMのサービスに変更は加えない。

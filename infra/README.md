# プライベートVM上のDockerプロトタイプ

P0の基盤とPF・証明書確認の模倣を実装。実JPKI / WebAuthn / SIWE / Registryは未実装。公開IPv4・Cloud NAT・独自ドメインを使用しない。

## 現状：既存VMへ配置済み・試験後停止

2026年9月7日、試験起動でディスク待ち（vmstatのwa 67〜83%のサンプル）と入口の疎通失敗が続いたため、プロトタイプ4コンテナを停止した。ローカルでは同居用構成の全7模倣シナリオが成功。停止後は既存5コンテナが稼働継続、利用可能メモリ272 MiB、ディスク待ち7〜8%のサンプルを確認。クラウドでの動作確認は未完了であり、資源余裕を再評価するまでは常時起動しない。

既存プロジェクト `sy-creator-first-demo-20260820`、VM `creator-first-navidrome-demo`（us-west1-b / e2-micro / Debian 12）を使用する。新規VM・ディスク・公開IPv4・Cloud NATは作成しない。既存の音楽サービスを維持する。

配置先は `/opt/jw-prototype`、Composeプロジェクトは `jw-prototype`。必ず同居用overlayを指定する（メモリ上限合計272 MiB、CPU上限合計0.50）。下の新規COS VM作成手順は代替案であり、今回実行しない。

```sh
sudo env JW_IMAGE=jw-scaffold:5470013 /opt/jw-prototype/docker-compose \
  -f /opt/jw-prototype/infra/docker/compose.yml \
  -f /opt/jw-prototype/infra/docker/compose.shared.yml \
  up -d --no-build --pull never --wait --wait-timeout 180
```

停止する場合は同じ2つの `-f` を指定し `stop` を実行する。既存の `creator-first-streaming` に対する `down`、ホストのDocker再起動、VM再起動は行わない。ロールバックは `jw-prototype` だけを停止し、DB volumeは保持する。

このIPv6専用VMではIAPが `4047: Failed to lookup instance` で失敗した。作業時は管理者IPv6の /128 に限定したSSH許可を一時作成し、SSH鍵で接続、作業後にルールを削除する。IAPで接続できたとは扱わない。既存の外部IPv6・80/443は変更せず、プロトタイプは `127.0.0.1:18080` のみで待ち受ける。管理者が接続元限定SSHを許可した時間帯だけ、SSH `-L 18080:127.0.0.1:18080` で開発機へ転送する。

Compose v5.5.1のLinux x86_64バイナリは公式公開checksumと照合済み：`db1889184726840f75c4f9c001048430d4f25b3be3cb084d3ddd762bc0aed576`。VM上でも同じSHA-256を確認した。実行ファイルはroot所有0755で配置する。

持込イメージtar.gz SHA-256：`3ed42116cb1e1c2f708ed6a128832dc4921dfe632435ac56194feb268db6ab73`。アプリのベースコミットは `54700134da4fc917f828f5ae14a3977de648f77e`。

## ローカル起動

リポジトリルートで以下を実行する。既存の別プロジェクトのComposeには作用しない。

```sh
node scripts/init-scaffold.mjs
docker compose -f infra/docker/compose.yml up -d --build --wait
curl --fail http://localhost:18080/readyz
```

`/healthz` はAPIプロセス、`/readyz` はDB＋worker heartbeat（90秒以内）を確認する。`/api/mock/jpki/verify` のみ合成fixtureの模倣応答を返し、その他の `/api/*` は501。実本人確認の成功は返さない。DB/APIはホストへ直接公開せず、入口18080も127.0.0.1限定。API/DB/workerはinternalネットワークに限定する。Caddyのみホストのlocalhost接続用bridgeにも所属する。終了時は `docker compose -f infra/docker/compose.yml down`。`down -v` はDBを消すため通常の停止には使わない。

P0のDBユーザーは初期化所有者を兼ねる。実データ用にはmigration専用ユーザーとAPI/worker用の非superuserを分離してから導入する。生成パスワードはP0専用で、本番秘密値を置かない。

## 代替案：新規Google Cloud VMの計画（今回は使用しない）

```sh
GCP_PROJECT_ID=YOUR_PROJECT_ID bash infra/gcp/create-private-vm.sh --plan
```

既定はコマンド表示のみ。`--apply` は無料枠消費・プロジェクト・国外配置の確認後に `FREE_TIER_REVIEWED=yes` と併用する。非冪等な初回作成用なので、既存の同名リソースがある場合は停止して内容を確認する。プロジェクトの既定設定を変更せず、全コマンドにprojectを指定する。

この構成は **Container-Optimized OS（cos-stable）** のプリインストールDockerを使う。VMからapt・npm・Docker Hubへ通信しない。OS更新、署名済みイメージ、脆弱性対応の維持は運用担当者が別途検証する。Private Google Accessは一般インターネットへの出口ではなく、Google APIの対応サービスに限る。

起動担当者にはIAPトンネル、OS Login（セットアップはOS Admin Login）、Compute参照等の必要なIAM権限が必要。スクリプトはIAMを自動付与しない。公開ファイアウォール・外部IP・NATは作成しない。ディスクはVM削除時に保持する設定なので、実験終了時に課金対象が残らないよう保管・削除を確認する。

## インターネットのないVMへの持ち込み

1. インターネット接続可能な開発機/CIでlinux/amd64のAPIイメージをビルドし、PostgreSQL・Caddyイメージを取得する。Apple Siliconではamd64を明示する。
2. `docker image save` で3種のイメージをtarへ保存する。Docker ComposeのLinux x86_64スタンドアロン実行ファイルも公式リリースから取得し、公開checksumを検証する。
3. Compose/Caddyfile/init.sql、イメージtar、Compose実行ファイルを `gcloud compute scp --tunnel-through-iap` でVMへ転送する。秘密情報をGitHubへpushしない。
4. OS Loginで接続し、書込可能な `/var/lib/jw-prototype` に配置する。`docker load` で読み込む。COSの `/var` は通常noexecなので、Compose実行ファイルだけは実行可能領域の `/var/lib/docker/jw-tools/docker-compose` へroot所有で配置し、0755にする。ファイルシステム全体のnoexec設定を解除しない。`docker compose` プラグインがOSに付属するとは仮定しない。
5. VM上でP0用DB秘密値を `openssl rand -hex 32` 等で生成する。`.secrets` は0700、ファイルは明示mountで各コンテナから読めるよう0444とする（親ディレクトリでアクセス制限）。配置構造はリポジトリと同じ `.secrets` と `infra/docker` を保つ。
6. `sudo /var/lib/docker/jw-tools/docker-compose -f /var/lib/jw-prototype/infra/docker/compose.yml up -d --no-build --pull never --wait`。コンテナのunless-stoppedでDocker再起動後の復帰を行う。VM再起動後にも動作を確認する。

例：開発機でイメージを準備する（実行前に十分なディスク容量を確認）。

```sh
docker buildx build --platform linux/amd64 --load -t jw-scaffold:dev services/scaffold
docker pull --platform linux/amd64 postgres:16-alpine
docker pull --platform linux/amd64 caddy:2-alpine
mkdir -p work
docker image save -o work/jw-images.tar jw-scaffold:dev postgres:16-alpine caddy:2-alpine
```

タグは取得時の指定。実VMへ持ち込むリリースではimage ID/RepoDigest、tarのSHA-256、Git commit、Compose版を保存し、検証した同じtarを配布する。VMでlatestをpullしない。Composeの `JW_IMAGE` / `POSTGRES_IMAGE` / `CADDY_IMAGE` で検証済みイメージを指定できる。

## 代替案：IAP経由の接続（既存VMでは未成立）

```sh
gcloud compute ssh jw-prototype \
  --project=YOUR_PROJECT_ID --zone=us-west1-b --tunnel-through-iap \
  -- -N -L 18080:127.0.0.1:18080
```

接続中の開発機で `http://localhost:18080` を開く。HTTPはSSHトンネル内のローカル利用に限定する。将来のWebAuthn検証はlocalhostという開発用Originに限定され、スマートフォンからPCのlocalhostへそのまま接続できない。100人配布用URLや端末共通RP IDは未提供。

## 外部連携の制約

公開IPv4もNATもないためPocketSign/RPCへの直接アクセスは不可。P1は模擬PF・模擬chainで検証する。プロトタイプではPF・証明書確認を模倣のまま継続する。実接続は今回の範囲外であり、NATを追加しない。Secret Manager等を使う場合は対応Google APIへのPrivate Google Access、DNS、IAMを検証する。IAP操作の権限は一般参加者へ配布しない。

詳細：[設計書](../docs/prototype-design.md)。


## PF模倣の呼び出し

```sh
curl -sS http://localhost:18080/api/mock/jpki/verify \
  -H 'Content-Type: application/json' \
  -d '{"scenario":"valid","person":"person-a","intentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'
```

scenarioは valid / renewed / revoked / expired / invalid_signature / timeout / unavailable。全応答はmockであると明示される。実証明書・実署名を入力しない。模倣テスト：`node --test services/scaffold/mock-jpki.test.mjs`。

## 検証記録（2026年9月7日）

ローカルDocker（linux/arm64）で4コンテナ起動、7種のPF模倣HTTP応答、実証明書フィールド拒否、未実装APIの501、DB停止時のreadiness 503と再起動後200を確認。単体テスト4件とVitePressビルドも成功。Google Cloud / e2-micro上の実行・IAP到達・リソース使用量・実署名検証は未確認。CIはlinux/amd64で同じDockerテストを実行する構成。

COSの配置根拠：[Disks and file system overview](https://docs.cloud.google.com/container-optimized-os/docs/concepts/disks-and-filesystem)。

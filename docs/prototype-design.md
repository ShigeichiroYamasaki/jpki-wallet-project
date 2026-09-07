---
title: Google Cloud・Docker プロトタイプ設計
---

# Google Cloud・Docker 配置・運用設計 v0.3

作成日・料金確認日：2026年9月7日。対象：[仕様書 v0.4](/specification)。

::: info 文書の役割
本書は配置・費用・過去の運用記録を扱います。現在のプロトタイプ要件は[プロトタイプ系詳細仕様 v0.4](/prototype-specification)を参照してください。5〜8節のセレモニー・API・状態は旧案であり、v0.4の系別仕様が優先します。実PF・実証明書の受入を記載した箇所は本番検討用です。新しい[Mac構成図](/prototype-specification#architecture)と[カード連携仕様](/prototype-specification#mac-card)を追加しました。
:::

::: warning 設計・実装状況
この文書は実装に向けた補足設計です。公開IPv4を持たないDockerの基盤スケルトンを同梱していますが、PF・証明書確認の模倣アダプターを実装しています。実JPKI・WebAuthn・SIWE検証、参加者画面、オンチェーン登録機能は未実装です。既存Google Cloud VMへ配置・試験起動しましたが、ディスク待ちと疎通失敗が続いたため、既存サービスを優先してプロトタイプを停止しました。常時稼働には資源配分の再検討が必要です。参加者の実機E2E・100人の負荷検証は未実施です。法的整合性は専門家による精査が必要です。
:::

## 1. 今回の決定と前提

| 項目 | 設計 |
| --- | --- |
| 公開ドキュメント | 既存のGitHub Pages / VitePressを継続 |
| サーバー | 既存 `creator-first-navidrome-demo`（e2-micro / Debian 12）へ同居。Docker Engine + 持込Compose |
| リージョン | 無料枠対象の `us-west1` を設計上の初期値とする。実データの国外処理可否は導入前確認事項 |
| ディスク | `pd-standard` 30 GB 1枚（OS・イメージ・DBを合算）。SSD・pd-balancedへ自動変更しない |
| プロセス | Caddy / API / worker / PostgreSQL 16の4コンテナ。単一VM、冗長化なし |
| ネットワーク | 公開IPv4・Cloud NATの追加なし。既存IPv6を維持し、管理者限定SSHトンネルで接続 |
| バックエンド実装案 | Node.js 24 LTS、TypeScript + Express、pg、SimpleWebAuthn、siwe、viem。スケルトンはNode標準HTTP + pgのみ |
| チェーン | 最初は模擬チェーン、次にEVMテストネット1種類。chain ID・RPC・コントラクトアドレス確定前は送信不可 |
| 対象規模 | 最終目標は登録者100人。今回の非公開環境は開発者検証用で、100人向けアクセスは後工程 |
| 段階 | P0基盤＋PF模倣 → P1模擬セレモニー → P2端末検証（PFは模倣）→ P3模擬100人実験。実PF接続は今回の範囲外 |

採用案は[追加ADR案](/prototype-decisions)にまとめています。旧仕様v0.3・原ADRは履歴として保持し、現行要件を別文書で管理します。

## 2. 無料枠の適用範囲と費用

「無料枠対象の構成」と「請求額が0円」は区別します。既存プロジェクト `sy-creator-first-demo-20260820` のe2-micro・30 GBディスクが使用中であることを確認し、新しいVM・ディスクを追加せず同居することを決定しました。

| 資源 | 無料枠・費用の扱い |
| --- | --- |
| e2-micro | `us-west1` / `us-central1` / `us-east1` が対象。月の総時間相当の上限を共有 |
| ディスク | standard persistent disk 30 GB-monthまで。追加ディスク・スナップショットは別途計算 |
| 外向き通信 | Compute Engine無料枠は北米から対象宛先へ月1 GB。日本の参加者、RPC、バックアップ送信等も見積もる |
| 外部IPv4 | 追加しない。既存VMのIPv6専用NICを維持。Cloud NATも作成しない |
| その他 | PocketSign、RPC、メール、バックアップ、ログ、ドメイン等は個別。GKE・Cloud SQL・Cloud NAT・ロードバランサーは初期構成に含めない |

Computeの根拠：[Google Cloud Free Tier](https://docs.cloud.google.com/free/docs/free-cloud-features)。対象外サービスの確認：[ネットワーク料金](https://cloud.google.com/vpc/network-pricing)。

東京リージョンはこのCompute無料枠の対象外です。国内保管が必須なら、費用条件を見直して東京等を選びます。公開IPv4がないことだけで外部通信不可とは判断しません。既存VMは外部IPv6を持ちますが、P0のAPI・worker・DBをDocker internalネットワークに隔離し、PF・証明書確認はすべて模倣します。イメージは開発機で準備して転送します。

料金アラートを設定しますが、alerts-only予算を課金停止装置として扱いません。Spend capを利用する場合も対象サービス・停止時の影響を別途確認します。[Cloud Billingの予算](https://docs.cloud.google.com/billing/docs/how-to/budgets)

## 3. 配置と通信境界

```text
公開説明サイト：GitHub Pages（既存URLを維持）

開発者PCの localhost:18080
       │ 管理者限定SSHローカル転送
       ▼
既存Compute Engine（外部IPv6のみ） / 独立Docker Compose
  Caddy ── API ── PostgreSQL ── worker
                （模擬データのみ）

外部PF / EVM RPC：P0コンテナから接続せず、模倣のみ
```

GitHub Pagesは説明専用です。今回のサーバーは開発者PCから管理者限定SSHトンネルを通して接続し、HTTP入口をホストの127.0.0.1:18080にだけbindします。API/DB/workerはinternalネットワークだけに所属させます。Caddyだけはlocalhostへのport公開用bridgeも持ちます。既存VMの外部IPv6と既存サービスを維持し、公開IPv4・NATは追加しません。証明書や秘密値をPagesへ渡しません。

`jw.cacanet.org` のDNS作業は保留を維持します。DNS設定・公開TLS証明書は今回不要です。P1 WebAuthnは開発機のlocalhost Originを使い、スマホ用Origin・RP IDへ自動移行できるとは扱いません。P2の実機およびP3の100人利用には、別途プライベートアクセス方式または公開方式の合意が必要です。一般参加者にGCPのIAP/OS Login権限を配りません。

DBポート5432・APIポート3000をホストに公開しません。既存サービスの80/443を変更しません。IAPはこのVMで `4047: Failed to lookup instance` となり利用を確認できていません。配置時は管理者のIPv6 /128だけにSSHを一時許可し、作業後に削除します。再接続時も管理者の送信元限定ルールを作業時間だけ設定します。

## 4. e2-microの資源配分

| コンテナ | メモリ上限の初期値 | 役割 |
| --- | --- | --- |
| Caddy | 64 MiB | ローカルHTTPルーティング、CPU 0.10 |
| API | 64 MiB | P0模倣HTTP API、heap 24 MiB、CPU 0.15 |
| worker | 64 MiB | P0 heartbeatのみ、heap 16 MiB、CPU 0.10 |
| PostgreSQL | 80 MiB | shared_buffers 16 MB、max_connections 10、CPU 0.15 |

同居用 `compose.shared.yml` を重ね、上限合計272 MiB / 0.50 CPUとします。既存音楽サービスはそのまま稼働させます。P0専用の小規模検証構成であり、100人同時処理の容量保証ではありません。P1以降は再計測が必要です。起動前の利用可能メモリは約307 MiB、ディスク空き24 GBでした。APIプール最大4、worker最大2接続。ビルドは開発機またはCIで行います。メモリ不足時はプロトタイプを停止して既存サービスを優先します。

## 5. 鍵束縛フローの補完（旧案）

ユーザー指定により、プロトタイプのPF接続・証明書確認はすべて模倣とします。以下の実JPKI連携の記述は将来の接続要件として保存し、今回の完了条件には含めません。

### 5.1 初回登録と認証を分ける

仕様v0.3はFIDO2 assertionから始まりますが、新規利用者は公開鍵が未登録です。最初に `navigator.credentials.create()` 相当の登録を行い、credential ID・COSE公開鍵・署名アルゴリズム・counter・backup flags・transportsをサーバーに保持します。JPKI確認前に有効な本人アカウントとして扱いません。登録後、同じ候補公開鍵によるassertionを束縛フローで検証します。

UV（利用者検証）をrequired、attestationはnone。パスキーは同期可能な場合があるため「必ず1台の端末だけに束縛される」とは保証しません。counterだけで同期パスキーを機械的に不正認定せず、backup flags等を踏まえて扱います。[WebAuthn仕様](https://www.w3.org/TR/webauthn-3/)

### 5.2 署名対象を確定する

案：セッション作成時にウォレットアドレス・chain IDを決め、候補credential登録後に以下の構造を固定します。

```text
BindingIntent v1 =
  protocol_version, session_id, nonce, expires_at,
  rp_id, origin, chain_id, wallet_address,
  credential_id_hash, credential_public_key_hash

intent_hash = SHA-256(JCS(BindingIntent))
```

nonceは暗号学的乱数32 bytesのhex（64文字）とし、SIWEの英数字制約を満たします。JCSはRFC 8785形式を候補とし、数値・日時・アドレス・base64urlの表現を固定したテストベクトルを実装時に用意します。

JPKIはintent_hashへの署名をPFに検証委託する案とします。実際に任意ダイジェストを署名できるか、SDK/PFでのハッシュ二重適用や署名用証明書の扱いはPocketSign仕様で確認し、未確認なら実PF接続段階へ進みません。単なるPFの本人確認成功レスポンスを任意のBindingIntentへの署名と同一視しません。

WebAuthn assertionのchallengeはintent_hashを含むドメイン分離済みチャレンジとし、公開鍵・challenge・rpIdHash・origin・type・UVを検証します。SIWEには共通nonceと、intent_hash・JPKI検証結果参照ハッシュをresourcesに入れます。domainだけでなくnonce・URI・chain ID・wallet・issuedAt・expirationTime・resources・request IDをサーバー生成値と厳密照合します。[ERC-4361](https://eips.ethereum.org/EIPS/eip-4361)

この補完は「3つのAPIに同じ文字列を渡せば十分」という解釈を避けるための案です。ADR-004/010との変更点を追加ADRで承認対象として明示します。P1はEOAのみを対象にし、コントラクトウォレットは明示的に非対応とします。ERC-1271対応は別工程です。

### 5.3 状態機械

```text
PENDING（credential準備・intent固定）
 → JPKI_VERIFIED → FIDO2_VERIFIED → SIWE_ISSUED → COMPLETED
途中失敗 → FAILED / 期限切れ → EXPIRED

binding_records.onchain_status:
PENDING → CONFIRMED
        → REJECTED（恒久的失敗の確認後に原本を削除）
        → NEEDS_REVIEW（結果不明・reorg等、参加資格は無効）
```

`COMPLETED` は署名検証・DB受付の完了であり、参加資格の付与ではありません。UIは「受付済み・チェーン確定待ち」とし、`CONFIRMED`でのみ参加可にします。セッション状態とチェーン状態を一つの列に混在させません。

TTLは開始から10分。期限は暗号学的に署名を壊すものではなく、サーバーの受付条件です。期限内のDB commit後はoutboxの処理を継続します。初回＋再試行3回＝最大4試行と定義する案です（原文のretry_count 0–3との意味を固定）。入力不正、認証失敗、PF障害・タイムアウトは別に集計します。

## 6. API契約案（旧案）

以下はP1以降の契約案です。同梱P0は `/api/mock/jpki/verify` だけを実装し、その他の `/api/*` は501を返します。

| メソッド・パス | 内容 | 正常系 |
| --- | --- | --- |
| POST /api/v1/binding-sessions | 招待・同意版・wallet・chain確認、nonce発行、HttpOnly Cookie発行 | 201 |
| POST /api/v1/binding-sessions/:id/webauthn/registration-options | 初回credential候補登録challenge | 200 |
| POST /api/v1/binding-sessions/:id/webauthn/registration | 公開鍵を仮登録、intent固定 | 200 |
| POST /api/v1/binding-sessions/:id/jpki | JPKI署名検証、派生値のみ保存 | 200 / 202処理中 |
| POST /api/v1/binding-sessions/:id/webauthn/assertion-options | intentに対応するassertion challenge | 200 |
| POST /api/v1/binding-sessions/:id/webauthn/assertion | credentialの所持・UVを検証 | 200 |
| POST /api/v1/binding-sessions/:id/siwe-message | 固定SIWE文字列を生成し保存 | 200 |
| POST /api/v1/binding-sessions/:id/siwe | 署名検証、recordとoutboxを同一DB transactionで保存 | 202 |
| GET /api/v1/binding-sessions/:id | 所有セッションの進捗のみ返す | 200 |
| POST /api/v1/auth/options, /verify | 既存credentialによる継続認証。新しいchallengeで束縛nonceを再利用しない | 200 |

全セッション操作で所有権を検証します。UUIDだけを認可として使わず、ランダムなセッション秘密値のハッシュをDBに保持し、CookieはSecure/HttpOnly/SameSiteとします。変更系はOrigin・CSRFを検証し、request bodyはサイズ上限・許可フィールドを適用。証明書・署名・Cookie・Authorization・PF応答はログ禁止。失敗コードは列挙値を返し、外部エラー本文をそのまま返しません。

再送には `Idempotency-Key`、セッション＋stage＋キーの一意制約を使用します。同じキーで異なる入力は409。成功応答の安全な射影だけを保存し、同一キーには同じ応答を返します。PF処理開始前にstage operationを原子的に予約し、並行リクエストから二重呼び出しを防ぎます。

PFが完了した直後にプロセスが落ちると、ローカルDBだけではexactly-once課金を保証できません。プロバイダの冪等キー・結果照会が利用できるか確認し、結果不明では自動再検証せず `NEEDS_REVIEW` にします。セッション作成数・IP等の短期レート・日次PF呼び出し上限・全体の同時数も制御し、新規セッション連打による上限回避を防ぎます。

## 7. DB・outbox設計（旧案）

| テーブル | 主な追加項目・制約 |
| --- | --- |
| binding_sessions | token_hash、intent_hash、provider結果ハッシュ、consent_version、stage lease、expires_at |
| stage_operations | session_id + stage + idempotency_key UNIQUE、request_hash、状態、lease期限、安全な応答 |
| webauthn_credentials | credential_id UNIQUE、COSE公開鍵、alg、counter、backup flags、状態、owner |
| binding_records | provider、subject HMAC、pepper_version、credential_id、wallet、chain、record_hash、onchain_status |
| outbox | record_id UNIQUE、event_id、attempts、next_attempt_at、lease、tx nonce、tx hash、receipt block hash |
| audit_logs | event_id、session_id、stage、provider、結果、時刻、列挙エラーコード（1年保持） |

subjectは `HMAC-SHA256(pepper, provider_namespace || user_id)` を案とし、バージョンを保存します。プロバイダ変更で同一人物性が自動継続するとは扱いません。生IDを保存しないためpepper交換だけで既存HMACを再生成できず、二重登録防止と再束縛計画が必要です。

PENDINGも含む有効レコードに `(provider, subject_hash)` とwalletの一意制約を設けます。credentialも同時に複数の有効レコードへ使えない制約を持ちます。record＋outbox＋セッション完了は同一transaction。workerは短いleaseと `FOR UPDATE SKIP LOCKED` で1件ずつ取得し、外部RPC呼び出し中にDB transactionを保持しません。

コミット対象は不変のversion付きpayloadだけとし、tx hash・status・updated_atはハッシュ入力から除外します。HMAC・credential参照・wallet・chain・同意版・intent hash・作成時刻・ランダムsalt等をJCSで固定し、digestの表現とテストベクトルを共有します。生の本人情報は含めません。

expiredセッションを単に状態変更しても保存データは消えません。TTL後に秘密値・候補credential・派生値を削除し、必要な安全なメタデータのみ残します。recordのsession FKはnullableまたは別の監査IDとして扱い、親削除によるrecord連鎖削除を防ぎます。REJECTEDの機微な原本は削除しますが、安全な障害メタデータは残します。仕様v0.3のdeleted_atは物理削除の代用にしません。

同梱P0のDBは `runtime_probe` のみです。この表はDB readiness用であり、上記業務schemaが実装済みとは示しません。

## 8. コントラクトと送信処理（旧案）

P2のRegistryはAccessControl、BACKEND_ROLE、別の管理者、pause/unpause、subjectとwalletの双方向一意性を設計します。署名鍵と管理鍵を分け、workerだけに送信鍵を渡します。`bind(eventId, subjectHash, wallet, bindingHash)` のeventIdで再送を照合し、同一eventId・同一payloadは既存結果と整合確認、異なるpayloadは拒否します。

ウォレット残高の制限だけでは鍵侵害の被害上限になりません（攻撃者がガスを補充できるため）。時間窓でのbind上限、総登録上限、pause、ロール失効を組み合わせます。初期値案は10件/時、実験参加100件＋運用検証用枠を明示的に管理し、変更権限と手順を定めます。

RPCタイムアウトを即「失敗・削除」にしません。tx hash・eventId・nonce・コントラクト状態を照合してから再送し、replacement transactionも追跡します。採用チェーンに応じて必要confirmations/finalityを固定し、再編成でreceiptが消えた場合は資格を保留します。worker再起動時には未確定送信を復元し、wallet nonce管理を単一送信者に直列化します。

失効・端末紛失・ウォレット変更は初回登録とは別フローです。P3開始前に再JPKI確認、旧資格無効化、重複防止、通知、異議申立てを確定します。削除請求を受けてもチェーン上の資格が有効なまま残る設計にはしません。過去のオンチェーン履歴は消せないため同意説明・専門家レビューが必要です。

## 9. 秘密情報・ログ・バックアップ

ADR-012の「暗号化環境変数」は素のGCE + Dockerでは自動的には提供されません。通常の `.env` やCompose secretsを暗号化ストアとは呼びません。[Docker secrets](https://docs.docker.com/compose/how-tos/use-secrets/)

P0は生成したテストDBパスワードをgit除外ディレクトリに保存し、Compose secretsでマウントします。実運用案はGoogle Secret Manager（無料枠内利用を確認）から起動時にrootのみが取得してtmpfsへ展開する方式で、ADR-012の改訂提案とします。Secret Managerを採用しない場合は、root管理ファイル、暗号化ディスク、最小権限、ローテーション・アクセス監査の限界を明示して選択します。

バックアップは暗号化したpg_dumpをVM外へ毎日保管し、RPO24時間・RTO4時間を目標値とします。日次7世代を初期案とし、別保管先・鍵・無料枠利用量を確定してからP3へ進みます。同じVM上のDocker volumeはバックアップではありません。削除済みの対象を復元しない削除台帳・復元後消去処理を用意し、バックアップからの消去遅延も説明します。

P0はコンテナログを10 MB×3へ制限、access logは無効。P1以降は許可リスト型の監査イベントだけを出力。例外監視、プロキシ、core dump、swap、SQLログ、CIログ、バックアップまで非保存方針を確認します。JavaScriptのGCで即座のメモリ消去は保証せず「スコープ終了後に参照を残さない」と実装要件を表現します。

## 10. 実装工程と受入条件

| 工程 | 成果 | 完了条件 |
| --- | --- | --- |
| P0 基盤 | Compose、API health、DB readiness、worker heartbeat、PF模倣、GCE作成手順 | コンテナ起動・DB障害の検出・再起動・非公開ポートを確認 |
| P1 模擬連携 | session / credentials / outbox、模擬PF、EOA署名検証 | 実データを使わず、正常系と異常系の自動検証に合格 |
| P2 端末 | PF・証明書は模倣のまま、WebAuthn/SIWE・模擬チェーンを結合 | 実端末への接続方式を決め、模擬本人確認であることが常に表示される |
| P3 模擬100人実験 | 合成本人データ、招待・サポート・復旧・失効・削除の検証 | 開発者用IAPとは別のアクセス方式を合意し、段階的10→30→100人受入 |

実PFの契約・SDK・失効確認・法的精査は実サービス導入時に別工程として扱います。P3も本人確認済み参加者とは呼びません。

P1/P2で必須の試験：nonce・origin・RP ID・wallet・chain・resources差替えの拒否、期限切れ、別セッションの証拠混入、並列PF呼出、再送body相違、DB commit直後のクラッシュ、送信後のRPC切断、同一人物/同一wallet競合、reorg、DB停止、ログへのテスト機微値混入検査、バックアップ復元後の削除保持。

5人同時操作でAPIのみのp95 500 ms以内・メモリ/ディスク余裕・OOMなしを測定目標にします。PF待ち・端末操作・チェーン確定時間は別指標。目標未達なら招待間隔や負荷制限を調整し、無料VMで100人同時処理可能と宣伝しません。

## 11. 後続実装・実データ投入前の未決定事項

- 追加通信・バックアップ等の費用の許容範囲。既存プロジェクトと同居VMは確定済み。
- 米国リージョンでの処理・保存、NPOの提供範囲、同意・規約、委託契約について専門家による精査。
- 参加者用HTTPSホスト、RP ID、ネイティブアプリとの関連付け。保留中のDNS変更は再開しない。
- 将来実接続時のみ：PocketSignの任意ダイジェスト署名、識別子継続性、冪等性・結果照会、失効検証、料金・保存ポリシー。今回の模倣実装はこれらの実仕様を保証しない。
- chain ID、RPC、finality、Registry管理鍵、復旧・失効の責任者。
- バックアップ保管先と鍵、Secret Manager方式の採否、実験終了時の削除（原ADRが参照するADR-018は未提供）。

## 12. 配置ファイル

[Docker・VM構成一式](https://github.com/ShigeichiroYamasaki/jpki-wallet-project/tree/main/infra) / [基盤サーバー](https://github.com/ShigeichiroYamasaki/jpki-wallet-project/tree/main/services/scaffold)

従来の `create-with-container` に依存せず、既存Debian 12のDockerへ持ち込んだComposeとイメージを使用します。Googleのcontainer startup agentは2026年7月31日に停止対象となっています。[移行資料](https://docs.cloud.google.com/compute/docs/deprecations/container-startup-agent-on-compute)

## 13. PF・証明書確認の模倣仕様（ユーザー指定）

PF接続アダプターをインプロセスの `MockJpkiProvider` として実装し、外部通信は一切行いません。APIは `/api/mock/jpki/verify`、providerは必ず `mock`、応答には `isMock: true` と `assurance: simulation-only` を付けます。`JPKI_PROVIDER` をmock以外に設定するとサーバーは起動しません。PocketSignのAPI互換性を主張するものではありません。

| scenario | 模倣する状況 | HTTP / outcome |
| --- | --- | --- |
| valid | 証明書・署名・有効性確認の成功 | 200 / verified |
| renewed | 更新後の証明書でも同一人物という仮定 | 200 / verified、同じmockSubjectId |
| revoked | 証明書失効 | 422 / rejected |
| expired | 証明書期限切れ | 422 / rejected |
| invalid_signature | 署名不一致 | 422 / rejected |
| timeout | PFから結果を取得できない | 504 / indeterminate |
| unavailable | PFサービス障害 | 503 / unavailable |

リクエストで受け付けるのは `scenario`、合成人物 `person-a` / `person-b`、64桁hexの `intentHash` のみです。証明書・署名値・氏名等のフィールドは拒否し、本文をログ・DBへ保存しません。intentHashは模倣応答へ反映するだけであり、暗号学的なJPKI署名検証は行いません。timeoutも実際の長い待ち時間ではなく結果を模倣します。

更新前後の同一人物ID・別人物IDは合成fixtureです。プロバイダ間でのID可搬性、実在人物の一意性、Sybil耐性の実証にはなりません。P1以降で使うsubject hashも `mock` 名前空間に分け、実データ・実チェーン資格と混在させません。模倣のverified結果で実サービスの権限を付与してはなりません。

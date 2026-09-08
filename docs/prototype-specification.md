---
title: プロトタイプ系詳細仕様 v0.4
---

::: info Mac実機用プロファイルを追加（2026年9月8日）
[Mac実機プロトタイプ v0.1](/mac-prototype)にパスキー・カード連携・ウォレット模擬操作を実装しました。以下のクラウド／専用拡張の設計全体を実装したものではなく、実Touch ID・実カード成功も未確認です。実装差分・起動方法は同ページを参照してください。
:::


# プロトタイプ系詳細仕様 v0.4

更新日：2026年9月7日。[仕様書総目次](/specification) / [本番系](/production-specification) / [配置・運用](/prototype-design)

::: warning 実装と設計の区別
現在のコードはP0の基盤・PF模倣APIのみです。以下の画面、カード連携、WebAuthn、SIWE、操作署名、VC、証拠庫・検証ツールは追加設計です。実カードを扱うローカル試験と、合成データだけを受け付けるサーバーを分離します。模倣成功を本人確認完了や実権利の証明と表示しません。
:::

## 1. 範囲とモード

利用者が操作する端末を「ユーザPC」と呼ぶ。現行プロトタイプの対応OSはmacOSとする。ICカードリーダーをUSB等で接続し、ブラウザからローカル連携ソフトを経由して使用する。スマホNFC／モバイルWebViewは今回の必須構成に含めない。

| モード | 入力と処理 | 出力・限界 |
| --- | --- | --- |
| P0サーバー試験（実装済み） | scenario、合成人物、合成intentHashをPF模倣APIへ送る | 模倣結果のみ。実署名の検証はしない |
| P1ブラウザ統合（追加設計） | 試験用パスキー・EOAの実署名＋PF合成fixture | 暗号学的署名は試験するが、人物は合成ID |
| P2カード接続（追加設計・要検証） | ユーザPC上だけで実カード接続・明示同意によるテスト署名を試す | 状態・試験合否のみ表示。証明書・署名・その派生hashをサーバーに送らない |
| P2証拠検証（追加設計） | 合成VCとP1署名から証拠を作成・独立検証 | simulation-only。実カード試験の証拠とは結合しない |
| P3参加実験（後工程） | 合成人物による段階的10→30→100人試験 | 専用アクセス方式・負荷対策を別途合意 |

画面のカード状態とPF状態は別々に表示する。`カード署名成功 / PF=mock` を「JPKI検証成功」にまとめない。カード未接続でもP1の模擬フローは試験できる。

## 2. システム構成 {#architecture}

![Macブラウザと既存Google Cloud VMによるプロトタイプ構成](/images/prototype-architecture.svg)

図の枠内ラベルで実装状況を区別する。PF模倣はAPI内の関数であり、独立コンテナではない。VC・証拠庫は追加する論理機能であり、無料枠VMに新コンテナを増やす決定ではない。

| 配置 | 実装済み | 追加設計 |
| --- | --- | --- |
| ユーザPC | 接続試験は未実施 | ブラウザUI、カードブリッジ、試験用パスキー・ウォレット、証拠検証ツール |
| Caddy | 全パスをapi:3000へ転送 | `/app/` にブラウザUIの静的成果物を配信 |
| API | Node標準HTTP、PF模倣、health/readiness | セッション、署名検証、認可、VC、証拠エクスポート |
| PostgreSQL | `runtime_probe` のみ | セッション、credentials、binding、操作、outbox、VC状態、証拠索引 |
| worker | DB heartbeat | 模擬実行・再試行・証拠確定記録 |
| GitHub Pages | 説明資料の公開 | 認証情報・実カードデータを扱わない |

## 3. 通信・Origin・Docker

- ブラウザUIの初期URLは `http://localhost:18080/app/`、APIは同一Originの `/api/`。現時点で `/app/` は未提供。PagesやVitePressの5173番を認証Originにしない。
- WebAuthnのRP IDは `localhost`、許可Originは `http://localhost:18080` の完全一致を初期設定とする。IP表記や別ポートから自動転用しない。実装時に `isSecureContext` とWebAuthn API利用可否を実ブラウザで検証する。
- MacのSSH転送はloopback限定。転送先はVMの `127.0.0.1:18080`。接続例は `ssh -N -L 127.0.0.1:18080:127.0.0.1:18080 <管理者SSH接続先>`。接続先・鍵は公開文書に埋め込まない。
- VM側はCaddyの8080番をホストの127.0.0.1:18080へ公開する。APIの3000番、DBの5432番をホストに公開しない。Mac→VM間はSSHで暗号化する。
- API・worker・DBはDocker `backend` internalネットワーク。Caddyだけが `ingress` bridgeも持つ。外部PF/RPCへの経路を今回追加しない。
- 公開IPv4・NAT・新規VMは作成しない。既存IPv6を使う管理者SSHは送信元限定・作業時間限定。IAPは過去の配置時に接続失敗しており、使用可能と仮定しない。
- `compose.yml` と `compose.shared.yml` を重ねる同居構成が対象。上限合計272 MiB / 0.50 CPUはP0用であり、P1以降は再計測する。クラウドは停止済みという配置記録があり、本更新では再起動していない。

P1はUI初期化時に同一Originのbootstrap処理でCSRFトークンを発行し、セッション作成から照合する。P1のCookieはhost-only、HttpOnly、SameSite=Strict、有効期限10分。変更要求にはOrigin完全一致とCSRFトークンを要求する。HTTP localhost専用開発プロファイルではSecureを付けない構成を明示的に限定し、HostとOriginがlocalhostでない場合は起動又は要求を拒否する。本番はHTTPS＋Secureを必須とし、設定を共用しない。CORSによる任意Originの許可は行わない。

## 4. Macのカード連携 {#mac-card}

### 4.1 連携方式

初期候補は、Chromeの専用拡張とNative MessagingでMac上の連携プロセスを呼び出し、対応するJPKIクライアントAPI／SDKからリーダーへアクセスする構成。これは独自連携の設計案であり、公式JPKIソフトが任意Webサイト向けAPIをそのまま公開しているとの主張ではない。提供API・利用条件・署名方式を確認してから採否を決める。

Safari等への対応は別プロファイルとし、互換を保証しない。ブラウザからWebUSBだけで直接カード署名できると仮定しない。ローカルHTTPブリッジへ変更する場合はOrigin認可・ローカルプロセス認証・リプレイ対策を追加ADRで定義するまで採用しない。

### 4.2 ローカルプロトコル案

| 操作 | 入力 | ブラウザへ返す情報 |
| --- | --- | --- |
| `getCapabilities` | プロトコル版、requestId | ソフト・OS・リーダー対応状況。証明書個人情報は含めない |
| `probeCard` | requestId、単発challenge | reader/cardの存在状態。カードの人物識別子は返さない |
| `runLocalSigningTest` | requestId、challenge、期限、テスト文書 | ローカル検証結果、方式名、試験時刻、列挙エラー。署名原本は返さない |
| `cancel` | 対象requestId | cancelled又は既に終了した状態 |

拡張は許可したOrigin・トップフレーム・タブに限定し、ユーザー操作なしに署名を始めない。ネイティブホストは許可拡張IDを固定し、操作の許可リスト、版、requestId、32 bytesのランダムchallengeと一回限りの使用を検証する。要求のTTLは60秒、本文上限16 KiB、同時署名は1件。応答は対応するタブとrequestIdにのみ返す。これはP2の実装要件であり、既存コードには存在しない。

### 4.3 PIN・署名・データ境界

PINは信頼するローカルのカード連携UIで入力し、Webページ・拡張メッセージ・サーバー・ログへ渡さない。この入力経路を実現できないSDKでは署名試験へ進まない。誤PIN時の自動再試行を禁止し、利用者の取消しやカード抜去で処理を中断する。

署名対象は「本番の契約・権利処分ではない」ことを明記したローカル試験文書。カード秘密鍵の読出しは行わない。証明書・署名値・基本4情報を必要とする処理はローカルプロセスの短期メモリ内に限定し、通常ファイル・DB・クラウド・証拠エクスポートへ保存しない。処理後に参照を破棄するが、完全な即時メモリ消去は保証しない。

実カード署名の数理的な検証ができても、信頼する証明書チェーンや失効・期限を実PFで確認した意味にはならない。PF模倣へ渡すintentHashは合成のBindingIntentから生成し、カード試験の証明書・署名・実人物から生成しない。

### 4.4 失敗と対応表

`READER_NOT_FOUND`、`CARD_ABSENT`、`USER_CANCELLED`、`PIN_REJECTED`、`CARD_LOCKED`、`UNSUPPORTED_ENVIRONMENT`、`TIMEOUT`、`LOCAL_VERIFICATION_FAILED` を分ける。生のSDK例外や証明書情報は表示・転送しない。中断後の再試験は新しいrequestId/challengeで開始する。

ユーザPCごとにCPU種別・macOS版、ブラウザ版、リーダー型番・ドライバ、JPKIソフト/API版、PIN入力経路、署名方式を確認する。対応表に実測結果を記録するまで「ユーザPCで動作確認済み」としない。[JPKI公式Mac案内](https://www.jpki.go.jp/download/mac.html)は対応確認の出発点であり、本システムの動作保証ではない。

## 5. P0の実装済みHTTP契約

| メソッド・パス | 挙動 |
| --- | --- |
| GET `/` | 基盤情報のJSON。ブラウザ参加画面ではない |
| GET `/healthz` | 200 alive。DB正常の保証ではない |
| GET `/readyz` | DBにアクセスでき、worker更新が90秒以内なら200。それ以外503 |
| POST `/api/mock/jpki/verify` | 下記の合成入力だけを処理 |
| その他の `/api/*` | 501 `PROTOCOL_NOT_IMPLEMENTED` |

```json
{"scenario":"valid","person":"person-a","intentHash":"0000000000000000000000000000000000000000000000000000000000000000"}
```

`person` は `person-a` / `person-b`、intentHashは小文字hex64桁。例のゼロ値はP0疎通用で、P1ではサーバーが固定したintentのhashを使う。JSON本文2048 bytes上限、未知フィールドを拒否する。証明書・PIN・署名値は入力しない。JSON不正・許可外入力400、過大413、JSON以外415。`JPKI_PROVIDER` はmockのみ起動可能。

| scenario | HTTP / outcome | 意味 |
| --- | --- | --- |
| valid / renewed | 200 / verified | 同じ合成人物ID。更新をfixtureで模倣 |
| revoked / expired / invalid_signature | 422 / rejected | 失効・期限切れ・不正署名を模倣 |
| timeout | 504 / indeterminate | 結果不明の模倣。実時間待機はしない |
| unavailable | 503 / unavailable | PF障害を模倣 |

応答には `provider=mock`、`isMock=true`、`assurance=simulation-only` とintentHashがある。成功時は `mockSubjectId`、`certificateFixture`、`evidenceHash` を返す。evidenceHashはfixtureから計算した値であり、PFによる署名証跡ではない。現在このAPIに所有セッション認証はなく、管理者限定の試験入口でのみ使用する。

## 6. P1の登録フローとAPI案

1. `/app/` で模倣表示・試験同意を提示し、EOAと試験chainを選ぶ。実資産用walletを前提にしない。
2. 所有Cookieを持つセッションを作り、新規FIDO2 credentialを仮登録する。UV required、attestation none。公開鍵・alg・counter・backup flagsを記録する。
3. サーバーはBindingIntentを固定する。v1の項目はsessionId、protocolVersion、mockSubjectId、nonce、expiresAt、rpId、origin、chainId、wallet、credentialIdHash、credentialPublicKeyHash、consentVersion。JCS＋SHA-256を候補に形式とテストベクトルを実装時に固定する。
4. 模倣PFをサーバー内から呼び、同じintentHashと合成人物を照合する。ブラウザが提出した「verified」は信用しない。
5. 同じintentを参照するWebAuthn assertionとSIWEを検証する。SIWEのdomain、URI、nonce、wallet、chain、期限、resources、requestIdを固定値と照合する。
6. binding、VC発行用outbox、セッション受付完了を同一DB transactionで保存する。返却は202、模擬処理完了を別途表示する。

| メソッド・パス（すべて未実装） | 要求・正常応答 |
| --- | --- |
| POST `/api/v1/binding-sessions` | wallet、chainId、同意版、合成人物 → 201 id・期限 |
| POST `…/:id/webauthn/registration-options` | 所有セッション → 200 登録challenge |
| POST `…/:id/webauthn/registration` | credential応答 → 200 仮登録・intent固定 |
| POST `…/:id/mock-jpki` | 許可scenarioのみ → 200 模倣確認／504不明／503障害 |
| POST `…/:id/webauthn/assertion-options` | → 200 intent対応challenge |
| POST `…/:id/webauthn/assertion` | assertion → 200 検証結果 |
| POST `…/:id/siwe-message` | → 200 サーバー固定メッセージ |
| POST `…/:id/siwe` | message・署名 → 202 受付 |
| GET `/api/v1/binding-sessions/:id` | → 200 所有者の進捗 |
| POST `/api/v1/auth/options` / `/api/v1/auth/verify` | 新規challengeと継続認証 |

`…` は `/api/v1/binding-sessions`。旧配置設計の `/:id/jpki` に実証明書を受ける案はプロトタイプで使用しない。P0の直接APIをP1の認可済み登録処理の代用にしない。

## 7. 状態・再送・エラー

```text
CREATED → CREDENTIAL_STAGED → INTENT_FIXED → MOCK_IDENTITY_ACCEPTED
        → PASSKEY_VERIFIED → WALLET_MESSAGE_ISSUED → ACCEPTED
途中：FAILED / EXPIRED / CANCELLED
模倣PFの結果不明：IDENTITY_INDETERMINATE（成功扱いしない）

外部処理を表す別列：PENDING → SIMULATED_CONFIRMED
                         → REJECTED / NEEDS_REVIEW
```

全セッションTTLは10分。各challengeは一回限りで、期限はセッションの残り時間を超えない。IDENTITY_INDETERMINATEからの再試験は期限内の明示操作と新stage requestで行い、成功を捏造しない。処理済みpayloadの再送以外は過去stageへ戻れない。カード試験状態はこの状態機械に入れない。

UUIDのみでは認可しない。所有Cookieの秘密値はハッシュでDB保存し、全操作で所有権を確認する。未認証401、不一致／CSRF403、不正入力400、順序／冪等キー競合409、期限切れ410、検証不合格422、過負荷429を区別する。要求本文の初期上限は32 KiBとし、実測で必要な場合だけ改訂する。

`sessionId + stage + Idempotency-Key` を一意にし、同じキーの異なるpayloadは拒否。stageを短いleaseで予約し、成功とnonce消費を原子的に保存する。初回＋再試行3回を上限とし、同時進行はセッション当たり1件、API処理全体は初期5件。人がカードを操作する間DB transactionを保持しない。バックエンドが再起動しても一意制約・outboxから復旧する。

## 8. 操作署名・VC・第三者検証

登録完了後、合成作品と合成の権利／委任VCを使って試験する。主体IDはサービス内のランダムな `mock:` 名前空間とし、DID方式は未選定。本人確認VC・鍵束縛VC・作品別権利VCを分け、試験発行者とその鍵履歴・証明範囲をローカル信頼台帳に登録する。

[共通仕様16節](/specification#evidence-design)のOperationIntentを使い、作品・相手方・条件・chain・実行先・引数・期限・nonce・VC参照を固定する。同じintentHashをWebAuthnとEIP-712に結び付ける。P1はEOAのみ、コントラクトウォレットは非対応。サーバーで権限と失効を再確認してから模擬実行を予約する。

| API案（未実装） | 内容 |
| --- | --- |
| POST `/api/v1/operations` | 許可された合成作品・操作からintentと署名要求を生成 |
| POST `/api/v1/operations/:id/approve` | 両署名を照合し202受付。変更・期限切れ・再送を検査 |
| GET `/api/v1/operations/:id` | 受付と模擬実行の別状態 |
| GET `/api/v1/operations/:id/evidence` | 所有者に証拠パッケージを限定開示 |
| GET `/api/v1/credentials/:id/status` | 試験用VC状態。閲覧権限を検査 |

証拠manifestは版、ファイルhash、提供者、生成日時を持つ。原文、canonical bytes、両署名、合成VC、過去の発行者鍵・状態、NPO試験鍵による受付署名、模擬実行結果を含める。実カード証明書・署名は含めない。独立タイムスタンプは未選定であり、サーバー時刻を独立タイムスタンプと表示しない。

第三者検証ツールはMac上でexportを検証し、発行者台帳を検証者が選ぶ。整合性、主体と鍵、権限、過去時点、実行一致をそれぞれ成功／失敗／判断不能で返す。欠落した失効証跡は判断不能。mock印の削除・実環境向け用途への流用は拒否する。DID/VC形式・署名方式は共通テストベクトル確定まで相互運用を保証しない。

## 9. 保存・秘密情報・削除

| データ | 保存先・扱い |
| --- | --- |
| PIN・カード秘密鍵 | サーバー受入禁止。PINはローカル入力経路のみ |
| 実カード証明書・署名・人物情報 | ローカル試験時の短期メモリのみ。クラウド・通常ログ・export禁止 |
| 合成主体・試験用credential公開鍵・wallet | P1のDB。実人物確認と結合しない |
| 試験用パスキー／ウォレット秘密鍵 | 認証器／wallet管理。APIへ送らない |
| セッション秘密値 | Cookie。DBはhashのみ。URL・ログへ出さない |
| 合成VC・署名・操作原文 | P2の暗号化証拠庫。DBは索引・状態。鍵は証拠と分離 |
| 監査ログ | 時刻、操作ID、版、模倣印、列挙結果のみ。本文やCookieを記録しない |

DBの追加表はbinding_sessions、stage_operations、webauthn_credentials、binding_records、outbox、operations、credentials、issuer_key_history、evidence_manifests。現状のruntime_probeから自動的に存在すると扱わず、migrationで導入する。

P1/P2の保存初期案は、期限切れセッション秘密値と未採用credentialを終了後24時間以内に削除、合成VC・操作証拠・最小監査を試験終了後30日以内に削除、試験backupは7世代とし最終削除から7日以内に消去する。模擬紛争試験で保持する場合は終了日を記録する。この初期案はADR-021に基づくプロトタイプ限定で、本番保存期間を決めない。試験用wallet等にも識別可能性があるためアクセスを限定する。

生の例外・SQL・アクセスログへ入力を出さず、検証用canaryで漏出を試験する。Compose secretsのファイルを暗号化保管と称さない。鍵・DBパスワード・復旧情報をgitに保存しない。VM内volumeだけではバックアップとしない。

## 10. 実装順序と受入条件

| 段階 | 合格条件 |
| --- | --- |
| P0 | 7シナリオ、未知フィールド拒否、DB停止時503、worker停止時readiness不合格、非公開ポート |
| P1 | localhostで登録→模倣→WebAuthn→SIWE→受付が通る。Origin・nonce・wallet・別セッション・順序・再送改変を拒否 |
| P2カード | 対応表を記録。PINがWeb/ログ/ネットワークに出ない。取消・抜去・不正PIN・timeoutを区別。サーバー未接続でも試験できる |
| P2証拠 | 合成VCと操作両署名を検証。権限外・失効・期限切れ・原文改変・欠落証拠を検出。実カードデータ混入を拒否 |
| P2障害 | DB commit後停止・worker再起動で重複しない。未確定結果はNEEDS_REVIEW。削除・復元の整合を確認 |
| P3 | 開発者SSHとは別の参加経路とOriginを決定。5人負荷から測定し、段階的に規模を上げる |

API処理のみp95 500 ms以内を初期測定目標とし、端末操作・トンネル遅延は別指標にする。OOM・ディスク待ち・既存サービスへの影響があれば停止し、資源配分を見直す。無料枠で100人同時利用できるとは保証しない。

外部テストネットへ接続する段階ではRPC経路・chainId・contract・送信鍵・finality・再編成対処を追加決定する。それまでは本物のtransaction hashを返さず `simulationRunId` を使用する。実PF・実権利・本番データの導入は[本番系の提供開始条件](/production-specification)に従う。

## 11. 接続方式の参照資料

[Chrome Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)は拡張とローカルプロセスの通信方式、[W3C Secure Contexts](https://www.w3.org/TR/secure-contexts/#is-origin-trustworthy)はlocalhostの開発環境を検討する根拠です。いずれもJPKI連携やユーザPCでの動作を保証するものではありません。

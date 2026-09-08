::: info Mac実機用プロファイルを追加（2026年9月8日）
[Mac実機プロトタイプ v0.1](https://shigeichiroyamasaki.github.io/jpki-wallet-project/mac-prototype.html)にパスキー・カード連携・ウォレット模擬操作を実装しました。以下のクラウド／専用拡張の設計全体を実装したものではなく、実Touch ID・実カード成功も未確認です。実装差分・起動方法は同ページを参照してください。
:::


# 鍵束縛プロトコル仕様書 v0.4

更新日：2026年9月7日。本番系とプロトタイプ系を分離し、Macブラウザによるプロトタイプの詳細を追加。

::: warning 適用範囲
本番系は実サービス導入に向けた要求仕様であり、稼働・認定・法令適合を示しません。プロトタイプ系はPF・証明書確認を模倣します。追加のカード連携・WebAuthn・ウォレット連携・VC・証拠検証は未実装です。法的整合性は専門家による精査が必要です。
:::



## 1. 文書構成と適用順序

| 文書 | 対象と役割 |
| --- | --- |
| [本番系仕様](https://shigeichiroyamasaki.github.io/jpki-wallet-project/production-specification.html) | 実本人確認・実権利操作に必要な構成、責任、提供開始条件 |
| [プロトタイプ系詳細仕様](https://shigeichiroyamasaki.github.io/jpki-wallet-project/prototype-specification.html) | ユーザPC、カードリーダー、ブラウザ、PF模倣、Dockerの具体的な接続・API・状態・受入条件 |
| 本ページ第16節 | 主体識別・VC・操作証拠の共通設計。方式選定待ちの項目も含む |
| [配置・運用設計](https://shigeichiroyamasaki.github.io/jpki-wallet-project/prototype-design.html) | 既存GCE、Compose、費用・資源配分、停止履歴と運用上の制約 |
| [旧仕様 v0.3](https://shigeichiroyamasaki.github.io/jpki-wallet-project/specification-legacy.html) | 分離前の設計履歴。現行の実装要件としては使用しない |

v0.4の系別仕様は旧v0.3の矛盾する記述に優先します。プロトタイプの接続方式・API・工程についてはプロトタイプ系詳細仕様が配置・運用設計の旧案に優先します。第16節の共通要求は各系の適用範囲内で使用し、模倣から実本人性を導きません。ADR-001〜013は履歴として維持し、追加方針はADR-020・021および[ADR-022](https://shigeichiroyamasaki.github.io/jpki-wallet-project/prototype-decisions.html#adr-022)で追跡します。

## 2. 本番系とプロトタイプ系の境界

本仕様では、利用者が操作する端末を「ユーザPC」と表記します。現行プロトタイプの対応OSはmacOSです。本番系の対応OS・端末は別途選定します。

| 項目 | 本番系 | プロトタイプ系 |
| --- | --- | --- |
| 本人確認 | 契約・機能・有効性確認を確認した実PF | 合成人物と7シナリオの模倣 |
| カード | 対応端末・方式を選定して実接続 | ユーザPCのリーダーでローカル試験。実証明書をサーバーに送らない |
| 認証・署名 | 本番Origin/RP IDと鍵・失効運用 | localhost、試験用パスキー・EOA（追加実装） |
| VCと権限 | 審査・根拠を伴う証明、検証者の信頼方針 | simulation-onlyの合成VC。実権利は付与しない |
| ネットワーク | 公開又は管理された利用者用経路、HTTPS、可用性設計 | 管理者SSH転送、既存IPv6、公開IPv4/NAT追加なし |
| チェーン | 対象ネットワークと権限・確定条件を別途確定 | 当面は模倣。テストネット接続も別工程 |
| データ | 利用目的・委託・保存・開示・削除を確定 | 合成データのみサーバーへ。カード試験の出力と分離 |
| 検証結果 | 法的評価と技術的判定を区別 | 実JPKI・実権利・法的推定効の実証とはしない |

## 3. 実装状況の読み方

「実装済み」はリポジトリのコードで確認できる機能、「追加設計」は今後の実装要件、「要検証」は方式・環境の確認が残る事項です。クラウドの停止・資源値は配置時の記録であり、この文書更新ではVMの再起動や現在の稼働確認を行っていません。

以下の第16節は既存リンクを維持するため番号とアンカーを保持します。本番への適用は本番系仕様の提供開始条件、プロトタイプへの適用はプロトタイプ系仕様の模倣境界に従います。

## 16. 主体・権限・操作証拠の補足仕様 v0.1 {#evidence-design}

追加日：2026年9月7日。対応：[ADR-020](https://shigeichiroyamasaki.github.io/jpki-wallet-project/adr.html#adr-020)・[ADR-021](https://shigeichiroyamasaki.github.io/jpki-wallet-project/adr.html#adr-021)。仕様書v0.4の両系に対する共通設計であり、以下の機能は未実装。旧仕様のVC見送りはP0に限定し、次の検証段階に証拠基盤を追加する。法的な推定効の適用は未確認である。

### 16.1 主体と証明

主体IDはサービス内で安定した識別子とする。DID方式は未選定。身元の対応表は非公開とし、主体IDをウォレットアドレスやJPKI証明書の単純ハッシュから自動生成しない。主体と操作者が異なる法人・代理のケースは委任VCで表現する。

| VC | 必須の意味情報 |
| --- | --- |
| 本人確認VC | subject、確認方法・日時、provider、保証範囲、証拠参照、模倣フラグ |
| 鍵束縛VC | subject、FIDO2公開鍵とcredential識別情報、wallet、chain、登録文書hash、検証方式版 |
| 権利・委任VC | 権利者、操作者、作品ID・版、権利種別、許可操作、地域・期間、共同権利・再委任条件、根拠文書参照 |

共通項目はid、issuer、subject、発行・確認日時、有効期間、status参照、schema/policy版、署名。これは意味上の項目表であり、W3C準拠プロファイルそのものではない。署名方式・正規化・DID解決・状態確認を固定し、テストベクトルを用意してから相互運用を宣言する。

発行者台帳は、実在主体との対応、署名鍵の履歴、有効期間、証明可能な範囲、審査・失効方針を保持する。台帳を信頼する根拠も検証者に提示する。

### 16.2 登録文書と鍵変更

登録文書は「本サービスでこの鍵を自分の操作に用いる」という意思を示し、subject、rp_id/origin、FIDO2公開鍵hash、wallet/chain、nonce、期限、規約版を固定する。ADR-015のBindingIntentと同じデータを参照し、表示文書と署名対象の対応を保存する。

実JPKIが文書又はダイジェストに署名できる場合のみ、その事実を記録する。通常の本人確認応答しか得られない場合は、身元確認証拠とFIDO2・ウォレットによる登録同意を別証拠として保存する。PFの機能は模倣で検証済みと扱わない。

鍵の追加・変更・紛失復旧は別の操作とし、継続性確認、旧鍵の失効、新VC発行、本人通知、履歴を残す。新しい鍵が過去に署名したとは扱わない。

### 16.3 操作文書と二重承認

```text
OperationIntent =
 protocolVersion, operationId, subjectId,
 workId, workVersion, action, counterparty,
 termsHash, displayDocumentHash, credentialHashes,
 chainId, verifyingContract, functionAndArgumentsHash,
 wallet, nonce, issuedAt, expiresAt
```

1. サーバーは意味と表現を固定した操作文書を作り、対象・権限・契約条件を利用者に表示する。
2. OperationIntentのcanonical bytesとhashを確定する。正規化方式は実装前に固定し、hashだけでなく原文も証拠保存する。
3. WebAuthn challengeに、用途を区別する固定値、intentHash、ランダムchallengeを含める。署名・公開鍵・origin・rpIdHash・type・UV・challenge・所有セッションを検証する。
4. ウォレットには同じintentHashと実行先・nonce・期限を含むEIP-712署名を要求し、サーバーとコントラクトの解釈を一致させる。SIWEログインはこの承認を代替しない。
5. VC署名・発行者の権限・subject対応・期限・失効・作品別の操作範囲を確認する。VCを持っているだけでは認可しない。
6. 実行直前にも状態と有効期限を確認する。nonce消費を原子的に行い、実際の呼出先と引数が署名対象に一致する場合だけ実行する。再送は同じ操作IDで照合し、重複実行しない。

二つの鍵が同じ端末・同期基盤で管理され得るため、独立した二者承認や絶対的な否認防止とは称さない。初期検証はEOAに限定し、コントラクトウォレットは別の検証要件を定める。WebAuthnのオンチェーン直接検証は今回の必須条件ではなく、その部分を検証するNPOバックエンドへの信頼を明示する。

### 16.4 証拠パッケージ

パッケージには以下を含め、各ファイルのhash、形式・方式版、証拠の提供者をmanifestに記載する。

- 登録・操作文書の原文、署名対象bytes、表示内容の版。
- FIDO2 assertion一式・検証公開鍵、ウォレット署名・署名対象。
- 利用VC、発行者鍵の過去版、操作時点の状態証拠と取得時刻。
- PFの検証証跡又はNPOの証明。独立検証できる範囲を明示。
- NPOが署名した受付証、外部タイムスタンプ（採用後）、監査参照。
- 実行結果の別記録、transaction hash、実行先・引数、receiptと確定性確認情報。受付時点で実行完了とはしない。

状態情報が後から取得された場合は、その事実と証明可能な時間範囲を記録する。操作時点の失効を判断できないときは「不明」とする。状態情報の最大許容経過時間、緊急失効の反映時間、チェーン確定条件を運用開始前に固定する。

### 16.5 第三者検証

検証ツールは、運営者の画面表示に依存せずエクスポートされた証拠を検証する。検証者が受け入れる発行者・policyを指定できることを要件とする。

出力は「暗号学的整合性」「主体と鍵の対応根拠」「権限範囲」「過去時点の有効性」「承認と実行の一致」を別々に示し、成功・失敗・証拠不足／判断不能を区別する。「推定効あり」「著作権保有が法的に確定」といった自動判定はしない。タイムスタンプは本人意思や権利内容を保証しない。

### 16.6 保存・開示

通常ログに機微データを出力せず、証拠庫を分離して暗号化、最小権限、改変検出、アクセス監査を行う。公開チェーンにはVCや契約書の原文を置かない。コミットメントを公開する場合も相関リスクを評価する。

保存期限、法的保全、削除、開示対象、PF側の証拠取得可能期間、サービス終了後の取得手段は未確定。ADR-011の非保存方針と衝突する項目を解消し、専門家レビューと改訂を完了するまで実データを導入しない。削除後に検証できなくなる範囲も説明する。

### 16.7 実装段階と受入条件

P0の模倣APIは現状維持。追加段階では合成の本人確認VC・鍵束縛VC・権利VCを発行し、FIDO2とEOAの実署名、証拠出力、独立検証を試験する。証拠には `provider=mock / isMock=true / assurance=simulation-only` を伝播させ、実権利の操作先では拒否する。

必須試験：別人のVC混入、作品・相手方・引数差替え、署名再送、期限切れ、失効、無権限発行者、旧鍵・新鍵の取り違え、改変された原文、欠落証拠、結果不明、バックエンド再起動時の重複実行。過去時点を立証できない試験で、検証ツールが判断不能を返すことも確認する。

PF実接続、実権利操作、推定効の適用評価、独立タイムスタンプ事業者、保存期間は後工程。PF模倣の成功でこれらを完了扱いにしない。

---

# 本番系仕様 v0.4

更新日：2026年9月7日。[仕様書総目次](https://shigeichiroyamasaki.github.io/jpki-wallet-project/specification.html) / [プロトタイプ系](https://shigeichiroyamasaki.github.io/jpki-wallet-project/prototype-specification.html)

::: warning 要求仕様・本番未提供
本書は実サービスに必要な要求を整理したものです。実PF契約・接続、端末対応、法的整合性、運用体制は未確定です。NPOのSPとしての位置付けやPFの機能・認定範囲は導入時に確認し、本書だけで確認済みとは扱いません。
:::

## 1. 目的と責任境界

JPKIによる初回本人確認、FIDO2による継続認証、ウォレット署名による操作意思の証拠を組み合わせる。主体識別子、本人確認VC・鍵束縛VC・権利／委任VC、第三者が検証できる証拠を分離して管理する。鍵束縛だけで著作権保有や法的効果の承継を保証しない。

| 主体 | 責任 |
| --- | --- |
| 利用者端末 | 内容表示と同意、カード・パスキー・ウォレットの署名操作 |
| NPOバックエンド | セッション・認可・PF委託結果の取扱い、VC発行、証拠保存、失効・復旧、監査 |
| 実PF | 契約した範囲のJPKI署名・証明書有効性確認。具体API・証跡形式は要確認 |
| 権利・委任VC発行者 | 作品・権限・期間の審査と根拠管理、訂正・失効 |
| チェーン／外部実行系 | 署名対象と一致する処理、再送防止、実行結果の記録 |
| 第三者検証者 | 信頼する発行者と方針を選び、証拠の範囲内で判定 |

## 2. 論理構成

```text
利用者端末（ブラウザ又は検証済みアプリ）
  ├─ 対応カード連携 ─ マイナンバーカード
  ├─ FIDO2認証器
  └─ ウォレット
       │ HTTPS／操作単位の認証・認可
NPO API ─ 実PFアダプター ─ 契約済みPF
  ├─ 主体・鍵履歴・状態DB
  ├─ VC発行／失効 ─ 発行者台帳・権利根拠
  ├─ 暗号化証拠庫 ─ 限定開示 ─ 第三者検証者
  └─ outbox／worker ─ 選定済みチェーン・実行先
```

本番の利用者端末をモバイルWebViewに固定しない。Macブラウザ＋リーダー、モバイルアプリ等の各方式はSDK・OS・ブラウザ・PFの対応と実機試験で採否を決める。プロトタイプのlocalhost RP IDやSSH転送を本番参加者のアクセス方式として転用しない。

## 3. 本人確認と登録

1. 同意文書の版、対象サービス、wallet、chain、セッション期限を固定する。
2. 初回FIDO2 credentialを仮登録し、検証公開鍵を取得する。未登録の鍵によるassertionを既存アカウント認証と扱わない。
3. 登録文書とBindingIntentに主体・候補公開鍵・ウォレットを結び付ける。
4. 実PFを通じた本人確認を行う。任意文書／ダイジェストにJPKI署名できるかはAPI・署名形式・二重ハッシュの有無まで確認する。非対応なら本人確認証拠と別途の登録同意を区別する。
5. 同じintentに対するWebAuthn assertionとSIWEを照合し、期限・nonce・Origin・RP ID・wallet・chain・セッション所有者を確認する。
6. 束縛記録とoutboxを原子的に保存する。受付と外部実行確定を別状態として通知する。

PFの人物識別子の継続性・更新・事業者変更時の取扱いを確認する。識別子のハッシュ化だけで完全なSybil耐性を保証しない。SP自身による検証の法的可否や使用可能なアルゴリズムを、旧仕様の断定から引き継がず専門家・PFに確認する。

## 4. 継続認証・権利操作・証拠

継続認証には新規challengeを発行し、登録nonceを再利用しない。重要操作は[共通仕様16節](https://shigeichiroyamasaki.github.io/jpki-wallet-project/specification.html#evidence-design)のOperationIntent、操作別WebAuthn assertion、EIP-712署名を使用する方針とする。SIWEログインのみで著作権・原盤権等の移転・許諾を承認しない。

VCの暗号学的検証と発行者の権限・根拠の検証を分ける。権利者と操作者が異なる場合は委任範囲を確認する。証拠には原文・署名対象・VC・過去の鍵と失効状態・受付証・実行結果を含め、確認不能な事項は判断不能とする。

DID/VCの採用は本システムの設計選択であり、あらゆるウォレット利用に法律上一律必須であるとの結論ではない。電子署名法3条の推定効の適用は、具体方式・記録・運用の専門家精査を必要とする。

## 5. データ・鍵・可用性

- 本人情報、証明書、契約原文、VC全文を公開チェーンに保存しない。公開コミットメントにも相関リスクを評価する。
- 証拠庫と通常ログを分離し、暗号化・最小権限・アクセス監査を実施する。ADR-011の非保存方針と衝突する保存項目は実データ導入前に改訂する。
- 保存・削除・法的保全・開示・委託・国外処理・サービス終了時の証拠取得を確定する。1年の監査ログ案を証拠全体の保存期限に流用しない。
- PF認証情報、VC発行鍵、チェーン送信鍵、管理鍵を分離する。失効・鍵更新・復旧・監査の責任者を定める。
- HTTPS、利用者アクセス、バックアップ復元、監視、障害対応、必要な可用性と容量を設計する。無料枠の単一VMを本番SLAの根拠にしない。

## 6. 提供開始条件

| 条件 | 必要な確認 |
| --- | --- |
| PF・法的整理 | 契約・委託範囲・証明書検証・証跡、NPOの責任、専門家レビュー |
| 端末 | 対応表、PIN入力経路、署名形式、初回登録・再認証・失効・紛失復旧のE2E |
| 相互運用 | DID方式、VC署名・状態方式、正規化、署名対象のテストベクトル |
| 権限・実行 | 根拠審査、再送防止、実行先照合、結果不明・reorg時の保留 |
| 運用 | 負荷・監視・鍵管理・復元・削除・通知・異議申立て・終了時手順 |

模倣シナリオの成功だけでは上記を満たさない。[旧仕様](https://shigeichiroyamasaki.github.io/jpki-wallet-project/specification-legacy.html)は検討履歴として参照し、本番提供の証拠には使用しない。

---

::: info Mac実機用プロファイルを追加（2026年9月8日）
[Mac実機プロトタイプ v0.1](https://shigeichiroyamasaki.github.io/jpki-wallet-project/mac-prototype.html)にパスキー・カード連携・ウォレット模擬操作を実装しました。以下のクラウド／専用拡張の設計全体を実装したものではなく、実Touch ID・実カード成功も未確認です。実装差分・起動方法は同ページを参照してください。
:::


# プロトタイプ系詳細仕様 v0.4

更新日：2026年9月7日。[仕様書総目次](https://shigeichiroyamasaki.github.io/jpki-wallet-project/specification.html) / [本番系](https://shigeichiroyamasaki.github.io/jpki-wallet-project/production-specification.html) / [配置・運用](https://shigeichiroyamasaki.github.io/jpki-wallet-project/prototype-design.html)

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

![Macブラウザと既存Google Cloud VMによるプロトタイプ構成](https://shigeichiroyamasaki.github.io/jpki-wallet-project/images/prototype-architecture.svg)

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

[共通仕様16節](https://shigeichiroyamasaki.github.io/jpki-wallet-project/specification.html#evidence-design)のOperationIntentを使い、作品・相手方・条件・chain・実行先・引数・期限・nonce・VC参照を固定する。同じintentHashをWebAuthnとEIP-712に結び付ける。P1はEOAのみ、コントラクトウォレットは非対応。サーバーで権限と失効を再確認してから模擬実行を予約する。

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

外部テストネットへ接続する段階ではRPC経路・chainId・contract・送信鍵・finality・再編成対処を追加決定する。それまでは本物のtransaction hashを返さず `simulationRunId` を使用する。実PF・実権利・本番データの導入は[本番系の提供開始条件](https://shigeichiroyamasaki.github.io/jpki-wallet-project/production-specification.html)に従う。

## 11. 接続方式の参照資料

[Chrome Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)は拡張とローカルプロセスの通信方式、[W3C Secure Contexts](https://www.w3.org/TR/secure-contexts/#is-origin-trustworthy)はlocalhostの開発環境を検討する根拠です。いずれもJPKI連携やユーザPCでの動作を保証するものではありません。

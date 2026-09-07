# 鍵束縛プロトコル仕様書
## JPKI × FIDO2 × Ethereum 公開鍵束縛による音楽Web3ガバナンス実験基盤

- バージョン: v0.3（ADR-001〜013の内容を反映し、セッション管理・異常系・個人情報・シークレット管理を詳細化）
- 対象: 100人規模プロトタイプ実験
- ステータス: 実装前レビュー段階
- 準拠ADR: ADR-001〜ADR-013（`adr-key-binding-protocol.md`）

---

## 1. 目的

音楽サブスクリプションをスマートコントラクトベース化し、資金配分等のガバナンスをプラットフォーマ中心から音楽クリエイターと利用者中心に移行するシステムにおいて、ガバナンス参加者の一意性（Sybil耐性）と本人性を、以下3つの鍵の暗号学的束縛によって担保する。

- **JPKI公開鍵**: 公的個人認証サービスによる本人性の担保（住民基本台帳ベース）
- **FIDO2 Passkey公開鍵**: デバイスに紐づく継続認証
- **Ethereumウォレット公開鍵**: オンチェーンでの行為主体性

本仕様は、VC（Verifiable Credential）発行を将来のスコープとし（ADR-005）、まず3鍵の束縛プロトコル自体の実装を対象とする。

## 2. 用語

| 用語 | 定義 |
|---|---|
| SP事業者 | 公的個人認証法上、電子証明書の有効性確認をPF事業者に委託して公的個人認証サービスを利用する事業者。本プロジェクトのNPO法人がこれに該当する（ADR-001） |
| PF事業者 | 主務大臣認定を受け、署名検証業務を行う事業者。本仕様ではPocketSign Verifyを採用（ADR-002） |
| 束縛セッション | nonce発行から束縛レコード生成（またはセッション失敗・失効）までの一連の処理単位。`binding_sessions`テーブルで管理する（ADR-010） |
| 束縛レコード | 束縛セッションが成功裏に完了した結果として生成される、3つの鍵の検証結果の恒久的な記録。`binding_records`テーブルで管理する（ADR-011） |
| SIWE | Sign-In with Ethereum（ERC-4361）。Ethereumアカウントによるログイン・署名の標準規格（ADR-004） |

## 3. 採用標準規格

| 対象 | 規格・方式 | 備考 |
|---|---|---|
| JPKI | 公的個人認証法に基づく署名用電子証明書（RSA2048 / ECDSA P-256） | PocketSign Verify API経由でのみ検証可能。SP事業者側での自前検証は不可（ADR-002） |
| JPKI連携 | PocketSign Verify API / JPKIAP SDK | スマホNFCカード読み取り、および「スマホJPKI」（Android/iOS）に対応 |
| ダイジェストハッシュ | CRYPTREC電子政府推奨暗号リスト準拠（SHA-256） | PocketSign Verify APIの制約による |
| FIDO2 | W3C WebAuthn Level 2 / CTAP2、署名アルゴリズムES256必須 | Attestationは`none`（プライバシー配慮）（ADR-003） |
| Ethereum | EIP-4361 (SIWE) | `resources`フィールドにJPKI・FIDO2検証結果への参照を埋め込む（ADR-004） |

## 4. システム構成

### 4.1 全体構成

```mermaid
flowchart TD
    subgraph MobileApp["モバイルアプリ（要検証: 構成はADR-009参照）"]
        WV[WebView UI]
        NB[Native Bridge]
    end
    NB --> JS[JPKIAP SDK]
    WV -.要検証: WebView内でのFIDO2動作.-> FA[FIDO2 プラットフォーム認証器]
    WV -.MetaMask SDK・未確定.-> ETHW[Ethereumウォレット]

    MobileApp --> BE[NPOバックエンドサーバー]
    BE --> AD[JPKI検証アダプター層]
    AD -->|署名・証明書・ダイジェスト| PS[PocketSign Verify API]
    PS -->|基本4情報・利用者ID| AD
    BE --> SDB[(PostgreSQL\nbinding_sessions)]
    BE --> RDB[(PostgreSQL\nbinding_records)]
    BE -->|コミットTx送信| REG[IdentityBindingRegistry\nAccessControl: BACKEND_ROLE]
    WK[バックグラウンドワーカー] -->|確認・再試行| REG
    WK --> RDB
```

- SP事業者（本NPO）は署名検証設備を自ら保有せず、PocketSign Verify APIへの委託によって公的個人認証サービスを利用する（ADR-001・ADR-002）。JPKI検証はNPOが管理するバックエンドサーバーからのみ呼び出し、APIトークンをクライアントに含めない。
- バックエンドとPocketSign Verify APIの間には**JPKI検証アダプター層**を設け、PocketSign固有のレスポンス形式に他の層を直接依存させない（ADR-008）。将来PF事業者を切り替える場合は、このアダプターの実装差し替えのみで対応する。
- **モバイルアプリのWebView中心構成は、WebView内でのFIDO2（プラットフォーム認証器）動作の実機検証結果が出るまで確定しない（ADR-009）。** 動作しない場合、FIDO2もNative Bridge経由でCredential Manager API / Authentication Servicesを直接呼び出す構成に切り替える。
- ウォレット接続方式（MetaMask SDK等）も同様に、WebView構成の結論を待って確定する（ADR-009）。
- `IdentityBindingRegistry`は`Ownable`を使わず**AccessControlに一本化**し、`bind()`を呼べるのは`BACKEND_ROLE`を持つアドレスのみとする。`ReentrancyGuard`は外部呼び出しを伴わない設計のため現時点では導入しない（ADR-009）。

### 4.2 バックエンドのフレームワーク・ライブラリ選定

Webフレームワーク（Fastify/Express）、コントラクト呼び出しライブラリ（ethers@6/viem）は、性能や抽象的な型安全性の優劣ではなく、**チーム習熟度と実装済みコードとの入れ替えコスト**を判断基準として決定する（ADR-009）。本書執筆時点で最終選定は未確定。

## 5. 束縛セレモニーのシーケンス（正常系）

```mermaid
sequenceDiagram
    participant U as 利用者端末
    participant S as NPOバックエンド
    participant P as PocketSign Verify API
    participant W as Ethereumウォレット

    S->>U: セッション作成、nonce発行（binding_sessions: PENDING）
    U->>U: JPKIAP SDKでマイナンバーカード/スマホJPKIタッチ、nonceダイジェストに署名
    U->>U: FIDO2でnonceに対するアサーション生成
    U->>S: JPKI署名値・証明書・ダイジェスト・FIDO2アサーション送信
    S->>P: JPKI署名検証リクエスト
    P-->>S: 検証結果（基本4情報・利用者ID）
    S->>S: 基本4情報から派生値のみ抽出し即座に破棄（ADR-011）、状態をJPKI_VERIFIEDに遷移
    S->>S: FIDO2アサーション検証、状態をFIDO2_VERIFIEDに遷移
    S->>U: SIWEメッセージ提示（resourcesにJPKI/FIDO2検証結果ハッシュを含む）、状態をSIWE_ISSUEDに遷移
    U->>W: SIWEメッセージに署名
    W-->>S: 署名済みSIWEメッセージ
    S->>S: SIWE署名検証、状態をCOMPLETEDに遷移
    S->>S: binding_recordsに束縛レコード作成（onchain_status: PENDING）
    S->>U: 受付完了レスポンスを返却（オンチェーン確定は待たない、ADR-013）
```

各ステージの検証呼び出しはADR-013に基づき冪等に扱われ、ネットワーク再送による重複リクエストは直前の成功結果をキャッシュから返す。

## 6. セッション状態遷移とnonce管理

セッション状態は`binding_sessions`テーブル（PostgreSQL）で管理し、Redis等の追加インフラは導入しない（ADR-010）。

```mermaid
stateDiagram-v2
    [*] --> PENDING: nonce発行
    PENDING --> JPKI_VERIFIED: JPKI検証成功
    JPKI_VERIFIED --> FIDO2_VERIFIED: FIDO2検証成功
    FIDO2_VERIFIED --> SIWE_ISSUED: SIWEメッセージ提示
    SIWE_ISSUED --> COMPLETED: SIWE検証成功
    PENDING --> EXPIRED: TTL(10分)経過
    JPKI_VERIFIED --> EXPIRED: TTL(10分)経過
    FIDO2_VERIFIED --> EXPIRED: TTL(10分)経過
    SIWE_ISSUED --> EXPIRED: TTL(10分)経過
    PENDING --> FAILED: 各ステージのリトライ上限(3回)超過
    JPKI_VERIFIED --> FAILED: リトライ上限超過
    FIDO2_VERIFIED --> FAILED: リトライ上限超過
    SIWE_ISSUED --> FAILED: リトライ上限超過
    COMPLETED --> ONCHAIN_PENDING: コミットTx送信
    ONCHAIN_PENDING --> ONCHAIN_CONFIRMED: トランザクション確定
    ONCHAIN_PENDING --> ONCHAIN_REJECTED: 一意性制約違反等でリバート
    ONCHAIN_REJECTED --> [*]: 束縛レコード即時削除（ADR-011・013）
    EXPIRED --> [*]
    FAILED --> [*]
    ONCHAIN_CONFIRMED --> [*]
```

- **TTL**: nonce発行から10分。期限切れセッションへの検証要求は拒否する（ADR-010）。
- **単一使用性**: Postgresの条件付きUPDATE（`WHERE status = $expected AND expires_at > now()`）で原子的に保証する。分散ロックやRedisのアトミック操作は使用しない（ADR-010）。
- **期限切れ時は部分進捗を再利用しない**: nonceは3つの署名すべてで共有されているため、失効は全ステージの署名を無効化する。ユーザーは新しいセッションで最初からやり直す（ADR-013）。
- **クリーンアップ**: 期限切れセッションは1時間ごとのバッチ処理で`EXPIRED`へ遷移、または物理削除する（ADR-010）。

## 7. データモデル

### 7.1 `binding_sessions`（一時的セッション状態、ADR-010・013）

```json
{
  "session_id": "uuid",
  "nonce": "string",
  "status": "PENDING | JPKI_VERIFIED | FIDO2_VERIFIED | SIWE_ISSUED | COMPLETED | EXPIRED | FAILED",
  "retry_count_jpki": "integer (0-3)",
  "retry_count_fido2": "integer (0-3)",
  "retry_count_siwe": "integer (0-3)",
  "fido2_credential_id": "base64url, nullable",
  "eth_address": "0x..., nullable",
  "expires_at": "ISO8601 timestamp",
  "created_at": "ISO8601 timestamp",
  "updated_at": "ISO8601 timestamp"
}
```

基本4情報・JPKI証明書・署名値はこのテーブルにも一切書き込まない（ADR-011）。

### 7.2 `binding_records`（束縛レコード本体、ADR-011）

```json
{
  "record_id": "uuid",
  "session_id": "uuid (FK)",
  "jpki_provider": "pocketsign",
  "jpki_user_id_hash": "HMAC-SHA256(pepper, user_id) の16進表現",
  "fido2_credential_id": "base64url",
  "eth_address": "0x...",
  "onchain_tx_hash": "0x..., nullable",
  "onchain_status": "PENDING | CONFIRMED | REJECTED",
  "created_at": "ISO8601 timestamp",
  "deleted_at": "ISO8601 timestamp, nullable"
}
```

- `jpki_user_id_hash`は単純なSHA-256ではなく、**NPO固有の秘密のペッパーを用いたHMAC**で算出する。他のPocketSign利用サービスによるクロスサービス相関（名寄せ）を防ぐため（ADR-011）。
- `jpki_provider`フィールドにより、PF事業者切り替え時の新旧レコードの区別・再束縛判定に用いる（ADR-008）。
- `onchain_status`が`REJECTED`になったレコードは、削除請求を待たず即時に物理削除する（ADR-011・ADR-013）。

### 7.3 `audit_logs`（監査ログ、ADR-011）

```json
{
  "log_id": "uuid",
  "session_id": "uuid",
  "provider": "pocketsign",
  "result": "success | failure",
  "error_code": "string, nullable",
  "timestamp": "ISO8601 timestamp"
}
```

基本4情報・証明書の内容は含めない。保持期間は1年間、経過後は削除する（ADR-011）。

## 8. オンチェーンレジストリ

- `IdentityBindingRegistry`は**AccessControlに一本化**し、`bind()`を呼べるのは`BACKEND_ROLE`を持つアドレスのみとする。`Ownable`との併用は行わない（ADR-009）。
- `mapping(bytes32 => address) userIdHashToWallet` により、1人につき1ウォレットの束縛を強制する。
- `mapping(address => bytes32) walletToBindingHash` により、ガバナンスコントラクトから「このウォレットは検証済み束縛を持つか」を1回の参照で確認できるようにする。
- 生の個人情報・証明書はオンチェーンに置かない。コミットメントハッシュのみを記録する（ADR-006）。
- `ReentrancyGuard`は、`bind()`が外部コントラクト呼び出しを伴わないため現時点では導入しない。外部呼び出しを伴う機能が具体化した時点で再評価する（ADR-009）。
- 単位時間あたりの`bind()`呼び出し回数にレート制限を設け、署名鍵漏えい時の被害を時間的に限定する（ADR-012）。

## 9. 異常系の処理方針

正常系（第5節）だけでは実運用は成立しない。以下の異常系をADR-013に基づき実装する。

| 事象 | 挙動 |
|---|---|
| 各ステージの検証失敗 | 同一セッション内で最大3回まで再試行を許可。上限超過でセッションを`FAILED`とし、新しいセッションでのやり直しを要求する |
| セッションのTTL経過 | `EXPIRED`に遷移。部分進捗は再利用せず、全ステップを再実行する |
| 同一ステージへの重複リクエスト | 冪等に扱い、直前の成功結果をキャッシュから返す。PocketSign Verify APIの再課金・FIDO2検証の再実行は行わない |
| オンチェーンコミット未確定 | `binding_records.onchain_status = PENDING`のまま、バックグラウンドワーカーが確認・再試行する |
| オンチェーンコミットの恒久的失敗（一意性制約違反） | セッションを`FAILED`（理由: 重複識別）、`binding_records`を`onchain_status = REJECTED`とし即時削除する。同一人物による複数デバイスからの同時多重登録（レースコンディション）に対する最終防御線として機能する |
| セッション放棄（ユーザーが離脱） | TTL経過により自動的に`EXPIRED`。監査ログのメタデータ以外のデータは残らない |

## 10. 個人情報の取扱い

- **基本4情報（氏名・住所・生年月日・性別）・JPKI証明書・署名値は一切永続化しない。** DB・アプリケーションログ・インフラログのいずれにも書き込まず、PocketSign Verify APIへのリクエストスコープ内のメモリ上でのみ扱い、必要な派生値を算出した時点で即座に破棄する（ADR-011）。
- ログ出力ミドルウェアは、PocketSign APIとの通信内容（リクエスト・レスポンスボディ）を自動的にマスクする（ADR-011）。
- 監査ログは検証イベントのメタデータ（`session_id`・プロバイダ名・結果・タイムスタンプ・エラーコード）のみとし、1年間保持後に削除する（ADR-011）。
- `binding_records`はサービス提供期間中保持する。利用者からの削除請求があった場合、オフチェーンの当該レコードを削除する。**オンチェーンのコミットメントハッシュはブロックチェーンの不可逆性により削除できない**ため、この制約を同意取得時に明示する（ADR-011）。
- `jpki_user_id_hash`はNPO固有のペッパーを用いたHMACで算出し、クロスサービス相関を防止する（ADR-011）。ペッパーの管理方式は第11節を参照。

## 11. シークレット管理

本プロトコルが扱うシークレットは重要度が異なるため、一律の管理方式ではなく重要度に応じた対応を取る（ADR-012）。

| シークレット | 重要度 | 管理方式 |
|---|---|---|
| ブロックチェーン署名鍵（`BACKEND_ROLE`の秘密鍵） | 最高 | 環境変数管理＋ホットウォレット残高の最小化＋コントラクト側のレート制限（第8節） |
| PocketSign Verify APIトークン | 高 | 環境変数管理、クライアントには配布しない（ADR-002） |
| HMACペッパー（第7.2節） | 高 | 環境変数管理 |
| DB接続情報 | 中〜高 | 環境変数管理 |

100人規模のプロトタイプ段階では、クラウドのSecrets ManagerやHashiCorp Vaultは導入せず、デプロイ基盤の暗号化環境変数機能で管理する。以下のいずれかに該当した時点で、ブロックチェーン署名鍵のみをKMS等で管理するハイブリッド方式へ移行する（ADR-012）。

- サービスの収益事業化（ADR-008の本格運用移行と同じタイミング）
- `bind()`の呼び出し量・資金規模の拡大
- チーム規模の拡大によるアクセス権限者の増加
- インシデントの発生

## 12. 本格運用移行時の考慮事項

プロトタイプで確立した束縛プロトコルは、事業規模の拡大に対して層ごとに連続性の強さが異なる。

| 層 | 本格運用への連続性 |
|---|---|
| FIDO2 | 公開標準（WebAuthn）に基づき、事業規模・法人形態に非依存。設計変更ほぼ不要 |
| Ethereum / SIWE | 同様に公開標準ベースで規模非依存。マルチチェーン対応やアカウントアブストラクション（ERC-4337）の追加はあり得るが、束縛の骨格は不変 |
| ZK証明レイヤー（ADR-007） | 束縛レコードのスキーマが安定していれば、JPKI供給元に依存せず継続利用可能 |
| JPKI / PF事業者 | プロバイダの実装詳細に強く結合しており、連続性が最も弱い層 |

JPKI/PF事業者の層については、収益事業化に伴いPocketSign VerifyでのSP契約を継続するか、NPO関連の株式会社を設立してPF事業者化するかを再検討する可能性がある（ADR-001・ADR-002）。この際、以下を前提として設計する（ADR-008）。

- JPKI検証呼び出しはアダプター層の背後に隠し、他の層（FIDO2・SIWE・ZK）に影響を及ぼさない形でPF事業者を切り替えられるようにする。
- `jpki_user_id_hash`がプロバイダ間で可搬な識別子かどうかは未確認であり、切り替え時には**再束縛（re-binding）セレモニー**を正式な移行ステップとして想定する。
- 実装着手前に、PocketSignまたはJ-LISに対し、利用者ID生成ロジックのPF事業者間での可搬性を直接確認する。

## 13. セキュリティ・プライバシー考慮事項（一般）

- ダイジェストのハッシュ関数はCRYPTREC準拠のものに限定する（ADR-002）。
- SIWEメッセージの`domain`検証によりフィッシング・リプレイを防止する（ADR-004）。
- FIDO2のAttestationは`none`とし、デバイス識別情報の不要な収集を避ける（ADR-003）。
- 個人情報の取扱いの詳細は第10節、シークレット管理は第11節を参照。

## 14. 本仕様のスコープ外（今後の検討事項）

- VC（Verifiable Credential）形式への移行（ADR-005）
- 犯罪収益移転防止法・金融商品取引法（集団投資スキーム該当性）の整理
- NPOのPF事業者化の要否判断
- スマホJPKI非対応環境（古いOSバージョン等）でのフォールバック設計
- 再束縛セレモニーの具体的なUX・通知フロー設計（ADR-008）
- WebView内FIDO2の実機検証結果に基づくモバイルアーキテクチャの最終決定（ADR-009）
- TTL（10分）とリトライ上限（3回）の組み合わせが実際のユーザー行動に対して十分な余裕を持つかの検証
- オンチェーンコミットがリバートしたユーザーへのUI・サポート導線の設計（ADR-013）

## 15. 参考

- デジタル庁「公的個人認証サービス（JPKI）」
- PocketSign Verify API ドキュメント
- EIP-4361: Sign-In with Ethereum
- W3C WebAuthn Level 2
- `adr-key-binding-protocol.md`（ADR-001〜013）

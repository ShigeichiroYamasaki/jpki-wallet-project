---
title: プロトタイプ追加ADR案
---

# プロトタイプ追加ADR案

日付：2026年9月7日。元のADR-001〜013を変更せず、以下を補足します。ADR-018は原文で実験終了時データライフサイクル用に参照されているため使用しません。

## ADR-014：Google Cloud無料枠対象VMとDocker Compose

**状態：ユーザー指定に基づく設計。実クラウド配置は未実施。**

既存プロジェクト `sy-creator-first-demo-20260820` の `creator-first-navidrome-demo`（us-west1-b / e2-micro / Debian 12 / pd-standard 30 GB）へ、独立したComposeプロジェクト `jw-prototype` を同居させる。既存無料枠を使っているため新規VMを作成しない。API・worker・PostgreSQL・Caddyの合計メモリ上限は272 MiB、CPU上限は合計0.50。既存サービスと公開IPv6は維持し、公開IPv4・Cloud NATを追加しない。入口はlocalhost:18080。IAP接続は実環境で失敗したため、管理者IPv6 /128に限定した作業時間のみのSSH許可で配置する。PF・証明書確認はすべて模倣し、100人負荷試験は後工程とする。

理由：100人登録規模のプロトタイプに対して運用対象を絞り、PostgreSQLによるセッション管理を維持できる。GKE/Cloud SQL/Cloud NATは初期構成から除く。影響：単一障害点、性能の実測が必要、全費用無料は保証できない。代替：Cloud Runは永続DB・worker設計の変更が必要、東京VMはCompute無料枠外。

## ADR-015：初回credential登録と署名intentの固定

**状態：提案。ADR-003/004/010・仕様v0.3への補完。**

FIDO2登録とassertionを分け、credential公開鍵を保存する。wallet・chain・credential公開鍵hashを含むBindingIntentを固定し、JPKI・WebAuthn・SIWEの証拠をそのintentに結びつける。同期パスキーを許容する案であり端末1台限定とはしない。PocketSignの任意ダイジェスト署名可否は未確認。理由：credential IDだけではassertionを検証できず、nonceの共通化だけでは対象の取り違えを十分定義できない。

## ADR-016：DB outboxと外部処理の結果不明状態

**状態：提案。ADR-010/013の実装補完。**

DB受付完了とチェーン確定を分ける。レコード・outbox・受付完了を同一transactionで保存する。stage処理前のlease・冪等キー・payload照合を用いる。プロバイダ処理後クラッシュやRPC timeoutは成功/失敗と決めつけず照会・手動確認へ回す。オンチェーン再送はeventIdで照合する。理由：条件付きUPDATEだけでは外部課金・外部Txのexactly-once実行は保証できない。影響：NEEDS_REVIEWと運用導線を追加する。

## ADR-017：GCE上での秘密情報の保存方法

**状態：提案。ADR-012の前提を再評価。**

素のVMの環境変数やCompose secretsは暗号化シークレット基盤ではない。P0は模擬DB秘密値をgit除外ファイルへ保存。実JPKI導入時はSecret Managerからroot管理tmpfsへ取得してコンテナに必要な分だけマウントする案を優先する。Google CloudにはSecret Managerの無料枠があるため、コスト・監査の前提を再評価する。VMのroot侵害に耐える方式とは説明しない。BACKEND_ROLE鍵はworker専用、管理鍵はVM外。HMAC鍵交換は再束縛計画を伴う。

各案の詳細・受入条件は[プロトタイプ設計書](/prototype-design)を参照。


## ADR-019：プロトタイプのPF接続・証明書確認を模倣に限定

**状態：ユーザー指定による決定。**

プロトタイプでは実PFへ接続せず、署名・失効・有効期限の判定を合成fixtureで模倣する。成功、更新、失効、期限切れ、署名不一致、タイムアウト、障害の応答を提供する。実証明書・基本4情報を受け付けない。providerはmockで固定し、実JPKIや実サービスの参加資格と区別する。外部IPv4・NATがなくても開発を継続でき、実契約・SDK・実データの取扱いを今回の範囲外にする。影響：実本人性・実証明書検証・PF互換性は検証できない。実接続へ移る時は別途設計・法的精査を行う。

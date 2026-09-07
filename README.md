# JPKI Wallet Project — VitePress site

NPO法人によるJPKI・FIDO2・Ethereum鍵束縛プロトコルのプロジェクトサイトです。正式なサービス名が未指定のため、表示名は仮称の「JPKI Wallet Project」としています。

## ローカルで表示

Node.js 24を推奨します。

```sh
npm ci
npm run docs:dev
```

## ビルド

```sh
npm run docs:build
npm run docs:preview
```

出力先は `docs/.vitepress/dist` です。リポジトリ配下への配置をローカル検証する場合は `PAGES_BASE_PATH=/repository-name/ npm run docs:build` を実行します。

## GitHub Pages

1. このディレクトリの内容を公開先リポジトリのルートへ配置します（既存ファイルがある場合は統合が必要）。
2. GitHubの Settings → Pages → Build and deployment → Source を **GitHub Actions** にします。
3. `main` へpushするか、Actionsで `Deploy VitePress to GitHub Pages` を手動実行します。既定ブランチが異なる場合は `.github/workflows/deploy.yml` の対象ブランチを変更します。

PagesのベースパスをActionsからVitePressへ渡すため、リポジトリ名をソースへ固定する必要はありません。ユーザーページ・プロジェクトページ・カスタムドメインの設定に追従します。

設定方法の参考: [VitePress公式デプロイガイド](https://vitepress.dev/guide/deploy)

## コンテンツ

- `docs/index.md` / `.vitepress/theme/components/ProjectHome.vue`: トップページ
- `docs/.vitepress/theme/style.css`: レスポンシブデザイン
- `docs/specification.md`: 仕様v0.4の総目次・共通証拠要件
- `docs/production-specification.md`: 本番系の要求仕様
- `docs/prototype-specification.md`: Mac・カード連携・PF模倣の詳細仕様
- `docs/specification-legacy.md`: 分離前の旧仕様v0.3（履歴）
- `docs/adr.md`: 原ADRと証拠基盤の追加ADR。Mac構成のADR-022は `docs/prototype-decisions.md`
- `docs/public/documents/`: 現行仕様の統合Markdown・系別Markdownと旧版

原文の技術・法務・製品仕様に関する主張は未検証です。文書内のMermaid記法は原文のコードブロックとして掲載しています。プロトタイプ構成図は `docs/public/images/prototype-architecture.svg`。トップページの認証図は独立したHTML/SVGによる概念図です。このサイトは説明用で、本人確認やウォレット接続の機能は実装していません。

## 依存ライブラリ

VitePress 1.6.4を採用し、開発サーバーの既知の脆弱性対策としてViteを6.4.3へoverrideしています。lockfileを含めて管理します。

## プロトタイプ基盤（公開IPv4なし・PF模倣）

[設計書](docs/prototype-design.md) / [追加ADR](docs/prototype-decisions.md) / [Docker・GCE手順](infra/README.md)。GitHub Pagesは説明専用、サーバーはprivate e2-micro + IAPを設計。Google Cloudの実VMは未作成。PF・証明書確認はmockのみで、実本人確認やオンチェーン登録は未実装。

仕様書を編集した後は `node scripts/sync-spec-downloads.mjs` でダウンロード版を同期し、`npm run docs:build` でリンクを確認してください。

## Mac実機プロトタイプ

`Start-JPKI-Prototype.command` で起動し、SafariまたはChromeで http://localhost:18080/app/ を開きます。初回は `./scripts/setup-mac-prototype.sh`。実装・試験の範囲は [Mac実機用README](services/mac-prototype/README.md) を参照してください。

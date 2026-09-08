import { defineConfig } from 'vitepress'

const base = process.env.PAGES_BASE_PATH || '/'
export default defineConfig({
  lang: 'ja-JP',
  title: 'JPKI Wallet Project',
  description: 'NPO法人によるJPKI・パスキー・Web3ウォレットの鍵束縛プロトコル。音楽クリエイターと利用者のための100人規模ガバナンス実験。',
  base: base.endsWith('/') ? base : `${base}/`,
  cleanUrls: false,
  appearance: false,
  head: [['meta', { name: 'theme-color', content: '#101e38' }]],
  themeConfig: {
    siteTitle: 'JPKI Wallet Project',
    nav: [
      { text: 'ホワイトペーパー', link: '/whitepaper' },
      { text: 'テストに参加', link: '/prototype-test' },
      { text: '認証のしくみ', link: '/#protocol' },
      { text: '仕様書 v0.4', link: '/specification' },
      { text: 'ADR', link: '/adr' },
      { text: 'プロトタイプ設計', link: '/prototype-design' }
    ],
    sidebar: {
      '/whitepaper': [{ text: 'プロジェクト資料', items: [{ text: 'ホワイトペーパー v0.4', link: '/whitepaper' }, { text: '仕様書 v0.4', link: '/specification' }, { text: 'ADR', link: '/adr' }, { text: 'プロトタイプ設計', link: '/prototype-design' }] }],
      '/production': [{ text: '仕様書 v0.4', items: [{ text: '共通・総目次', link: '/specification' }, { text: '本番系', link: '/production-specification' }, { text: 'プロトタイプ系', link: '/prototype-specification' }] }],
      '/mac-prototype': [{ text: 'Mac実機試験', items: [{ text: '起動・使い方', link: '/mac-prototype' }, { text: '詳細仕様', link: '/prototype-specification' }, { text: '追加ADR', link: '/prototype-decisions' }] }],
      '/prototype': [{ text: 'プロトタイプ', items: [{ text: 'テストの説明・参加方法', link: '/prototype-test' }, { text: 'Google Cloud・Docker設計', link: '/prototype-design' }, { text: 'Mac実機プロトタイプ', link: '/mac-prototype' }, { text: 'プロトタイプ系詳細仕様', link: '/prototype-specification' }, { text: '追加ADR', link: '/prototype-decisions' }] }],
      '/specification': [{ text: '設計ドキュメント', items: [{ text: '仕様書 v0.4', link: '/specification' }, { text: '本番系仕様', link: '/production-specification' }, { text: 'Mac実機プロトタイプ', link: '/mac-prototype' }, { text: 'プロトタイプ系詳細仕様', link: '/prototype-specification' }, { text: '旧仕様（履歴）', link: '/specification-legacy' }, { text: 'ADR集・証拠基盤補足', link: '/adr' }] }],
      '/adr': [{ text: '設計ドキュメント', items: [{ text: '仕様書 v0.4', link: '/specification' }, { text: '本番系仕様', link: '/production-specification' }, { text: 'Mac実機プロトタイプ', link: '/mac-prototype' }, { text: 'プロトタイプ系詳細仕様', link: '/prototype-specification' }, { text: '旧仕様（履歴）', link: '/specification-legacy' }, { text: 'ADR集・証拠基盤補足', link: '/adr' }] }]
    },
    outline: { level: [2, 3], label: 'このページの内容' },
    docFooter: { prev: '前のページ', next: '次のページ' },
    returnToTopLabel: 'ページの先頭へ',
    sidebarMenuLabel: 'メニュー',
    darkModeSwitchLabel: '表示切替',
    footer: { message: 'JPKI × Passkey × Ethereum · 100人規模を目指すプロトタイプ / PF模倣実装・検証段階' }
  }
})

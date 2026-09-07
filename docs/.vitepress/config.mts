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
      { text: '認証のしくみ', link: '/#protocol' },
      { text: '仕様書 v0.3', link: '/specification' },
      { text: 'ADR', link: '/adr' },
      { text: 'プロトタイプ設計', link: '/prototype-design' }
    ],
    sidebar: {
      '/whitepaper': [{ text: 'プロジェクト資料', items: [{ text: 'ホワイトペーパー v0.1', link: '/whitepaper' }, { text: '仕様書 v0.3', link: '/specification' }, { text: 'ADR', link: '/adr' }, { text: 'プロトタイプ設計', link: '/prototype-design' }] }],
      '/prototype': [{ text: 'プロトタイプ', items: [{ text: 'Google Cloud・Docker設計', link: '/prototype-design' }, { text: '追加ADR案', link: '/prototype-decisions' }] }],
      '/specification': [{ text: '設計ドキュメント', items: [{ text: '仕様書 v0.3', link: '/specification' }, { text: 'ADR-001〜013', link: '/adr' }] }],
      '/adr': [{ text: '設計ドキュメント', items: [{ text: '仕様書 v0.3', link: '/specification' }, { text: 'ADR-001〜013', link: '/adr' }] }]
    },
    outline: { level: [2, 3], label: 'このページの内容' },
    docFooter: { prev: '前のページ', next: '次のページ' },
    returnToTopLabel: 'ページの先頭へ',
    sidebarMenuLabel: 'メニュー',
    darkModeSwitchLabel: '表示切替',
    footer: { message: 'JPKI × Passkey × Ethereum · 100人規模を目指すプロトタイプ / PF模倣実装・検証段階' }
  }
})

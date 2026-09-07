<script setup>
import { withBase } from 'vitepress'
const steps = [
  { number: '01', name: 'JPKI', label: '本人を確かめる', text: 'マイナンバーカード等を用いた本人確認。認定PF事業者への検証委託を計画しています。' },
  { number: '02', name: 'Passkey', label: '継続して認証する', text: 'FIDO2 / WebAuthnによる公開鍵認証。登録後の認証を担います。' },
  { number: '03', name: 'Ethereum', label: 'ウォレットを結びつける', text: 'SIWE署名でウォレットの操作権限を確認し、本人確認・パスキーの検証結果と結びつけます。' }
]
</script>

<template>
  <div class="project-home">
    <section class="hero" aria-labelledby="hero-title">
      <div class="hero-inner">
        <div class="hero-copy">
          <p class="eyebrow"><span class="status-dot"></span> NPO × DIGITAL IDENTITY</p>
          <h1 id="hero-title">音楽の未来に、<br><span>信頼できる参加を。</span></h1>
          <p class="hero-description">本人確認とウォレットをつなぐ。<br>クリエイターと利用者が、ともに意思決定するための<br class="desktop-break">Web3認証基盤をつくります。</p>
          <div class="hero-actions">
            <a class="button primary" :href="withBase('/whitepaper.html')">ホワイトペーパーを読む <span aria-hidden="true">↗</span></a>
            <a class="button secondary" :href="withBase('/specification.html')">仕様書を読む <span aria-hidden="true">→</span></a>
          </div>
          <p class="hero-note">100人規模のプロトタイプを計画 · 現在はPF模倣実装・検証段階</p>
        </div>
        <div class="binding-visual" role="img" aria-label="JPKIによる本人確認、パスキーによる継続認証、Ethereumウォレットを、一つの束縛レコードに結びつける概念図">
          <div class="visual-topline"><span>IDENTITY BINDING</span><span>PROTOCOL / 0.4</span></div>
          <div class="orbit orbit-one"></div><div class="orbit orbit-two"></div>
          <svg class="binding-lines" viewBox="0 0 480 400" aria-hidden="true"><path d="M240 92 L110 290 L370 290 Z"/><path d="M240 92 L240 220 M110 290 L240 220 M370 290 L240 220"/></svg>
          <div class="key-node jpki"><span class="node-icon">01</span><strong>JPKI</strong><small>本人確認</small></div>
          <div class="key-node passkey"><span class="node-icon">02</span><strong>Passkey</strong><small>継続認証</small></div>
          <div class="key-node ethereum"><span class="node-icon">03</span><strong>Ethereum</strong><small>ウォレット署名</small></div>
          <div class="binding-center"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3 27 8v8c0 7-11 13-11 13S5 23 5 16V8Z"/><path d="m11 16 3 3 7-7"/></svg><span>鍵束縛</span></div>
          <div class="visual-caption"><span class="mini-line"></span> 3つの役割を、1つの信頼へ。</div>
        </div>
      </div>
    </section>

    <div class="project-strip"><div><span>EXPERIMENT</span><strong>100人規模</strong></div><div><span>PROTOCOL</span><strong>仕様書 v0.4</strong></div><div><span>DESIGN DECISIONS</span><strong>原ADR 13件＋補足</strong></div><div><span>STATUS</span><strong>PF模倣・検証中</strong></div></div>

    <aside class="legal-notice" aria-labelledby="legal-notice-title">
      <h2 id="legal-notice-title">法的整合性について</h2>
      <p>本認証基盤の法的整合性については、弁護士等の専門家による精査が必要です。現時点で法令への適合性が確認されたものではなく、サービス提供に先立ち、設計・運用・個人情報の取扱いを含めた確認を行う必要があります。</p>
    </aside>

    <section id="about" class="content-section about-section">
      <div><p class="section-label">01 / PURPOSE</p><h2>つくる人と、聴く人が、<br>音楽のこれからを決める。</h2></div>
      <div class="section-copy"><p>音楽サブスクリプションの資金配分や運営に、クリエイターと利用者が参加する。そのためには、一人ひとりの参加を確かめながら、個人情報を守る仕組みが必要です。</p><p>本プロジェクトでは、NPO法人が提供する認証サービスを構想しています。100人規模の実験を通じて、本人性・重複参加の抑止・使いやすさを検証します。</p><a class="text-link" :href="withBase('/specification.html')">プロジェクトの仕様を読む <span aria-hidden="true">→</span></a></div>
    </section>

    <section id="protocol" class="protocol-section">
      <div class="section-heading"><div><p class="section-label">02 / PROTOCOL</p><h2>3つの認証を、つなぐ。</h2></div><p>本人確認、継続認証、ウォレットの意思表示。<br>それぞれの役割を組み合わせる設計です。</p></div>
      <div class="steps-grid"><article v-for="step in steps" :key="step.number" class="step"><span class="step-number">{{ step.number }}</span><p class="step-tech">{{ step.name }}</p><h3>{{ step.label }}</h3><p>{{ step.text }}</p></article></div>
      <div class="protocol-result"><span class="result-label">BINDING RECORD</span><p>検証結果を束縛レコードとして記録し、<strong>ガバナンス参加資格の確認</strong>につなげます。</p><a :href="withBase('/prototype-specification.html')" aria-label="仕様書で束縛セレモニーを読む">詳細 <span aria-hidden="true">↗</span></a></div>
    </section>

    <section class="content-section privacy-section">
      <div><p class="section-label">03 / PRIVACY BY DESIGN</p><h2>確かめる情報と、<br>残す情報を分ける。</h2><p class="muted intro">必要な検証を行い、保存する情報を絞る。<br>これをプロトタイプの設計方針としています。</p></div>
      <div class="privacy-list"><article><span>01</span><div><h3>基本4情報は永続化しない</h3><p>氏名・住所・生年月日・性別、JPKI証明書・署名値をDBやログに保存しない方針です。</p></div></article><article><span>02</span><div><h3>オンチェーンに本人確認の生データを置かない</h3><p>設計ではハッシュとウォレットアドレスの対応を記録します。公開された情報の関連性や、消去できない履歴も考慮します。</p></div></article><article><span>03</span><div><h3>より少ない開示で参加できる未来へ</h3><p>ゼロ知識証明による認証・属性・行動履歴の保護をロードマップに含めています。実装方式は未確定です。</p></div></article></div>
    </section>

    <section id="documents" class="documents-section"><div class="section-heading"><div><p class="section-label">04 / OPEN DESIGN</p><h2>設計を読み、議論を進める。</h2></div><span class="review-badge">PF模倣実装・検証段階</span></div><div class="document-grid"><a class="document-link" :href="withBase('/whitepaper.html')"><span class="document-meta">WHITE PAPER / v0.2</span><h3>プロジェクト・ホワイトペーパー <span aria-hidden="true">↗</span></h3><p>NPOの役割、認証の設計、プライバシー、実験計画を一冊に。</p><span class="document-foot">公開検討稿 · 2026年9月7日</span></a><a class="document-link" :href="withBase('/specification.html')"><span class="document-meta">SPECIFICATION / v0.4</span><h3>鍵束縛プロトコル仕様書 <span aria-hidden="true">↗</span></h3><p>全体構成からセッション管理、異常系、情報の取扱いまで。</p><span class="document-foot">本番系・プロトタイプ系を分離</span></a><a class="document-link" :href="withBase('/adr.html')"><span class="document-meta">ARCHITECTURE DECISION RECORDS</span><h3>技術的な選択と、その理由 <span aria-hidden="true">↗</span></h3><p>採用した方針、検討した代替案、今後の検証課題を記録。</p><span class="document-foot">ADR-001〜013・020・021 · 決定と追加方針</span></a></div>
      <div class="source-links" aria-label="GitHub上の設計資料">
        <a :href="withBase('/production-specification.html')">本番系仕様 →</a>
        <a :href="withBase('/prototype-specification.html')">プロトタイプ系詳細仕様・構成図 →</a>
        <a :href="withBase('/prototype-design.html')">Google Cloud・Docker 配置設計 →</a>
        <a :href="withBase('/mac-prototype.html')">Mac実機プロトタイプの起動方法 →</a>
        <span>GitHubで原文・変更履歴を確認</span>
        <a href="https://github.com/ShigeichiroYamasaki/jpki-wallet-project/blob/main/docs/public/documents/specification.md">仕様書 v0.4 ↗</a>
        <a href="https://github.com/ShigeichiroYamasaki/jpki-wallet-project/blob/main/docs/public/documents/adr.md">ADR集・証拠基盤補足 ↗</a>
      </div>
      <p class="scope-note">PF・証明書確認の模倣と基盤スケルトンに加え、Mac用のパスキー・カード連携・ウォレット模擬操作を実装しました。実Touch ID・実カードの成功は未確認です。クラウドは試験起動後、応答遅延のためプロトタイプを停止中です。認証サービスの提供開始、参加者募集、実機での一連の動作検証の完了を示すものではありません。</p></section>
  </div>
</template>

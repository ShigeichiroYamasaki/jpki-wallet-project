import { readFile, writeFile } from 'node:fs/promises'

// Produce portable Markdown downloads from the canonical VitePress sources.
const base = 'https://shigeichiroyamasaki.github.io/jpki-wallet-project'
function portable(source) {
  return source.replace(/^---\n[\s\S]*?\n---\n/, '')
    .replace(/<script setup>[\s\S]*?<\/script>\n/g, '')
    .replace(/^.*<a :href=.*download>.*<\/a>.*\n/gm, '')
    .replace(/\]\(\/(.*?)\)/g, (_, path) => {
      const [page, fragment] = path.split('#')
      const target = page && !page.includes('.') ? `${page}.html` : page
      return `](${base}/${target}${fragment ? `#${fragment}` : ''})`
    }).trim() + '\n'
}
const pages = ['specification', 'production-specification', 'prototype-specification']
const texts = await Promise.all(pages.map(async page => portable(await readFile(`docs/${page}.md`, 'utf8'))))
for (let i = 1; i < pages.length; i++) {
  await writeFile(`docs/public/documents/${pages[i]}.md`, texts[i])
}
await writeFile('docs/public/documents/specification.md', texts.join('\n---\n\n'))

#!/usr/bin/env node
// Build Phasera case studies into the MAIN site under /cases/ (same domain = phasera.jp).
//   content/cases/<slug>.md  →  cases/<slug>/index.html   (canonical https://phasera.jp/cases/<slug>/)
//   content/cases/*          →  cases/index.html          (hub / collection page)
//   (re)writes sitemap.xml with homepage + /cases/ + every article.
//
// Each article page carries Article + BreadcrumbList JSON-LD; the hub carries
// CollectionPage + BreadcrumbList + ItemList JSON-LD. This consolidates the SEO
// value that previously lived on the separate phasera-blog.vercel.app domain.
//
// Only dependency: `marked` for markdown parsing.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, basename } from 'node:path'
import { marked } from 'marked'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SRC = join(ROOT, 'content', 'cases')
const OUT = join(ROOT, 'cases')
const ORIGIN = 'https://phasera.jp'
const ORG_ID = `${ORIGIN}/#org`

const TEMPLATE = readFileSync(join(__dirname, 'cases-template.html'), 'utf8')
const INDEX_TEMPLATE = readFileSync(join(__dirname, 'cases-index-template.html'), 'utf8')

marked.setOptions({ gfm: true, breaks: false })

function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!m) return { meta: {}, body: raw }
  const meta = {}
  for (const line of m[1].split('\n')) {
    const km = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/)
    if (!km) continue
    let v = km[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    meta[km[1]] = v
  }
  return { meta, body: m[2] }
}

function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// Strip inline markdown markers so descriptions read cleanly in meta tags / JSON-LD.
function plain(s = '') {
  return String(s).replace(/[*_`]/g, '').trim()
}

function applyTemplate(tpl, vars) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] ?? ''))
}

function countJaChars(s) {
  return s.replace(/[\s`#*_\-~>|\[\]()]/g, '').length
}

function fmtDate(iso) {
  // 2026-05-12 -> 2026.05.12 ; fall back to raw string
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''))
  return m ? `${m[1]}.${m[2]}.${m[3]}` : String(iso || '')
}

function ensureDir(p) { if (!existsSync(p)) mkdirSync(p, { recursive: true }) }

function build() {
  ensureDir(OUT)

  const mdFiles = readdirSync(SRC).filter((f) => f.endsWith('.md')).sort()
  const entries = []

  for (const file of mdFiles) {
    const slug = basename(file, '.md')
    if (slug === 'README' || slug.startsWith('_')) continue

    const raw = readFileSync(join(SRC, file), 'utf8')
    const { meta, body } = parseFrontmatter(raw)
    const html = marked.parse(body)
    const chars = countJaChars(body)
    const canonical = `${ORIGIN}/cases/${slug}/`
    const title = meta.title || slug
    const description = plain(meta.description || meta.title || slug)
    const date = meta.date || ''
    const updated = meta.updated || meta.date || ''
    const image = `${ORIGIN}/assets/works-${slug}.jpg`

    const jsonld = JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Article',
          '@id': `${canonical}#article`,
          headline: title,
          description,
          inLanguage: 'ja-JP',
          ...(date ? { datePublished: date } : {}),
          ...(updated ? { dateModified: updated } : {}),
          author: { '@type': 'Person', '@id': `${ORIGIN}/#founder`, name: '濱田大夢' },
          publisher: {
            '@type': 'Organization',
            '@id': ORG_ID,
            name: 'Phasera',
            logo: { '@type': 'ImageObject', url: `${ORIGIN}/assets/favicon-180.png` },
          },
          mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
          image,
          ...(meta.audience ? { audience: { '@type': 'BusinessAudience', audienceType: meta.audience } } : {}),
          isPartOf: { '@id': `${ORIGIN}/cases/#collection` },
        },
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Phasera', item: `${ORIGIN}/` },
            { '@type': 'ListItem', position: 2, name: 'ケーススタディ', item: `${ORIGIN}/cases/` },
            { '@type': 'ListItem', position: 3, name: title, item: canonical },
          ],
        },
      ],
    }, null, 2)

    const out = applyTemplate(TEMPLATE, {
      title: escapeHtml(title),
      slug,
      category: escapeHtml(meta.category || ''),
      audience: escapeHtml(meta.audience || ''),
      chars: String(chars),
      content: html,
      description: escapeHtml(description),
      canonical,
      jsonld,
      date,
      dateDisplay: fmtDate(date),
    })

    const dir = join(OUT, slug)
    ensureDir(dir)
    writeFileSync(join(dir, 'index.html'), out, 'utf8')
    entries.push({ slug, title, description, audience: meta.audience || '', chars, canonical, date, updated })
    console.log(`[cases] ${slug}.md -> cases/${slug}/index.html (${chars} chars)`)
  }

  // ----- hub / collection page -----
  const listHtml = entries.map((e) =>
    `<li class="entry"><a href="/cases/${e.slug}/">` +
    `<span class="entry-main">` +
    `<span class="t">${escapeHtml(e.title)}</span>` +
    `<span class="desc">${escapeHtml(e.description)}</span>` +
    `</span>` +
    `<span class="meta">${escapeHtml(e.audience)} · ${e.chars}字</span>` +
    `</a></li>`
  ).join('\n    ')

  const hubCanonical = `${ORIGIN}/cases/`
  const hubJsonld = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${hubCanonical}#collection`,
        name: '導入事例・ケーススタディ',
        url: hubCanonical,
        inLanguage: 'ja-JP',
        isPartOf: { '@id': ORG_ID },
        about: { '@id': `${ORIGIN}/#service` },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Phasera', item: `${ORIGIN}/` },
          { '@type': 'ListItem', position: 2, name: 'ケーススタディ', item: hubCanonical },
        ],
      },
      {
        '@type': 'ItemList',
        itemListElement: entries.map((e, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          url: e.canonical,
          name: e.title,
        })),
      },
    ],
  }, null, 2)

  const indexHtml = applyTemplate(INDEX_TEMPLATE, {
    entries: listHtml,
    canonical: hubCanonical,
    jsonld: hubJsonld,
  })
  writeFileSync(join(OUT, 'index.html'), indexHtml, 'utf8')
  console.log(`[cases] hub -> cases/index.html (${entries.length} entries)`)

  // ----- sitemap.xml (homepage + hub + articles) -----
  const today = new Date().toISOString().slice(0, 10)
  const urls = [
    { loc: `${ORIGIN}/`, lastmod: today, changefreq: 'weekly', priority: '1.0' },
    { loc: hubCanonical, lastmod: today, changefreq: 'weekly', priority: '0.8' },
    ...entries.map((e) => ({
      loc: e.canonical,
      lastmod: e.updated || e.date || today,
      changefreq: 'monthly',
      priority: '0.7',
    })),
  ]
  const sitemap =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) =>
      `  <url>\n` +
      `    <loc>${u.loc}</loc>\n` +
      `    <lastmod>${u.lastmod}</lastmod>\n` +
      `    <changefreq>${u.changefreq}</changefreq>\n` +
      `    <priority>${u.priority}</priority>\n` +
      `  </url>`
    ).join('\n') +
    `\n</urlset>\n`
  writeFileSync(join(ROOT, 'sitemap.xml'), sitemap, 'utf8')
  console.log(`[cases] sitemap.xml -> ${urls.length} urls`)
}

build()

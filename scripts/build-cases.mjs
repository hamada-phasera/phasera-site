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
const SRC_PAGES = join(ROOT, 'content', 'pages')
const ORIGIN = 'https://phasera.jp'
const ORG_ID = `${ORIGIN}/#org`
const FOUNDER_ID = `${ORIGIN}/#founder`
const DEFAULT_OG = `${ORIGIN}/assets/og-cover.png`

const TEMPLATE = readFileSync(join(__dirname, 'cases-template.html'), 'utf8')
const INDEX_TEMPLATE = readFileSync(join(__dirname, 'cases-index-template.html'), 'utf8')
const PAGE_TEMPLATE = readFileSync(join(__dirname, 'page-template.html'), 'utf8')

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

  // ----- standalone pages (industry landings, about, author, privacy) -----
  const pageUrls = buildPages()

  // ----- sitemap.xml (homepage + hub + articles + pages) -----
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
    ...pageUrls,
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

// Build standalone pages from content/pages/*.md (path/pagetype frontmatter drives
// output location and JSON-LD type). Returns sitemap url entries.
function pageJsonld({ pagetype, canonical, title, description, breadcrumb, audience, serviceType }) {
  const crumbs = {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Phasera', item: `${ORIGIN}/` },
      { '@type': 'ListItem', position: 2, name: breadcrumb || title, item: canonical },
    ],
  }
  const graph = []
  if (pagetype === 'landing') {
    graph.push({
      '@type': 'WebPage', '@id': `${canonical}#webpage`,
      name: title, description, url: canonical, inLanguage: 'ja-JP',
      isPartOf: { '@id': ORG_ID },
    })
    graph.push({
      '@type': 'Service', '@id': `${canonical}#service`,
      serviceType: serviceType || title, name: title, description,
      provider: { '@id': ORG_ID }, areaServed: 'JP',
      ...(audience ? { audience: { '@type': 'BusinessAudience', audienceType: audience } } : {}),
    })
  } else if (pagetype === 'about') {
    graph.push({
      '@type': 'AboutPage', '@id': `${canonical}#webpage`,
      name: title, description, url: canonical, inLanguage: 'ja-JP',
      mainEntity: { '@id': ORG_ID },
    })
  } else if (pagetype === 'author') {
    graph.push({
      '@type': 'ProfilePage', '@id': `${canonical}#webpage`,
      name: title, description, url: canonical, inLanguage: 'ja-JP',
      mainEntity: { '@id': FOUNDER_ID },
    })
    graph.push({
      '@type': 'Person', '@id': FOUNDER_ID,
      name: '濱田大夢', alternateName: 'Hiromu Hamada', jobTitle: 'Founder',
      worksFor: { '@id': ORG_ID }, url: canonical,
      sameAs: ['https://github.com/hamada-phasera'],
    })
  } else {
    graph.push({
      '@type': 'WebPage', '@id': `${canonical}#webpage`,
      name: title, description, url: canonical, inLanguage: 'ja-JP',
      isPartOf: { '@id': ORG_ID },
    })
  }
  graph.push(crumbs)
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2)
}

function buildPages() {
  if (!existsSync(SRC_PAGES)) return []
  const files = readdirSync(SRC_PAGES).filter((f) => f.endsWith('.md')).sort()
  const out = []
  const priorityByType = { landing: '0.7', about: '0.5', author: '0.5', legal: '0.3' }
  for (const file of files) {
    if (file === 'README.md' || file.startsWith('_')) continue
    const raw = readFileSync(join(SRC_PAGES, file), 'utf8')
    const { meta, body } = parseFrontmatter(raw)
    const relPath = String(meta.path || basename(file, '.md')).replace(/^\/+|\/+$/g, '')
    const canonical = `${ORIGIN}/${relPath}/`
    const title = meta.title || relPath
    const description = plain(meta.description || meta.title || relPath)
    const html = marked.parse(body)
    const jsonld = pageJsonld({
      pagetype: meta.pagetype || 'legal',
      canonical, title, description,
      breadcrumb: meta.breadcrumb, audience: meta.audience, serviceType: meta.serviceType,
    })
    const rendered = applyTemplate(PAGE_TEMPLATE, {
      title: escapeHtml(title),
      description: escapeHtml(description),
      canonical,
      ogimage: meta.ogimage || DEFAULT_OG,
      eyebrow: escapeHtml(meta.eyebrow || ''),
      breadcrumb: escapeHtml(meta.breadcrumb || title),
      content: html,
      jsonld,
    })
    const dir = join(ROOT, relPath)
    ensureDir(dir)
    writeFileSync(join(dir, 'index.html'), rendered, 'utf8')
    out.push({ loc: canonical, lastmod: new Date().toISOString().slice(0, 10),
      changefreq: 'monthly', priority: priorityByType[meta.pagetype] || '0.4' })
    console.log(`[pages] ${file} -> ${relPath}/index.html (${meta.pagetype || 'legal'})`)
  }
  return out
}

build()

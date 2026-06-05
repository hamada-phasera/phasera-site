#!/usr/bin/env node
// Phasera build-time SEO validator. Zero dependencies.
// Usage:
//   node scripts/seo-check.mjs           # dry-run, exits 1 on failure
//   node scripts/seo-check.mjs --write   # also rewrites sitemap.xml <lastmod> to today

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const WRITE = process.argv.includes('--write')

const CANONICAL = 'https://phasera.jp/'
const REQUIRED_SCHEMA_TYPES = ['Organization', 'WebSite', 'Service', 'FAQPage']
const TITLE_MIN = 30, TITLE_MAX = 60
const DESC_MIN = 70, DESC_MAX = 160

const fails = []
const warns = []
const fail = (file, msg) => fails.push(`[FAIL] ${file}: ${msg}`)
const warn = (file, msg) => warns.push(`[WARN] ${file}: ${msg}`)
const pass = []

const html = readFileSync(join(ROOT, 'index.html'), 'utf8')
const sitemap = readFileSync(join(ROOT, 'sitemap.xml'), 'utf8')
const robots = readFileSync(join(ROOT, 'robots.txt'), 'utf8')

// --- index.html checks ---

// 1. <html lang="ja">
if (!/<html[^>]+lang=["']ja["']/i.test(html)) fail('index.html', '<html lang="ja"> not found')
else pass.push('html lang')

// 2. title length
const titleMatch = html.match(/<title>([^<]+)<\/title>/)
if (!titleMatch) fail('index.html', '<title> not found')
else {
  const t = titleMatch[1].trim()
  const len = Array.from(t).length
  if (len < TITLE_MIN || len > TITLE_MAX) fail('index.html', `title length ${len} not in [${TITLE_MIN},${TITLE_MAX}] — "${t}"`)
  else pass.push(`title length ${len}`)
}

// 3. meta description length
const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i)
if (!descMatch) fail('index.html', 'meta description not found')
else {
  const d = descMatch[1].trim()
  const len = Array.from(d).length
  if (len < DESC_MIN || len > DESC_MAX) fail('index.html', `description length ${len} not in [${DESC_MIN},${DESC_MAX}]`)
  else pass.push(`description length ${len}`)
}

// 4. canonical
const canonMatch = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i)
if (!canonMatch) fail('index.html', 'canonical link not found')
else if (canonMatch[1] !== CANONICAL) fail('index.html', `canonical "${canonMatch[1]}" !== "${CANONICAL}"`)
else pass.push('canonical')

// 5. robots meta
if (!/<meta\s+name=["']robots["']/i.test(html)) warn('index.html', 'explicit <meta name="robots"> missing (defaults to index,follow)')
else pass.push('robots meta')

// 6. h1 exactly 1
const h1Count = (html.match(/<h1[\s>]/gi) || []).length
if (h1Count !== 1) fail('index.html', `expected exactly 1 <h1>, found ${h1Count}`)
else pass.push('single h1')

// 7. all <img> have non-empty alt
const imgs = [...html.matchAll(/<img\s+([^>]*)>/gi)]
let imgFails = 0
for (const [, attrs] of imgs) {
  const altMatch = attrs.match(/\balt=["']([^"']*)["']/i)
  if (!altMatch || altMatch[1].trim() === '') imgFails++
}
if (imgFails > 0) fail('index.html', `${imgFails} <img> with missing/empty alt`)
else pass.push(`img alt (${imgs.length} images)`)

// 8. JSON-LD parses + required @types present
const jsonLds = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
if (jsonLds.length === 0) fail('index.html', 'no JSON-LD <script> blocks')
const seenTypes = new Set()
const walkTypes = (node) => {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) return node.forEach(walkTypes)
  if (node['@type']) {
    const t = node['@type']
    if (Array.isArray(t)) t.forEach((x) => seenTypes.add(x))
    else seenTypes.add(t)
  }
  for (const k of Object.keys(node)) walkTypes(node[k])
}
for (let i = 0; i < jsonLds.length; i++) {
  try {
    const obj = JSON.parse(jsonLds[i][1].trim())
    walkTypes(obj)
  } catch (e) {
    fail('index.html', `JSON-LD block #${i + 1} parse error: ${e.message}`)
  }
}
for (const t of REQUIRED_SCHEMA_TYPES) {
  if (!seenTypes.has(t)) fail('index.html', `JSON-LD missing required @type "${t}"`)
}
if (jsonLds.length > 0) pass.push(`JSON-LD parsed (types: ${[...seenTypes].join(', ')})`)

// 9. all internal href="#id" point to existing section IDs
const sectionIds = new Set([...html.matchAll(/<section[^>]+id=["']([^"']+)["']/gi)].map((m) => m[1]))
const idHrefs = [...html.matchAll(/href=["']#([^"'\s]+)["']/gi)].map((m) => m[1]).filter((id) => id && id !== '')
const missingAnchors = [...new Set(idHrefs.filter((id) => !sectionIds.has(id)))]
if (missingAnchors.length > 0) fail('index.html', `href anchors missing section: ${missingAnchors.join(', ')}`)
else pass.push(`anchors (${sectionIds.size} sections, ${idHrefs.length} links)`)

// --- sitemap.xml checks ---

// 10. all <loc> start with CANONICAL and contain no fragments
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim())
if (locs.length === 0) fail('sitemap.xml', 'no <loc> entries')
let badLocs = 0
for (const loc of locs) {
  if (!loc.startsWith(CANONICAL)) { fail('sitemap.xml', `loc must start with ${CANONICAL}: "${loc}"`); badLocs++ }
  if (loc.includes('#')) { fail('sitemap.xml', `loc must not contain fragment: "${loc}"`); badLocs++ }
}
if (badLocs === 0) pass.push(`sitemap locs (${locs.length})`)

// --- robots.txt checks ---

// 11. Sitemap: line present
if (!/^Sitemap:\s*https?:\/\//mi.test(robots)) fail('robots.txt', 'no Sitemap: line')
else pass.push('robots Sitemap line')

// --- side effect: --write rewrites sitemap lastmod ---
if (WRITE) {
  const today = new Date().toISOString().slice(0, 10)
  const updated = sitemap.replace(/<lastmod>[^<]+<\/lastmod>/g, `<lastmod>${today}</lastmod>`)
  if (updated !== sitemap) {
    writeFileSync(join(ROOT, 'sitemap.xml'), updated)
    pass.push(`sitemap lastmod → ${today}`)
  }
}

// --- report ---
const stamp = new Date().toISOString()
console.log(`# Phasera SEO check (${stamp})`)
for (const p of pass) console.log(`[PASS] ${p}`)
for (const w of warns) console.log(w)
for (const f of fails) console.log(f)
console.log(`# ${pass.length} pass · ${warns.length} warn · ${fails.length} fail`)

process.exit(fails.length > 0 ? 1 : 0)

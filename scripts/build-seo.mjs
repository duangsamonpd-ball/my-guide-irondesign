#!/usr/bin/env node
/**
 * Iron Software Design System — docs SEO block generator
 *
 * The docs are 31 static HTML pages served straight from /docs by GitHub Pages
 * with no build step, so anything that has to appear on every page is either
 * hand-copied 31 times or generated. Hand-copying is what put 585 duplicated
 * `:root` declarations in these pages once already; this generates instead.
 *
 * Writes, per page, between `<!-- seo:start -->` / `<!-- seo:end -->`:
 *   · <meta name="description">    — from the page's OWN copy, never a template
 *   · <link rel="canonical">
 *   · Open Graph + Twitter card
 *   · JSON-LD: TechArticle + BreadcrumbList, built from the page's own crumb
 *
 * And repo-wide: docs/sitemap.xml, docs/robots.txt.
 *
 * Run:   node scripts/build-seo.mjs
 * Check: node scripts/build-seo.mjs --check   → exit 1 if anything is stale
 *
 * Zero dependencies, same as every other script here.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');
const CHECK = process.argv.includes('--check');

/**
 * The published origin. GitHub Pages serves /docs as the site root, so a page
 * lives at `${SITE}/component-badge.html`.
 *
 * ⚠ If the site moves — a custom domain, an org rename — change this ONE line
 * and re-run. A canonical pointing at the wrong origin is worse than no
 * canonical at all: it tells a crawler to index a URL that does not exist.
 */
const SITE = 'https://duangsamonpd-ball.github.io/my-guide-irondesign';

/** No 1200x630 social card exists yet — see "Social card (og:image)" under
 *  Deploy in README.md for the reasoning, the drawing spec and the three steps.
 *  An og:image pointing at an unrelated asset is worse than none, because chat
 *  clients cache the first image they fetch, so it is omitted until a real card
 *  is drawn. Set this to the path and it lands on all 31 pages — and flips
 *  twitter:card from `summary` to `summary_large_image` on its own. */
const OG_IMAGE = null;

const SITE_NAME = 'Iron Software Design System';

/* ── description sourcing ────────────────────────────────────────────────── */

const decode = (s) =>
  s
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

/* Tags become a space so `<b>a</b><b>b</b>` does not read as "ab" — but that
   puts a space before the punctuation in "…any <a>Input</a>, <a>Select</a>…",
   which then survives into the description as "Drop any Input ,". */
const text = (html) =>
  decode(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();

/** Trim to <= max characters on a word boundary, without a dangling separator. */
function clamp(s, max = 158) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const at = cut.lastIndexOf(' ');
  return cut.slice(0, at > 60 ? at : max).replace(/[\s—·,.:;-]+$/, '') + '…';
}

/**
 * Two pages carry no prose that describes them: index.html is a link grid and
 * homepage.html is a full marketing-page mock, so scraping either returns its
 * navigation. These are the only hand-written descriptions.
 */
const OVERRIDES = {
  'index.html':
    'The visual token reference for Iron Software — colour, typography, spacing, borders, shadow and all 19 components, plus a semantic token guide for developers.',
  'homepage.html':
    'A complete marketing page assembled only from design-system components and tokens — the reference for how the pieces compose at full page scale.',
};

/** Strip the leading emoji some page titles carry; it is decoration, not copy. */
const cleanTitle = (t) => t.replace(/^[\p{Extended_Pictographic}️‍\s]+/u, '').trim();

function describe(file, src) {
  if (OVERRIDES[file]) return OVERRIDES[file];
  // Component pages lead with a real summary paragraph — the best copy available.
  const lead = src.match(/<p class="lead">([\s\S]*?)<\/p>/);
  if (lead) return clamp(text(lead[1]));
  // Foundation pages put theirs in .page-title, after the <h1>.
  const title = src.match(/<div class="page-title">([\s\S]*?)<\/div>/);
  if (title) {
    const body = title[1].replace(/<h1[^>]*>[\s\S]*?<\/h1>/, '');
    const t = text(body);
    if (t) return clamp(t);
  }
  throw new Error(`${file}: no description source — add an OVERRIDES entry`);
}

/* ── page facts ──────────────────────────────────────────────────────────── */

function pageInfo(file) {
  const src = readFileSync(join(DOCS, file), 'utf8');
  const h1 = src.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const title = src.match(/<title>([\s\S]*?)<\/title>/);
  const crumb = src.match(/<(?:div|nav)[^>]*class="crumb"[^>]*>([\s\S]*?)<\/(?:div|nav)>/);

  const trail = [];
  if (crumb) {
    for (const m of crumb[1].matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
      trail.push({ name: text(m[2]), href: m[1] });
    }
    // Whatever follows the last link is the current page, unlinked.
    const tail = text(crumb[1].split('</a>').pop() ?? '').replace(/^\/\s*/, '').trim();
    if (tail) trail.push({ name: tail, href: file });
  }

  return {
    file,
    src,
    title: title ? text(title[1]) : SITE_NAME,
    heading: cleanTitle(h1 ? text(h1[1]) : SITE_NAME),
    description: describe(file, src),
    trail,
  };
}

/* ── the block ───────────────────────────────────────────────────────────── */

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function seoBlock(p) {
  const url = `${SITE}/${p.file}`;
  const lines = [
    '  <!-- seo:start — generated by scripts/build-seo.mjs, do not hand-edit -->',
    `  <meta name="description" content="${esc(p.description)}" />`,
    `  <link rel="canonical" href="${url}" />`,
    `  <meta property="og:type" content="${p.file === 'index.html' ? 'website' : 'article'}" />`,
    `  <meta property="og:site_name" content="${esc(SITE_NAME)}" />`,
    `  <meta property="og:title" content="${esc(p.title)}" />`,
    `  <meta property="og:description" content="${esc(p.description)}" />`,
    `  <meta property="og:url" content="${url}" />`,
  ];
  if (OG_IMAGE) lines.push(`  <meta property="og:image" content="${SITE}/${OG_IMAGE}" />`);
  lines.push(
    `  <meta name="twitter:card" content="${OG_IMAGE ? 'summary_large_image' : 'summary'}" />`,
    `  <meta name="twitter:title" content="${esc(p.title)}" />`,
    `  <meta name="twitter:description" content="${esc(p.description)}" />`,
  );

  const graph = [
    {
      '@type': p.file === 'index.html' ? 'WebSite' : 'TechArticle',
      '@id': `${url}#page`,
      name: p.heading,
      headline: p.heading,
      description: p.description,
      url,
      inLanguage: 'en',
      isPartOf: { '@type': 'WebSite', '@id': `${SITE}/index.html#site`, name: SITE_NAME, url: `${SITE}/index.html` },
      publisher: { '@type': 'Organization', name: 'Iron Software', url: 'https://ironsoftware.com' },
    },
  ];
  if (p.trail.length > 1) {
    graph.push({
      '@type': 'BreadcrumbList',
      '@id': `${url}#breadcrumb`,
      itemListElement: p.trail.map((t, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: t.name,
        item: `${SITE}/${t.href}`,
      })),
    });
  }

  const ld = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2)
    .split('\n')
    .map((l) => '  ' + l)
    .join('\n');

  lines.push('  <script type="application/ld+json">', ld, '  </script>', '  <!-- seo:end -->');
  return lines.join('\n');
}

/* ── splice ──────────────────────────────────────────────────────────────── */

const MARKERS = /[ \t]*<!-- seo:start[\s\S]*?<!-- seo:end -->/;

function splice(src, block) {
  if (MARKERS.test(src)) return src.replace(MARKERS, () => block);
  // First insertion goes right after <title>, where a reader expects it.
  return src.replace(/(<title>[\s\S]*?<\/title>)/, (_, t) => `${t}\n${block}`);
}

/* ── run ─────────────────────────────────────────────────────────────────── */

const pages = readdirSync(DOCS).filter((f) => f.endsWith('.html')).sort();
const stale = [];
let written = 0;

const infos = pages.map(pageInfo);

for (const p of infos) {
  const next = splice(p.src, seoBlock(p));
  if (next === p.src) continue;
  if (CHECK) stale.push(p.file);
  else {
    writeFileSync(join(DOCS, p.file), next);
    written++;
  }
}

/* sitemap — every page that is actually on disk, so it cannot list a 404 */
const sitemap =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  infos
    .map((p) => `  <url>\n    <loc>${SITE}/${p.file}</loc>\n    <priority>${p.file === 'index.html' ? '1.0' : '0.8'}</priority>\n  </url>`)
    .join('\n') +
  '\n</urlset>\n';

const robots = `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`;

for (const [name, body] of [['sitemap.xml', sitemap], ['robots.txt', robots]]) {
  const path = join(DOCS, name);
  const current = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (current === body) continue;
  if (CHECK) stale.push(name);
  else {
    writeFileSync(path, body);
    written++;
  }
}

if (CHECK) {
  if (stale.length) {
    console.log(`\n\x1b[31m✖  ${stale.length} SEO block${stale.length > 1 ? 's are' : ' is'} stale\x1b[0m`);
    for (const f of stale) console.log(`    \x1b[31m✖\x1b[0m docs/${f}`);
    console.log(`\n  Run \x1b[1mnpm run build:seo\x1b[0m and commit the result.\n`);
    process.exit(1);
  }
  console.log(`\n\x1b[32m✔  SEO current — ${pages.length} pages carry a generated description, canonical, OG and JSON-LD\x1b[0m\n`);
} else {
  console.log(`\n\x1b[32m✔  SEO written — ${written} file${written === 1 ? '' : 's'} updated across ${pages.length} pages, plus sitemap.xml and robots.txt\x1b[0m\n`);
}

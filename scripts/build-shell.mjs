#!/usr/bin/env node
/**
 * Iron Software Design System — docs shell generator
 *
 * The docs are static HTML served straight from /docs by GitHub Pages with no
 * build step, so anything appearing on every page is either hand-copied thirty
 * times or generated. This generates the sidebar.
 *
 * Measured before it existed, 2026-08-13: the sidebar was 105KB across 30
 * pages, and all thirty markups were distinct — but with the `active` marker
 * removed they collapsed to TWO, and those two differed by a single character.
 * one page drew the Footer Bar icon as ⬛ where the other twenty-nine used 🧱.
 * One nav, copied thirty times, with one copy already behind. That is the whole
 * argument for this script.
 *
 * The array below was EXTRACTED from the pages, not retyped. A hand-written
 * first draft of it got the Spacing icon, the Borders label, the Opacity icon,
 * the last category name and most of the component ORDER wrong, and would have
 * rewritten all thirty sidebars into that. When a generator replaces copies,
 * derive its source of truth from the copies.
 *
 * Writes, per page, between `<!-- shell:nav -->` / `<!-- /shell:nav -->`:
 *   · the sidebar link list, with `active` on the entry matching the page
 *
 * Deliberately NOT generated: the header, the version stamp, the page title and
 * anything below the shell. They are either identical already (and gated as
 * shell rules in docs.css) or genuinely per-page. This owns the one block that
 * was demonstrably drifting.
 *
 * Run:   node scripts/build-shell.mjs
 * Check: node scripts/build-shell.mjs --check   → exit 1 if any page is stale
 *
 * Zero dependencies, same as every other script here.
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NAV } from './lib/nav.mjs';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');
const CHECK = process.argv.includes('--check');

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[90m${s}\x1b[0m`;


const navBlock = (file, indent) =>
  NAV.map((n) =>
    n.category
      ? `${indent}<div class="sidebar-category">${n.category}</div>`
      : `${indent}<a href="${n.href}" class="sidebar-link${n.href === file ? ' active' : ''}">` +
        `<i class="sidebar-icon">${n.icon}</i>${n.label}</a>`,
  ).join('\n');

const MARKERS = /([ \t]*)<!-- shell:nav -->[\s\S]*?<!-- \/shell:nav -->/;

const pages = readdirSync(DOCS).filter((f) => f.endsWith('.html')).sort();
let wrote = 0, stale = [], skipped = 0;

for (const file of pages) {
  const path = join(DOCS, file);
  const src = readFileSync(path, 'utf8');
  const m = src.match(MARKERS);
  if (!m) { skipped++; continue; }
  const indent = m[1] ?? '      ';
  const block = `${indent}<!-- shell:nav -->\n${navBlock(file, indent)}\n${indent}<!-- /shell:nav -->`;
  const out = src.replace(MARKERS, block);
  if (out === src) continue;
  if (CHECK) stale.push(file);
  else { writeFileSync(path, out); wrote++; }
}

if (CHECK) {
  if (stale.length) {
    console.log(red(`\n✖  the sidebar is stale in ${stale.length} page(s)`));
    for (const f of stale) console.log(`     ${f}`);
    console.log(`\n  Run ${'\x1b[1m'}npm run build:shell\x1b[0m and commit the result.\n`);
    process.exit(1);
  }
  console.log(green(`\n✔  Sidebar current — ${pages.length - skipped} pages share one nav of ${NAV.filter((n) => n.href).length} links`) + dim(` (${skipped} page(s) carry no shell markers)`) + '\n');
  process.exit(0);
}

console.log(green(`\n✔  Sidebar written — ${wrote} page(s) updated`) + dim(`, ${pages.length - skipped} carry the markers, ${skipped} do not`) + '\n');

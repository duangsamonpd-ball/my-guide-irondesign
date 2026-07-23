#!/usr/bin/env node
/**
 * Iron Software Design System — component ↔ docs CSS parity check
 *
 * Every `.astro` component ships its CSS in a <style> block, and the matching
 * docs demo page (docs/component-<name>.html) carries the same CSS inline so it
 * renders standalone on GitHub Pages with no build step. Two copies, hand-kept
 * "1:1" — which means they silently drift the moment one side is edited alone.
 *
 * This asserts every top-level CSS rule in a component's <style> block also
 * appears, unchanged, in its docs page. The docs page may add extra rules for
 * the demo layout (astro ⊆ docs); it may never contradict the component.
 *
 *   astro-components/components/Button.astro   <style> …the source of truth…
 *   docs/component-button.html                 must contain the same rules
 *
 * Run:  node scripts/check-component-parity.mjs
 * Exit: 0 = in sync · 1 = drift found
 *
 * Zero dependencies — plain Node, same as the token drift checker.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COMPONENTS = join(ROOT, 'astro-components/components');
const DOCS = join(ROOT, 'docs');

const errors = [];
const skipped = [];
let rulesChecked = 0;

/* ── CSS extraction ──────────────────────────────────────────────────────── */

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** All <style>…</style> bodies in a file, concatenated. */
function styleBlocks(src) {
  return [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
}

/**
 * Split CSS into top-level rules by tracking brace depth, so an `@media { … }`
 * block comes back as one unit with its nested rules intact rather than being
 * torn apart. Components are otherwise flat, so this stays simple.
 */
function topLevelRules(css) {
  const rules = [];
  let cur = '';
  let depth = 0;
  for (const ch of stripComments(css)) {
    cur += ch;
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      rules.push(cur.trim());
      cur = '';
    }
  }
  return rules.filter((r) => r.includes('{'));
}

/** Canonical form so whitespace and trailing-semicolon differences never register. */
const normalise = (rule) =>
  rule
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};:,])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();

/* ── compare each component against its docs page ────────────────────────── */

for (const file of readdirSync(COMPONENTS).filter((f) => f.endsWith('.astro')).sort()) {
  const name = basename(file, '.astro').toLowerCase();
  const docsPath = join(DOCS, `component-${name}.html`);

  if (!existsSync(docsPath)) {
    skipped.push(`${file} — no docs/component-${name}.html (composed component, nothing to mirror)`);
    continue;
  }

  const astroRules = topLevelRules(styleBlocks(readFileSync(join(COMPONENTS, file), 'utf8')));
  const docsRules = new Set(topLevelRules(styleBlocks(readFileSync(docsPath, 'utf8'))).map(normalise));

  for (const rule of astroRules) {
    rulesChecked++;
    if (!docsRules.has(normalise(rule))) {
      const selector = rule.slice(0, rule.indexOf('{')).replace(/\s+/g, ' ').trim();
      errors.push({ file, name, selector });
    }
  }
}

/* ── report ──────────────────────────────────────────────────────────────── */

if (skipped.length) {
  console.log(`\n\x1b[90m·  skipped ${skipped.length}: ${skipped.map((s) => s.split(' — ')[0]).join(', ')}\x1b[0m`);
}

if (errors.length) {
  console.log(`\n\x1b[31m✖  ${errors.length} rule${errors.length > 1 ? 's' : ''} in a component <style> are missing or changed in its docs page\x1b[0m`);
  const byFile = new Map();
  for (const e of errors) (byFile.get(e.file) ?? byFile.set(e.file, []).get(e.file)).push(e);
  for (const [file, items] of byFile) {
    console.log(`\n  \x1b[1m${file}\x1b[0m  ↔  docs/component-${items[0].name}.html`);
    for (const { selector } of items) console.log(`    \x1b[31m✖\x1b[0m ${selector} { … }`);
  }
  console.log(`\n  The <style> block in each .astro is the source of truth. Sync the docs page`);
  console.log(`  so its inline CSS matches, then this passes.\n`);
  process.exit(1);
}

console.log(`\n\x1b[32m✔  Component CSS in sync — ${rulesChecked} rules match across .astro and docs pages\x1b[0m\n`);

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
const empty = [];
const perFile = [];
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

  /**
   * A component that contributes no rules passes this check vacuously — the
   * assertion is astro ⊆ docs, and the empty set is a subset of anything. So
   * emptying a component's <style> does not turn this gate red, it turns it
   * SILENT: the count drops, the tick stays, and the docs page keeps carrying
   * rules that describe markup which no longer exists.
   *
   * Found 2026-08-05 on the Tailwind POC branch, where rewriting Badge as
   * utility classes took parity from 456 rules to 438 and still reported ✔.
   * It is not a Tailwind problem — any edit that empties a <style> does it.
   *
   * Every one of the 19 components has CSS today (7 to 116 rules), so requiring
   * at least one needs no baseline file to keep in sync. If a component ever
   * legitimately ships without CSS, add it to a documented exempt list here
   * rather than deleting this check.
   */
  if (astroRules.length === 0) {
    empty.push(file);
    continue;
  }
  perFile.push({ file, count: astroRules.length });

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

if (empty.length) {
  console.log(`\n\x1b[31m✖  ${empty.length} component${empty.length > 1 ? 's have' : ' has'} no CSS for this gate to check\x1b[0m`);
  for (const file of empty) console.log(`    \x1b[31m✖\x1b[0m ${file} — <style> is empty or absent`);
  console.log(`\n  This gate compares a component's rules against its docs page. With no`);
  console.log(`  rules it passes on a technicality while the docs page keeps the old CSS.`);
  console.log(`  If that is intended, add the file to an exempt list in this script.\n`);
  process.exit(1);
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

/* The per-component counts are printed so a large drop is visible in a CI log
   even though only a drop to ZERO is an error. A component quietly losing most
   of its CSS is the same failure in slower motion. */
const smallest = [...perFile].sort((a, b) => a.count - b.count)[0];
console.log(
  `\n\x1b[32m✔  Component CSS in sync — ${rulesChecked} rules match across ${perFile.length} components and their docs pages\x1b[0m`,
);
console.log(`\x1b[90m   every component contributes CSS; fewest is ${smallest.file} at ${smallest.count} rules\x1b[0m\n`);

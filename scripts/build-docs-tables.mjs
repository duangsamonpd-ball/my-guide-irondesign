#!/usr/bin/env node
/**
 * Iron Software Design System — every docs table wears the Table component's classes
 *
 * ── THE GAP ────────────────────────────────────────────────────────────────
 *
 * Until 2026-09-18 the docs carried four table looks — `.tok` in docs.css plus
 * a per-page `.tok td` on nineteen pages, `.mapping-table` on the semantic
 * guide, `.token-table` on typography, and one table styled inline — and they
 * differed from each other in padding, header colour and border, because each
 * was a copy of the last. When the `Table` component shipped, Ball asked for
 * every docs table to look like it.
 *
 * A fifth copy of the look, in docs.css, would have drifted from the component
 * the same way. So the docs tables wear the component's own class strings,
 * read from `astro-components/table.ts`, and this script is what puts them
 * there and keeps them there.
 *
 * ── THE MARKUP ─────────────────────────────────────────────────────────────
 *
 *   <div data-ds-table-wrap class="…tableWrap…">
 *     <table data-ds-table="tok" class="…tableClass('sm')… tok">
 *
 * The class attribute is OWNED by this script: it is the canonical string plus
 * whatever the page names in `data-ds-table` — its own cell vocabulary
 * (`tok`, `mapping-table`, `ptable`), which still carries the rules about what
 * is IN a cell (mono identifiers, swatches, the dark-mode column). Edit the
 * data attribute, not the class.
 *
 * ── COMPLETENESS ───────────────────────────────────────────────────────────
 *
 * A gate that knows its tables by a marker would say nothing about a table
 * added without one. So every `<table>` in docs/ must be accounted for: marked,
 * rendered by the component inside a generated `<!-- demo:* -->` region, or
 * carrying `data-ds-table-exempt="<reason>"`. Anything else fails.
 *
 *   node scripts/build-docs-tables.mjs              rewrite the class attributes
 *   node scripts/build-docs-tables.mjs --check      fail if any is stale or unaccounted for
 *   node scripts/build-docs-tables.mjs --self-test  prove --check can fail
 *
 * Exit: 0 = every table current · 1 = one is stale, unmarked, or unpaired
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tableWrap, tableClass } from '../astro-components/table.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');
const CHECK = process.argv.includes('--check');
const SELF_TEST = process.argv.includes('--self-test');

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[90m${s}\x1b[0m`;

/** The docs use the dense size. */
export const DOCS_TABLE = tableClass('sm');

const WRAP_RE = /<div data-ds-table-wrap class="[^"]*"/g;
const TABLE_RE = /<table data-ds-table="([^"]*)" class="[^"]*"/g;

export function stamp(html) {
  return html
    .replace(WRAP_RE, `<div data-ds-table-wrap class="${tableWrap}"`)
    .replace(TABLE_RE, (_, extra) => `<table data-ds-table="${extra}" class="${[DOCS_TABLE, extra].filter(Boolean).join(' ')}"`);
}

/** Every <table> that is neither marked, exempt, nor inside a generated demo region. */
export function unaccounted(html) {
  const demo = [...html.matchAll(/<!-- demo:([\w-]+) -->[\s\S]*?<!-- \/demo:\1 -->/g)].map((m) => [m.index, m.index + m[0].length]);
  const inDemo = (i) => demo.some(([a, b]) => i > a && i < b);
  return [...html.matchAll(/<table\b[^>]*>/g)]
    .filter((m) => !/data-ds-table(?:-exempt)?=/.test(m[0]) && !inDemo(m.index))
    .map((m) => m[0]);
}

/** A marked table must sit directly inside a marked wrapper, or it has no box. */
export function unwrapped(html) {
  return [...html.matchAll(/<table data-ds-table=/g)]
    .filter((m) => !/<div data-ds-table-wrap class="[^"]*"[^>]*>\s*$/.test(html.slice(Math.max(0, m.index - 2000), m.index)))
    .length;
}

/* ── self-test ────────────────────────────────────────────────────────────── */

if (SELF_TEST) {
  const good = `<div data-ds-table-wrap class="old"><table data-ds-table="tok" class="old tok"><tr><td>x</td></tr></table></div>`;
  const fresh = stamp(good);
  const cases = [
    ['a stale class attribute is rewritten', fresh !== good && fresh.includes(tableWrap) && fresh.includes(`${DOCS_TABLE} tok"`)],
    ['a current page is left alone', stamp(fresh) === fresh],
    ['the page vocabulary survives the rewrite', / tok"/.test(fresh)],
    ['an unmarked table is reported', unaccounted('<table class="x"></table>').length === 1],
    ['an exempt table is not', unaccounted('<table data-ds-table-exempt="spec list"></table>').length === 0],
    ['a table inside a demo region is not', unaccounted('<!-- demo:a --><table></table><!-- /demo:a -->').length === 0],
    ['a marked table with no wrapper is reported', unwrapped('<p><table data-ds-table="tok" class="x"></table>') === 1],
    ['a wrapped one is not', unwrapped(fresh) === 0],
  ];
  let bad = 0;
  for (const [what, ok] of cases) { if (!ok) bad++; console.log(`${ok ? green('✓') : red('✖')} ${what}`); }
  if (bad) { console.error(red(`\n✖  self-test: ${bad} case(s) failed`)); process.exit(1); }
  console.log(green('\n✔  self-test passed — --check can fail'));
  process.exit(0);
}

/* ── run ──────────────────────────────────────────────────────────────────── */

let marked = 0;
let exempt = 0;
const stale = [];
const errors = [];

for (const file of readdirSync(DOCS).filter((f) => f.endsWith('.html')).sort()) {
  const path = join(DOCS, file);
  const html = readFileSync(path, 'utf8');
  marked += (html.match(/<table data-ds-table=/g) ?? []).length;
  exempt += (html.match(/data-ds-table-exempt=/g) ?? []).length;
  for (const t of unaccounted(html)) errors.push(`${file}: ${t} — mark it data-ds-table="…" or give it data-ds-table-exempt="<reason>"`);
  const n = unwrapped(html);
  if (n) errors.push(`${file}: ${n} marked table(s) not directly inside a <div data-ds-table-wrap>`);
  const out = stamp(html);
  if (out === html) continue;
  if (CHECK) stale.push(file);
  else { writeFileSync(path, out); console.log(`  ${green('✓')} ${file}`); }
}

/* The floor. A marker regex that matched nothing would report every page current. */
if (!marked) errors.push('no docs table carries data-ds-table — the markup this gate reads is gone, not clean');

if (errors.length) {
  console.error(red(`\n✖  ${errors.length} docs table problem(s):`));
  for (const e of errors) console.error(`    ${e}`);
  process.exit(1);
}
if (stale.length) {
  console.error(red(`\n✖  ${stale.length} page(s) carry table classes older than table.ts:`));
  for (const s of stale) console.error(`    ${s}`);
  console.error(`\n  Fix it:  npm run build:tables\n`);
  process.exit(1);
}
console.log(green(`\n✔  Docs tables current`) + ` — ${marked} table(s) wear table.ts ${dim(`(${exempt} exempt, each with its reason)`)}`);

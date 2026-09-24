#!/usr/bin/env node
/**
 * Iron Software Design System — docs props tables, generated from the manifest
 *
 * ── THE GAP ────────────────────────────────────────────────────────────────
 *
 * On 2026-09-18 four docs pages carried a Prop / Type / Default table and
 * fifteen carried none, documenting 140 props by demonstration only. Where the
 * props WERE written out in words — the `Props: …` sentences in
 * `astro-components/README.md` — nothing compared them to the component at all.
 * `check:props-table` printed "15 page(s) document no props", which reads as if
 * those components took none; Button alone takes seven.
 *
 * Writing 140 rows by hand would have made 140 more things to keep current. So
 * the table is DERIVED: its source is `astro-components/components.json`, which
 * `build-manifest.mjs` parses from each component's own `interface Props` and
 * `check:manifest` keeps current. Change a prop and the page follows on the next
 * `npm run build:props`; forget to run it and `--check` fails.
 *
 * ── THE REGION ─────────────────────────────────────────────────────────────
 *
 *   <!-- props:Button -->
 *   …generated table…
 *   <!-- /props:Button -->
 *
 * Only the table is generated. The section heading and any sentence around it
 * stay hand-written, so a page can still say what the table cannot.
 *
 * The Notes column is the FIRST SENTENCE of the prop's `/** … *\/` comment and
 * nothing more. Those comments are written for whoever edits the component and
 * often go on to explain why a thing is built the way it is — Button's `wrap`
 * runs to Tailwind's emission order. The first sentence is the summary; the
 * rest stays in the source. A prop with no comment gets an empty cell, which is
 * a visible gap to fill in the component, never text invented here.
 *
 * `check:props-table` still reads the result, as it reads a hand-written table:
 * two independent ways of being wrong are not the same as one.
 *
 *   node scripts/build-props-tables.mjs              write the regions
 *   node scripts/build-props-tables.mjs --check      fail if any is stale
 *   node scripts/build-props-tables.mjs --self-test  prove --check can fail
 *
 * Exit: 0 = every region current · 1 = one is stale, unknown, or unreadable
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tableWrap, tableClass } from '../astro-components/table.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');
const MANIFEST = join(ROOT, 'astro-components/components.json');
const CHECK = process.argv.includes('--check');
const SELF_TEST = process.argv.includes('--self-test');

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[90m${s}\x1b[0m`;

/* ── rendering ────────────────────────────────────────────────────────────── */

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** `code` spans become <code>; everything else is escaped text. */
const prose = (s) =>
  s.split(/(`[^`]+`)/).map((p) => (p.startsWith('`') && p.endsWith('`') && p.length > 1
    ? `<code>${esc(p.slice(1, -1))}</code>`
    : esc(p))).join('');

/**
 * The first sentence: up to the first `.`, `!` or `?` that ends a word and is
 * followed by whitespace or the end. A full stop inside a `code` span is not a
 * sentence end, so spans are stepped over rather than searched.
 */
export function firstSentence(text) {
  const s = (text ?? '').replace(/\s+/g, ' ').trim();
  let inCode = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '`') inCode = !inCode;
    else if (!inCode && /[.!?]/.test(c) && (i === s.length - 1 || s[i + 1] === ' ')) return s.slice(0, i + 1);
  }
  return s;
}

/**
 * A union is split into members so the CSS can let it wrap BETWEEN them and
 * never inside one. The ` | ` text stays in the cell, so the table still reads
 * as the type it is to anything that strips tags — `check:props-table` does.
 * Only top-level bars split: `Array<'a' | 'b'>` stays one member.
 */
export function renderType(type) {
  const members = [];
  let depth = 0, cur = '';
  for (const ch of type) {
    if ('<([{'.includes(ch)) depth++;
    else if ('>)]}'.includes(ch)) depth--;
    if (ch === '|' && depth === 0) { members.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  members.push(cur.trim());
  if (members.length === 1) return esc(members[0]);
  return members.map((m) => `<span class="ptable-m">${esc(m)}</span>`).join(' | ');
}

/**
 * The Default cell. Most defaults are a word, and are shown as written. Two
 * kinds are not, both first met on FooterBar (2026-09-24):
 *
 * - A long array literal — `menu`'s eight links, `toolGroups`' three groups of
 *   columns — is the component's CONTENT, not a setting, and printed whole it
 *   ran to forty lines in one cell. It is summarised as a count; the literal
 *   stays in components.json and in the component.
 * - A `\uXXXX` escape is how the source spells a character it wants to be
 *   unambiguous about (the address's non-breaking spaces). A reader needs the
 *   character, not the escape.
 */
export function shownDefault(d) {
  const v = d.trim();
  if (v.startsWith('[') && v.endsWith(']') && (v.includes('\n') || v.length > 40)) {
    let depth = 0, quote = null, items = 0, seen = false;
    for (let i = 1; i < v.length - 1; i++) {
      const ch = v[i];
      if (quote) { if (ch === '\\') i++; else if (ch === quote) quote = null; continue; }
      if (ch === "'" || ch === '"' || ch === '`') { quote = ch; seen = true; continue; }
      if ('{[('.includes(ch)) { depth++; seen = true; continue; }
      if ('}])'.includes(ch)) { depth--; continue; }
      if (ch === ',' && depth === 0) { if (seen) items++; seen = false; continue; }
      if (!/\s/.test(ch)) seen = true;
    }
    if (seen) items++;
    return `<span class="ptable-none">${items} item${items === 1 ? '' : 's'}</span>`;
  }
  return esc(v.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))));
}

export function renderTable(component, indent) {
  const pad = (n) => indent + ' '.repeat(n);
  const rows = component.props.map((p) => {
    const note = [p.required ? '<span class="ptable-req">Required</span>' : '', prose(firstSentence(p.description))]
      .filter(Boolean).join('');
    const dflt = p.default === undefined ? '<span class="ptable-none">—</span>' : shownDefault(p.default);
    return `${pad(2)}<tr><td class="ptable-name">${esc(p.name)}</td><td class="ptable-type">${renderType(p.type)}</td>`
      + `<td class="ptable-default">${dflt}</td><td class="ptable-notes">${note}</td></tr>`;
  });
  return [
    /* The same markup build-docs-tables.mjs stamps onto every other docs table,
       written out here in full: if this emitted a placeholder class, the two
       scripts would each call the other's output stale. */
    `${indent}<div data-ds-table-wrap class="${tableWrap}"><table data-ds-table="ptable" class="${tableClass('sm')} ptable"><thead><tr><th>Prop</th><th>Type</th><th>Default</th><th>Notes</th></tr></thead><tbody>`,
    ...rows,
    `${indent}</tbody></table></div>`,
  ].join('\n');
}

/* ── regions ──────────────────────────────────────────────────────────────── */

const REGION = /^([ \t]*)<!-- props:([A-Za-z]+) -->\n[\s\S]*?^[ \t]*<!-- \/props:\2 -->$/gm;

/**
 * Returns the page with every region regenerated, plus the names it found and
 * any it could not resolve. A name the manifest does not know is an ERROR, not
 * a skip — a typo in a marker would otherwise leave a stale table unchecked.
 */
export function regenerate(html, byName) {
  const found = [];
  const unknown = [];
  const out = html.replace(REGION, (_, indent, name) => {
    found.push(name);
    const c = byName.get(name);
    if (!c) { unknown.push(name); return _; }
    return `${indent}<!-- props:${name} -->\n${renderTable(c, indent)}\n${indent}<!-- /props:${name} -->`;
  });
  /* An opening marker the regex could not pair is a region nobody is checking. */
  const opened = [...html.matchAll(/<!-- props:([A-Za-z]+) -->/g)].map((m) => m[1]);
  const unpaired = opened.filter((n) => !found.includes(n));
  return { out, found, unknown, unpaired };
}

function loadManifest() {
  const m = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const all = [...(m.components ?? []), ...(m.internal ?? [])];
  if (!all.length) throw new Error('components.json lists no components — nothing to generate from');
  return new Map(all.map((c) => [c.name, c]));
}

/* ── self-test ────────────────────────────────────────────────────────────── */

if (SELF_TEST) {
  const byName = new Map([['Demo', { name: 'Demo', props: [
    { name: 'size', type: "'sm' | 'lg'", required: false, default: "'sm'", description: 'Picks the size. The rest explains `a.b` internals.' },
    { name: 'href', type: 'string', required: true },
  ] }]]);
  const page = (body) => `<div>\n  <!-- props:Demo -->\n${body}\n  <!-- /props:Demo -->\n</div>`;
  const fresh = regenerate(page('  stale'), byName).out;
  const cases = [
    ['a stale region is rewritten', regenerate(page('  stale'), byName).out !== page('  stale')],
    ['a current region is left alone', regenerate(fresh, byName).out === fresh],
    ['an unknown name is reported', regenerate(page('x').replace(/Demo/g, 'Nope'), byName).unknown.length === 1],
    ['an unpaired marker is reported', regenerate('<!-- props:Demo -->\nno close', byName).unpaired.length === 1],
    ['Notes keeps only the first sentence', fresh.includes('<td class="ptable-notes">Picks the size.</td>') && !fresh.includes('internals')],
    ['a required prop says so and shows no default', /href<\/td><td class="ptable-type">string<\/td><td class="ptable-default"><span class="ptable-none">—<\/span><\/td><td class="ptable-notes"><span class="ptable-req">Required<\/span><\/td>/.test(fresh)],
    ['a union splits into members at top-level bars only', renderType("'a' | Array<'b' | 'c'>") === '<span class="ptable-m">\'a\'</span> | <span class="ptable-m">Array&lt;\'b\' | \'c\'&gt;</span>'],
    ['a long array default is shown as a count', shownDefault("[\n  { label: 'a, b' },\n  { label: 'c' },\n]") === '<span class="ptable-none">2 items</span>'],
    ['a short default is shown as written', shownDefault("'sm'") === "'sm'"],
    ['a \\u escape is shown as its character', shownDefault("'a\\u00A0b'") === "'a\u00A0b'"],
    ['a full stop inside code does not end the sentence', firstSentence('Use `a.b` here. Then more.') === 'Use `a.b` here.'],
  ];
  let bad = 0;
  for (const [what, ok] of cases) { if (!ok) bad++; console.log(`${ok ? green('✓') : red('✖')} ${what}`); }
  if (bad) { console.error(red(`\n✖  self-test: ${bad} case(s) failed`)); process.exit(1); }
  console.log(green('\n✔  self-test passed — --check can fail'));
  process.exit(0);
}

/* ── run ──────────────────────────────────────────────────────────────────── */

const byName = loadManifest();
const pages = readdirSync(DOCS).filter((f) => f.endsWith('.html')).sort();
let regions = 0;
const stale = [];
const errors = [];

for (const file of pages) {
  const path = join(DOCS, file);
  const html = readFileSync(path, 'utf8');
  const { out, found, unknown, unpaired } = regenerate(html, byName);
  regions += found.length;
  for (const n of unknown) errors.push(`${file}: <!-- props:${n} --> names no component in components.json`);
  for (const n of unpaired) errors.push(`${file}: <!-- props:${n} --> has no matching <!-- /props:${n} -->`);
  if (out === html) continue;
  if (CHECK) stale.push(`${file} (${found.join(', ')})`);
  else { writeFileSync(path, out); console.log(`  ${green('✓')} ${file}  ${dim(found.join(', '))}`); }
}

if (errors.length) {
  console.error(red(`\n✖  ${errors.length} props region(s) cannot be generated:`));
  for (const e of errors) console.error(`    ${e}`);
  process.exit(1);
}
if (stale.length) {
  console.error(red(`\n✖  ${stale.length} page(s) carry a props table older than the component:`));
  for (const s of stale) console.error(`    ${s}`);
  console.error(`\n  Fix it:  npm run build:props\n`);
  process.exit(1);
}
console.log(green(`\n✔  Props tables current`) + ` — ${regions} region(s) generated from components.json`);

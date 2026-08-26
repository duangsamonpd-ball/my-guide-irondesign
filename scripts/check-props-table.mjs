#!/usr/bin/env node
/**
 * Iron Software Design System — the docs props table against the real Props
 *
 * ── THE GAP ────────────────────────────────────────────────────────────────
 *
 * `astro-components/components.json` is generated from each component's own
 * `interface Props` and gated by `check:manifest`. The Prop / Type / Default
 * tables in `docs/component-*.html` are typed by hand, and until now nothing
 * compared the two — so a prop could gain a union member, lose one, or be
 * renamed, and the page would go on describing the component as it was.
 *
 * That is not hypothetical. A survey on 2026-08-24 found three wrong rows, all
 * on Logo and all stale before that session touched anything: `kind` had never
 * learned `'lockup'`, `variant` was missing `onhero`/`basic`/`stack`, and `size`
 * printed a union the component had not shipped for weeks. They were fixed by
 * hand; this is what stops the next three.
 *
 * The docs are the thing a consumer reads before they read the types, so a
 * stale table is worse than no table: it is a confident answer.
 *
 * ── WHAT IT CHECKS, AND THE HALF THAT IS EASY TO FORGET ────────────────────
 *
 * Both directions. A row whose type disagrees is the obvious fault; a prop that
 * the table simply DOES NOT MENTION is the one a comparison keyed on rows would
 * never see, and it is the more likely of the two — a new prop is added to the
 * component and the page is not reopened. So the check is set equality first,
 * then field by field.
 *
 * ── WHAT IT DOES NOT DO ────────────────────────────────────────────────────
 *
 * It does not require a page to HAVE a table. Fifteen of the nineteen pages
 * document no props at all, most of them because the component takes none worth
 * a table, and inventing a requirement here would be a policy nobody asked for.
 * A page with no table is unchecked, and the count of those is printed so
 * "unchecked" stays a visible state rather than a silent pass.
 *
 * Pure Node, no browser, no node_modules — so it runs inside `npm run check`.
 *
 *   node scripts/check-props-table.mjs [--self-test]
 * Exit: 0 = every table matches its component · 1 = one does not
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const C = process.stdout.isTTY
  ? { r: '\x1b[31m', g: '\x1b[32m', y: '\x1b[33m', b: '\x1b[1m', dim: '\x1b[2m', x: '\x1b[0m' }
  : { r: '', g: '', y: '', b: '', dim: '', x: '' };

/* ── 1. reading a hand-written table ──────────────────────────────────────── */

const ENTITIES = { '&#39;': "'", '&quot;': '"', '&lt;': '<', '&gt;': '>', '&nbsp;': ' ', '&amp;': '&' };
/* &amp; last, so `&amp;#39;` cannot be decoded twice into a quote. */
export const decode = (s) =>
  Object.entries(ENTITIES).reduce((acc, [e, c]) => acc.split(e).join(c), s);

const text = (cell) => decode(cell.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

/**
 * Returns the rows of the first Prop/Type/Default table on the page, or null if
 * the page has none. Null and an empty array are different answers and the
 * caller treats them differently: no table is "unchecked", a table with no rows
 * is a fault.
 */
export function parseTable(html) {
  const tables = [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)];
  for (const [, body] of tables) {
    const head = body.match(/<thead>([\s\S]*?)<\/thead>/);
    if (!head) continue;
    const cols = [...head[1].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => text(m[1]));
    if (cols[0] !== 'Prop') continue;
    /* Not every table has all three columns. FlyoutMenu's is `Prop | What it
       does`, which still makes a claim about WHICH props exist even though it
       makes none about their types — so it is checked for the half it asserts
       rather than skipped for the half it does not. A column that is absent
       reads null, and null is never compared. */
    const typeAt = cols.indexOf('Type');
    const defaultAt = cols.indexOf('Default');

    const rows = [];
    for (const [, tr] of body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
      const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => text(m[1]));
      if (!cells.length) continue;
      /* One row, two props: the pages write `ctaLabel / ctaHref` where a pair
         shares a type and a sentence. That is a real convention and not a
         fault, so it is READ rather than exempted — and reading it is what
         exposes the case where the pair does NOT share a default, which a row
         written this way silently gets wrong for one of the two. */
      const names = cells[0].split('/').map((n) => n.trim()).filter(Boolean);
      /* A paired row may pair its DEFAULT too — `'Search' / 'Ask AI'` — and
         then the two zip. Split on a spaced slash only: `'/'` is a real default
         value on this page and a bare split would tear it in half. Where the
         two do not zip, every name gets the whole cell, which is what makes a
         pair sharing ONE default report as the mismatch it is. */
      const rawDefault = defaultAt === -1 ? null : (cells[defaultAt] ?? '');
      const parts = rawDefault === null ? null : rawDefault.split(/\s+\/\s+/);
      for (const [i, name] of names.entries()) {
        rows.push({
          name,
          type: typeAt === -1 ? null : (cells[typeAt] ?? ''),
          default: parts === null ? null : (parts.length === names.length ? parts[i] : rawDefault),
          pairedWith: names.length > 1 ? cells[0] : null,
        });
      }
    }
    return rows;
  }
  return null;
}

/* A union is a set, not a string: `'a' | 'b'` and `'b' | 'a'` describe the same
   prop. Spacing around the bars is likewise not a claim about anything. */
export const sameType = (a, b) => {
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  if (norm(a) === norm(b)) return true;
  const parts = (s) => norm(s).split('|').map((p) => p.trim()).filter(Boolean).sort().join('|');
  return parts(a) === parts(b);
};

/* The page writes an em dash where the component has no default. */
export const sameDefault = (docs, manifest) => {
  const d = (docs ?? '').trim();
  const m = (manifest ?? '').trim();
  if (d === m) return true;
  if ((d === '—' || d === '-' || d === '') && m === '') return true;
  return false;
};

/* ── 2. the comparison ────────────────────────────────────────────────────── */

/**
 * Props every component declares with the same type — `class` today, and the
 * reason no table lists it. Derived rather than named: the day a component
 * stops taking `class`, it stops being universal and the tables owe it a row.
 * Naming it here instead would be an exemption that survives its own reason.
 */
export function universalProps(components) {
  const first = components[0]?.props ?? [];
  return new Set(
    first
      .filter((p) => components.every((c) => (c.props ?? []).some((q) => q.name === p.name && q.type === p.type)))
      .map((p) => p.name),
  );
}

export function compare(component, rows, universal = new Set()) {
  const faults = [];
  const declared = component.props ?? [];
  const byName = new Map(declared.map((p) => [p.name, p]));
  const inTable = new Map(rows.map((r) => [r.name, r]));

  for (const p of declared) {
    if (universal.has(p.name)) continue;
    if (!inTable.has(p.name)) faults.push(`${p.name} — the component has it, the table does not`);
  }
  for (const r of rows) {
    if (!byName.has(r.name)) faults.push(`${r.name} — the table has it, the component does not`);
  }
  for (const p of declared) {
    const r = inTable.get(p.name);
    if (!r) continue;
    if (r.type !== null && !sameType(r.type, p.type)) {
      faults.push(`${p.name} type\n        component  ${p.type}\n        table      ${r.type}`);
    }
    if (r.default !== null && !sameDefault(r.default, p.default ?? '')) {
      faults.push(
        `${p.name} default — component ${p.default ?? '<none>'}, table ${r.default}` +
          (r.pairedWith ? `  ${C.dim}(one Default cell shared by \`${r.pairedWith}\`)${C.x}` : ''),
      );
    }
  }
  return faults;
}

/* ── 3. run ───────────────────────────────────────────────────────────────── */

const SELF_TEST = process.argv.includes('--self-test');
const manifest = JSON.parse(readFileSync(join(ROOT, 'astro-components', 'components.json'), 'utf8'));

let failed = false;

if (SELF_TEST) {
  const component = {
    name: 'X',
    props: [
      { name: 'kind', type: "'mark' | 'lockup'", default: "'mark'" },
      { name: 'size', type: 'number', default: '48' },
      { name: 'href', type: 'string' },
    ],
  };
  const table = (over = {}) => {
    const rows = [
      { name: 'kind', type: "'mark' | 'lockup'", default: "'mark'" },
      { name: 'size', type: 'number', default: '48' },
      { name: 'href', type: 'string', default: '—' },
    ];
    return over.rows ?? rows.map((r) => ({ ...r, ...(over[r.name] ?? {}) })).filter((r) => !over.drop?.includes(r.name));
  };

  const html = `<table><thead><tr><th>Prop</th><th>Type</th><th>Default</th><th>Notes</th></tr></thead><tbody>
    <tr><td class="prop">kind</td><td class="token">&#39;mark&#39; | &#39;lockup&#39;</td><td class="val">&#39;mark&#39;</td><td>n</td></tr>
  </tbody></table>`;

  const cases = [
    ['CONTROL — a table that agrees is silent', compare(component, table()), (f) => f.length === 0],
    ['a union member the table never learned', compare(component, table({ kind: { type: "'mark'" } })), (f) => f.length === 1],
    ['a union in a different ORDER is the same union', compare(component, table({ kind: { type: "'lockup' | 'mark'" } })), (f) => f.length === 0],
    ['a prop the table does not mention', compare(component, table({ drop: ['size'] })), (f) => f.length === 1 && /table does not/.test(f[0])],
    ['a prop the table invented', compare(component, [...table(), { name: 'ghost', type: 'string', default: '—' }]), (f) => f.length === 1 && /component does not/.test(f[0])],
    ['a default that has drifted', compare(component, table({ size: { default: '56' } })), (f) => f.length === 1],
    ['an em dash IS "no default"', compare(component, table()), (f) => f.length === 0],
    ['the table parser decodes entities', parseTable(html), (r) => r.length === 1 && r[0].type === "'mark' | 'lockup'" && r[0].default === "'mark'"],
    ['a page with no Prop/Type table reads null', parseTable('<table><thead><tr><th>Token</th></tr></thead></table>'), (r) => r === null],
    ['CONTROL — &amp;#39; is not decoded twice', decode('&amp;#39;'), (s) => s === '&#39;'],
  ];

  console.log(`\n${C.b}Self-test${C.x} ${C.dim}props table vs Props${C.x}`);
  for (const [label, got, want] of cases) {
    const pass = want(got);
    if (!pass) failed = true;
    console.log(`  ${pass ? `${C.g}✓${C.x}` : `${C.r}✖${C.x}`} ${label}`);
  }
  console.log();
  process.exit(failed ? 1 : 0);
}

let checked = 0, unchecked = [], rowCount = 0;
const universal = universalProps(manifest.components);
console.log(
  `\n${C.b}Props tables${C.x} ${C.dim}${universal.size ? `universal, so no table owes a row: ${[...universal].join(', ')}` : 'no universal props'}${C.x}\n`,
);

for (const component of manifest.components) {
  if (!component.docs) continue;
  const page = join(ROOT, component.docs);
  if (!existsSync(page)) {
    console.log(`  ${C.r}✖${C.x} ${component.name} — ${component.docs} does not exist`);
    failed = true;
    continue;
  }
  const rows = parseTable(readFileSync(page, 'utf8'));
  if (rows === null) { unchecked.push(component.name); continue; }
  if (!rows.length) {
    console.log(`  ${C.r}✖${C.x} ${component.name} — a Prop/Type table with no rows in it`);
    failed = true;
    continue;
  }

  checked++;
  rowCount += rows.length;
  const faults = compare(component, rows, universal);
  if (!faults.length) {
    console.log(`  ${C.g}✓${C.x} ${component.name.padEnd(14)} ${C.dim}${rows.length} row(s) match ${component.file}${C.x}`);
  } else {
    failed = true;
    console.log(`  ${C.r}✖${C.x} ${component.name.padEnd(14)} ${C.dim}${component.docs}${C.x}`);
    for (const f of faults) console.log(`      ${f}`);
  }
}

/* A docs page carrying a Prop table that NO manifest entry claims. The loop
   above walks components, so such a page is invisible to it — and one exists:
   `component-flyoutmenu.html` documents `astro-components/internal/`, which is
   deliberately not exported and therefore not in the manifest. Nothing can
   check that table, and the honest thing is to say so every run rather than to
   let it read as covered. Not a failure: whether internal components get a
   manifest entry is a decision, not a defect. */
const claimed = new Set(manifest.components.map((c) => c.docs).filter(Boolean));
const orphans = readdirSync(join(ROOT, 'docs'))
  .filter((f) => /^component-.*\.html$/.test(f) && !claimed.has(`docs/${f}`))
  .filter((f) => parseTable(readFileSync(join(ROOT, 'docs', f), 'utf8')) !== null);

if (orphans.length) {
  console.log(
    `\n  ${C.y}!${C.x} ${orphans.length} page(s) carry a Prop table no component in the manifest claims:`,
  );
  for (const f of orphans) console.log(`      ${C.dim}docs/${f} — nothing checks these rows${C.x}`);
}

console.log(
  failed
    ? `\n${C.r}✖${C.x}  a docs table disagrees with the component it documents.\n`
    : `\n${C.g}✔${C.x}  ${rowCount} row(s) across ${checked} table(s) match their Props.` +
      `${C.dim} ${unchecked.length} page(s) document no props and are unchecked.${C.x}\n`,
);
process.exit(failed ? 1 : 0);

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
 * It does not require a page to HAVE a table. A page with no table is
 * unchecked, and the count of those is printed so "unchecked" stays a visible
 * state rather than a silent pass.
 *
 * This comment used to say most pages had none "because the component takes
 * none worth a table". That was never measured and it was wrong: on 2026-09-18
 * the fifteen table-less pages documented 140 props between them, Button alone
 * seven. The tables are now GENERATED (`build-props-tables.mjs`, gated as
 * `check:props`) and a page gains one by carrying a `<!-- props:Name -->`
 * region. Generated or hand-typed, this gate reads the result the same way.
 *
 * INTERNAL COMPONENTS ARE CHECKED TOO, as of 2026-08-26. `component-flyoutmenu`
 * carries a props table for a component in `astro-components/internal/`, which
 * is not exported by name and therefore not in the manifest's public array. For
 * a day this gate could only NAME that page as unverifiable. The manifest now
 * describes internal components under their own key — separate, so the public
 * surface the consuming room diffs is untouched — and those tables are checked
 * exactly like the rest.
 *
 * ── AND THE README, as of 2026-09-30 ───────────────────────────────────────
 *
 * `astro-components/README.md` writes each public component's props out in
 * prose — `Props: \`a\` (…), \`b\`, …` — and that sentence was the one place a
 * consumer reads props that nothing compared to anything. The 2026-09-18 audit
 * found four props missing there on one day. So the same set equality now runs
 * against it: the prop NAMES at the top level of the `Props` paragraph (anything
 * inside parentheses is a value or an explanation and is not read), plus the
 * first column of a markdown table that follows it, which is how FooterBar
 * writes nineteen props. Names only — the prose is free to explain types and
 * defaults however it likes, and the docs tables above are where those are
 * gated. Unlike those tables, `class` is not exempt: every section lists it.
 * A public component whose section has no `Props` paragraph at all is a fault.
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

/**
 * The page writes an em dash where the component has no default.
 *
 * Two more spellings since 2026-09-24, both from build-props-tables.mjs: a long
 * array literal is shown as "N items", and a `\uXXXX` escape as its character.
 * Neither is taken on trust. The manifest's literal is EVALUATED here — a
 * different reader from the generator's bracket-counting scanner — so the count
 * and the character are re-derived rather than matched against the same code
 * that produced them. A literal that will not evaluate is simply not equal.
 */
const literal = (src) => {
  try { return new Function(`"use strict"; return (${src});`)(); } catch { return undefined; }
};
export const sameDefault = (docs, manifest) => {
  const d = (docs ?? '').trim();
  const m = (manifest ?? '').trim();
  if (d === m) return true;
  if ((d === '—' || d === '-' || d === '') && m === '') return true;
  const count = /^(\d+) items?$/.exec(d);
  if (count) {
    const v = literal(m);
    return Array.isArray(v) && v.length === Number(count[1]);
  }
  if (/^['"]/.test(m)) {
    const v = literal(m);
    // text() folds every whitespace run in a cell to one space — a no-break
    // space included — so the evaluated value is folded the same way.
    return typeof v === 'string' && d === (m[0] + v + m[0]).replace(/\s+/g, ' ').trim();
  }
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

/* ── 3. the README's Props prose ──────────────────────────────────────────── */

/** `### \`Name.astro\`` → the section's text, up to the next `###`. */
export function readmeSections(md) {
  const out = new Map();
  for (const part of md.split(/^### /m).slice(1)) {
    const h = part.match(/^`(\w+)\.astro`/);
    if (h) out.set(h[1], part);
  }
  return out;
}

/**
 * The prop names a section's `Props` paragraph lists, or null when it has none.
 * A name is a backticked identifier OUTSIDE parentheses — `(\`a\` | \`b\`)` is a
 * union and `(default \`x\`)` a value, neither a prop. Backticks are skipped as
 * a unit first, so a `)` inside code cannot close a parenthesis.
 *
 * READING STOPS AT THE LIST'S FULL STOP — the first `.` at the top level that
 * ends a sentence. Input's paragraph goes on to explain `autocomplete` and
 * `error` after `class.`, so a whole-paragraph read would keep passing with
 * `error` deleted from the list itself: the set comparison would find it in the
 * explanation. A `.` inside parentheses (`e.g. for another language`) is not
 * the end. A markdown table right after the paragraph contributes its first
 * column.
 */
export function readmePropNames(section) {
  const start = section.search(/^Props\b/m);
  if (start < 0) return null;
  const rest = section.slice(start);
  const para = rest.split(/\n\s*\n/)[0];
  const names = [];
  let depth = 0;
  for (let i = 0; i < para.length; i++) {
    const ch = para[i];
    if (ch === '`') {
      const j = para.indexOf('`', i + 1);
      if (j < 0) break;
      if (depth === 0) names.push(para.slice(i + 1, j));
      i = j;
    } else if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (ch === '.' && depth === 0 && (i + 1 === para.length || /\s/.test(para[i + 1]))) break;
  }
  const after = rest.slice(para.length).replace(/^\s*\n/, '');
  if (after.startsWith('|')) {
    for (const line of after.split('\n')) {
      if (!line.startsWith('|')) break;
      const cell = line.split('|')[1] ?? '';
      for (const m of cell.matchAll(/`([^`]+)`/g)) names.push(m[1]);
    }
  }
  return [...new Set(names.filter((n) => /^[a-zA-Z][a-zA-Z0-9]*$/.test(n)))];
}

export function compareReadme(component, names) {
  const want = new Set((component.props ?? []).map((p) => p.name));
  const got = new Set(names);
  return [
    ...[...want].filter((n) => !got.has(n)).map((n) => `${n} — the component has it, the README's Props line does not`),
    ...[...got].filter((n) => !want.has(n)).map((n) => `${n} — the README's Props line has it, the component does not`),
  ];
}

/* ── 4. run ───────────────────────────────────────────────────────────────── */

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
    ['"N items" matches an array literal of N', sameDefault('2 items', "[{ a: 'x, y' }, { a: 'z' }]"), (ok) => ok === true],
    ['"N items" with the wrong N does not', sameDefault('3 items', "[{ a: 'x, y' }, { a: 'z' }]"), (ok) => ok === false],
    ['an escape matches its character only', [sameDefault("'caf\u00E9'", "'caf\\u00E9'"), sameDefault("'cafe'", "'caf\\u00E9'")], ([yes, no]) => yes && !no],
    ['the table parser decodes entities', parseTable(html), (r) => r.length === 1 && r[0].type === "'mark' | 'lockup'" && r[0].default === "'mark'"],
    ['a page with no Prop/Type table reads null', parseTable('<table><thead><tr><th>Token</th></tr></thead></table>'), (r) => r === null],
    ['CONTROL — &amp;#39; is not decoded twice', decode('&amp;#39;'), (s) => s === '&#39;'],
    ['README — top-level names only, not a union or a default in parentheses',
      readmePropNames("Props: `kind` (`mark` | `lockup`, default `mark`), `size`, `href`.\n\nMore."),
      (n) => n.join() === 'kind,size,href'],
    ['README — a `)` inside code does not close the parenthesis',
      readmePropNames("Props: `a` (`f()` then `x`), `b`."), (n) => n.join() === 'a,b'],
    ['README — a table after the Props paragraph adds its first column',
      readmePropNames("Props, all optional:\n\n| | |\n|---|---|\n| `kind`, `size` | the size |\n| `href` | `notAProp` |\n\nAfter."),
      (n) => n.join() === 'kind,size,href'],
    ['README — prose after the list\'s full stop is not read as the list',
      readmePropNames("Props: `kind`, `size`. Pass `href` when it links."), (n) => n.join() === 'kind,size'],
    ['README — a full stop inside parentheses does not end the list',
      readmePropNames("Props: `kind` (e.g. for this. Or that), `size`."), (n) => n.join() === 'kind,size'],
    ['README — a section with no Props paragraph reads null', readmePropNames('Some text.\n'), (n) => n === null],
    ['README CONTROL — a Props line that agrees is silent', compareReadme(component, ['kind', 'size', 'href']), (f) => f.length === 0],
    ['README — a prop the Props line does not mention', compareReadme(component, ['kind', 'href']), (f) => f.length === 1 && /README's Props line does not/.test(f[0])],
    ['README — a prop the Props line invented', compareReadme(component, ['kind', 'size', 'href', 'ghost']), (f) => f.length === 1 && /component does not/.test(f[0])],
    ['README — sections are keyed by their `Name.astro` heading',
      readmeSections("### `A.astro`\nProps: `x`.\n\n### Other\n\n### `B.astro`\nno props\n"), (m) => [...m.keys()].join() === 'A,B'],
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
/* Universality is judged over the PUBLIC components only. `class` is a promise
   this package makes to consumers; an internal component that happens to take
   it is not what makes that promise, and one that does not must not be able to
   revoke the exemption for nineteen pages. */
const universal = universalProps(manifest.components);
console.log(
  `\n${C.b}Props tables${C.x} ${C.dim}${universal.size ? `universal, so no table owes a row: ${[...universal].join(', ')}` : 'no universal props'}${C.x}\n`,
);

/* Public and internal alike: what makes a table checkable is that something
   describes the component, not whether a consumer may import it. */
for (const component of [...manifest.components, ...(manifest.internal ?? [])]) {
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
const claimed = new Set(
  [...manifest.components, ...(manifest.internal ?? [])].map((c) => c.docs).filter(Boolean),
);
const orphans = readdirSync(join(ROOT, 'docs'))
  .filter((f) => /^component-.*\.html$/.test(f) && !claimed.has(`docs/${f}`))
  .filter((f) => parseTable(readFileSync(join(ROOT, 'docs', f), 'utf8')) !== null);

if (orphans.length) {
  console.log(
    `\n  ${C.y}!${C.x} ${orphans.length} page(s) carry a Prop table no component in the manifest claims:`,
  );
  for (const f of orphans) console.log(`      ${C.dim}docs/${f} — nothing checks these rows${C.x}`);
}

/* The README. Public components only: an internal one is not something a
   consumer passes props to, and its README section says it moved. */
const readme = readmeSections(readFileSync(join(ROOT, 'astro-components', 'README.md'), 'utf8'));
let readmeChecked = 0, readmeNames = 0;
const readmeFailed = [];
console.log(`\n${C.b}README Props lines${C.x} ${C.dim}astro-components/README.md, names only${C.x}\n`);
for (const component of manifest.components) {
  const section = readme.get(component.name);
  if (!section) continue; // a missing section is check:exports' finding, not this gate's
  const names = readmePropNames(section);
  if (names === null) {
    readmeFailed.push(component.name);
    console.log(`  ${C.r}✖${C.x} ${component.name.padEnd(14)} the README section has no Props paragraph — ${(component.props ?? []).length} props undocumented there`);
    continue;
  }
  const faults = compareReadme(component, names);
  readmeChecked++;
  readmeNames += names.length;
  if (!faults.length) {
    console.log(`  ${C.g}✓${C.x} ${component.name.padEnd(14)} ${C.dim}${names.length} name(s) match${C.x}`);
  } else {
    readmeFailed.push(component.name);
    console.log(`  ${C.r}✖${C.x} ${component.name.padEnd(14)}`);
    for (const f of faults) console.log(`      ${f}`);
  }
}
if (readmeFailed.length) failed = true;

console.log(
  failed
    ? `\n${C.r}✖${C.x}  a docs table or README Props line disagrees with the component it documents.\n`
    : `\n${C.g}✔${C.x}  ${rowCount} row(s) across ${checked} table(s) match their Props.` +
      (unchecked.length
        ? `${C.dim} ${unchecked.length} page(s) have no props table yet — add a <!-- props:Name --> region and run npm run build:props.${C.x}\n`
        : ` Every component page has one.`) +
      ` ${readmeNames} README prop name(s) across ${readmeChecked} section(s) match too.\n`,
);
process.exit(failed ? 1 : 0);

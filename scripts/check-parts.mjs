#!/usr/bin/env node
/**
 * Iron Software Design System — does every published hook still exist?
 *
 * A component here publishes `[data-part]` and never its own class names. That
 * is Ball's ruling, and it is what makes composition possible: `TopNav` styles
 * `FlyoutMenu` through `[data-part='trigger']` and `[data-part='panel']`,
 * because Astro's scoping cannot reach a child and `.fm-trigger` is not a
 * contract anyone promised to keep.
 *
 * So `[data-part]` IS the contract, and until 2026-08-21 nothing checked it.
 * Rename `data-part="rail"` and every selector keyed to it stops matching in
 * silence — no error, no warning, just a component that has quietly stopped
 * being styled. That is the same failure the consuming room reported when four
 * page-side overrides died with `.btn` and `.sel-label`, moved one level up and
 * into this repo.
 *
 * WHY THIS AND NOT A DEPRECATION POLICY FOR CLASS NAMES. Because internal
 * classes are deliberately not a contract. Guarding them would promise
 * something this package has explicitly declined to offer, and would tax every
 * future conversion to utilities with a funeral for a name nobody was entitled
 * to use. The hooks are the promise; the hooks get the gate.
 *
 * WHAT IT DOES NOT DO. It does not complain about a part that nothing here
 * consumes. Hooks exist FOR consumers, who are outside this repo by definition,
 * so an unused one is the normal case rather than dead code.
 *
 * The publisher and the consumer are usually different files — FlyoutMenu
 * publishes, TopNav depends — so this is a whole-repo question and cannot be
 * answered per file.
 *
 * Pure Node, no browser and no node_modules, so it runs inside `npm run check`.
 *
 * Run:  node scripts/check-parts.mjs [--self-test]
 * Exit: 0 = every dependency has a publisher · 1 = one does not
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, extname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SELF_TEST = process.argv.includes('--self-test');

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[90m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

/**
 * The contract is published by the PACKAGE'S SOURCE and by nothing else.
 *
 * That distinction is load-bearing and was learned the hard way: with `docs/`
 * counted as a publisher too, renaming `data-part="rail"` in ProductFlyout left
 * the gate green, because the generated demo regions in three docs pages still
 * carried the old attribute and satisfied every selector by themselves. The
 * fault injection did not land, and a gate that cannot fail is not a gate. The
 * tell was the count — 9 published where there had been 8 — not the verdict.
 *
 * So: only `astro-components/` publishes. Everything else may depend.
 */
const PUBLISH_ROOTS = ['astro-components'];
const DEPEND_ROOTS = ['astro-components', 'docs', 'playground/src'];
const EXT = new Set(['.astro', '.ts', '.html', '.css']);

function filesIn(roots) {
  const out = [];
  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir); } catch { return; }
    for (const name of entries) {
      if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (EXT.has(extname(name))) out.push(p);
    }
  };
  for (const r of roots) walk(join(ROOT, r));
  return out.sort();
}

/**
 * `data-part="x"` in markup PUBLISHES x. `[data-part='x']` in a selector or a
 * query DEPENDS on x. The bracket is what tells them apart, and it is reliable:
 * an attribute is never written inside square brackets, and a selector never
 * outside them.
 */
const PUBLISH = /(?<!\[)\bdata-part\s*=\s*["']([A-Za-z0-9_-]+)["']/g;
const DEPEND = /\[\s*data-part\s*=\s*["']?([A-Za-z0-9_-]+)["']?\s*\]/g;
/** A hook whose name is computed. Nothing static can follow it — so it is counted, not ignored. */
const DYNAMIC = /\bdata-part\s*=\s*\{/g;

function scan() {
  const published = new Map();   // part -> [file:line]  — source only
  const depended = new Map();    // part -> [file:line]  — anywhere
  let dynamic = 0;
  const at = (src, i) => src.slice(0, i).split('\n').length;

  for (const f of filesIn(PUBLISH_ROOTS)) {
    const src = readFileSync(f, 'utf8');
    const rel = relative(ROOT, f);
    for (const m of src.matchAll(PUBLISH)) {
      if (!published.has(m[1])) published.set(m[1], []);
      published.get(m[1]).push(`${rel}:${at(src, m.index)}`);
    }
    dynamic += [...src.matchAll(DYNAMIC)].length;
  }
  for (const f of filesIn(DEPEND_ROOTS)) {
    const src = readFileSync(f, 'utf8');
    const rel = relative(ROOT, f);
    for (const m of src.matchAll(DEPEND)) {
      if (!depended.has(m[1])) depended.set(m[1], []);
      depended.get(m[1]).push(`${rel}:${at(src, m.index)}`);
    }
  }
  return { published, depended, dynamic, files: filesIn(DEPEND_ROOTS).length };
}

function orphans({ published, depended }) {
  const out = [];
  for (const [part, uses] of depended) if (!published.has(part)) out.push({ part, uses });
  return out;
}

/**
 * Six rows. The two that matter most are the ones that keep publish and depend
 * apart: a detector that treated `data-part="panel"` as a dependency would find
 * every part satisfied by itself and never fire.
 */
function selfTest() {
  const fixture = (s) => {
    const published = new Map(), depended = new Map();
    for (const m of s.matchAll(PUBLISH)) published.set(m[1], ['fixture']);
    for (const m of s.matchAll(DEPEND)) depended.set(m[1], ['fixture']);
    return { published, depended };
  };

  const missing = orphans(fixture(`<div data-part="panel"></div><style>[data-part='rail'] { color: red }</style>`));
  const satisfied = orphans(fixture(`<div data-part="rail"></div><style>[data-part='rail'] { color: red }</style>`));
  const attrOnly = fixture(`<div data-part="panel"></div>`);
  const selOnly = fixture(`<style>[data-part='panel'] {}</style>`);

  const real = scan();
  const realOrphans = orphans(real);

  const rows = [
    ['a selector keyed to a part nothing publishes is reported',
     missing.length === 1 && missing[0].part === 'rail', missing.map((o) => o.part).join(',') || 'nothing'],
    ['…and one whose publisher exists is not', satisfied.length === 0, `${satisfied.length} finding(s)`],
    ['an ATTRIBUTE is read as publishing, not as depending',
     attrOnly.published.has('panel') && !attrOnly.depended.has('panel'),
     `published=${attrOnly.published.has('panel')} depended=${attrOnly.depended.has('panel')}`],
    ['a SELECTOR is read as depending, not as publishing',
     selOnly.depended.has('panel') && !selOnly.published.has('panel'),
     `published=${selOnly.published.has('panel')} depended=${selOnly.depended.has('panel')}`],
    ['the real tree has hooks on both sides — this is not asking nothing',
     real.published.size >= 3 && real.depended.size >= 2,
     `${real.published.size} published · ${real.depended.size} depended on`],
    ['only the package source publishes — a docs echo cannot satisfy a selector',
     filesIn(PUBLISH_ROOTS).every((f) => relative(ROOT, f).startsWith('astro-components')),
     `${filesIn(PUBLISH_ROOTS).length} source files`],
    ['the real tree is clean', realOrphans.length === 0, `${realOrphans.length} orphan(s)`],
  ];

  let bad = 0;
  for (const [label, ok, detail] of rows) {
    console.log(`  ${ok ? green('✔') : red('✖')}  ${label}   ${dim(detail)}`);
    if (!ok) bad++;
  }
  return { bad, total: rows.length };
}

if (SELF_TEST) {
  const { bad, total } = selfTest();
  if (bad) {
    console.error(red(`\n✖  ${bad} of ${total} self-test rows failed — this checker does not do what it claims.\n`));
    process.exit(1);
  }
  console.log(green(`\n✔  ${total}/${total} — publishing and depending are told apart, and a missing publisher is caught\n`));
  process.exit(0);
}

// ── the check ────────────────────────────────────────────────────────────────

const result = scan();
const found = orphans(result);

if (found.length) {
  console.error(red(`\n✖  ${found.length} \`[data-part]\` hook(s) are depended on but published by nothing\n`));
  for (const o of found) {
    console.error(`  ${bold(`[data-part='${o.part}']`)}`);
    for (const u of o.uses) console.error(`    ${dim(u)}`);
  }
  console.error(`\n  A component publishes \`[data-part]\` and never its class names, so these`);
  console.error(`  hooks are the contract. A renamed one does not error — the selector simply`);
  console.error(`  stops matching, and the component quietly stops being styled.`);
  console.error(`\n  Either restore the attribute, or update everything keyed to it. Published`);
  console.error(`  now: ${[...result.published.keys()].sort().join(', ')}\n`);
  process.exit(1);
}

console.log(green(`\n✔  every \`[data-part]\` depended on has a publisher`) +
            dim(`  — ${result.published.size} published by the package, ${result.depended.size} depended on, across ${result.files} files` +
                (result.dynamic ? `  (${result.dynamic} computed, unreadable)` : '')) + '\n');

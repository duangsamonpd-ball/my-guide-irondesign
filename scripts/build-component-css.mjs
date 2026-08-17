#!/usr/bin/env node
/**
 * Iron Software Design System — one stylesheet for every component <style>
 *
 * WHY THIS EXISTS. A docs page that shows ONE component carries a copy of that
 * component's CSS inline, and `check:parity` proves the copy matches. That does
 * not scale to a page showing all nineteen: `07-components.html` would have to
 * hand-carry 36KB from eight components, unguarded, which is the drift this
 * repo keeps paying for. So the stylesheet is generated from the components
 * themselves and the page links it.
 *
 *   astro-components/components/*.astro  <style> …  ──▶  docs/components.css
 *   astro-components/internal/*.astro    <style> …
 *
 * The per-page copies are untouched. A single-component page still carries its
 * own rules and parity still governs them; this is for pages that compose many.
 *
 * WHAT MAKES A FLAT FILE SAFE, AND WHY BOTH PROPERTIES ARE CHECKED RATHER THAN
 * BELIEVED. In an Astro component the <style> is SCOPED — every selector is
 * rewritten with a `data-astro-cid-…` attribute, so `.title` in one component
 * cannot touch `.title` in another, and a bare `footer { … }` reaches only that
 * component's own footer. Concatenating the blocks throws all of that away.
 * Measured on 2026-08-17 the components are clean on both counts, and both are
 * one careless edit from stopping being true:
 *
 *   (1) NO SELECTOR IS CLAIMED BY TWO COMPONENTS. Every component prefixes its
 *       classes (`tn-`, `pm-`, `fb-`, `tt-`, `tlink`, `notice-`, `dropzone-`).
 *       Two components declaring `.title` would silently merge here.
 *   (2) NO TOP-LEVEL SELECTOR STARTS WITH A BARE TAG. This repo has already
 *       lost a day to a bare `footer { padding }` in docs.css padding every
 *       component footer below 640px, and to a bare `header` styling the
 *       homepage hero. Unscoped, a component's own bare tag would do the same
 *       to every docs page that links this file.
 *
 * Either one fails the build. A rule that cannot be written safely into a flat
 * file must stay scoped and stay out of here.
 *
 * Run:
 *   node scripts/build-component-css.mjs             write docs/components.css
 *   node scripts/build-component-css.mjs --check     fail if it is not current
 *   node scripts/build-component-css.mjs --self-test prove the two checks bite
 *
 * Zero dependencies — plain Node, same as the other generators.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = ['astro-components/components', 'astro-components/internal'];
const OUT = join(ROOT, 'docs/components.css');

const CHECK = process.argv.includes('--check');
const SELF_TEST = process.argv.includes('--self-test');

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[90m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** All <style> bodies in a component file, concatenated. */
function styleBlocks(src) {
  return [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
}

/**
 * Top-level selectors, by brace depth so an @media block reports its own
 * prelude rather than the rules nested inside it. Those nested rules are not
 * examined: a selector inside @media is still governed by the same two rules
 * through the plain rule that declares it, and every component here declares
 * one. `walkNested` covers the case where it does not.
 */
function topLevelSelectors(css) {
  const out = [];
  let cur = '';
  let depth = 0;
  for (const ch of stripComments(css)) {
    if (ch === '{') {
      if (depth === 0) out.push(cur.trim());
      depth++;
      cur = '';
      continue;
    }
    if (ch === '}') {
      depth = Math.max(0, depth - 1);
      cur = '';
      continue;
    }
    if (depth === 0) cur += ch;
  }
  return out.filter(Boolean);
}

/** Selector preludes nested one level inside an at-rule, e.g. inside @media. */
function nestedSelectors(css) {
  const out = [];
  for (const m of stripComments(css).matchAll(/@[\w-]+[^{]*\{([\s\S]*?)\n\s*\}/g)) {
    out.push(...topLevelSelectors(m[1]));
  }
  return out;
}

/** Split a selector list into its individual compound selectors. */
const compounds = (list) => list.split(',').map((s) => s.trim()).filter(Boolean);

/** The first simple selector of a compound — `.a .b` → `.a`, `footer p` → `footer`. */
const firstSimple = (compound) => compound.split(/[\s>+~]+/)[0];

/**
 * Collect every component's CSS, and the two properties that make it safe to
 * flatten. Returns { files, blocks, collisions, bareTags }.
 */
function collect(readFile = (p) => readFileSync(p, 'utf8')) {
  const blocks = [];
  const owner = new Map();          // selector -> [component, …]
  const bareTags = [];

  for (const rel of SOURCES) {
    const dir = join(ROOT, rel);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.astro')).sort()) {
      const css = styleBlocks(readFile(join(dir, file))).trim();
      if (!css) continue;
      const name = basename(file, '.astro');
      blocks.push({ name, rel, css });

      for (const list of [...topLevelSelectors(css), ...nestedSelectors(css)]) {
        if (list.startsWith('@')) continue;
        for (const compound of compounds(list)) {
          if (!owner.has(compound)) owner.set(compound, []);
          if (!owner.get(compound).includes(name)) owner.get(compound).push(name);
          const first = firstSimple(compound);
          if (/^[a-zA-Z][a-zA-Z0-9]*$/.test(first)) bareTags.push({ name, compound, first });
        }
      }
    }
  }

  const collisions = [...owner].filter(([, names]) => names.length > 1);
  return { blocks, collisions, bareTags };
}

function render(blocks) {
  const head = [
    '/*',
    ' * Iron Software Design System — every component <style>, in one file.',
    ' *',
    ' * GENERATED by scripts/build-component-css.mjs — do not edit.',
    ' * Edit the component and re-run `npm run build:components-css`.',
    ' *',
    ' * For docs pages that show MANY components at once (07-components.html).',
    ' * A page showing one component still carries its own copy, governed by',
    ' * check:parity. The generator refuses to write this file if two components',
    ' * claim one selector, or if any selector starts with a bare tag — Astro',
    ' * scoping makes both harmless in the component and neither is harmless here.',
    ' *',
    ` * ${blocks.length} components with a <style> block.`,
    ' */',
    '',
  ].join('\n');

  // Source comments are dropped: they carry the REASONING, which belongs beside
  // the rule in the component, not in a file whose own banner says to go there.
  // 75.1KB of them, against 36.6KB of actual CSS, on a page a browser fetches.
  const body = blocks
    .map(({ name, rel, css }) => {
      const rules = stripComments(css).split('\n').filter((l) => l.trim()).join('\n');
      return `/* ── ${name} ${'─'.repeat(Math.max(0, 60 - name.length))}\n   ${rel}/${name}.astro */\n${rules}\n`;
    })
    .join('\n');

  return `${head}\n${body}`;
}

/* ── self-test: prove both refusals bite ─────────────────────────────────── */

if (SELF_TEST) {
  const results = [];
  const real = (p) => readFileSync(p, 'utf8');

  const clean = collect(real);
  results.push(['the real tree has no selector collisions', clean.collisions.length === 0, `${clean.collisions.length} found`]);
  results.push(['the real tree has no bare-tag selectors', clean.bareTags.length === 0, `${clean.bareTags.length} found`]);
  results.push(['it found CSS at all', clean.blocks.length > 0, `${clean.blocks.length} components`]);

  // Plant a collision: give one component a selector another already owns.
  const victim = clean.blocks[0].name;
  const stolen = compounds(topLevelSelectors(clean.blocks[1].css)[0])[0];
  const withCollision = collect((p) =>
    p.endsWith(`${victim}.astro`) ? `<style>${stolen} { color: red; }</style>` : real(p));
  results.push([`a planted collision on \`${stolen}\` is caught`,
    withCollision.collisions.some(([sel]) => sel === stolen), 'not reported']);

  // Plant a bare tag, the `footer { … }` shape that has cost this repo twice.
  const withBareTag = collect((p) =>
    p.endsWith(`${victim}.astro`) ? '<style>footer { padding: 40px; }</style>' : real(p));
  results.push(['a planted bare `footer` selector is caught',
    withBareTag.bareTags.some((b) => b.first === 'footer'), 'not reported']);

  // And one inside @media, since that is where a stray rule hides best.
  const withNestedBareTag = collect((p) =>
    p.endsWith(`${victim}.astro`) ? '<style>@media (max-width: 640px) {\n  header { padding: 0; }\n}</style>' : real(p));
  results.push(['a bare tag nested inside @media is caught',
    withNestedBareTag.bareTags.some((b) => b.first === 'header'), 'not reported']);

  let failed = 0;
  console.log('');
  for (const [label, ok, detail] of results) {
    console.log(`  ${ok ? green('✔') : red('✖')}  ${label}${ok ? '' : dim(`  — ${detail}`)}`);
    if (!ok) failed++;
  }
  console.log(failed ? red(`\n✖  ${failed} of ${results.length} self-test checks failed\n`)
                     : green(`\n✔  self-test ${results.length}/${results.length}\n`));
  process.exit(failed ? 1 : 0);
}

/* ── run ─────────────────────────────────────────────────────────────────── */

const { blocks, collisions, bareTags } = collect();

if (collisions.length) {
  console.error(red(`\n✖  ${collisions.length} selector(s) claimed by more than one component\n`));
  for (const [sel, names] of collisions) console.error(`  ${bold(sel)}  ${dim(names.join(', '))}`);
  console.error(dim('\n  Scoping hides this in the component and cannot hide it in one flat file.\n  Prefix the class with the component, the way every other one does.\n'));
  process.exit(1);
}

if (bareTags.length) {
  console.error(red(`\n✖  ${bareTags.length} selector(s) start with a bare tag\n`));
  for (const b of bareTags) console.error(`  ${bold(b.compound)}  ${dim(`in ${b.name}, on every \`${b.first}\` of any page that links this file`)}`);
  console.error(dim('\n  A bare `footer` in docs.css once padded every component footer below 640px.\n  Give the rule a class.\n'));
  process.exit(1);
}

const out = render(blocks);
const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : null;

if (CHECK) {
  if (current === out) {
    console.log(green(`\n✔  docs/components.css current — ${blocks.length} components, ${(out.length / 1024).toFixed(1)}KB\n`));
    process.exit(0);
  }
  console.error(red('\n✖  docs/components.css is stale\n'));
  console.error(dim(`  ${current === null ? 'the file does not exist' : 'a component <style> changed since it was generated'}`));
  console.error(dim('  Run `npm run build:components-css` and commit the result.\n'));
  process.exit(1);
}

writeFileSync(OUT, out);
console.log(green(`\n✔  docs/components.css written — ${blocks.length} components, ${(out.length / 1024).toFixed(1)}KB\n`));

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
const converted = [];
const perFile = [];
let rulesChecked = 0;

const UTILITIES = join(DOCS, 'utilities.css');
const shellCss = readFileSync(join(DOCS, 'docs.css'), 'utf8');

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

/* ── mode B: a component that has converted to utility classes ───────────── */

/** Every class name that appears in a `class="…"` attribute in some markup. */
function classesInMarkup(html) {
  const out = new Set();
  for (const m of html.matchAll(/class="([^"]*)"/g)) {
    for (const c of m[1].split(/\s+/)) if (c) out.add(c);
  }
  return out;
}

/**
 * A converted component ships no CSS of its own, so the question changes. It is
 * no longer "does the docs page carry the same rules" — there are none to carry.
 * It is: will that page still render the component, and has the CSS it used to
 * need been cleared out?
 *
 * Two failures, both of which happened on the POC branch and neither of which
 * any existing gate saw:
 *
 *  1. The page does not link the compiled utilities, so every demo on it renders
 *     as unstyled text. Worse, the hand-written cells further down the same page
 *     kept working off the old CSS, so it read as half broken rather than broken.
 *  2. The old rules stay behind — 18 of them for Badge — styling class names the
 *     component no longer emits. Dead CSS on a page nobody rereads is how the
 *     next person concludes the component still works that way.
 */
function checkConverted(file, name, docsPath) {
  const page = readFileSync(docsPath, 'utf8');
  const problems = [];

  if (!/<link[^>]+href="utilities\.css"/.test(page)) {
    problems.push(`does not link utilities.css — every demo on it renders unstyled`);
  }

  /**
   * The check that matters most, and the one whose absence bit first. Deleting
   * the component's old rules from the page is only safe if nothing on the page
   * still uses them — and on Badge, seven hand-written elements outside the
   * generated demo regions did: an anatomy example and six token-table swatches.
   * They kept `class="badge badge--success"` while the rules that styled it were
   * removed, so they rendered as bare text on a page that otherwise looked fine.
   *
   * The dead-rule check below cannot see this. It asks whether a RULE has lost
   * its markup; this asks whether MARKUP has lost its rule. Both directions have
   * now happened, on the same page, within an hour of each other.
   */
  /**
   * `\\.` in the pattern is not optional. Tailwind escapes any character that is
   * not valid in an identifier, so `size-1.5` is emitted as `.size-1\.5` — read
   * with a plain `[\w-]+` that comes back as `size-1`, the real class looks
   * undeclared, and this gate reports a class that is right there in the file.
   * It did exactly that the first time it ran.
   */
  const unescape = (s) => s.replace(/\\(.)/g, '$1');
  const declared = new Set([
    ...[...readFileSync(UTILITIES, 'utf8').matchAll(/^\s*\.((?:[\w-]|\\.)+)/gm)].map((m) => unescape(m[1])),
    ...[...shellCss.matchAll(/\.((?:[\w-]|\\.)+)/g)].map((m) => unescape(m[1])),
    ...[...styleBlocks(page).matchAll(/\.((?:[\w-]|\\.)+)/g)].map((m) => unescape(m[1])),
  ]);
  const used = classesInMarkup(page);
  const unstyled = [...used].filter((c) => !declared.has(c));
  if (unstyled.length) {
    problems.push(
      `${unstyled.length} class${unstyled.length > 1 ? 'es' : ''} in its markup resolve nowhere — ` +
        `not in utilities.css, docs.css or the page: ${unstyled.slice(0, 8).join(', ')}` +
        (unstyled.length > 8 ? ', …' : ''),
    );
  }

  const dead = [];
  for (const rule of topLevelRules(styleBlocks(page))) {
    const sel = rule.slice(0, rule.indexOf('{')).replace(/\s+/g, ' ').trim();
    // Only judge selectors built purely from class names; anything with an
    // element, id, attribute or at-rule in it is the page's own chrome.
    if (!/^(\.[\w-]+)+(\s*[,>+~]?\s*(\.[\w-]+)+)*$/.test(sel)) continue;
    const names = [...sel.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
    if (names.every((n) => !used.has(n))) dead.push(sel);
  }
  if (dead.length) {
    problems.push(
      `${dead.length} dead rule${dead.length > 1 ? 's' : ''} for classes its markup no longer uses: ` +
        dead.slice(0, 6).join(', ') + (dead.length > 6 ? ', …' : ''),
    );
  }

  return { file, name, docsPath, problems, utilities: [...used].length };
}

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
   * A component with no <style> is now the EXPECTED end state, not a mistake:
   * the components are converting to Tailwind utility classes (Ball's call
   * 2026-08-05). But the two shapes cannot be checked the same way, and the
   * empty set is a subset of anything — so left alone this gate would not fail
   * on a converted component, it would go SILENT, exactly as it did on the POC
   * branch where 456 rules became 438 and it still printed a tick.
   *
   * So: a component either has scoped CSS and is checked against its docs page
   * as before, or it has none and is checked against the compiled utilities
   * instead. What is not allowed is falling through unchecked.
   */
  if (astroRules.length === 0) {
    converted.push(checkConverted(file, name, docsPath));
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

const broken = converted.filter((c) => c.problems.length);
if (broken.length) {
  console.log(`\n\x1b[31m✖  ${broken.length} converted component${broken.length > 1 ? 's' : ''} left its docs page unable to render it\x1b[0m`);
  for (const { file, name, problems } of broken) {
    console.log(`\n  \x1b[1m${file}\x1b[0m  ↔  docs/component-${name}.html`);
    for (const p of problems) console.log(`    \x1b[31m✖\x1b[0m ${p}`);
  }
  console.log(`\n  A component with no <style> is styled by docs/utilities.css. Link it on the`);
  console.log(`  page, and delete the rules the old markup needed.\n`);
  process.exit(1);
}

/**
 * utilities.css must exist the moment any component depends on it. Without this
 * the whole mode-B branch checks a file that is not there and says nothing.
 */
if (converted.length && !existsSync(UTILITIES)) {
  console.log(`\n\x1b[31m✖  ${converted.length} component(s) rely on docs/utilities.css, which is missing\x1b[0m`);
  console.log(`   Run: node scripts/build-utilities.mjs\n`);
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
if (smallest) {
  console.log(`\x1b[90m   fewest is ${smallest.file} at ${smallest.count} rules\x1b[0m`);
}
if (converted.length) {
  console.log(
    `\x1b[32m✔  ${converted.length} converted component${converted.length > 1 ? 's' : ''} styled by docs/utilities.css\x1b[0m` +
      `\x1b[90m — ${converted.map((c) => c.file).join(', ')}\x1b[0m`,
  );
}
console.log();

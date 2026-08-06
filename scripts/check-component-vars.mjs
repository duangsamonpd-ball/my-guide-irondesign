#!/usr/bin/env node
/**
 * Iron Software Design System — component variable resolution check
 *
 * Our components read design tokens as plain CSS variables inside their own
 * <style> blocks, not as utility classes. Tailwind's scanner cannot see those,
 * so a token it decides to drop is invisible until something renders wrong.
 *
 * This takes the *compiled* stylesheet and asserts that every `var(--…)` the
 * components reference is actually defined in it.
 *
 * Run:  npx @tailwindcss/cli -i tailwind/theme.css -o /tmp/out.css
 *       node scripts/check-component-vars.mjs /tmp/out.css
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const compiledPath = process.argv[2];

if (!compiledPath) {
  console.error('usage: node scripts/check-component-vars.mjs <compiled.css>');
  process.exit(2);
}

const compiled = readFileSync(compiledPath, 'utf8');
const defined = new Set([...compiled.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));

const COMPONENTS = join(ROOT, 'astro-components/components');
/** @type {Map<string, string[]>} variable → components that use it */
const used = new Map();

/**
 * This gate was built when every component read tokens as `var(--…)` inside its
 * own <style>. As components convert to utility classes those usages disappear,
 * and a check that counts them does not fail — it goes quiet, the same way
 * check:parity did. Badge alone took it from 168 variables to 149 while still
 * printing a tick.
 *
 * So a converted component is checked a different way rather than not at all:
 * every utility class it wears must exist in the compiled stylesheet. That
 * matters more here than it looks, because Tailwind emits NOTHING for a class
 * it does not recognise. `bg-sucess-subtle` is not an error anywhere in the
 * toolchain — it is simply a badge with no background, discovered by eye.
 */
const utilities = new Set(
  [...readFileSync(join(ROOT, 'docs/utilities.css'), 'utf8').matchAll(/^\s*\.((?:[\w-]|\\.)+)/gm)]
    .map((m) => m[1].replace(/\\(.)/g, '$1')),
);

/** @type {{file: string, vars: number, classes: number}[]} */
const perFile = [];
const unknown = [];

for (const file of readdirSync(COMPONENTS).filter((f) => f.endsWith('.astro'))) {
  const src = readFileSync(join(COMPONENTS, file), 'utf8');
  // A component may declare its own custom properties in its <style> block;
  // those resolve locally and never need to come from the theme, so don't
  // count them as usages that the compiled CSS has to satisfy.
  const localDefs = new Set([...src.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  /**
   * Comments are stripped before counting. A component that documents its
   * tokens in prose — Badge's closing note names `var(--color-success-subtle)`
   * while using none — otherwise reports a usage it does not have, and that one
   * phantom is enough to keep the guard below from ever firing.
   */
  /**
   * `//` lines are stripped for the same reason `/* *​/` blocks are, and it took
   * a fourth quote bug to notice they were not. Select's frontmatter explains
   * its ids with "don't collide when multiple <Select>s render" — one unpaired
   * apostrophe, which shifts every `'…'` pair after it by one. The reader then
   * treated the CLOSING quote of a real class list as an opening one and read
   * the markup between two of them as a class string, reporting
   * `aria-expanded/aria-haspopup/aria-controls` as three utilities Tailwind had
   * failed to emit. Only line-leading `//` is removed: `https://` inside a real
   * string is not a comment, and eating it would take the string with it.
   */
  const code = src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
  let vars = 0;
  for (const [, name] of code.matchAll(/var\((--[\w-]+)/g)) {
    if (localDefs.has(name)) continue;
    vars++;
    if (!used.has(name)) used.set(name, []);
    const list = used.get(name);
    if (!list.includes(file)) list.push(file);
  }

  /**
   * Only for components that have given up their <style>. Scanning class
   * strings on a component that still has scoped CSS would flag every semantic
   * class it owns — `badge`, `bdot` — as an unknown utility.
   */
  const hasStyle = /<style[^>]*>[\s\S]*\S[\s\S]*<\/style>/i.test(src);
  let classes = 0;
  if (!hasStyle) {
    /**
     * Comment-stripped source, for a reason that is not obvious: an apostrophe
     * in prose — "Figma's", "the component's" — is an unpaired quote, and it
     * shifts every `'…'` match after it by one. Read straight off `src`, Logo's
     * class strings came back as fragments of English and NOT ONE of its
     * utilities was checked, while the gate printed a tick.
     */
    /**
     * A class the component's own <script> selects on is a HOOK, not a utility,
     * and Tailwind is right to emit nothing for it. Select is the first
     * converted component with any: it drives its listbox from `.sel-trigger`,
     * `.sel-menu`, `.sel-opt` and `.sel-value`, and those sit in the same
     * class:list as the utilities. check:parity has allowed this since Badge —
     * it reads docs/preview-frame.js the same way — so the rule is not new, only
     * its second home. `(?![\w-])` so `.sel` does not vouch for `.sel-trigger`.
     */
    const ownScript = [...code.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join('\n');
    const isHook = (c) => new RegExp(`\\.${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(ownScript);

    const strings = [...code.matchAll(/'([^']*)'/g)].map((m) => m[1]);
    for (const s of strings) {
      /**
       * The token pattern has to admit variant prefixes and arbitrary values,
       * or the classes most likely to be wrong are the ones never checked:
       * `hover:opacity-85` and `duration-[var(--duration-fast)]` were both
       * skipped by a `[\w.\/-]` character class.
       */
      const tokens = s.split(/\s+/).filter((c) => c && /^[a-z][\w.:/[\]()%,#-]*$/.test(c));
      const known = tokens.filter((c) => utilities.has(c));
      classes += known.length;

      /**
       * A string that contains at least one real utility is a class list, so
       * anything else in it that looks like a class is suspect. Matching a
       * known PREFIX instead — `bg-`, `opacity-` — only catches typos in the
       * value half: `bg-sucess-subtle` is caught, `hover:opactiy-85` is not,
       * because a misspelt prefix matches no prefix. Strings with no utility in
       * them at all are left alone; that is where the union types live.
       */
      if (!known.length) continue;
      for (const c of tokens) {
        if (utilities.has(c) || !/[-:]/.test(c) || isHook(c)) continue;
        /**
         * A token whose brackets do not balance is this reader's own damage, not
         * a class. `bg-[url(assets/Rainbow.svg)]` written with inner quotes ends
         * the surrounding `'…'` early, and what comes back is `bg-[url(` — which
         * was duly reported as a utility Tailwind had failed to emit, while the
         * rule sat in the compiled sheet the whole time. Third time a quote has
         * fooled this file; the other two are noted above.
         */
        const balanced = (open, close) =>
          c.split(open).length === c.split(close).length;
        if (!balanced('[', ']') || !balanced('(', ')')) continue;
        unknown.push({ file, cls: c });
      }
    }
  }
  perFile.push({ file, vars, classes });
}

/**
 * Shared modules outside components/ that hold class strings, since 2026-08-06.
 * `astro-components/field.ts` carries everything Input and Textarea must agree
 * on, and without this pass those strings would be the only ones in the library
 * nothing validates — the components import them, so they never appear in a
 * `.astro` file for the loop above to read.
 *
 * `build-utilities.mjs` had to learn about the same file for Tailwind to compile
 * them at all. Both changes are load-bearing: one makes the classes exist, this
 * one makes a typo in them fail.
 */
for (const file of ['field.ts', 'choice.ts']) {
  const path = join(ROOT, 'astro-components', file);
  if (!existsSync(path)) continue;
  const code = readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
  let classes = 0;
  for (const [, s] of code.matchAll(/'([^']*)'/g)) {
    const tokens = s.split(/\s+/).filter((c) => c && /^[a-z][\w.:/[\]()%,#-]*$/.test(c));
    const known = tokens.filter((c) => utilities.has(c));
    classes += known.length;
    if (!known.length) continue;
    for (const c of tokens) {
      if (utilities.has(c) || !/[-:]/.test(c)) continue;
      const balanced = (open, close) => c.split(open).length === c.split(close).length;
      if (!balanced('[', ']') || !balanced('(', ')')) continue;
      unknown.push({ file, cls: c });
    }
  }
  perFile.push({ file, vars: 0, classes });
}

/**
 * The anti-silence guard. A component that contributes no variables AND no
 * recognised utility classes is not being checked by anything here, and this
 * script would still exit 0.
 */
const unchecked = perFile.filter((f) => f.vars === 0 && f.classes === 0);
if (unchecked.length) {
  console.error(`\n\x1b[31m✖  ${unchecked.length} component(s) contribute nothing for this gate to check\x1b[0m\n`);
  for (const { file } of unchecked) console.error(`    \x1b[31m✖\x1b[0m ${file} — no var(--…) usages and no known utility classes`);
  console.error(`\n  Either it reads tokens through its <style>, or it wears utility classes that`);
  console.error(`  docs/utilities.css defines. Neither means nothing is verifying its styling.\n`);
  process.exit(1);
}

if (unknown.length) {
  console.error(`\n\x1b[31m✖  ${unknown.length} utility class${unknown.length > 1 ? 'es' : ''} used by a component but not emitted by Tailwind\x1b[0m\n`);
  const byFile = new Map();
  for (const u of unknown) (byFile.get(u.file) ?? byFile.set(u.file, []).get(u.file)).push(u.cls);
  for (const [file, list] of byFile) {
    console.error(`    \x1b[1m${file}\x1b[0m`);
    for (const c of new Set(list)) console.error(`      \x1b[31m✖\x1b[0m ${c}`);
  }
  console.error(`\n  Tailwind emits nothing for a class it does not recognise — no warning, no`);
  console.error(`  error, just an element with that styling missing. Check the spelling, or`);
  console.error(`  add the token behind it to tailwind/tokens.css.\n`);
  process.exit(1);
}

const missing = [...used.keys()].filter((v) => !defined.has(v)).sort();

if (missing.length) {
  console.error(`\n\x1b[31m✖  ${missing.length} variable${missing.length > 1 ? 's' : ''} used by components but not defined in the compiled CSS\x1b[0m\n`);
  for (const v of missing) {
    console.error(`    \x1b[31m✖\x1b[0m ${v}`);
    console.error(`        used by ${used.get(v).join(', ')}`);
  }
  console.error(`\n  Tailwind drops theme tokens no utility references. tailwind/theme.css uses`);
  console.error(`  \`@theme static\` to prevent exactly this — check that it is still there.\n`);
  process.exit(1);
}

/* ── docs pages must satisfy their own variables ─────────────────────────── */

/**
 * Each docs/component-*.html is standalone — no stylesheet link, just an inline
 * <style> and a hand-kept :root re-declaring the tokens that page happens to
 * need. So the compiled theme proves nothing about them: a component can start
 * reading a new token, the docs page can copy the rule across, and the variable
 * behind it is simply never declared. `var(--x)` with no declaration and no
 * fallback makes the whole property invalid, and the browser drops it —
 * silently, which is how three pages ended up rendering with no border at all
 * and a hover colour that never applied.
 *
 * Only CSS is scanned: <style> bodies and inline style="" attributes. The token
 * pages print `var(--name)` as copyable prose, and that is not a usage.
 */
const DOCS = join(ROOT, 'docs');
const docErrors = [];
let docsChecked = 0;

for (const file of readdirSync(DOCS).filter((f) => f.startsWith('component-') && f.endsWith('.html'))) {
  const src = readFileSync(join(DOCS, file), 'utf8');
  const css = [
    ...[...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]),
    ...[...src.matchAll(/\sstyle="([^"]*)"/gi)].map((m) => m[1]),
  ].join('\n');

  // A page may declare tokens itself, link a local stylesheet, or both. Remote
  // hrefs (the webfont) are ignored — nothing here declares custom properties.
  const declared = new Set([...src.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  for (const [, href] of src.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/gi)) {
    if (/^https?:/i.test(href)) continue;
    let linked;
    try {
      linked = readFileSync(join(DOCS, href), 'utf8');
    } catch {
      docErrors.push({ file, name: `(links ${href}, which does not exist)` });
      continue;
    }
    for (const [, n] of linked.matchAll(/(--[\w-]+)\s*:/g)) declared.add(n);
  }
  const seen = new Set();
  // `var(--x, fallback)` still renders without --x, so only the bare form counts.
  for (const [, name, next] of css.matchAll(/var\((--[\w-]+)\s*(,?)/g)) {
    if (next === ',' || declared.has(name) || seen.has(name)) continue;
    seen.add(name);
    docErrors.push({ file, name });
  }
  docsChecked++;
}

if (docErrors.length) {
  console.error(`\n\x1b[31m✖  ${docErrors.length} variable${docErrors.length > 1 ? 's' : ''} used in a docs page's CSS but never declared there\x1b[0m\n`);
  const byFile = new Map();
  for (const e of docErrors) (byFile.get(e.file) ?? byFile.set(e.file, []).get(e.file)).push(e.name);
  for (const [file, names] of byFile) {
    console.error(`    \x1b[1mdocs/${file}\x1b[0m`);
    for (const n of names) console.error(`      \x1b[31m✖\x1b[0m ${n}`);
  }
  console.error(`\n  These pages carry their own :root — add the token there with the same value`);
  console.error(`  it has in tailwind/tokens.css, or the property using it is dropped outright.\n`);
  process.exit(1);
}

const converted = perFile.filter((f) => f.classes > 0);
console.log(`\n\x1b[32m✔  All ${used.size} component variables resolve in ${basename(compiledPath)}\x1b[0m`);
if (converted.length) {
  const total = converted.reduce((n, f) => n + f.classes, 0);
  console.log(`\x1b[32m✔  ${total} utility classes across ${converted.length} converted component(s) are all emitted\x1b[0m`);
}
console.log(`\x1b[32m✔  ${docsChecked} docs pages resolve every variable their CSS uses\x1b[0m\n`);

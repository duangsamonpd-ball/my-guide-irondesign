#!/usr/bin/env node
/**
 * Iron Software Design System — docs shell ownership check
 *
 * docs/docs.css holds the chrome every page in docs/ shares. Those rules used to
 * be copied into all 29 pages, and that is exactly how they drifted apart: a fix
 * made on one page never reached the others, so by the time anyone looked there
 * were four versions of `.hamburger` and three of `.sidebar`.
 *
 * This fails if a page declares a selector docs.css already owns. Re-declaring it
 * is how the copies came back last time — change the shared file instead, or, if
 * the page genuinely needs to differ, give it a selector of its own.
 *
 * Run:  node scripts/check-docs-css.mjs
 * Exit: 0 = no page overrides the shell · 1 = someone re-declared one
 *
 * Zero dependencies — plain Node, same as the other checkers.
 */

import { readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');

/** Split CSS into top-level rules, tracking brace depth so @media stays whole. */
function rules(css) {
  const out = [];
  let cur = '';
  let depth = 0;
  for (const ch of css.replace(/\/\*[\s\S]*?\*\//g, '')) {
    cur += ch;
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      out.push(cur.trim());
      cur = '';
    }
  }
  return out.filter((r) => r.includes('{'));
}

const selector = (r) => r.slice(0, r.indexOf('{')).replace(/\s+/g, ' ').trim();

const shell = new Set(rules(readFileSync(join(DOCS, 'docs.css'), 'utf8')).map(selector));

const clashes = [];
/**
 * A SECOND SHADOW OF THE SAME KIND. Thirteen docs pages used to declare their
 * own `--space-*` ladder — micro/xs/sm/md/lg/xl/2xl/3xl/4xl/hero, every rung a
 * duplicate of the system's `--spacing-*`, plus a `--space-2xs` that had no
 * system counterpart and no user. It survived the docs.css hoist because it is
 * a custom property rather than a rule, so the selector check above could not
 * see it, and it drifted the way copies do: component-checkbox.html labelled a
 * gap `--space-xs` where the component binds `--spacing-xs`, and
 * 07-components.html's `.btn-nuget` did the same. Removed 2026-08-17, 197
 * references and 53 declarations, proved value-neutral against a computed-style
 * snapshot of 15,523 elements. This keeps it gone.
 */
const aliases = [];

/**
 * A THIRD SHADOW, and the one that cost the most to find. A docs page may not
 * declare a bare single-class selector whose name TAILWIND WOULD EMIT A UTILITY
 * FOR.
 *
 * Fifteen pages carried `.grid { display:grid; grid-template-columns:
 * repeat(auto-fill, minmax(220px,1fr)); gap:14px }` for their own spec cards.
 * That is a perfectly good page style until a converted component uses the
 * `grid` utility — and then the page wins, because an inline <style> outranks
 * every linked sheet. ProductFlyout was the first component to want it, and
 * three consecutive sweeps measured the PAGE's 220px grid while reporting it as
 * the panel's: the column counts looked non-monotonic and a 1.2px overflow
 * appeared from nowhere. Nothing was wrong with the component.
 *
 * Same family as the bare-tag trap CLAUDE.md records (`footer { padding }`
 * padding every component footer), one level down — a generic CLASS this time,
 * so the tag-selector rule could not see it.
 *
 * WHY THIS ASKS TAILWIND INSTEAD OF READING utilities.css. The first version of
 * this check compared against the names already in docs/utilities.css, and it
 * found nothing — because by then ProductFlyout had been moved off `grid` onto
 * `[display:grid]`, so `grid` was no longer emitted and the collision it had
 * just cost a day to find was invisible. A gate built from the current output
 * only ever re-finds what is currently broken. The question that does not go
 * stale is "would Tailwind emit a utility called this?", and the only thing that
 * can answer it is Tailwind.
 *
 * It is asked as a DIFFERENTIAL: compile the theme with no source at all, then
 * again with a file that wears every candidate name, and take the difference.
 * An absolute reading cannot work — theme.css contributes `.dark` itself, and
 * `.dark` is the system's own dark-mode hook that pages are meant to declare.
 *
 * Only the FIRST compound is checked, and only when it is a lone class: that is
 * the part that decides which elements the rule can reach. `.grid > .cell` is
 * as dangerous as `.grid`; `.canvas .grid` is not, because the page owns
 * `.canvas`.
 */
function emittedBy(names) {
  const theme = readFileSync(join(ROOT, 'tailwind/theme.css'), 'utf8');
  const ANCHOR = '@import "tailwindcss";';
  if (!theme.includes(ANCHOR)) {
    console.error(`\n\x1b[31m✖  tailwind/theme.css no longer contains \`${ANCHOR}\` — this check cannot compile\x1b[0m\n`);
    process.exit(1);
  }
  const cli = join(ROOT, 'node_modules/.bin/tailwindcss');
  /* Inside node_modules, not the OS temp dir: the input imports
     `tailwindcss/utilities.css` by PACKAGE NAME, and resolution walks up from
     the file's own directory. A temp dir elsewhere on disk cannot see this
     project's node_modules and the CLI fails with "Can't resolve 'tailwindcss'".
     build-utilities.mjs compiles from the same place for the same reason. */
  const dir = mkdtempSync(join(ROOT, 'node_modules/.tmp-shadow-'));
  const compile = (markup) => {
    writeFileSync(join(dir, 'scan.astro'), markup);
    writeFileSync(join(dir, 'in.css'), theme.replace(ANCHOR, [
      '@layer theme, base, components, utilities;',
      '@import "tailwindcss/theme.css" layer(theme);',
      '@import "tailwindcss/utilities.css" source(none);',
      `@source "${join(dir, '*.astro')}";`,
    ].join('\n')));
    execFileSync(cli, ['-i', join(dir, 'in.css'), '-o', join(dir, 'out.css')], { stdio: 'pipe' });
    return new Set([...readFileSync(join(dir, 'out.css'), 'utf8')
      .matchAll(/^\.([\w-]+)(?=[\s,{:>+~])/gm)].map((m) => m[1]));
  };
  try {
    const base = compile('<div></div>');
    const withNames = compile(`<div class="${[...names].join(' ')}"></div>`);
    return new Set([...withNames].filter((n) => !base.has(n) && names.has(n)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const candidates = new Map();


let checked = 0;

for (const file of readdirSync(DOCS).filter((f) => f.endsWith('.html'))) {
  const src = readFileSync(join(DOCS, file), 'utf8');
  const css = [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
  for (const s of new Set(rules(css).map(selector))) {
    if (shell.has(s)) clashes.push({ file, selector: s });
  }
  for (const m of new Set([...css.matchAll(/--space-[a-z0-9]+/g)].map((x) => x[0]))) {
    aliases.push({ file, name: m });
  }
  for (const sel of new Set(rules(css).map(selector))) {
    for (const one of sel.split(',').map((x) => x.trim())) {
      const first = /^\.([\w-]+)(?![\w-])/.exec(one);
      if (!first) continue;
      const list = candidates.get(first[1]) ?? candidates.set(first[1], []).get(first[1]);
      list.push({ file, selector: one });
    }
  }
  checked++;
}

if (aliases.length) {
  console.error(`\n\x1b[31m✖  ${aliases.length} \`--space-*\` alias${aliases.length > 1 ? 'es' : ''} in a docs page — the system spells it \`--spacing-*\`\x1b[0m\n`);
  const byFile = new Map();
  for (const a of aliases) (byFile.get(a.file) ?? byFile.set(a.file, []).get(a.file)).push(a.name);
  for (const [file, names] of byFile) {
    console.error(`    \x1b[1mdocs/${file}\x1b[0m`);
    for (const n of names) console.error(`      \x1b[31m✖\x1b[0m ${n}  →  ${n.replace('--space-', '--spacing-')}`);
  }
  console.error(`\n  tokens.css already declares every rung. A second name for one value is`);
  console.error(`  how a docs page ends up labelling a component's gap with the wrong token.\n`);
  process.exit(1);
}

const emitted = emittedBy(new Set(candidates.keys()));
const shadowed = [];
for (const [cls, uses] of candidates) {
  if (emitted.has(cls)) for (const u of uses) shadowed.push({ ...u, cls });
}

if (shadowed.length) {
  const names = new Set(shadowed.map((x) => x.cls));
  console.error(`\n\x1b[31m✖  ${shadowed.length} docs-page rule${shadowed.length > 1 ? 's' : ''} shadow a Tailwind utility of the same name\x1b[0m\n`);
  const byFile = new Map();
  for (const x of shadowed) (byFile.get(x.file) ?? byFile.set(x.file, []).get(x.file)).push(x.selector);
  for (const [file, sels] of byFile) {
    console.error(`    \x1b[1mdocs/${file}\x1b[0m`);
    for (const sel of sels) console.error(`      \x1b[31m✖\x1b[0m ${sel}`);
  }
  console.error(`\n  ${[...names].map((n) => `.${n}`).join(', ')} — an inline <style> outranks utilities.css, so any`);
  console.error(`  component on the page that wears that utility gets the page's rule instead.`);
  console.error(`  Rename the page's class to something Tailwind does not emit.\n`);
  process.exit(1);
}

if (clashes.length) {
  console.error(`\n\x1b[31m✖  ${clashes.length} selector${clashes.length > 1 ? 's' : ''} re-declared in a page that docs/docs.css already owns\x1b[0m\n`);
  const byFile = new Map();
  for (const c of clashes) (byFile.get(c.file) ?? byFile.set(c.file, []).get(c.file)).push(c.selector);
  for (const [file, sels] of byFile) {
    console.error(`    \x1b[1mdocs/${file}\x1b[0m`);
    for (const s of sels) console.error(`      \x1b[31m✖\x1b[0m ${s}`);
  }
  console.error(`\n  Edit docs/docs.css so every page gets the change, or give this page its own`);
  console.error(`  selector if it really needs to differ.\n`);
  process.exit(1);
}

console.log(`\n\x1b[32m✔  ${checked} docs pages leave the ${shell.size} shared shell rules alone, re-spell no --spacing-*, and shadow no utility name (${candidates.size} page classes put to Tailwind)\x1b[0m\n`);

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

import { readFileSync, readdirSync } from 'node:fs';
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
 * The THIRD rule of this kind — no page may declare a bare class whose name
 * Tailwind would emit a utility for — lives in `build-utilities.mjs --check`,
 * not here. It has to ask Tailwind, and this script runs in the CI job that
 * installs nothing: making it compile put an `ENOENT … node_modules/.tmp-shadow`
 * on main, because `mkdtemp` inside a node_modules that does not exist fails
 * before any check runs. The workflow says as much next to the job that does
 * have the CLI. Everything in this file stays answerable from the files alone.
 */


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

console.log(`\n\x1b[32m✔  ${checked} docs pages leave the ${shell.size} shared shell rules alone, and none re-spell --spacing-*\x1b[0m\n`);

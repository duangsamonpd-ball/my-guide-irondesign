#!/usr/bin/env node
/**
 * Iron Software Design System — compile the utility classes the components use
 *
 *   astro-components/components/*.astro  →  docs/utilities.css
 *
 * The components are moving from scoped <style> blocks to Tailwind utility
 * classes (Ball's call 2026-08-05, after his team reviewed the POC). A consumer
 * running Tailwind compiles those classes themselves. Nothing else does:
 *
 *   · the 32 docs pages are static HTML served straight from /docs with no build
 *     step, so a utility class in demo markup renders as unstyled text;
 *   · a consumer NOT running Tailwind has nothing to import.
 *
 * This produces the one stylesheet that answers both. It is generated and
 * committed, and `--check` fails when it goes stale — the same contract
 * tailwind/theme.css already has.
 *
 * Run:    node scripts/build-utilities.mjs
 * Verify: node scripts/build-utilities.mjs --check   (fails if the output is stale)
 *
 * TWO THINGS THIS FILE EXISTS TO GET RIGHT, both verified by measurement rather
 * than assumed — see the notes at each one.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const THEME = join(ROOT, 'tailwind/theme.css');
const COMPONENTS = join(ROOT, 'astro-components/components');
const OUT = join(ROOT, 'docs/utilities.css');
const TMP = join(ROOT, 'node_modules/.tmp');
const CLI = join(ROOT, 'node_modules/.bin/tailwindcss');
const CHECK = process.argv.includes('--check');

/* ── 1. the source set must be EXPLICIT ──────────────────────────────────────
 *
 * Tailwind v4 auto-detects sources from the input file's location. Left to do
 * that it walks the whole repo and scrapes class names out of prose: the first
 * run of this pipeline emitted 169 utilities for a component that uses 40,
 * the other 129 coming from README code samples and docs demo markup. Those
 * would then be shipped, and would churn every time someone edited a sentence.
 *
 * `source(none)` turns detection off; the `@source` line below is then the
 * whole input. Measured: 169 → 40, and 40 is exactly what Badge uses.
 *
 * ── 2. NO PREFLIGHT ──────────────────────────────────────────────────────────
 *
 * `@import "tailwindcss"` is theme + preflight + utilities. Preflight is a
 * global reset — it would land on all 32 docs pages the moment they link this
 * file and restyle every heading, list and form control on them. Importing the
 * two layers by hand is how you take the utilities without the reset.
 * Measured: `box-sizing` appears once with preflight, zero times without, and
 * the utility count is identical either way.
 */
const SCAN = join(TMP, 'scan');

const ANCHOR = '@import "tailwindcss";';
const REPLACEMENT = [
  '@layer theme, base, components, utilities;',
  '@import "tailwindcss/theme.css" layer(theme);',
  '@import "tailwindcss/utilities.css" layer(utilities) source(none);',
  `@source "${SCAN}/*.astro";`,
].join('\n');

/* ── build the compiler input ────────────────────────────────────────────── */

const astroFiles = existsSync(COMPONENTS)
  ? readdirSync(COMPONENTS).filter((f) => f.endsWith('.astro'))
  : [];

/**
 * If the glob matches nothing, Tailwind does not complain — it emits a valid
 * stylesheet with no utilities in it, the docs pages go unstyled, and this
 * script still exits 0. A renamed directory should be loud.
 */
if (astroFiles.length === 0) {
  console.error(`\n\x1b[31m✖  no .astro files under astro-components/components\x1b[0m`);
  console.error(`   The @source glob would match nothing and this would emit an empty`);
  console.error(`   stylesheet without failing. Check the path in this script.\n`);
  process.exit(1);
}

const theme = readFileSync(THEME, 'utf8');

/**
 * Same shape of failure as above: if the anchor ever moves, `.replace()` returns
 * the string untouched, `source(none)` is never applied, and the build quietly
 * goes back to scraping the whole repo — bigger output, no error.
 */
if (!theme.includes(ANCHOR)) {
  console.error(`\n\x1b[31m✖  tailwind/theme.css no longer contains \`${ANCHOR}\`\x1b[0m`);
  console.error(`   This script rewrites that line to pin the source set and drop preflight.`);
  console.error(`   Without the rewrite Tailwind scans the entire repo and emits a global`);
  console.error(`   reset onto every docs page — silently. Update ANCHOR in this script.\n`);
  process.exit(1);
}

mkdirSync(TMP, { recursive: true });

/* ── 3. scan the MARKUP, not the stylesheet ──────────────────────────────────
 *
 * Tailwind's scanner reads a file as undifferentiated text, so it treats CSS
 * values and English prose as class candidates. Pointed at the components as
 * they are on disk it emitted 31 utilities while not one component uses a
 * utility class: `display: block` produced `.block`, `position: relative`
 * produced `.relative`, and comments produced the rest.
 *
 * That noise is not free. Two of the 31 — `grid` and `underline` — are also
 * class names the docs pages use (14 pages and 1), and shipping a rule for a
 * name someone else already uses is how you change a page you never touched.
 * `@layer utilities` makes it survivable, because an unlayered rule beats a
 * layered one whatever the specificity — verified in Chrome, not assumed:
 * `.plain { display:block }` unlayered wins over a layered `.flex`. But it is
 * only survivable where the docs rule happens to declare the same property.
 *
 * A class name can never appear inside a <style> block, so scanning a copy with
 * those blocks and comments removed cannot lose a real one. Everything that
 * could legitimately hold a class — frontmatter, markup, class:list arrays —
 * is kept byte for byte. Measured: 31 utilities → 7, and `grid` is gone.
 *
 * The 7 that remain are not reachable this way, and were each traced: `block`,
 * `collapse` and `blur` come from `//` line comments in FlyoutMenu's script,
 * `transform` from an SVG `transform="translate(…)"` attribute, and `outline`,
 * `inline` and `underline` from variant union types — Button's `'outline'`,
 * TextLink's `'underline'`. Prose in a design system uses the same words its
 * utilities do; separating them needs a real parser, not a bigger regex. They
 * cost ~300 bytes and, being layered, lose to any docs rule that sets the same
 * property. Do not chase this to zero by stripping more text — the failure that
 * costs is a MISSING utility, and every strip added here risks one.
 */
mkdirSync(SCAN, { recursive: true });
for (const f of readdirSync(SCAN)) rmSync(join(SCAN, f));
for (const file of astroFiles) {
  const src = readFileSync(join(COMPONENTS, file), 'utf8');
  writeFileSync(
    join(SCAN, file),
    src.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/\/\*[\s\S]*?\*\//g, ''),
  );
}

const inputPath = join(TMP, 'utilities.in.css');
writeFileSync(inputPath, theme.replace(ANCHOR, REPLACEMENT));

/* ── compile ─────────────────────────────────────────────────────────────── */

const compiledPath = join(TMP, 'utilities.out.css');
try {
  execFileSync(CLI, ['-i', inputPath, '-o', compiledPath], { stdio: 'pipe' });
} catch (err) {
  console.error(`\n\x1b[31m✖  tailwindcss failed to compile the utilities\x1b[0m\n`);
  console.error(String(err.stderr || err.stdout || err.message));
  process.exit(1);
}

const HEADER =
  `/**\n` +
  ` * Iron Software Design System — compiled utility classes\n` +
  ` *\n` +
  ` * ╔══════════════════════════════════════════════════════════════════════════╗\n` +
  ` * ║  GENERATED FILE — DO NOT EDIT                                            ║\n` +
  ` * ║  Run: node scripts/build-utilities.mjs                                   ║\n` +
  ` * ╚══════════════════════════════════════════════════════════════════════════╝\n` +
  ` *\n` +
  ` * Every Tailwind utility used by astro-components/components/*.astro, and\n` +
  ` * nothing else. No preflight: the docs pages link this and must not be reset.\n` +
  ` *\n` +
  ` * Running Tailwind yourself? You do not need this file — import\n` +
  ` * @iron-software/design-system/theme.css and compile your own.\n` +
  ` */\n`;

const out = HEADER + readFileSync(compiledPath, 'utf8');

/* ── report ──────────────────────────────────────────────────────────────── */

/** Utility rules are emitted indented inside `@layer utilities { … }`. */
const utilities = [...out.matchAll(/^\s+\.([a-zA-Z][^\s,{:]*)/gm)].map((m) => m[1]);
const distinct = new Set(utilities).size;

if (CHECK) {
  let current = null;
  try { current = readFileSync(OUT, 'utf8'); } catch { /* missing */ }
  if (current !== out) {
    console.error(`\n\x1b[31m✖  docs/utilities.css is stale\x1b[0m`);
    console.error(`   A component's utility classes changed without regenerating. Run:\n`);
    console.error(`     node scripts/build-utilities.mjs\n`);
    process.exit(1);
  }
  console.log(
    `\n\x1b[32m✔  docs/utilities.css is up to date\x1b[0m — ${distinct} utilities from ${astroFiles.length} components\n`,
  );
} else {
  writeFileSync(OUT, out);
  console.log(
    `\n\x1b[32m✔  Wrote docs/utilities.css\x1b[0m — ${distinct} distinct utilities compiled from ${astroFiles.length} components\n`,
  );
}

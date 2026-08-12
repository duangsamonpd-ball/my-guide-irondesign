#!/usr/bin/env node
/**
 * Iron Software Design System — vendor the webfonts the harnesses measure with
 *
 * WHY THIS EXISTS. `preview.mjs`, `check-overflow.mjs` and `state-diff.mjs` all
 * measure text, so all three need the real font before any number they print
 * means anything — and all three were fetching it from fonts.googleapis.com at
 * run time. On 2026-08-12, the day `overflow` became a CI gate, that CDN failed
 * four times in one morning, on a different page every time (textlink, then
 * flyoutmenu and input, then select). Each failure is a red build that says
 * nothing about the code. A gate that flakes is worse than no gate, because it
 * teaches people to re-run it until it is green.
 *
 * So the harnesses stop going to the network. The bytes live in vendor/fonts/,
 * this script is how they got there, and re-running it is how they are
 * refreshed — mystery binaries with no provenance are their own problem.
 *
 *   node scripts/vendor-fonts.mjs            download from Google and rewrite
 *   node scripts/vendor-fonts.mjs --check    verify OFFLINE that the set is usable
 *
 * --check deliberately does not reach upstream; see verifyOffline() for why.
 *
 * WHAT IS DELIBERATELY NOT CHANGED: the docs pages still link to Google Fonts,
 * because what ships to a reader is a product decision and this is a testing
 * one. The files are byte-identical to what the CDN serves, so the harnesses
 * measure the same glyphs either way. If the site is ever self-hosted, the
 * generated stylesheet below is already the thing to link.
 *
 * Montserrat and Roboto Mono are both SIL Open Font License 1.1, which permits
 * redistribution; see vendor/fonts/LICENSE.txt.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'vendor/fonts');

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[90m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

/* The exact query the harnesses use. Kept in one place so the vendored set and
   the thing it stands in for cannot drift apart silently. */
export const FONT_QUERY =
  'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&family=Roboto+Mono:wght@400&display=swap';

/* A modern desktop UA, because Google serves woff2 + unicode-range subsets to
   Chrome and something older to anything it does not recognise. Asking as the
   browser the harnesses actually run is the only way to get the bytes they
   would have loaded. */
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';

const check = process.argv.includes('--check');

/**
 * family+subset → a stable, readable filename.
 *
 * NOT family+weight+subset, which is the obvious shape and is wrong here.
 * Google delivers Montserrat as a VARIABLE font: the stylesheet declares 36
 * @font-face rules, six weights across six subsets, and they resolve to only
 * ELEVEN distinct URLs, because one file per subset covers 400 through 900.
 * Naming by weight produced six names for the same bytes, six downloads of each
 * file, and a "990KB" report for 232KB of fonts. The weight is a property of
 * the rule, not of the file.
 */
function fileNameFor(css, url, index) {
  const block = css.slice(0, css.indexOf(url));
  const start = block.lastIndexOf('@font-face');
  const rule = css.slice(start, css.indexOf('}', css.indexOf(url)));
  const family = (rule.match(/font-family:\s*'([^']+)'/) ?? [, 'font'])[1].replace(/\s+/g, '-');
  const style = (rule.match(/font-style:\s*(\w+)/) ?? [, 'normal'])[1];
  /* Google labels each rule with a `/* latin *​/`-style comment BEFORE the
     @font-face, not inside it. Anchoring the match to the end of the text
     preceding the url looked right and silently produced s0, s1, s2 … — names
     that carry none of the one fact worth knowing about a subset file. */
  const before = css.slice(0, start);
  const comments = [...before.matchAll(/\/\*\s*([a-z0-9-]+)\s*\*\//g)];
  const subset = comments.length ? comments[comments.length - 1][1] : `s${index}`;
  return `${family}-${style}-${subset}.woff2`.toLowerCase();
}

/**
 * The gate form, and it must not touch the network.
 *
 * The obvious --check re-downloads the upstream stylesheet and diffs it, which
 * would put a CDN back in the middle of the thing this script exists to take a
 * CDN out of — and would fail the build on the day Google ships a new font
 * version, which is news but not a regression. So it verifies the only
 * properties a run actually depends on: the stylesheet is here, every file it
 * names is here, and nothing in it points off-machine. Refreshing against
 * upstream is a deliberate act: `node scripts/vendor-fonts.mjs`.
 */
function verifyOffline() {
  const cssPath = join(OUT, 'fonts.css');
  if (!existsSync(cssPath)) {
    console.error(red('\n✖  vendor/fonts/fonts.css is missing — run `node scripts/vendor-fonts.mjs`\n'));
    process.exit(1);
  }
  const css = readFileSync(cssPath, 'utf8');

  const external = [...css.matchAll(/url\((https?:[^)]+)\)/g)].map((m) => m[1]);
  const referenced = [...css.matchAll(/url\(\.\/([^)]+)\)/g)].map((m) => m[1]);
  const missing = referenced.filter((f) => !existsSync(join(OUT, f)));
  const unique = new Set(referenced);

  const problems = [];
  if (external.length) problems.push(`${external.length} url() still point off-machine: ${[...new Set(external)].slice(0, 3).join(', ')}`);
  if (!referenced.length) problems.push('no local url() at all — fonts.css was not rewritten');
  if (missing.length) problems.push(`${missing.length} referenced file(s) missing: ${[...new Set(missing)].slice(0, 4).join(', ')}`);

  if (problems.length) {
    console.error(red('\n✖  vendored fonts are not usable — run `node scripts/vendor-fonts.mjs`'));
    for (const p of problems) console.error(red(`   ${p}`));
    console.error('');
    process.exit(1);
  }
  console.log(green(`\n✔  ${unique.size} vendored font files present, ${referenced.length} @font-face rules, nothing external\n`));
}

async function main() {
  if (check) return verifyOffline();

  mkdirSync(OUT, { recursive: true });

  const res = await fetch(FONT_QUERY, { headers: { 'user-agent': UA } });
  if (!res.ok) {
    console.error(red(`\n✖  could not fetch the Google Fonts stylesheet — HTTP ${res.status}\n`));
    process.exit(1);
  }
  const css = await res.text();

  const urls = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1]);
  if (!urls.length) {
    console.error(red('\n✖  no font URLs in the stylesheet — the response shape changed\n'));
    process.exit(1);
  }

  let localCss = css;
  const written = [];
  const nameOf = new Map(); // url → filename, so each file is fetched once
  let bytes = 0;

  for (const [i, url] of urls.entries()) {
    if (nameOf.has(url)) { localCss = localCss.split(url).join(`./${nameOf.get(url)}`); continue; }

    let name = fileNameFor(css, url, i);
    /* If Google ever goes back to per-weight statics, two different files would
       claim one name and the second would silently overwrite the first. Cheaper
       to notice here than to debug a font that renders at the wrong weight. */
    const claimedBy = [...nameOf].find(([, n]) => n === name);
    if (claimedBy) {
      const tag = url.slice(url.lastIndexOf('/') + 1, url.lastIndexOf('.')).slice(-6).toLowerCase();
      name = name.replace(/\.woff2$/, `-${tag}.woff2`);
      console.log(dim(`    note: two files wanted the same name; this one becomes ${name}`));
    }
    nameOf.set(url, name);

    const dest = join(OUT, name);
    const r = await fetch(url, { headers: { 'user-agent': UA } });
    if (!r.ok) {
      console.error(red(`\n✖  ${name} — HTTP ${r.status}\n`));
      process.exit(1);
    }
    const buf = Buffer.from(await r.arrayBuffer());
    writeFileSync(dest, buf);
    bytes += buf.length;
    written.push(name);
    localCss = localCss.split(url).join(`./${name}`);
  }

  const header =
    '/* GENERATED by scripts/vendor-fonts.mjs — do not edit.\n' +
    ` * Source: ${FONT_QUERY}\n` +
    ' * The url() targets are rewritten to the files beside this stylesheet, so\n' +
    ' * nothing here reaches the network. Refresh with `node scripts/vendor-fonts.mjs`.\n' +
    ' */\n';
  const cssPath = join(OUT, 'fonts.css');

  writeFileSync(cssPath, header + localCss);
  const extra = readdirSync(OUT).filter((f) => f.endsWith('.woff2') && !written.includes(f));

  console.log(bold(`\n  Vendored ${written.length} font files → vendor/fonts/`));
  console.log(dim(`    ${Math.round(bytes / 1024)}KB total, from ${urls.length} @font-face rules`));
  console.log(dim(`    (Montserrat is variable — one file per subset serves 400 through 900)`));
  if (extra.length) console.log(dim(`    ${extra.length} file(s) no longer referenced: ${extra.join(', ')}`));
  console.log(green(`\n✔  fonts.css rewritten to local paths — the harnesses no longer need the network\n`));
}

await main();

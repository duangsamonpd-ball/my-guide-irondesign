#!/usr/bin/env node
/**
 * Iron Software Design System — will this component's CSS stay put once flattened?
 *
 * An Astro <style> is SCOPED: every selector is rewritten with a
 * `data-astro-cid-…` attribute, and Astro puts it on more than the last compound
 * — `.tn-menu > li` compiles to `.tn-menu[cid] > li[cid]`. Inside a real app that
 * makes a component's rules unable to leave it.
 *
 * `docs/components.css` throws all of it away. So does every per-page inline
 * copy: build-demos.mjs strips `data-astro-cid-…` from the markup and
 * build-component-css.mjs concatenates the blocks unscoped, because the docs
 * pages are static HTML with no build step. A selector that Astro had bounded is
 * unbounded there.
 *
 * build-component-css.mjs already checks the two properties that makes safe:
 * no selector claimed by two components, and no selector STARTING with a bare
 * tag. This is the third, and it is the one that got through: a bare tag reached
 * through a DESCENDANT combinator.
 *
 * `.tn-menu li { display: flex }` was TopNav's own rule and correct under
 * scoping. Then a nav item gained a FlyoutMenu, so the panel — and everything a
 * consumer slots into it — came to live inside one of those <li>s. On the docs
 * pages, where the scoping is gone, it reached every product row in the
 * mega-menu: each <a> became a flex ITEM and shrank to its content, and the
 * hover fill measured 240px inside a 282px column. Ball found it in a
 * screenshot. No gate here could see it: check:parity compares a component's CSS
 * to its OWN page and never asks what that CSS lands on somewhere else.
 *
 * WHY THIS ASKS THE DOM RATHER THAN READING SELECTORS. A static rule — "no bare
 * tag after a descendant combinator" — flags `.tn-brand-text b` too, which is
 * safe: nothing but TopNav can put a <b> in there. The question is not the shape
 * of the selector, it is whether the subtree it reaches can hold another
 * component's markup, and that is a fact about the rendered tree. So: take each
 * scoped rule, strip the cid attributes to get what the docs pages will use, and
 * ask the page which elements that matches. Any match not carrying the rule's
 * own cid is a rule that will escape once flattened.
 *
 * Run:  node scripts/check-flat-scope.mjs [--self-test]
 * Exit: 0 = every component's CSS stays inside it · 1 = one escapes
 *
 * Needs the playground build and a browser, so it belongs in the render job.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { chromium } from 'playwright-core';
import { serveFonts, installOfflineGuard } from './lib/local-fonts.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'playground/dist');
const SELF_TEST = process.argv.includes('--self-test');

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[90m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

if (!existsSync(DIST)) {
  console.error(red(`\n✖  ${DIST} does not exist — run the playground build first.\n`));
  process.exit(1);
}

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
               '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

/**
 * The probe. Runs in the page: for every rule whose selector carries a scope
 * attribute, strip the attributes and ask what the bare selector reaches.
 *
 * `PLANT` exists for the self-test — a rule injected into the page that is known
 * to escape. Without it a green run proves only that today's tree is clean, not
 * that the probe can see anything at all.
 */
const PROBE = (plant) => {
  const out = [];
  const CID = /\[data-astro-cid-[a-z0-9]+\]/g;
  const sheets = [...document.styleSheets];
  if (plant) {
    const s = document.createElement('style');
    s.textContent = plant;
    document.head.appendChild(s);
    sheets.push(s.sheet);
  }
  for (const sheet of sheets) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    const walk = (list) => {
      for (const rule of list) {
        if (rule.cssRules && !rule.selectorText) { walk(rule.cssRules); continue; }
        const sel = rule.selectorText;
        if (!sel || !CID.test(sel)) { CID.lastIndex = 0; continue; }
        CID.lastIndex = 0;
        const cids = [...sel.matchAll(/\[data-astro-cid-([a-z0-9]+)\]/g)].map((m) => m[1]);
        const own = new Set(cids);
        const flat = sel.replace(CID, '').replace(/\s+/g, ' ').trim();
        if (!flat) continue;
        let hits;
        try { hits = document.querySelectorAll(flat); } catch { continue; }
        for (const el of hits) {
          const mine = el.getAttributeNames()
            .filter((a) => a.startsWith('data-astro-cid-'))
            .map((a) => a.slice('data-astro-cid-'.length));
          if (mine.some((c) => own.has(c))) continue;
          out.push({
            selector: sel, flat,
            tag: el.tagName.toLowerCase(),
            cls: (el.className && el.className.toString().slice(0, 40)) || '',
            foreign: mine[0] ?? '(none — another component, or slotted)',
          });
        }
      }
    };
    walk(rules);
  }
  // one row per selector is enough to act on
  const seen = new Set();
  return out.filter((r) => !seen.has(r.selector) && seen.add(r.selector));
};

const server = createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const font = await serveFonts(url);
  if (font) { res.writeHead(200, { 'content-type': font.type }); return res.end(font.body); }
  const p = join(DIST, url === '/' ? 'index.html' : url);
  if (!p.startsWith(DIST) || !existsSync(p)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(0, r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

const pages = readdirSync(join(DIST, 'demos')).filter((f) => f.endsWith('.html')).sort();
const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await installOfflineGuard(context, ORIGIN);
const page = await context.newPage();

/**
 * The self-test plants its own markup as well as its own rule, so it does not
 * depend on what any demo page happens to contain. The first attempt reused a
 * cid the page already had and looked for stray <li>s; it reported 0 on a tree
 * where the real fault was live, because every <li> on that page carried the cid
 * it had borrowed. A plant that cannot be seen proves nothing.
 *
 * Two rows, and the second is the one that makes the first mean something:
 * the ESCAPE has an inner element with no cid and must be reported; the CONTROL
 * is identical except the inner element carries the cid, and must be silent.
 */
async function selfTest(page) {
  await page.goto(`${ORIGIN}/demos/${pages[0]}`, { waitUntil: 'networkidle' });
  const run = (innerHasCid) => page.evaluate(async ({ inner, probeSrc }) => {
    document.querySelectorAll('.fs-plant').forEach((n) => n.remove());
    const host = document.createElement('div');
    host.className = 'fs-plant fs-outer';
    host.setAttribute('data-astro-cid-planted', '');
    const kid = document.createElement('i');
    kid.className = 'fs-inner';
    if (inner) kid.setAttribute('data-astro-cid-planted', '');
    host.appendChild(kid);
    document.body.appendChild(host);
    const probe = new Function('return (' + probeSrc + ')')();
    return probe('.fs-outer[data-astro-cid-planted] .fs-inner[data-astro-cid-planted] { outline: 0 }');
  }, { inner: innerHasCid, probeSrc: PROBE.toString() });

  const escaped = (await run(false)).filter((r) => r.flat === '.fs-outer .fs-inner');
  const control = (await run(true)).filter((r) => r.flat === '.fs-outer .fs-inner');
  const rows = [
    ['a rule reaching an element with no scope of its own is reported', escaped.length === 1, `${escaped.length} finding(s)`],
    ['…and the SAME rule is silent when that element carries the scope', control.length === 0, `${control.length} finding(s)`],
  ];
  let bad = 0;
  for (const [label, ok, detail] of rows) {
    console.log(`  ${ok ? green('✔') : red('✖')}  ${label}   ${dim(detail)}`);
    if (!ok) bad++;
  }
  return bad;
}

if (SELF_TEST) {
  const bad = await selfTest(page);
  await browser.close(); server.close();
  if (bad) { console.error(red(`\n✖  ${bad} of 2 self-test rows failed — the probe does not report what it claims to.\n`)); process.exit(1); }
  console.log(green('\n✔  2/2 — the probe fires on a rule that escapes and stays quiet on one that does not\n'));
  process.exit(0);
}

const escapes = [];
for (const file of pages) {
  await page.goto(`${ORIGIN}/demos/${file}`, { waitUntil: 'networkidle' });
  const found = await page.evaluate(PROBE, null);
  for (const f of found) escapes.push({ file, ...f });

}
await browser.close();
server.close();



if (escapes.length) {
  console.error(red(`\n✖  ${escapes.length} component rule(s) escape their component once the scoping is stripped\n`));
  for (const e of escapes) {
    console.error(`  ${bold(e.selector)}`);
    console.error(`    ${dim(`flattened: ${e.flat}`)}`);
    console.error(`    ${dim(`reaches <${e.tag}${e.cls ? ` class="${e.cls}"` : ''}> from ${e.foreign}, on demos/${e.file}`)}`);
  }
  console.error(`\n  docs/components.css and every per-page copy are UNSCOPED — the docs pages`);
  console.error(`  are static HTML with no build step. A rule Astro had bounded is unbounded`);
  console.error(`  there. Use \`>\` so it reaches one level it owns, or give the target a class.\n`);
  process.exit(1);
}

console.log(green(`\n✔  every component's CSS stays inside it — ${pages.length} demo pages, flattened and re-matched\n`));

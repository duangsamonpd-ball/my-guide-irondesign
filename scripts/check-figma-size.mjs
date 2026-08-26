#!/usr/bin/env node
/**
 * Iron Software Design System — a rendered band against the node it comes from
 *
 * ── THE GAP ────────────────────────────────────────────────────────────────
 *
 * On 2026-08-25 `FooterBar` rendered 227 where `footer-lg` 2373:4247 draws 224.
 * It was two faults, both of them ARITHMETIC THAT HAD BEEN WRITTEN DOWN RATHER
 * THAN ASSERTED: a transparent border reserve that cancels out between siblings
 * in Button and does not here, and a `line-height: var(--leading-5)` sitting
 * under six lines of comment explaining that this rule exists to escape 20px
 * leading. The second had been wrong since the component's first commit. Nothing
 * read as suspect, because the prose was already correct.
 *
 * Every gate in this repo asks about SOURCE — a token used, a class paired, a
 * hook published. None of them opens the page and measures a box, so a band
 * three pixels tall in the wrong direction is a correct-looking picture that no
 * gate can see and no screenshot diff will flag, because it has always looked
 * like that.
 *
 * ── WHY IT IS NOT A GATE WITH THREE NUMBERS IN IT ──────────────────────────
 *
 * Ball's ruling, 2026-08-26. A gate keyed to FooterBar's three heights is a gate
 * built from the shape of the bug it already knows, and it would go green on
 * every band nobody thought to hardcode. So the numbers live where the claim
 * lives: a COMPONENT DECLARES its own bands, and this checks everything that has
 * declared. A component that has not declared is unchecked — visibly, in the
 * count this prints — rather than silently asserted to be fine.
 *
 *   /* @figma-size menu-bar
 *        node   2373:4247
 *        frame  footer-lg
 *        page   component-footerbar.html
 *        region freetools
 *        select .fb-menu-bar
 *        at     1440
 *        height 56
 *        why    ...                                          (optional)
 *        count  9                                            (optional, default 1)
 *   *\/
 *
 * A declaration that cannot be parsed is an ERROR, never a skip. The failure
 * mode this repo has hit twice is a checker going blind in a region and
 * reporting that region clean — a JSX comment in attribute position once killed
 * a TS parse so half a file went unchecked while fourteen gates stayed green.
 *
 * ── WHAT MAKES A READING A READING ─────────────────────────────────────────
 *
 * Three arms, and the third is the one that matters:
 *
 *  1. THE PAGE IS STYLED. A token has to resolve to real px. An unresolved
 *     `var()` reads back as the browser's default rather than as an error, so
 *     an unstyled page answers every question confidently and wrongly.
 *  2. THE FONT IS THE REAL ONE, PROVEN BY MEASUREMENT. Not
 *     `document.fonts.check()`, which a machine with Montserrat installed
 *     answers yes to no matter what the page renders — that unfalsifiable
 *     condition had ten of nineteen components being measured in Times. Here
 *     the family has to measure APART from a bogus one on the same string.
 *  3. THE PROBE IS POINTED AT THE BOX THAT IS ABOUT TO CHANGE. 10px of block
 *     padding is injected into the very element about to be measured, and the
 *     height has to move by exactly 10 and then come back. A probe reading a
 *     stale duplicate of the CSS returns a plausible number that does not move
 *     at all, and that is how the 227 survived its first fix: the tell was not
 *     a wrong number, it was a number that refused to change.
 *
 * ── WHERE IT MEASURES, AND WHY THERE ───────────────────────────────────────
 *
 * `docs/*.html`, the pages this repo ships, not the playground demos. They
 * inline their own copy of the component's CSS and carry the docs font rule, so
 * there is nothing to inject and no second styling path to get wrong. That the
 * inlined copy still matches source is `check:parity`'s question, not this one.
 *
 * Needs Chrome, so it stays OUT of `npm run check` and runs in CI's `render`
 * job beside `check:overflow` and `npm run audit`.
 *
 *   node scripts/check-figma-size.mjs               every declaration
 *   node scripts/check-figma-size.mjs footerbar     only these components
 *   node scripts/check-figma-size.mjs --self-test   prove the instrument
 *
 * Exit: 0 = every declared band measures what its node says · 1 = one does not,
 * a declaration is malformed, or an arm failed.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';
import { serveFonts, useLocalFonts, installOfflineGuard, fontsAvailable } from './lib/local-fonts.mjs';

import { componentSources } from './lib/sources.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');

const C = process.stdout.isTTY
  ? { r: '\x1b[31m', g: '\x1b[32m', y: '\x1b[33m', b: '\x1b[1m', dim: '\x1b[2m', x: '\x1b[0m' }
  : { r: '', g: '', y: '', b: '', dim: '', x: '' };

/* ── 1. the declarations ──────────────────────────────────────────────────── */

const KEYS = {
  node: /^\d+:\d+$/,
  frame: /^\S.*$/,
  page: /^[\w.-]+\.html$/,
  region: /^[a-z0-9-]+$/,
  select: /^\S.*$/,
  at: /^\d{2,4}$/,
  height: /^\d+(\.\d+)?$/,
  count: /^\d+$/,
  why: /^\S.*$/,
};
const REQUIRED = ['node', 'frame', 'page', 'region', 'select', 'at', 'height'];

/**
 * Line-oriented on purpose. A regex spanning the whole block is the kind of
 * parser an apostrophe defeats, and this one decides what gets checked at all.
 * Returns declarations AND errors; a file with an unreadable block contributes
 * an error, never a quiet nothing.
 */
export function parseDecls(src, file) {
  const lines = src.split('\n');
  const decls = [];
  const errors = [];

  for (let i = 0; i < lines.length; i++) {
    if (!/@figma-size\b/.test(lines[i])) continue;
    const where = `${file}:${i + 1}`;
    const name = (lines[i].match(/@figma-size\s+(\S+)\s*$/) ?? [])[1];
    if (!name || !/^[a-z0-9-]+$/.test(name)) {
      errors.push(`${where}  @figma-size needs a name of its own, like \`@figma-size menu-bar\``);
      continue;
    }

    const fields = {};
    let closed = false;
    for (let j = i + 1; j < lines.length; j++) {
      const body = lines[j].replace(/^\s*\*(?!\/)\s?/, '').trimEnd();
      if (/\*\//.test(lines[j]) || !body.trim()) { closed = true; break; }
      const f = body.match(/^\s*([a-z]+)\s+(.+?)\s*$/);
      if (!f) {
        errors.push(`${where}  cannot read \`${body.trim()}\` — every line is \`key value\``);
        closed = true;
        break;
      }
      const [, key, value] = f;
      if (!(key in KEYS)) {
        errors.push(`${where}  \`${key}\` is not a field — try ${Object.keys(KEYS).join(', ')}`);
      } else if (key in fields) {
        errors.push(`${where}  \`${key}\` is given twice`);
      } else if (!KEYS[key].test(value)) {
        errors.push(`${where}  \`${key} ${value}\` does not look like a ${key}`);
      } else {
        fields[key] = value;
      }
      i = j;
    }
    if (!closed) errors.push(`${where}  the block never ends`);

    const missing = REQUIRED.filter((k) => !(k in fields));
    if (missing.length) {
      errors.push(`${where}  missing ${missing.join(', ')}`);
      continue;
    }
    decls.push({
      where,
      name,
      component: file.replace(/\.astro$/, ''),
      ...fields,
      at: Number(fields.at),
      height: Number(fields.height),
      count: fields.count ? Number(fields.count) : 1,
    });
  }
  return { decls, errors };
}

/* ── 2. the probe, as it runs in the page ─────────────────────────────────── */

/**
 * Region scoping by the `<!-- demo:name -->` sentinels the generated pages
 * carry, which is exact where a CSS selector down the page would be a guess.
 * A region named by a declaration and absent from the page is an error, so
 * renaming a region cannot silently un-check a band.
 */
const IN_PAGE = `
window.regionEls = function (name) {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT);
  let open = null;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.data.trim();
    if (text === 'demo:' + name) { open = n; continue; }
    if (open && text === '/demo:' + name) {
      const els = [];
      for (let s = open.nextSibling; s && s !== n; s = s.nextSibling) if (s.nodeType === 1) els.push(s);
      return els;
    }
  }
  return null;
};
window.pick = function (region, select) {
  const roots = regionEls(region);
  if (!roots) return { error: 'no <!-- demo:' + region + ' --> region on this page' };
  const hits = [];
  for (const root of roots) {
    if (root.matches(select)) hits.push(root);
    hits.push(...root.querySelectorAll(select));
  }
  return { hits: [...new Set(hits)] };
};
window.heights = function (els) { return els.map((el) => +el.getBoundingClientRect().height.toFixed(2)); };
`;

/** Styled, and prove it: an unresolved var() reads as a browser default. */
const armStyled = () => {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;visibility:hidden;width:var(--spacing-md)';
  document.body.append(probe);
  const w = getComputedStyle(probe).width;
  probe.remove();
  return w;
};

/**
 * The font, by MEASUREMENT rather than by asking. `document.fonts.check` is
 * answered by whatever the machine has installed, which is the unfalsifiable
 * condition that hid ten components being measured in Times.
 */
const armFont = () => {
  const span = document.createElement('span');
  span.textContent = 'Iron Software Design System';
  span.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font-weight:700;font-size:16px';
  document.body.append(span);
  const measure = (family) => { span.style.fontFamily = family; return span.getBoundingClientRect().width; };
  const real = measure('Montserrat');
  const bogus = measure('"NoSuchFamily-ZZ", monospace');
  const body = getComputedStyle(document.body).fontFamily;
  span.remove();
  return { real: +real.toFixed(1), bogus: +bogus.toFixed(1), body };
};

/* ── 3. the server ────────────────────────────────────────────────────────── */

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json',
};

async function startServer() {
  const server = createServer(async (req, res) => {
    let path;
    try { path = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
    catch { res.writeHead(400).end('bad escape in URL'); return; }

    const font = await serveFonts(path);
    if (font) { res.writeHead(200, { 'content-type': font.type }).end(font.body); return; }

    const tries = [join(DOCS, normalize(path))];
    const asset = path.match(/\/assets\/(.+)$/);
    if (asset) tries.push(join(DOCS, 'assets', asset[1]));
    for (const file of tries) {
      if (!file.startsWith(DOCS)) continue;
      try {
        const body = await readFile(file);
        res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
        /* Vendored fonts on the way out, same bytes: a woff2 that never arrives
           is a band measured in a fallback face and reported as nothing at all. */
        res.end(extname(file) === '.html' ? useLocalFonts(body.toString('utf8')) : body);
        return;
      } catch { /* next candidate */ }
    }
    res.writeHead(404, { 'content-type': 'text/plain' }).end(`not found: ${path}`);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

/* ── 4. run ───────────────────────────────────────────────────────────────── */

const argv = process.argv.slice(2);
const SELF_TEST = argv.includes('--self-test');
const only = argv.filter((a) => !a.startsWith('-')).map((s) => s.toLowerCase());

/* Every component in the package, internal included — from the one enumerator.
   An internal component renders inside a public one, so its bands are drawn on
   the same frames; there is no reason a gate about pixels should care which
   folder a file lives in. See scripts/lib/sources.mjs. */
const files = componentSources();
const all = { decls: [], errors: [] };
for (const source of files) {
  const r = parseDecls(readFileSync(source.file, 'utf8'), source.name + '.astro');
  all.decls.push(...r.decls);
  all.errors.push(...r.errors);
}

if (all.errors.length) {
  console.error(`\n${C.r}✖${C.x}  ${all.errors.length} declaration(s) could not be read:`);
  for (const e of all.errors) console.error(`      ${e}`);
  console.error(`${C.dim}   A block that cannot be parsed is not a band that is fine.${C.x}\n`);
  process.exit(1);
}

const wanted = only.length
  ? all.decls.filter((d) => only.includes(d.component.toLowerCase()))
  : all.decls;

if (!fontsAvailable()) {
  console.error(`\n${C.r}✖${C.x}  vendor/fonts is missing — run \`npm run vendor:fonts\`.\n`);
  process.exit(1);
}
for (const d of wanted) {
  if (!existsSync(join(DOCS, d.page))) {
    console.error(`\n${C.r}✖${C.x}  ${d.where}  docs/${d.page} does not exist.\n`);
    process.exit(1);
  }
}

let chromium;
try {
  ({ chromium } = await import('playwright-core'));
} catch {
  console.error(`\n${C.r}✖${C.x}  playwright-core is not installed — run \`npm install\`.\n`);
  process.exit(1);
}
const browser = await chromium.launch({ channel: 'chrome' });
const { server, origin } = await startServer();
const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
const escaped = await installOfflineGuard(context, origin);
let failed = false;

console.log(
  `\n${C.b}Figma size${C.x} ${C.dim}${wanted.length} declared band(s) · ${new Set(wanted.map((d) => d.component)).size} of ${files.length} components declare${C.x}\n`,
);

/* One page load per page × width, and the declarations sorted into it. */
const byLoad = new Map();
for (const d of wanted) {
  const key = `${d.page}@${d.at}`;
  if (!byLoad.has(key)) byLoad.set(key, []);
  byLoad.get(key).push(d);
}

for (const [key, group] of SELF_TEST ? [] : byLoad) {
  const [page, width] = key.split('@');
  const tab = await context.newPage();
  /* Before the navigation, so `pick` exists in the page rather than being
     evaluated as an expression — which is what a bare function declaration
     handed to `evaluate` becomes. */
  await tab.addInitScript({ content: IN_PAGE });
  await tab.setViewportSize({ width: Number(width), height: 1200 });
  await tab.goto(`${origin}/${page}`, { waitUntil: 'networkidle' });

  /* Arms 1 and 2, once per load. Nothing below them is a reading. */
  const styled = await tab.evaluate(armStyled);
  const font = await tab.evaluate(armFont);
  const armOK = /^\d+(\.\d+)?px$/.test(styled) && styled !== '0px' &&
    Math.abs(font.real - font.bogus) > 5 && /Montserrat/i.test(font.body);
  if (!armOK) {
    failed = true;
    console.log(
      `  ${C.r}✖${C.x} ${page} @ ${width} did not arm ${C.dim}— --spacing-md read ${styled}, Montserrat ${font.real} vs bogus ${font.bogus}, body ${font.body}${C.x}`,
    );
    await tab.close();
    continue;
  }

  console.log(`  ${C.dim}${page} @ ${width}px — --spacing-md ${styled}, Montserrat ${font.real} vs ${font.bogus}${C.x}`);

  for (const d of group) {
    const found = await tab.evaluate(
      ([region, select]) => pick(region, select),
      [d.region, d.select],
    );
    if (found.error || found.hits.length !== d.count) {
      failed = true;
      console.log(
        `  ${C.r}✖${C.x} ${d.component} ${C.b}${d.name}${C.x} ${C.dim}${d.where}${C.x}\n` +
        `      ${found.error ?? `\`${d.select}\` matched ${found.hits.length} element(s) in demo:${d.region}, declared ${d.count}`}`,
      );
      continue;
    }

    /* Arm 3, per declaration and on the element itself. */
    const armed = await tab.evaluate(
      ([region, select]) => {
        const els = pick(region, select).hits;
        const before = heights(els);
        for (const el of els) {
          const cs = getComputedStyle(el);
          el.dataset.figmaSizeArm = cs.paddingBlockStart;
          el.style.setProperty('padding-block-start', `calc(${cs.paddingBlockStart} + 10px)`, 'important');
        }
        const during = heights(els);
        for (const el of els) {
          el.style.removeProperty('padding-block-start');
          delete el.dataset.figmaSizeArm;
        }
        return { before, during, after: heights(els) };
      },
      [d.region, d.select],
    );
    const moved = armed.before.every((h, i) => Math.abs(armed.during[i] - h - 10) < 0.05);
    const back = armed.before.every((h, i) => Math.abs(armed.after[i] - h) < 0.05);
    if (!moved || !back) {
      failed = true;
      console.log(
        `  ${C.r}✖${C.x} ${d.component} ${C.b}${d.name}${C.x} ${C.dim}${d.where}${C.x}\n` +
        `      the probe is not pointed at the box: 10px of padding moved it ${JSON.stringify(armed.before)} → ${JSON.stringify(armed.during)} → ${JSON.stringify(armed.after)}`,
      );
      continue;
    }

    const off = armed.before.filter((h) => Math.abs(h - d.height) > 0.5);
    if (off.length) {
      failed = true;
      console.log(
        `  ${C.r}✖${C.x} ${d.component} ${C.b}${d.name}${C.x} ${C.dim}${d.where}${C.x}\n` +
        `      ${d.frame} ${d.node} draws ${C.b}${d.height}${C.x}, \`${d.select}\` renders ${C.b}${armed.before.join(', ')}${C.x} at ${width}px`,
      );
    } else {
      console.log(
        `  ${C.g}✓${C.x} ${d.component.padEnd(12)} ${d.name.padEnd(12)} ${C.dim}${armed.before.join(', ')} = ${d.frame} ${d.node} · ${d.count > 1 ? d.count + ' elements · ' : ''}armed +10${C.x}`,
      );
    }
  }
  await tab.close();
}

/* ── 5. the self-test ─────────────────────────────────────────────────────── */

if (SELF_TEST) {
  const good = `/* @figma-size menu-bar
 *      node   2373:4247
 *      frame  footer-lg
 *      page   component-footerbar.html
 *      region freetools
 *      select .fb-menu-bar
 *      at     1440
 *      height 56
 */`;
  const cases = [
    ['CONTROL — a well-formed block parses', parseDecls(good, 'X.astro'), (r) => r.decls.length === 1 && !r.errors.length],
    ['a field the parser does not know', parseDecls(good.replace('frame ', 'framme '), 'X.astro'), (r) => r.errors.length > 0],
    ['a node id that is not one', parseDecls(good.replace('2373:4247', 'footer-lg'), 'X.astro'), (r) => r.errors.length > 0],
    ['a missing required field', parseDecls(good.replace(/^.*height.*$/m, ''), 'X.astro'), (r) => r.errors.length > 0 && r.decls.length === 0],
    ['the same field twice', parseDecls(good.replace(' */', ' *      at     1024\n */'), 'X.astro'), (r) => r.errors.length > 0],
    ['a block with no name', parseDecls(good.replace('@figma-size menu-bar', '@figma-size'), 'X.astro'), (r) => r.errors.length > 0 && r.decls.length === 0],
    ['a file with no declarations at all', parseDecls('const x = 1;\n', 'X.astro'), (r) => !r.decls.length && !r.errors.length],
    ['CONTROL — count defaults to 1', parseDecls(good, 'X.astro'), (r) => r.decls[0]?.count === 1],
  ];
  console.log(`\n${C.b}Self-test — the parser${C.x} ${C.dim}(no browser; these fail anywhere)${C.x}`);
  for (const [label, got, want] of cases) {
    const pass = want(got);
    if (!pass) failed = true;
    console.log(`  ${pass ? `${C.g}✓${C.x}` : `${C.r}✖${C.x}`} ${label} ${C.dim}→ ${got.decls.length} decl, ${got.errors.length} error${C.x}`);
  }

  /* And the part a pure parser cannot prove: that a WRONG number goes red on
     the real page. The comparison is re-run against the live measurement with
     the declared height moved 3px — the size of the fault this gate exists for.
     A gate that has never been seen to fail is not known to be able to. */
  console.log(`\n${C.b}Self-test — a wrong number on the real page${C.x}`);
  const probe = wanted[0];
  if (!probe) {
    console.log(`  ${C.r}✖${C.x} nothing declares, so there is nothing to prove this against`);
    failed = true;
  } else {
    const tab = await context.newPage();
    await tab.addInitScript({ content: IN_PAGE });
    await tab.setViewportSize({ width: probe.at, height: 1200 });
    await tab.goto(`${origin}/${probe.page}`, { waitUntil: 'networkidle' });
    const hs = await tab.evaluate(([r, s]) => heights(pick(r, s).hits), [probe.region, probe.select]);
    await tab.close();
    const rowsFor = (h) => hs.filter((x) => Math.abs(x - h) > 0.5).length;
    const control = rowsFor(probe.height);
    const injected = rowsFor(probe.height + 3);
    const pass = control === 0 && injected === hs.length;
    if (!pass) failed = true;
    console.log(
      `  ${pass ? `${C.g}✓${C.x}` : `${C.r}✖${C.x}`} ${probe.component} ${probe.name} measures ${hs.join(', ')}: ` +
      `declared ${probe.height} → ${control} off, declared ${probe.height + 3} → ${injected} off ${C.dim}(of ${hs.length})${C.x}`,
    );
  }
}

if (escaped?.length) {
  console.log(`\n${C.r}✖${C.x} ${escaped.length} request(s) left the offline guard:`);
  for (const u of escaped.slice(0, 10)) console.log(`     ${u}`);
  failed = true;
}

await browser.close();
server.close();

if (!failed && !SELF_TEST) {
  const undeclared = files.length - new Set(all.decls.map((d) => d.component)).size;
  console.log(
    `\n${C.g}✔${C.x}  ${wanted.length} band(s) measure what their node draws.` +
    `${C.dim} ${undeclared} component(s) declare nothing and are unchecked.${C.x}\n`,
  );
}
process.exit(failed ? 1 : 0);

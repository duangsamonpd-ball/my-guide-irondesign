#!/usr/bin/env node
/**
 * Iron Software Design System — interactive state diff
 *
 * The gap this closes: converting a component to Tailwind utilities is supposed
 * to change nothing a user can see. For Badge and Logo that claim is settled by
 * one screenshot — they have no states. Eight of the components left do:
 * Checkbox, Radio, Select, FileUpload, FlyoutMenu, TopNav, ProductMenu,
 * FooterBar. Their rules fire on :hover, :focus-visible, :checked and :has(),
 * and a page screenshot at rest proves nothing about any of them.
 *
 * So this drives each interactive element into each state, on the current tree
 * and on a git ref, and compares the two pixel for pixel.
 *
 *   node scripts/state-diff.mjs checkbox                 vs main
 *   node scripts/state-diff.mjs checkbox --ref HEAD~1
 *   node scripts/state-diff.mjs checkbox --states hover,focus
 *   node scripts/state-diff.mjs --self-test              prove the harness fails
 *
 * Options:
 *   --ref <git-ref>   what to compare against, default `main`
 *   --states <list>   subset of rest,hover,focus,click  (default: all four)
 *   --width <px>      viewport width, default 1440
 *   --threshold <n>   per-channel delta that counts as a difference, default 2
 *   --max <n>         stop after n differing elements, default 12
 *   --calib-passes <n>  noise-floor passes to take the worst of, default 3
 *   --json            machine-readable output
 *
 * FIVE THINGS IT HAS TO DO THAT THE OBVIOUS VERSION GETS WRONG. Every one of
 * them produced a wrong answer by hand first, on Checkbox, in the order listed:
 *
 *  1. TRANSITIONS ARE DISABLED. Sampling a computed style or a screenshot while
 *     a 150ms transition is running reads an interpolated value. By hand this
 *     showed a border as rgb(38,147,236) on one side and rgb(39,147,236) on the
 *     other, and an opacity of 0.888 against 1 — 59 "differences", every one of
 *     them a stopwatch reading rather than a style.
 *
 *  2. STATE IS DRIVEN BY REAL INPUT, never by setting a property. Chrome does
 *     not always re-evaluate `:has()` when `input.checked` is assigned by
 *     script, so a `group-has-[:checked]` rule that works perfectly for a user
 *     looks broken to a script — and a `peer-checked` rule right next to it
 *     updates, which makes the component look half-broken rather than
 *     mis-measured. Clicks and Tab presses go through the browser's real input
 *     path, so what is measured is what a user gets.
 *
 *  3. ELEMENTS ARE PAIRED BY STRUCTURAL PATH, not by index into a flat list.
 *     Conversion moves classes between elements, so `document.querySelectorAll`
 *     can return different lists on the two sides and quietly compare element 4
 *     against element 5.
 *
 *  5. IT MEASURES ITS OWN NOISE FLOOR before measuring anything else. Two
 *     browser contexts rendering the same file differ by a few units of
 *     antialiasing; the first run of this reported eleven such differences as
 *     findings on a page that had not changed. See calibrate().
 *
 *  4. IT SCREENSHOTS THE ELEMENT, not the page. A full-page comparison of a
 *     scripted state reported 1.08% of pixels differing and pointed at a box
 *     1900px tall, which is not a finding, it is a haystack.
 *
 *  6. IT SCREENSHOTS THE WHOLE PAGE, which sounds like the opposite of 4 and is
 *     the correction to it. Framing each element meant a scroll offset and a
 *     crop rectangle per probe, and those are what would not settle: the same
 *     unchanged page measured a floor of Δ5 on one run and Δ8 on the next, so a
 *     finding between the two was reported on one run and not the next. Three
 *     calibration passes did not fix it, because the variance was in the
 *     framing, not in the rendering. A full-page shot has no framing to
 *     disagree about. What is still per-element is which element is driven into
 *     the state — that part was never the problem.
 *
 *     Before: focus was blind and click would not settle. After: an injected
 *     hover change is caught 3 runs out of 3, an injected focus-ring change 2
 *     out of 2, and a clean tree is clean every time.
 *
 *     STILL OPEN: `click` is slow — it needs a fresh load per probe, and with
 *     full-page shots a calibration pass over Checkbox takes minutes — and its
 *     measured floor is Δ140, far above the other three. A clean tree does come
 *     back clean, but no injected click-state change has been caught on
 *     repeated runs yet, so click is not evidence. Use `--calib-passes 1` to
 *     make it bearable while that is being worked out.
 *
 * Needs Google Chrome. Not in `npm run check` — same reason as preview.mjs.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readdirSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');
const TMP = join(ROOT, 'node_modules/.tmp');
const WORKTREE = join(TMP, 'state-diff-ref');

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[90m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

const fail = (m) => { console.error(red(`\n✖  ${m}\n`)); process.exit(1); };

/* ── args ────────────────────────────────────────────────────────────────── */

function parseArgs(argv) {
  const o = { pages: [], ref: 'main', states: 'rest,hover,focus,click', width: 1440, threshold: 2, max: 12 };
  const takesValue = new Set(['--ref', '--states', '--width', '--threshold', '--max']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (takesValue.has(a)) {
      const v = argv[++i];
      if (v === undefined) fail(`${a} needs a value`);
      o[a.slice(2)] = ['--width', '--threshold', '--max'].includes(a) ? Number(v) : v;
    } else if (a.startsWith('--') && a.includes('=')) {
      const [k, ...rest] = a.split('=');
      argv.splice(i--, 1, k, rest.join('='));
    } else if (a.startsWith('--')) {
      o[a.slice(2)] = true;
    } else {
      o.pages.push(a);
    }
  }
  return o;
}
const opts = parseArgs(process.argv.slice(2));
const STATES = String(opts.states).split(',').map((s) => s.trim()).filter(Boolean);

function resolvePage(name) {
  for (const c of [name, `${name}.html`, `component-${name}.html`]) if (existsSync(join(DOCS, c))) return c;
  fail(`no docs page matches "${name}"`);
}

/* ── a static server per directory ───────────────────────────────────────── */

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

async function serve(dir) {
  const server = createServer(async (req, res) => {
    try {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html';
      const body = await readFile(join(dir, rel));
      res.writeHead(200, { 'content-type': MIME[extname(rel)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

/* ── the reference tree ──────────────────────────────────────────────────── */

function worktreeFor(ref) {
  rmSync(WORKTREE, { recursive: true, force: true });
  try { execFileSync('git', ['worktree', 'prune'], { cwd: ROOT, stdio: 'pipe' }); } catch { /* fine */ }
  try {
    execFileSync('git', ['worktree', 'add', '-q', '--detach', WORKTREE, ref], { cwd: ROOT, stdio: 'pipe' });
  } catch (err) {
    fail(`could not create a worktree for "${ref}" — ${String(err.stderr || err.message).trim().split('\n')[0]}`);
  }
  return join(WORKTREE, 'docs');
}

/* ── in-page helpers ─────────────────────────────────────────────────────── */

/**
 * A selector that identifies the same node on both sides. Built from tag +
 * :nth-child all the way to <body>, so it survives every class change a
 * conversion makes — which is the whole point, since classes are what changed.
 */
const IN_PAGE_PATH = `
function pathOf(el) {
  const parts = [];
  for (let n = el; n && n.nodeType === 1 && n !== document.body; n = n.parentElement) {
    const i = [...n.parentElement.children].indexOf(n) + 1;
    parts.unshift(n.tagName.toLowerCase() + ':nth-child(' + i + ')');
  }
  return 'body > ' + parts.join(' > ');
}`;

/**
 * Interactive elements inside the generated demo regions only. The page chrome —
 * sidebar, header, code tabs — is the same on both sides and is not what is
 * under test; including it just adds noise and runtime.
 */
const IN_PAGE_TARGETS = `
function demoTargets() {
  const out = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT);
  const regions = [];
  while (w.nextNode()) {
    const t = w.currentNode.nodeValue.trim();
    if (t.startsWith('demo:')) regions.push(w.currentNode);
  }
  for (const start of regions) {
    const name = start.nodeValue.trim().slice(5);
    for (let n = start.nextSibling; n && !(n.nodeType === 8 && n.nodeValue.trim() === '/demo:' + name); n = n.nextSibling) {
      if (n.nodeType !== 1) continue;
      for (const el of [n, ...n.querySelectorAll('*')]) {
        if (el.matches('a, button, input, select, textarea, summary, label, [tabindex]')) {
          out.push({ region: name, path: pathOf(el), tag: el.tagName.toLowerCase() });
        }
      }
    }
  }
  return out;
}`;

/* ── browser ─────────────────────────────────────────────────────────────── */

let chromium;
try { ({ chromium } = await import('playwright-core')); } catch { fail('playwright-core is not installed — run `npm install`'); }

async function openPage(browser, origin, page) {
  const p = await browser.newPage();
  await p.setViewportSize({ width: opts.width, height: 1000 });
  /**
   * See note 1 at the top. This has to be an init script, not a style added
   * after load: a transition can be running before the first evaluate lands.
   */
  await p.addInitScript(() => {
    const st = document.createElement('style');
    st.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
    document.documentElement.appendChild(st);
  });
  await p.goto(`${origin}/${page}`, { waitUntil: 'networkidle' });
  /**
   * `networkidle` is not enough. The pages link Montserrat from Google Fonts,
   * and a face that arrives after the first paint re-renders every text run.
   * Two contexts that happened to be on different sides of that moment gave a
   * measured noise floor of Δ27 across 12% of a box — an order of magnitude too
   * high to distinguish a real change from, and not antialiasing at all.
   * Waiting on document.fonts makes both sides render the same text.
   */
  await p.evaluate(() => document.fonts.ready);
  await p.addScriptTag({ content: `${IN_PAGE_PATH}\n${IN_PAGE_TARGETS}\nwindow.__targets = demoTargets();` });
  return p;
}

/**
 * Put one element into one state using the browser's real input path — see
 * note 2. Returns false when the state does not apply to this element, so the
 * caller can skip it on both sides rather than compare a state to nothing.
 */
async function applyState(p, path, state) {
  const el = await p.$(path);
  if (!el) return false;
  const box = await el.boundingBox();
  if (!box || box.width < 1 || box.height < 1) return false;

  if (state === 'rest') return true;
  if (state === 'hover') {
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    return true;
  }
  if (state === 'focus') {
    /**
     * :focus-visible is what every focus ring in this system is written
     * against, and script focus does not reliably set it — so the focus has to
     * arrive by keyboard. The obvious shortcut, `.focus()` then Shift+Tab then
     * Tab, is not deterministic: when the element is not focusable the pair
     * starts from wherever focus happened to be and lands somewhere different
     * on each page. Measured, that shortcut gave this harness a noise floor of
     * Δ26 across 12% of a box on the focus state alone, while rest and hover
     * were at exactly zero.
     *
     * Tabbing from the top of the document instead is slower and exact: the tab
     * order is a property of the page, so both sides walk the same one.
     */
    const focusable = await el.evaluate((e) => !e.disabled && e.tabIndex >= 0);
    if (!focusable) return false;
    await p.evaluate(() => { document.activeElement?.blur(); document.body.focus(); });
    for (let i = 0; i < 250; i++) {
      await p.keyboard.press('Tab');
      const hit = await el.evaluate((e) => document.activeElement === e);
      if (hit) return true;
    }
    return false;
  }
  if (state === 'click') {
    /**
     * Only click what a user could click. Every control here hides its real
     * <input> at one transparent pixel, and Playwright will still dispatch at
     * it — but whether the click lands on the input or on whatever is painted
     * over it is not decided the same way twice. Including those took the
     * self-comparison floor for this state to Δ102 across 78% of a box, which
     * is not a floor, it is the harness measuring its own coin flip.
     */
    const clickable = await el.evaluate((e) => {
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      return r.width >= 4 && r.height >= 4 && cs.opacity !== '0' && cs.visibility !== 'hidden' && !e.disabled;
    });
    if (!clickable) return false;
    try {
      await el.click({ timeout: 1500 });
    } catch {
      return false;
    }
    /* Move the pointer away so the shot is the post-click state, not a hover. */
    await p.mouse.move(0, 0);
    return true;
  }
  fail(`unknown state "${state}" — expected rest, hover, focus or click`);
}

/**
 * Element screenshot, padded so a focus ring or shadow outside the box counts.
 *
 * The element under test is not always the element to photograph. Every control
 * in this system hides its real <input> — `absolute w-px h-px opacity-0` — and
 * paints a sibling instead, so the input's own box is one invisible pixel and a
 * padded shot of it is 17x17 pixels of whatever happens to be behind it. That
 * is what the focus-state noise was: Δ53 on a region that shows nothing, while
 * rest and hover sat at exactly zero. What changes on focus is the sibling.
 *
 * So the shot climbs to the nearest ancestor that is actually visible. The
 * state is still applied to the real control; only the framing moves.
 */
async function shot(p, path) {
  let el = await p.$(path);
  if (!el) return null;
  el = await el.evaluateHandle((e) => {
    const visible = (n) => {
      const r = n.getBoundingClientRect();
      const cs = getComputedStyle(n);
      return r.width >= 4 && r.height >= 4 && cs.opacity !== '0' && cs.visibility !== 'hidden';
    };
    let n = e;
    while (n && n !== document.body && !visible(n)) n = n.parentElement;
    return n && n !== document.body ? n : e;
  });
  /**
   * Scroll to a rounded, deterministic offset before framing. Tabbing to an
   * element scrolls it into view, and how far depends on how many presses it
   * took to get there — so the two sides can settle a fraction of a pixel apart
   * and every antialiased edge in the shot lands on a different subpixel phase.
   * That is the rest of the focus-state noise: same ring, shifted by 0.4px.
   */
  await el.evaluate((e) => {
    const y = e.getBoundingClientRect().top + window.scrollY - Math.round(window.innerHeight / 2);
    window.scrollTo(0, Math.max(0, Math.round(y)));
  });
  /**
   * Let the scroll and the state change actually paint before framing. Without
   * this the harness was not reproducible on the focus state: the same injected
   * change was caught on one run and missed on the next, because the shot
   * sometimes landed a frame early.
   */
  await el.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

  /**
   * FULL PAGE, not a clipped box — and this is the correction that mattered
   * most. Framing each element meant a scroll offset and a crop rectangle per
   * probe, and those are what would not settle: the same unchanged page gave
   * Δ5 then Δ8, so a finding between the two was reported on one run and not
   * the next. A full-page screenshot has no framing to disagree about, and on
   * Badge, Logo and Textarea it came back byte-identical every time.
   */
  return p.screenshot({ fullPage: true });
}

/* ── pixel comparison, done in the browser rather than with a PNG library ─── */

async function makeComparator(browser) {
  const p = await browser.newPage();
  await p.setContent('<body></body>');
  return {
    async diff(a, b) {
      return p.evaluate(
        async ([A, B, threshold]) => {
          const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
          const [ia, ib] = await Promise.all([load(A), load(B)]);
          if (ia.width !== ib.width || ia.height !== ib.height) {
            return { sizeMismatch: `${ia.width}x${ia.height} vs ${ib.width}x${ib.height}` };
          }
          const w = ia.width, h = ia.height;
          const data = (img) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h).data; };
          const da = data(ia), db = data(ib);
          let n = 0, maxDelta = 0, minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]), Math.abs(da[i + 3] - db[i + 3]));
            if (d > threshold) { n++; if (d > maxDelta) maxDelta = d; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
          }
          return { w, h, differing: n, pct: (100 * n) / (w * h), maxDelta, box: n ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } : null };
        },
        [`data:image/png;base64,${a.toString('base64')}`, `data:image/png;base64,${b.toString('base64')}`, opts.threshold],
      );
    },
    close: () => p.close(),
  };
}

/* ── the run ─────────────────────────────────────────────────────────────── */

/**
 * The noise floor, measured rather than guessed — see note 5.
 *
 * Two browser contexts rendering the SAME file do not produce identical pixels.
 * Text antialiasing and edge coverage differ by a few units, so a first run of
 * this harness comparing an unconverted Checkbox against itself reported eleven
 * "differences" of 2-7% of a small box at max Δ3-15. A fixed threshold picked to
 * silence those would be a number chosen to make the output look right.
 *
 * Instead every run first compares the reference against itself and keeps the
 * largest difference that produces. Anything at or below that is what this
 * harness cannot tell apart, on this machine, today — and is not reported.
 */
async function calibrate(browser, cmp, refDocs, page) {
  const A = await serve(refDocs);
  const [p1, p2] = [await openPage(browser, A.origin, page), await openPage(browser, A.origin, page)];
  const targets = await p1.evaluate(() => window.__targets);
  const per = new Map(); let n = 0;
  for (const t of targets) {
    for (const state of STATES) {
      /**
       * `click` has to be calibrated the same way it is measured — on fresh
       * loads — not skipped. Left uncalibrated its floor was 0/0, and a clean
       * unchanged page then reported 6 differences on one run and 9 on the
       * next: a check that fails at random is worse than no check.
       */
      let a = p1, b = p2, fresh = null;
      if (state === 'click') {
        fresh = [await openPage(browser, A.origin, page), await openPage(browser, A.origin, page)];
        [a, b] = fresh;
      } else {
        for (const p of [p1, p2]) { await p.evaluate(() => document.activeElement?.blur()); await p.mouse.move(0, 0); }
      }
      const ok = (await applyState(a, t.path, state)) && (await applyState(b, t.path, state));
      const [s1, s2] = ok ? [await shot(a, t.path), await shot(b, t.path)] : [null, null];
      if (fresh) { await fresh[0].close(); await fresh[1].close(); }
      if (!ok || !s1 || !s2) continue;
      const d = await cmp.diff(s1, s2);
      if (d.sizeMismatch) continue;
      n++;
      const cur = per.get(state) ?? { maxDelta: 0, maxPct: 0, worst: null };
      if (d.maxDelta > cur.maxDelta) { cur.maxDelta = d.maxDelta; cur.worst = t.path; }
      if (d.pct > cur.maxPct) cur.maxPct = d.pct;
      per.set(state, cur);
    }
  }
  await p1.close(); await p2.close(); A.server.close();
  for (const st of STATES) if (!per.has(st)) per.set(st, { maxDelta: 0, maxPct: 0, worst: null });
  return { per, probes: n };
}

async function comparePage(browser, cmp, refDocs, page, floor) {
  const [A, B] = [await serve(refDocs), await serve(DOCS)];
  const findings = [];
  let compared = 0, skipped = 0;
  /** Above the floor on BOTH axes, so neither a faint wide wash nor a sharp
      single pixel gets through on antialiasing alone. */
  const isReal = (d, state) => {
    if (d.sizeMismatch) return true;
    const f = floor.per.get(state) ?? { maxDelta: 0, maxPct: 0 };
    return d.maxDelta > f.maxDelta && d.pct > f.maxPct;
  };

  const pa = await openPage(browser, A.origin, page);
  const targets = await pa.evaluate(() => window.__targets);
  await pa.close();

  /**
   * `click` mutates the page — a checkbox stays checked — so every click probe
   * needs a fresh load or the run measures the order elements were visited in.
   * rest/hover/focus mutate nothing, so they share one load per side and are
   * reset between elements instead. On Checkbox that is the difference between
   * ~110 page loads and ~30.
   */
  const MUTATING = new Set(['click']);
  const cheap = STATES.filter((s) => !MUTATING.has(s));
  const costly = STATES.filter((s) => MUTATING.has(s));

  const probe = async (p1, p2, t, state) => {
    const ok1 = await applyState(p1, t.path, state);
    const ok2 = await applyState(p2, t.path, state);
    if (!ok1 || !ok2) return 'skip';
    const [s1, s2] = [await shot(p1, t.path), await shot(p2, t.path)];
    if (!s1 || !s2) return 'skip';
    const d = await cmp.diff(s1, s2);
    return isReal(d, state) ? { ...t, state, ...d } : 'same';
  };

  if (cheap.length) {
    const [p1, p2] = [await openPage(browser, A.origin, page), await openPage(browser, B.origin, page)];
    for (const t of targets) {
      for (const state of cheap) {
        /* Clear whatever the previous element left behind, or a focus ring on a
           neighbour lands inside this element's padded screenshot. */
        for (const p of [p1, p2]) {
          await p.evaluate(() => document.activeElement?.blur());
          await p.mouse.move(0, 0);
        }
        const r = await probe(p1, p2, t, state);
        if (r === 'skip') { skipped++; continue; }
        compared++;
        if (r !== 'same') {
          findings.push(r);
          if (findings.length >= opts.max) {
            await p1.close(); await p2.close();
            A.server.close(); B.server.close();
            return { findings, compared, skipped, truncated: true };
          }
        }
      }
    }
    await p1.close(); await p2.close();
  }

  for (const t of targets) {
    for (const state of costly) {
      const [p1, p2] = [await openPage(browser, A.origin, page), await openPage(browser, B.origin, page)];
      const r = await probe(p1, p2, t, state);
      await p1.close(); await p2.close();
      if (r === 'skip') { skipped++; continue; }
      compared++;
      if (r !== 'same') {
        findings.push(r);
        if (findings.length >= opts.max) {
          A.server.close(); B.server.close();
          return { findings, compared, skipped, truncated: true };
        }
      }
    }
  }
  A.server.close(); B.server.close();
  return { findings, compared, skipped, truncated: false };
}

/* ── self-test — a harness that cannot fail is not evidence ──────────────── */

async function selfTest(browser, cmp) {
  const dir = join(TMP, 'state-diff-selftest');
  const mk = (file, css) => writeFileSync(join(dir, file), `<!doctype html><html><head><style>
    body { margin: 0; padding: 20px; background: #fff; font: 14px monospace; }
    .btn { display: inline-block; padding: 8px 16px; border: 2px solid #888; border-radius: 6px; background: #eee; }
    ${css}
  </style></head><body>
    <!-- demo:probe -->
    <div><button class="btn">Press</button></div>
    <!-- /demo:probe -->
  </body></html>`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const cases = [
    { name: 'identical pages report no difference', css: '.btn:hover { background: #cfe; }', expect: 0 },
    { name: 'a hover-only difference is caught', css: '.btn:hover { background: #f00; }', expect: 1 },
    { name: 'a focus-only difference is caught', css: '.btn:hover { background: #cfe; } .btn:focus-visible { outline: 3px solid #f0f; }', expect: 1 },
  ];

  let failed = 0;
  for (const c of cases) {
    mk('a.html', '.btn:hover { background: #cfe; }');
    mk('b.html', c.css);
    const { origin, server } = await serve(dir);
    let diffs = 0;
    for (const state of ['rest', 'hover', 'focus']) {
      const [p1, p2] = [await openPage(browser, origin, 'a.html'), await openPage(browser, origin, 'b.html')];
      const path = (await p1.evaluate(() => window.__targets))[0].path;
      const ok = (await applyState(p1, path, state)) && (await applyState(p2, path, state));
      if (ok) {
        const [s1, s2] = [await shot(p1, path), await shot(p2, path)];
        if (s1 && s2) { const d = await cmp.diff(s1, s2); if (d.differing > 0) diffs++; }
      }
      await p1.close(); await p2.close();
    }
    server.close();
    const pass = c.expect === 0 ? diffs === 0 : diffs > 0;
    console.log(`  ${pass ? green('✔') : red('✖')}  ${c.name} ${dim(`(${diffs} state(s) differed)`)}`);
    if (!pass) failed++;
  }
  rmSync(dir, { recursive: true, force: true });
  return failed;
}

/* ── main ────────────────────────────────────────────────────────────────── */

let browser;
try {
  browser = await chromium.launch({ channel: 'chrome' });
} catch (err) {
  fail(`could not launch Google Chrome — ${err.message.split('\n')[0]}`);
}
const cmp = await makeComparator(browser);

if (opts['self-test']) {
  console.log(`\n${bold('state-diff self-test')}\n`);
  const failed = await selfTest(browser, cmp);
  await cmp.close(); await browser.close();
  if (failed) { console.log(red(`\n✖  ${failed} self-test case(s) failed — the harness is not trustworthy\n`)); process.exit(1); }
  console.log(green('\n✔  the harness sees a difference when there is one, and none when there is not\n'));
  process.exit(0);
}

if (!opts.pages.length) fail('name a component page, or pass --self-test');

const pages = opts.pages.map(resolvePage);
const refDocs = worktreeFor(opts.ref);
if (!existsSync(refDocs)) fail(`the worktree for "${opts.ref}" has no docs/ directory`);

let bad = 0;
const report = [];
for (const page of pages) {
  console.log(`\n${bold(page)} ${dim(`— working tree vs ${opts.ref}`)}`);
  /**
   * Calibrate more than once and keep the worst. One pass is an estimate with
   * its own variance: on a page with only four probes it returned Δ5 then Δ8 for
   * the same unchanged page, and a finding sitting between the two was reported
   * on one run and not the next. A floor that moves is not a floor.
   */
  const passes = Number(opts["calib-passes"] ?? 3);
  let floor = null;
  for (let i = 0; i < passes; i++) {
    const f2 = await calibrate(browser, cmp, refDocs, page);
    if (!floor) { floor = f2; continue; }
    for (const [st, v] of f2.per) {
      const cur = floor.per.get(st) ?? { maxDelta: 0, maxPct: 0, worst: null };
      floor.per.set(st, {
        maxDelta: Math.max(cur.maxDelta, v.maxDelta),
        maxPct: Math.max(cur.maxPct, v.maxPct),
        worst: v.maxDelta > cur.maxDelta ? v.worst : cur.worst,
      });
    }
    floor.probes += f2.probes;
  }
  const floorLine = [...floor.per.entries()]
    .map(([st, f]) => `${st} Δ${f.maxDelta}/${f.maxPct.toFixed(1)}%`)
    .join('  ');
  console.log(dim(`  noise floor from ${floor.probes} self-comparisons — ${floorLine}`));
  if (floor.worst) console.log(dim(`  worst self-comparison: ${floor.worst.state} on ${floor.worst.path.split(" > ").slice(-2).join(" > ")}`));
  const { findings, compared, skipped, truncated } = await comparePage(browser, cmp, refDocs, page, floor);
  report.push({ page, findings, compared, skipped });
  if (!findings.length) {
    console.log(green(`  ✔  ${compared} element states identical`) + dim(` (${skipped} not applicable)`));
    continue;
  }
  bad++;
  /**
   * Full-page shots mean every element in the same state produces the SAME
   * image, so an unchanged page-level difference is reported once per element —
   * FormCard listed one 2491px difference five times, against five different
   * paths, as though five things had changed. Collapse identical readings and
   * name how many elements were driven into that state instead.
   */
  const seen = new Map();
  for (const f of findings) {
    const key = [f.state, f.differing, f.maxDelta, f.sizeMismatch ?? ""].join("|");
    const cur = seen.get(key);
    if (cur) cur.also++;
    else seen.set(key, { ...f, also: 0 });
  }
  const shown = [...seen.values()];
  console.log(red(`  ✖  ${shown.length} difference(s) across ${findings.length} element state(s)`) + dim(` of ${compared} compared`));
  for (const f of shown) {
    const where = f.sizeMismatch
      ? `size ${f.sizeMismatch}`
      : `${f.differing} px (${f.pct.toFixed(2)}%), max Δ${f.maxDelta}, at ${f.box.x},${f.box.y} ${f.box.w}x${f.box.h}`;
    console.log(`     ${f.state.padEnd(6)} ${dim(f.region)} ${f.tag}  ${where}`);
    console.log(dim(`            ${f.path}${f.also ? ` (and ${f.also} more element(s) in this state)` : ""}`));
  }
  if (truncated) console.log(dim(`     … stopped at --max ${opts.max}`));
}

await cmp.close();
await browser.close();
rmSync(WORKTREE, { recursive: true, force: true });
try { execFileSync('git', ['worktree', 'prune'], { cwd: ROOT, stdio: 'pipe' }); } catch { /* fine */ }

if (opts.json) console.log(JSON.stringify(report, null, 2));
console.log();
process.exit(bad ? 1 : 0);

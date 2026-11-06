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
 *   --confirm <n>     fresh-load re-measurements a difference must survive, default 2
 *   --json            machine-readable output
 *   --explain         name every reaction set aside and every candidate that did not reproduce
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
 *     AND FROM ITS FIRST COMMIT (`4bcfbf0`, 2026-08-05) IT DID NOT. The style was appended to
 *     `document.documentElement` from an init script, which is not the element
 *     the parser keeps, so it never reached a page — found 2026-11-05 when
 *     FooterBar's Free-tools click measured a page height of 4641, 4667 or
 *     4687 two frames later and 4739 every time after 1.5s, with 8
 *     CSSTransitions running. Every hover, focus and click it had shot raced
 *     whatever the component animated. It is now checked twice: `motionIsOff`
 *     fails the run if the style is absent or a 1s transition does not compute
 *     to 0s, and a self-test row clicks a 2s height transition and demands the
 *     end height two frames later (it read 26px of 200 with the old injection).
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
 *     measured PIXEL floor is high (Δ140 on Checkbox, Δ255/3.6% on FlyoutMenu).
 *     On pixels alone click was not evidence; note 8 is what made it so. Use
 *     `--calib-passes 1` to make it bearable.
 *
 *  7. A DIFFERENCE HAS TO REPRODUCE, and NOTHING COMPARED IS NOT A PASS
 *     (both 2026-08-12). The floor in 5 bounds the variance calibration
 *     happened to sample; it cannot bound what it did not. Measured after
 *     `0c23ed7`, with HEAD equal to the working tree so both sides were
 *     byte-identical: three runs of `formcard --ref HEAD` gave clean, one
 *     difference, clean — the odd one being a submit button whose computed
 *     style is identical in both trees, checked in Chrome. So a candidate is
 *     now re-measured on fresh loads (`--confirm`, default 2) and dropped
 *     unless it survives; the count that did not survive is printed, because a
 *     harness silently discarding findings is its own hazard. Four runs of the
 *     same page after: clean every time, with the phantom named as a candidate
 *     that did not reproduce.
 *
 *     Calibration also now opens TWO servers on the reference tree rather than
 *     one origin twice, so the floor spans the same conditions as the run it
 *     guards. It had been sampling a warm second load where the real second
 *     side is cold.
 *
 *     And a page where nothing could be driven into any state now FAILS instead
 *     of printing "0 element states identical" under a green tick, which is
 *     what `state-diff badge` did until today. Badge has no interactive element
 *     in its demo regions; that is a true fact about Badge and a refusal to
 *     answer, not a clean bill of health. Use `npm run preview` for those.
 *
 *  8. IT COMPARES WHAT AN INTERACTION DID, AND IT NEVER LEAVES THE MACHINE
 *     (2026-11-05, found by the monthly audit). Two holes, both measured:
 *
 *     Pixels could not see behaviour. With FlyoutMenu's open call deleted from
 *     the tree, this harness printed "231 element states identical": the floor
 *     that page calibrates sits at Δ255 across 3.6%, because the panel's notch
 *     is positioned from layout and lands 83px or 75px depending on timing, and
 *     a menu that no longer opens hides under that. So every probe now also
 *     records, per side, what the interaction changed in the demo regions —
 *     ARIA states, inert / hidden / open / disabled, checkedness, form value,
 *     whether each element renders, which holds focus — and compares the two
 *     REACTIONS (before→after on each side, never the raw DOM, so a conversion
 *     that renames every class is not a finding). Calibration asks the same
 *     question of two loads of the reference; a probe whose reaction is not
 *     stable there is excused from it, and the run prints how many were.
 *
 *     It was first written 2026-11-05 and held back: on the UNTOUCHED
 *     FlyoutMenu page it reported a difference that reproduced 3 times out of 3.
 *     The cause was note 1 — transitions had never been off, so a reaction read
 *     two frames after a hover caught each panel at a different point of its
 *     animation. With transitions really off (2026-11-06): two clean runs on
 *     the untouched page, 235 states identical, 0 false findings, 1 hover probe
 *     excused as unstable on the reference (was 5–6), click floor Δ255/3.6% →
 *     Δ54/0.0%; and with `pointerenter`'s open call removed from the page it
 *     reported exactly 1 difference — "hover preview button reacted differently
 *     on 20 element(s)": HEAD's panel opened, the tree's did not.
 *
 *     And it was online. No harness here may touch the network, and this was
 *     the one without `installOfflineGuard`: clicking the TextLink demos
 *     (`href="https://example.com"`) made 122 requests per run and raced a
 *     navigation against the shot — one run died with a TimeoutError on a page
 *     that was not ours. Every page is guarded now, a link that would leave the
 *     document has its default cancelled (its own handlers still run), and any
 *     request that tries to leave fails the run naming the host.
 *
 *     The self-test carries a row for each, and each was proven to fail with its
 *     fix removed: a reaction-only change with pixels asserted identical, its
 *     refusal twin, an off-site link that must not move the page, and an
 *     off-site <img> the guard must catch — that last one is the plumbing row,
 *     without which the link row would also pass with no guard at all.
 *
 * Needs Google Chrome. Not in `npm run check` — same reason as preview.mjs.
 */

import { serveStatic } from './lib/serve.mjs';
import { installOfflineGuard } from './lib/local-fonts.mjs';

import { existsSync, readdirSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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
  /**
   * `--calib-passes` and `--confirm` belong here too. Until 2026-08-12 only the
   * first five did, so `--calib-passes 1` — which this file's own header
   * recommends — set the flag to `true` and pushed `1` into the page list,
   * failing with `no docs page matches "1"`. A documented option that cannot be
   * used is worse than an undocumented one.
   */
  const takesValue = new Set(['--ref', '--states', '--width', '--threshold', '--max', '--calib-passes', '--confirm']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (takesValue.has(a)) {
      const v = argv[++i];
      if (v === undefined) fail(`${a} needs a value`);
      o[a.slice(2)] = ['--width', '--threshold', '--max', '--calib-passes', '--confirm'].includes(a) ? Number(v) : v;
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


async function serve(dir) {
  /* Vendored fonts, served locally as of 2026-08-12. This harness has the
     sharpest stake in it: a face arriving after first paint re-renders every
     text run, and two contexts landing on opposite sides of that moment
     measured a Δ27 noise floor across 12% of a box — see the note by
     document.fonts.ready below. A font that never travels cannot arrive late. */
  return serveStatic({ roots: [dir], assets: false });
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

/**
 * What an interaction DID, as data rather than pixels — see note 8. One entry
 * per element inside the demo regions, keyed by the same structural path the
 * targets use. Classes are deliberately absent: a conversion renames them, and
 * this compares behaviour across a conversion. What is kept is what a user or
 * assistive technology can observe: the ARIA states, inert / hidden / open /
 * disabled, checkedness and form value, whether the element renders at all, and
 * whether it holds focus.
 */
const IN_PAGE_DOM = `
function domState() {
  const ATTRS = ['aria-expanded', 'aria-selected', 'aria-checked', 'aria-pressed', 'aria-hidden', 'aria-current', 'inert', 'hidden', 'open', 'disabled'];
  const out = {};
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
        const form = el.matches('input, select, textarea');
        out[pathOf(el)] = ATTRS.map((a) => el.getAttribute(a) ?? '').concat([
          el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) ? 'shown' : 'not-shown',
          form && 'checked' in el ? 'checked=' + el.checked : '',
          form ? 'value=' + el.value : '',
          el === document.activeElement ? 'focused' : '',
        ]).join('|');
      }
    }
  }
  return out;
}`;

/** before → after for one side: `{ path: "old → new" }`, only what moved. */
function domDelta(before, after) {
  const out = {};
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (before[k] !== after[k]) out[k] = `${before[k] ?? '∅'} → ${after[k] ?? '∅'}`;
  }
  return out;
}

/** Paths where the two sides' reactions disagree. Empty when they behaved alike. */
function reactionMismatch(d1, d2) {
  const out = [];
  for (const k of new Set([...Object.keys(d1), ...Object.keys(d2)])) {
    if (d1[k] !== d2[k]) out.push({ path: k, a: d1[k] ?? 'unchanged', b: d2[k] ?? 'unchanged' });
  }
  return out;
}

const domOf = (p) => p.evaluate(() => domState());

/**
 * The DOM once it has stopped moving. A component may finish its reaction on a
 * timer — FlyoutMenu closes 150ms after the pointer leaves — and a read that
 * lands either side of that is a coin flip: on 2026-11-05 the same trigger on
 * the same reference tree read `shown` on one load and `not-shown` on the next,
 * which excused exactly the triggers a planted break lived in. So read until two
 * reads 100ms apart agree, at least 200ms after starting and at most 2s. No
 * component's constant is written here; quiet is observed, not assumed.
 */
async function settledDom(p) {
  const t0 = Date.now();
  let prev = JSON.stringify(await domOf(p));
  for (;;) {
    await p.waitForTimeout(100);
    const cur = JSON.stringify(await domOf(p));
    if (cur === prev && Date.now() - t0 >= 200) return JSON.parse(cur);
    if (Date.now() - t0 > 2000) return JSON.parse(cur);
    prev = cur;
  }
}

/** The reaction to read after a state: for `click`, the one captured while the
    pointer was still on the element (see applyState), else the settled DOM. */
const reactionOf = (p, state) => (state === 'click' && p.__afterClick ? p.__afterClick : settledDom(p));

/* ── browser ─────────────────────────────────────────────────────────────── */

/**
 * Every page this harness opens is offline — see note 8. Each guard's list is
 * kept so the run can FAIL on anything that tried to leave, rather than trust
 * that nothing did; the TextLink demo clicked through to example.com 122 times
 * per run before this.
 */
const GUARDS = [];
/** `--explain`: what this run chose not to report, so the choice can be read. */
const EXPLAIN = [];
const escaped = () => GUARDS.flat();

let chromium;
try { ({ chromium } = await import('playwright-core')); } catch { fail('playwright-core is not installed — run `npm install`'); }

/**
 * The plumbing half of "transitions are off": the style is in the page AND the
 * browser applies it — a probe element given a 1s transition computes 0s. The
 * render half is a self-test row. Two rows because a check on the render alone
 * passes on any page that happens to have nothing animating.
 */
async function motionIsOff(p) {
  return p.evaluate(() => {
    if (!document.getElementById('__state-diff-motion-off')) return false;
    const probe = document.createElement('div');
    probe.style.transition = 'opacity 1s';
    document.body.appendChild(probe);
    const dur = getComputedStyle(probe).transitionDuration;
    probe.remove();
    return dur === '0s';
  });
}

async function openPage(browser, origin, page) {
  const p = await browser.newPage();
  p.__escapes = await installOfflineGuard(p.context(), origin);
  GUARDS.push(p.__escapes);
  await p.setViewportSize({ width: opts.width, height: 1000 });
  /**
   * A `click` on a real link must not leave the page under test. Without this
   * the TextLink demos (`href="https://example.com"`) started a navigation on
   * every click probe, and the post-click shot raced it — one run died with a
   * TimeoutError on a page that was not ours. Registered on window in the
   * bubble phase, so the component's own handlers on the link still run first
   * and see an ordinary event; only the browser's default navigation is
   * cancelled, and only when it would change the document. In-page `#` links
   * are left alone, since moving within the page is behaviour worth measuring.
   */
  await p.addInitScript(() => {
    window.addEventListener('click', (e) => {
      const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
      if (!a) return;
      const u = new URL(a.href, location.href);
      if (u.origin + u.pathname + u.search !== location.origin + location.pathname + location.search) e.preventDefault();
    });
  });
  /**
   * See note 1 at the top. This has to be an init script, not a style added
   * after load: a transition can be running before the first evaluate lands.
   */
  /*
   * Until 2026-11-05 this appended the style to `document.documentElement` and
   * stopped. At init-script time that element is not the one the parser keeps,
   * so the style was never in the page: measured on component-footerbar.html,
   * `.fb-tools` still read `transition-duration: 0.3s` and a click started 8
   * CSSTransitions. Every state this harness has ever shot was shot with
   * transitions running — and a click on FooterBar's Free-tools trigger gave a
   * page height of 4641, 4667 or 4687 two frames later, 4739 every time after
   * 1.5s. So the style is (re)inserted whenever the document can hold it, and
   * `motionIsOff` below checks it is really there before anything is measured.
   */
  await p.addInitScript(() => {
    const css = '*, *::before, *::after { transition: none !important; animation: none !important; }';
    const ensure = () => {
      if (document.getElementById('__state-diff-motion-off')) return;
      const host = document.head ?? document.documentElement;
      if (!host) return;
      const st = document.createElement('style');
      st.id = '__state-diff-motion-off';
      st.textContent = css;
      host.appendChild(st);
    };
    ensure();
    document.addEventListener('readystatechange', ensure);
    document.addEventListener('DOMContentLoaded', ensure);
  });
  await p.goto(`${origin}/${page}`, { waitUntil: 'networkidle' });
  if (!(await motionIsOff(p))) fail(`transitions are still on in ${page} — the motion-off style did not land, so every shot would race an animation`);
  /**
   * `networkidle` is not enough. The pages link Montserrat from Google Fonts,
   * and a face that arrives after the first paint re-renders every text run.
   * Two contexts that happened to be on different sides of that moment gave a
   * measured noise floor of Δ27 across 12% of a box — an order of magnitude too
   * high to distinguish a real change from, and not antialiasing at all.
   * Waiting on document.fonts makes both sides render the same text.
   */
  await p.evaluate(() => document.fonts.ready);
  await p.addScriptTag({ content: `${IN_PAGE_PATH}\n${IN_PAGE_TARGETS}\n${IN_PAGE_DOM}\nwindow.__targets = demoTargets();` });
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
    /**
     * The REACTION is read here, before the pointer leaves — see note 8. What a
     * user gets from a click is what is on screen while they are still on the
     * control; moving away first measured whether a hover menu's close timer
     * had fired yet. Settled, because a click can start its own timers too.
     */
    p.__afterClick = await settledDom(p);
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
  /**
   * TWO servers, both on the reference tree — not one origin opened twice.
   * The floor has to be measured across the same span as the comparison it
   * guards, and `comparePage` reads one side from each of two servers. With a
   * single origin the second load is warm where the real run's second side is
   * cold, so the floor came in systematically low: FormCard measured Δ60 here
   * and then flagged its submit button at Δ77 with computed styles identical in
   * both trees. A floor sampled under easier conditions than the measurement is
   * a floor that certifies a stability nothing tested.
   */
  const [A, A2] = [await serve(refDocs), await serve(refDocs)];
  const [p1, p2] = [await openPage(browser, A.origin, page), await openPage(browser, A2.origin, page)];
  const targets = await p1.evaluate(() => window.__targets);
  const per = new Map(); let n = 0;
  /** `state|path` pairs whose DOM reaction differed between two loads of the
      SAME tree. The reaction is exact data, so there is no Δ to raise — such a
      probe is simply not asked the DOM question in the comparison, and the run
      says how many were set aside. */
  const domUnstable = new Set();
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
        fresh = [await openPage(browser, A.origin, page), await openPage(browser, A2.origin, page)];
        [a, b] = fresh;
      } else {
        for (const p of [p1, p2]) { await p.evaluate(() => document.activeElement?.blur()); await p.mouse.move(0, 0); }
      }
      const pre = [await settledDom(a), await settledDom(b)];
      const ok = (await applyState(a, t.path, state)) && (await applyState(b, t.path, state));
      if (ok) {
        const post = [await reactionOf(a, state), await reactionOf(b, state)];
        const mm = reactionMismatch(domDelta(pre[0], post[0]), domDelta(pre[1], post[1]));
        if (mm.length) { domUnstable.add(`${state}|${t.path}`); if (opts.explain) EXPLAIN.push(['unstable', state, t.path, mm[0]]); }
      }
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
  await p1.close(); await p2.close(); A.server.close(); A2.server.close();
  for (const st of STATES) if (!per.has(st)) per.set(st, { maxDelta: 0, maxPct: 0, worst: null });
  return { per, probes: n, domUnstable };
}

async function comparePage(browser, cmp, refDocs, page, floor) {
  const [A, B] = [await serve(refDocs), await serve(DOCS)];
  const findings = [];
  let compared = 0, skipped = 0, unconfirmed = 0;
  /** Above the floor on BOTH axes, so neither a faint wide wash nor a sharp
      single pixel gets through on antialiasing alone. */
  const isReal = (d, state) => {
    if (d.sizeMismatch) return true;
    if (d.dom?.length) return true;
    const f = floor.per.get(state) ?? { maxDelta: 0, maxPct: 0 };
    return d.maxDelta > f.maxDelta && d.pct > f.maxPct;
  };
  let domSetAside = 0;

  const pa = await openPage(browser, A.origin, page);
  const targets = await pa.evaluate(() => window.__targets);
  await pa.close();
  const targetCount = targets.length;

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

  /**
   * Pixels AND reaction — see note 8. The pixel comparison is unchanged; the
   * reaction is what the interaction did to the DOM on each side, compared as
   * data. It is the half that sees a menu which no longer opens: pixels did not,
   * because the floor this page self-calibrates can sit at Δ255 across several
   * percent of the page, and a closed panel hides under that.
   */
  const measure = async (p1, p2, t, state) => {
    const pre = [await settledDom(p1), await settledDom(p2)];
    const ok1 = await applyState(p1, t.path, state);
    const ok2 = await applyState(p2, t.path, state);
    if (!ok1 || !ok2) return 'skip';
    const post = [await reactionOf(p1, state), await reactionOf(p2, state)];
    const asked = !floor.domUnstable?.has(`${state}|${t.path}`);
    const dom = asked ? reactionMismatch(domDelta(pre[0], post[0]), domDelta(pre[1], post[1])) : [];
    const [s1, s2] = [await shot(p1, t.path), await shot(p2, t.path)];
    if (!s1 || !s2) return 'skip';
    const d = await cmp.diff(s1, s2);
    if (!asked) d.domSetAside = true;
    if (dom.length) d.dom = dom;
    return d;
  };

  /**
   * A candidate difference has to REPRODUCE on fresh loads before it is
   * reported. The floor above bounds the variance this harness could measure
   * during calibration; it cannot bound what it did not happen to sample.
   *
   * Proved necessary rather than assumed: after `0c23ed7`, with HEAD equal to
   * the working tree so the two sides were byte-identical, three consecutive
   * runs of `state-diff formcard --ref HEAD` gave clean, one difference, clean.
   * The one difference was the submit button at Δ77 — an element whose computed
   * style is identical in both trees, checked in Chrome. A finding that appears
   * in one run out of three is a property of the harness, and the cheapest way
   * to tell that apart from a real change is to look again.
   *
   * Confirmation always reopens both pages, because the variance being tested
   * for is between page LOADS — re-measuring the same two open pages would
   * mostly reproduce whatever they already rendered and confirm nothing.
   * Only candidates pay this cost, so a clean run is unaffected.
   */
  const CONFIRM = Math.max(0, Number(opts.confirm ?? 2));
  const reproduces = async (t, state) => {
    for (let i = 0; i < CONFIRM; i++) {
      const [q1, q2] = [await openPage(browser, A.origin, page), await openPage(browser, B.origin, page)];
      const d = await measure(q1, q2, t, state);
      await q1.close(); await q2.close();
      if (d === 'skip' || !isReal(d, state)) return false;
    }
    return true;
  };

  const probe = async (p1, p2, t, state) => {
    const d = await measure(p1, p2, t, state);
    if (d === 'skip') return 'skip';
    if (d.domSetAside) domSetAside++;
    if (!isReal(d, state)) return 'same';
    if (!(await reproduces(t, state))) { unconfirmed++; if (opts.explain) EXPLAIN.push(['unconfirmed', state, t.path, d.dom?.[0] ?? { pixels: `${d.differing}px Δ${d.maxDelta}` }]); return 'same'; }
    return { ...t, state, ...d, seen: CONFIRM + 1 };
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
            return { findings, compared, skipped, unconfirmed, domSetAside, targetCount, truncated: true };
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
          return { findings, compared, skipped, unconfirmed, domSetAside, targetCount, truncated: true };
        }
      }
    }
  }
  A.server.close(); B.server.close();
  return { findings, compared, skipped, unconfirmed, domSetAside, targetCount, truncated: false };
}

/**
 * The verdict for one page, kept as a pure function so the self-test can reach
 * it without a git ref or a browser. `nothing-compared` exists because the two
 * honest outcomes are not "clean" and "differences": a run that drove no element
 * into any state has produced no evidence, and saying so in the same green
 * sentence used for a clean page is how a comparer that stopped comparing goes
 * unnoticed.
 */
function verdictFor(compared, findings) {
  if (!compared) return 'nothing-compared';
  return findings.length ? 'differences' : 'clean';
}

/* ── self-test — a harness that cannot fail is not evidence ──────────────── */

async function selfTest(browser, cmp) {
  const dir = join(TMP, 'state-diff-selftest');
  const mk = (file, css, demo = '<div><button class="btn">Press</button></div>', script = '') => writeFileSync(join(dir, file), `<!doctype html><html><head><style>
    body { margin: 0; padding: 20px; background: #fff; font: 14px monospace; }
    .btn { display: inline-block; padding: 8px 16px; border: 2px solid #888; border-radius: 6px; background: #eee; }
    ${css}
  </style></head><body>
    <!-- demo:probe -->
    ${demo}
    <!-- /demo:probe -->
    <script>${script}</script>
  </body></html>`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const cases = [
    { name: 'identical pages report no difference', css: '.btn:hover { background: #cfe; }', expect: 0 },
    { name: 'a hover-only difference is caught', css: '.btn:hover { background: #f00; }', expect: 1 },
    { name: 'a focus-only difference is caught', css: '.btn:hover { background: #cfe; } .btn:focus-visible { outline: 3px solid #f0f; }', expect: 1 },
  ];

  let failed = 0;

  /**
   * The verdict rule, checked without a browser. The middle case is the one
   * that matters: it is the shape `state-diff badge` printed under a green tick
   * until 2026-08-12 — nothing compared, reported as though the page had been
   * cleared. A refusal case is what makes the other two mean anything.
   */
  for (const [name, compared, findings, want] of [
    ['0 compared is refused, not called a pass', 0, [], 'nothing-compared'],
    ['0 compared is refused even with 0 findings', 0, [], 'nothing-compared'],
    ['a page with probes and no findings is clean', 12, [], 'clean'],
    ['a page with a finding reports differences', 12, [{}], 'differences'],
  ]) {
    const got = verdictFor(compared, findings);
    const pass = got === want;
    console.log(`  ${pass ? green('✔') : red('✖')}  ${name} ${dim(`(${got})`)}`);
    if (!pass) failed++;
  }

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
  /**
   * Findings now have to reproduce on fresh loads before they are reported,
   * which is only safe if a REAL difference survives being looked at again.
   * This drives the same genuine hover change three times, on new page loads
   * each time, and demands three sightings out of three. A suppressor tuned
   * until the noise went away would fail here, which is the point: the
   * repetition rule has to be able to cost something.
   */
  {
    mk('a.html', '.btn:hover { background: #cfe; }');
    mk('b.html', '.btn:hover { background: #f00; }');
    const { origin, server } = await serve(dir);
    let seen = 0;
    for (let i = 0; i < 3; i++) {
      const [p1, p2] = [await openPage(browser, origin, 'a.html'), await openPage(browser, origin, 'b.html')];
      const path = (await p1.evaluate(() => window.__targets))[0].path;
      if ((await applyState(p1, path, 'hover')) && (await applyState(p2, path, 'hover'))) {
        const [s1, s2] = [await shot(p1, path), await shot(p2, path)];
        if (s1 && s2 && (await cmp.diff(s1, s2)).differing > 0) seen++;
      }
      await p1.close(); await p2.close();
    }
    server.close();
    const pass = seen === 3;
    console.log(`  ${pass ? green('✔') : red('✖')}  a real difference reproduces on every fresh load ${dim(`(${seen}/3)`)}`);
    if (!pass) failed++;
  }

  /**
   * The reaction channel — note 8. A disclosure whose script stops toggling
   * `aria-expanded` and the panel paints NOTHING different (the panel stays
   * hidden both ways; only the state a screen reader hears moves), so the
   * pixel half is asserted identical on the broken pair: if this row passes,
   * it passed on the reaction alone. The refusal row beside it gives the same
   * script to both sides and must find nothing.
   */
  {
    const demo = '<div><button class="btn" aria-expanded="false">Menu</button></div>';
    const works = "document.querySelector('.btn').addEventListener('click', (e) => e.currentTarget.setAttribute('aria-expanded', 'true'));";
    const broken = "document.querySelector('.btn').addEventListener('click', () => {});";
    for (const [name, bScript, want] of [
      ['a reaction-only difference is caught with identical pixels', broken, 'caught'],
      ['identical reactions report nothing', works, 'clean'],
    ]) {
      mk('a.html', '', demo, works);
      mk('b.html', '', demo, bScript);
      const { origin, server } = await serve(dir);
      const [p1, p2] = [await openPage(browser, origin, 'a.html'), await openPage(browser, origin, 'b.html')];
      const path = (await p1.evaluate(() => window.__targets))[0].path;
      const pre = [await settledDom(p1), await settledDom(p2)];
      const ok = (await applyState(p1, path, 'click')) && (await applyState(p2, path, 'click'));
      const post = [await reactionOf(p1, 'click'), await reactionOf(p2, 'click')];
      const mismatch = ok ? reactionMismatch(domDelta(pre[0], post[0]), domDelta(pre[1], post[1])) : [];
      const pixels = ok ? (await cmp.diff(await shot(p1, path), await shot(p2, path))).differing : -1;
      await p1.close(); await p2.close(); server.close();
      const got = mismatch.length ? 'caught' : 'clean';
      const pass = ok && got === want && pixels === 0;
      console.log(`  ${pass ? green('✔') : red('✖')}  ${name} ${dim(`(${mismatch.length} element(s) reacted differently, ${pixels} px differed)`)}`);
      if (!pass) failed++;
    }
  }

  /**
   * Transitions off — the render half (openPage fails the run on the plumbing
   * half). A box with a 2s height transition is clicked open; two frames later
   * it must already be at its end height. Before 2026-11-05 the motion-off style
   * never reached the page and this read ~20px of the 200: every shot of every
   * state had been racing whatever the component animated.
   */
  {
    mk('a.html', '.box { height: 20px; overflow: hidden; background: #ccc; transition: height 2s linear; } .box.big { height: 200px; }',
      '<div><button class="btn" onclick="document.querySelector(\'.box\').classList.toggle(\'big\')">Grow</button><div class="box"></div></div>');
    const { origin, server } = await serve(dir);
    const p = await openPage(browser, origin, 'a.html');
    const path = (await p.evaluate(() => window.__targets))[0].path;
    await applyState(p, path, 'click');
    await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const h = await p.evaluate(() => Math.round(document.querySelector('.box').getBoundingClientRect().height));
    await p.close(); server.close();
    const pass = h === 200;
    console.log(`  ${pass ? green('✔') : red('✖')}  transitions are off: a 2s height transition is at its end two frames after the click ${dim(`(${h}px of 200)`)}`);
    if (!pass) failed++;
  }

  /**
   * The network. Two rows, because the property has two halves and one of them
   * cannot fail on a machine with a fast connection: (1) clicking a link to
   * another host leaves the page where it was and asks the network for nothing;
   * (2) the guard is really installed — an external <img> is caught by it. Row 2
   * is the plumbing check: without it, row 1 also passes if the guard is gone and
   * the navigation merely happened to be cancelled.
   */
  {
    mk('a.html', '', '<div><a class="btn" href="https://example.com/">Away</a></div>');
    const { origin, server } = await serve(dir);
    const p = await openPage(browser, origin, 'a.html');
    const path = (await p.evaluate(() => window.__targets))[0].path;
    await applyState(p, path, 'click');
    await p.waitForTimeout(300);
    const stayed = p.url() === `${origin}/a.html`;
    const asked = p.__escapes.length;
    await p.close();
    const pass = stayed && asked === 0;
    console.log(`  ${pass ? green('✔') : red('✖')}  clicking an off-site link stays on the page and asks the network for nothing ${dim(`(url ${stayed ? 'unchanged' : 'CHANGED'}, ${asked} request(s) out)`)}`);
    if (!pass) failed++;

    mk('b.html', '', '<div><img alt="" src="https://example.com/x.png"><button class="btn">Press</button></div>');
    const q = await openPage(browser, origin, 'b.html');
    const caught = q.__escapes.length;
    await q.close(); server.close();
    const pass2 = caught > 0;
    console.log(`  ${pass2 ? green('✔') : red('✖')}  the offline guard is installed: an off-site image is aborted ${dim(`(${caught} caught)`)}`);
    if (!pass2) failed++;
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
async function runPage(page) {
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
    for (const k of f2.domUnstable) floor.domUnstable.add(k);
  }
  const floorLine = [...floor.per.entries()]
    .map(([st, f]) => `${st} Δ${f.maxDelta}/${f.maxPct.toFixed(1)}%`)
    .join('  ');
  console.log(dim(`  noise floor from ${floor.probes} self-comparisons — ${floorLine}`));
  if (floor.worst) console.log(dim(`  worst self-comparison: ${floor.worst.state} on ${floor.worst.path.split(" > ").slice(-2).join(" > ")}`));
  const { findings, compared, skipped, unconfirmed, domSetAside, targetCount, truncated } = await comparePage(browser, cmp, refDocs, page, floor);
  report.push({ page, findings, compared, skipped, unconfirmed });
  /**
   * "0 element states identical" is not a pass — it is the harness saying it
   * compared nothing, in the words it uses for good news. This repo has the
   * failure on record twice already, once from a probe that reported exactly
   * that while measuring nothing at all, and `state-diff badge` printed it under
   * a green tick until 2026-08-12. A comparer that found nothing to compare has
   * not cleared the tree; it has failed to look at it.
   */
  if (verdictFor(compared, findings) === 'nothing-compared') {
    bad++;
    console.log(red('  ✖  nothing was compared') + dim(` (${skipped} state(s) not applicable)`));
    console.log(dim(targetCount
      ? `     ${targetCount} element(s) were found but none could be driven into any of: ${STATES.join(', ')}.`
      : '     its demo regions contain no interactive element (a, button, input, select,'));
    if (!targetCount) console.log(dim('     textarea, summary, label, [tabindex]). A component with no states is settled'));
    if (!targetCount) console.log(dim('     by a screenshot — use `npm run preview` — not by this harness.'));
    return;
  }
  /* Printed, not hidden: a probe excused from the DOM question is a probe whose
     behaviour this run did not check, and a count of zero is the claim that
     every reaction was. */
  if (opts.explain) {
    for (const [kind, st, path, m] of EXPLAIN.splice(0)) {
      console.log(dim(`  ${kind.padEnd(11)} ${st.padEnd(5)} ${path.split(' > ').slice(-3).join(' > ')}`));
      console.log(dim(`              ${m.path ? `${m.path.split(' > ').slice(-2).join(' > ')}: ${m.a}  ≠  ${m.b}` : m.pixels}`));
    }
  }
  const aside = domSetAside ? dim(`, ${domSetAside} reaction(s) not compared — unstable on the reference itself`) : '';
  if (!findings.length) {
    console.log(green(`  ✔  ${compared} element states identical, pixels and reaction`) + dim(` (${skipped} not applicable)`)
      + (unconfirmed ? dim(`, ${unconfirmed} candidate(s) did not reproduce`) : '') + aside);
    return;
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
    /* A reaction finding is about ONE element, so it is never collapsed into a
       page-level pixel reading that happens to share its numbers. */
    const key = f.dom ? `dom|${f.state}|${f.path}` : [f.state, f.differing, f.maxDelta, f.sizeMismatch ?? ""].join("|");
    const cur = seen.get(key);
    if (cur) cur.also++;
    else seen.set(key, { ...f, also: 0 });
  }
  const shown = [...seen.values()];
  console.log(red(`  ✖  ${shown.length} difference(s) across ${findings.length} element state(s)`) + dim(` of ${compared} compared`));
  for (const f of shown) {
    const where = f.sizeMismatch
      ? `size ${f.sizeMismatch}`
      : f.dom
        ? `reacted differently on ${f.dom.length} element(s)` + (f.differing ? `; pixels ${f.differing} px, max Δ${f.maxDelta}` : '; pixels identical')
        : `${f.differing} px (${f.pct.toFixed(2)}%), max Δ${f.maxDelta}, at ${f.box.x},${f.box.y} ${f.box.w}x${f.box.h}`;
    console.log(`     ${f.state.padEnd(6)} ${dim(f.region)} ${f.tag}  ${where}`);
    console.log(dim(`            ${f.path}${f.also ? ` (and ${f.also} more element(s) in this state)` : ""}`));
    for (const m of (f.dom ?? []).slice(0, 4)) {
      console.log(dim(`              ${m.path.split(' > ').slice(-2).join(' > ')}`));
      console.log(dim(`                ${opts.ref}: ${m.a}`));
      console.log(dim(`                tree: ${m.b}`));
    }
  }
  if (truncated) console.log(dim(`     … stopped at --max ${opts.max}`));
}

/**
 * One page that throws must not take the run down with it. Until 2026-11-06 an
 * exception anywhere in a page — twice a screenshot TimeoutError, both times the
 * Mac asleep — ended the process with a stack trace: no row for the page, no
 * row for the pages after it, the reference worktree left behind, and an exit
 * code that came from Node rather than from this harness. It is reported as an
 * ERROR, never as a verdict: the page was not compared, so it neither passed nor
 * differed, and the run fails.
 */
for (const page of pages) {
  try {
    await runPage(page);
  } catch (err) {
    bad++;
    EXPLAIN.splice(0);
    const first = String(err?.message ?? err).split('\n')[0];
    report.push({ page, error: `${err?.name ?? 'Error'}: ${first}` });
    console.log(red(`  ✖  error — this page was NOT compared`) + dim(` (${err?.name ?? 'Error'}: ${first})`));
    if (err?.name === 'TimeoutError') console.log(dim('     A browser timeout here has so far always been the machine asleep, not the code —\n     check `pmset -g log | grep -E "Sleep|Wake"` for the run\'s window before debugging.'));
  }
}

/* Guarded for the same reason: after an error the browser may be the thing that
   died, and a throw here would skip removing the reference worktree. */
try { await cmp.close(); await browser.close(); } catch { /* reported above */ }
rmSync(WORKTREE, { recursive: true, force: true });
try { execFileSync('git', ['worktree', 'prune'], { cwd: ROOT, stdio: 'pipe' }); } catch { /* fine */ }

/* A run that reached the network measured something this machine does not
   own. The guard aborted it, so the shot was of our page — but the attempt is
   a hole in what this harness controls, and it fails the run naming the host. */
const leaks = escaped();
if (leaks.length) {
  bad++;
  const hosts = new Map();
  for (const u of leaks) { const h = (() => { try { return new URL(u).host; } catch { return u; } })(); hosts.set(h, (hosts.get(h) ?? 0) + 1); }
  console.log(red(`\n✖  ${leaks.length} request(s) tried to leave the machine and were aborted:`));
  for (const [h, n] of hosts) console.log(dim(`     ${h} ×${n}`));
}

if (opts.json) console.log(JSON.stringify(report, null, 2));
console.log();
process.exit(bad ? 1 : 0);

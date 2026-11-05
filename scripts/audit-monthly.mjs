#!/usr/bin/env node
/**
 * audit:monthly — what has DECAYED across the whole system, not what one commit
 * broke.
 *
 * The per-commit gates ask "did this change break something". Nothing asked the
 * other question until Ball's first monthly audit, 2026-11-05, which was done by
 * hand and found, among others: a critical advisory in a lockfile three gates
 * had passed over; `node_modules` holding astro 7.2.3 while the lock said 7.1.6;
 * `wide` red since the day VideoThumbnail shipped, because nothing runs it; a
 * harness sending 122 requests off the machine; and, in the skills room, a radar
 * that would have answered "move to nothing" in a year. This is the repeatable
 * half of that pass. The half that is not repeatable — reading what a finding
 * means, ruling on it — stays with a person.
 *
 * What it runs, in order:
 *   gates      npm run check
 *   harnesses  every non-gated instrument, its --self-test FIRST: overflow,
 *              audit (preview), wide, layout, figma-size; state-diff's
 *              self-test only — `--ref` compares against a ref and is
 *              vacuous on a direct-to-main repo (see CLAUDE.md)
 *   deps       npm audit; in-range updates the lockfile has not taken;
 *              node_modules disagreeing with the lockfile; majors (noted)
 *   skills     the skills room's radar (--gates --versions --audit
 *              --fail-on-drift), the same radar a year ahead (DRIFT_TODAY),
 *              and the ~/.claude/skills wiring
 *   github     open issues, open PRs (with their age) and the last CI
 *              conclusion per workflow on main,
 *              both repos
 *
 * Every row is decided by EXIT CODE, never by grepping output (CLAUDE.md, "Verify
 * with the exit code"). A row is `ok`, a `finding` (the instrument ran and said
 * no), or an `error` (the instrument did not answer: timeout, signal, missing
 * binary, output that would not parse). `error` is never folded into `ok` — an
 * instrument that has stopped answering reads exactly like good news otherwise.
 *
 * Each run writes .audit/monthly-<date>.json (gitignored: it is this machine's
 * record) and compares itself with the newest earlier one: NEW, RESOLVED, STILL
 * OPEN. Finding ids are stable keys (`deps:advisory:astro`, `harness:wide`), so
 * that comparison is a set difference and not a reading of prose.
 *
 *   node scripts/audit-monthly.mjs                  the full pass (tens of minutes)
 *   node scripts/audit-monthly.mjs --skip-browser   everything but the harnesses
 *   node scripts/audit-monthly.mjs --self-test      prove the classifier can fail
 *
 * Exits 1 when anything is a finding or an error, 0 only on a clean pass.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync, lstatSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS_REPO = join(homedir(), 'Projects/test-build-skills');
const LIVE_SKILLS = join(homedir(), '.claude/skills');
const REPOS = { ds: 'duangsamonpd-ball/my-guide-irondesign', skills: 'duangsamonpd-ball/full-stack-design-skills-iron' };
const OUT_DIR = join(ROOT, '.audit');

const red = (s) => `\x1b[31m${s}\x1b[0m`, green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`, dim = (s) => `\x1b[90m${s}\x1b[0m`;
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
const tail = (s, n = 3) => strip(s).split('\n').map((l) => l.trim()).filter(Boolean).slice(-n).join(' ⏎ ');

/* ── running a command ────────────────────────────────────────────────────── */

/** Runs a command and classifies it by how it ENDED. Pure function of the result. */
export function classify(r, { timeoutMs } = {}) {
  if (r.error?.code === 'ENOENT') return { status: 'error', why: `not found: ${r.error.path ?? 'command'}` };
  if (r.error?.code === 'ETIMEDOUT' || (r.signal === 'SIGTERM' && timeoutMs)) return { status: 'error', why: `no answer within ${Math.round(timeoutMs / 1000)}s` };
  if (r.error) return { status: 'error', why: r.error.message };
  if (r.signal) return { status: 'error', why: `killed by ${r.signal}` };
  if (r.status === 0) return { status: 'ok', why: '' };
  return { status: 'finding', why: `exit ${r.status}` };
}

function run(cmd, args, { cwd = ROOT, timeoutMs = 20 * 60_000, env = {} } = {}) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 1 << 28, env: { ...process.env, ...env } });
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  return { ...classify(r, { timeoutMs }), out, code: r.status };
}

/* ── the report ───────────────────────────────────────────────────────────── */

const rows = [];
function row(group, id, status, label, detail = '') {
  rows.push({ group, id, status, label, detail });
  const mark = status === 'ok' ? green('✔') : status === 'finding' ? red('✖') : status === 'note' ? dim('·') : yellow('?');
  console.log(`  ${mark} ${label}${detail ? dim(`  ${detail}`) : ''}`);
}

/** A command as one row: ok / finding / error, with the tail of its output on anything but ok. */
function commandRow(group, id, label, cmd, args, opts, why = tail) {
  const r = run(cmd, args, opts);
  row(group, id, r.status, label, r.status === 'ok' ? '' : `${r.why} — ${why(r.out)}`);
  return r;
}

/** The radar's own warning lines, for the DETAIL only — the verdict is still its exit code. */
const warnings = (out) => strip(out).split('\n').filter((l) => /[⚠✗]/.test(l)).map((l) => l.trim()).slice(0, 3).join(' ⏎ ') || tail(out);

/* ── parsers, exported for the self-test ──────────────────────────────────── */

/** `npm audit --json` → one finding per vulnerable package. Throws on output that is not an audit. */
export function auditFindings(json) {
  const j = JSON.parse(json);
  if (!j || typeof j !== 'object' || !('vulnerabilities' in j)) throw new Error('not npm audit output');
  return Object.entries(j.vulnerabilities).map(([name, v]) => ({
    id: `deps:advisory:${name}`,
    label: `${name} — ${v.severity}${v.isDirect ? ' (direct)' : ''}`,
    detail: v.fixAvailable === false ? 'no fix available' : v.fixAvailable === true ? 'npm audit fix' : `fix needs ${v.fixAvailable?.name}@${v.fixAvailable?.version}`,
  }));
}

/** `npm outdated --json` → in-range updates (findings) and new majors (notes). Empty output means nothing outdated. */
export function outdatedRows(json) {
  const j = json.trim() ? JSON.parse(json) : {};
  const out = [];
  for (const [name, v0] of Object.entries(j)) {
    for (const v of Array.isArray(v0) ? v0 : [v0]) {
      if (!v.current) continue;
      if (v.wanted && v.wanted !== v.current) out.push({ status: 'finding', id: `deps:in-range:${name}`, label: `${name} ${v.current} → ${v.wanted} is in range and not taken` });
      const maj = (s) => +String(s).split('.')[0];
      if (v.latest && maj(v.latest) > maj(v.current)) out.push({ status: 'note', id: `deps:major:${name}`, label: `${name} ${v.current} — major ${v.latest} exists (a decision, not a defect)` });
    }
  }
  return out;
}

/** Direct dependencies whose installed version is not the one the lockfile pins. */
export function installedDrift(pkg, lock, installedVersion) {
  const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  const out = [];
  for (const name of names) {
    const locked = lock.packages?.[`node_modules/${name}`]?.version;
    if (!locked) continue;                       // workspace link or not hoisted
    const have = installedVersion(name);
    if (have !== locked) out.push({ id: `deps:installed:${name}`, label: `${name}: node_modules has ${have ?? 'nothing'}, the lockfile pins ${locked}` });
  }
  return out;
}

/** New / resolved / still open, by finding id. */
export function compare(prevIds, nowIds) {
  const p = new Set(prevIds), n = new Set(nowIds);
  return { added: [...n].filter((x) => !p.has(x)), resolved: [...p].filter((x) => !n.has(x)), still: [...n].filter((x) => p.has(x)) };
}

/* ── self-test ────────────────────────────────────────────────────────────── */

if (process.argv.includes('--self-test')) {
  let bad = 0;
  const expect = (label, got, want) => {
    const ok = got === want;
    if (!ok) bad++;
    console.log(`  ${ok ? green('✔') : red('✖')} ${label}${ok ? '' : red(`  got ${got}, want ${want}`)}`);
  };
  console.log('\naudit:monthly self-test — every way an instrument can end must be told apart\n');
  const node = process.execPath;
  expect('a clean exit is ok', run(node, ['-e', 'process.exit(0)']).status, 'ok');
  expect('exit 1 is a finding', run(node, ['-e', 'process.exit(1)']).status, 'finding');
  expect('a CRASH (uncaught throw, no marker printed) is never ok', run(node, ['-e', 'throw new Error("boom")']).status, 'finding');
  expect('a hang is an error, not a pass', run(node, ['-e', 'setTimeout(()=>{}, 60000)'], { timeoutMs: 800 }).status, 'error');
  expect('a missing binary is an error', run('definitely-not-a-binary-xyz', []).status, 'error');
  expect('a signal is an error', run(node, ['-e', 'process.kill(process.pid, "SIGKILL")']).status, 'error');

  const planted = JSON.stringify({ vulnerabilities: { astro: { severity: 'critical', isDirect: true, fixAvailable: true } } });
  expect('an advisory becomes a finding row', auditFindings(planted).length, 1);
  expect('a clean audit yields no rows', auditFindings('{"vulnerabilities":{}}').length, 0);
  let threw = false; try { auditFindings('{"error":{"code":"ENOTFOUND"}}'); } catch { threw = true; }
  expect('npm audit failing to reach the registry is NOT read as clean', threw, true);

  const od = outdatedRows(JSON.stringify({ tailwindcss: { current: '4.3.3', wanted: '4.3.4', latest: '4.3.4' }, typescript: { current: '6.0.3', wanted: '6.0.3', latest: '7.0.2' } }));
  expect('an in-range update is a finding', od.filter((r) => r.status === 'finding').length, 1);
  expect('a new major is a note, not a finding', od.filter((r) => r.status === 'note').length, 1);
  expect('nothing outdated (empty output) yields no rows', outdatedRows('').length, 0);

  const drift = installedDrift({ devDependencies: { astro: '^7', x: '^1' } }, { packages: { 'node_modules/astro': { version: '7.1.6' }, 'node_modules/x': { version: '1.0.0' } } }, (n) => ({ astro: '7.2.3', x: '1.0.0' })[n]);
  expect('node_modules disagreeing with the lockfile is caught (astro 7.2.3 vs 7.1.6, round 1)', drift.map((d) => d.id).join(), 'deps:installed:astro');

  const c = compare(['a', 'b'], ['b', 'c']);
  expect('compare: new / resolved / still', `${c.added}|${c.resolved}|${c.still}`, 'c|a|b');

  console.log(bad ? red(`\nSELF-TEST FAILED (${bad})\n`) : green(`\nSELF-TEST PASSED — ok, finding and error are told apart, and every parser refuses what it cannot read\n`));
  process.exit(bad ? 1 : 0);
}

/* ── the pass ─────────────────────────────────────────────────────────────── */

const SKIP_BROWSER = process.argv.includes('--skip-browser');
const started = new Date();
const today = started.toISOString().slice(0, 10);
console.log(`\naudit:monthly — ${today}${SKIP_BROWSER ? dim('  (--skip-browser)') : ''}\n`);

console.log('gates');
commandRow('gates', 'gates:check', 'npm run check', 'npm', ['run', 'check']);

console.log('\nharnesses — each self-test first; a red self-test voids its run');
if (SKIP_BROWSER) {
  row('harnesses', 'harness:skipped', 'note', 'skipped by --skip-browser');
} else {
  const HARNESSES = [
    ['overflow', 'overflow:self-test', 'overflow'],
    ['audit', 'preview:self-test', 'audit'],
    ['wide', 'wide:self-test', 'wide'],
    ['layout', 'layout:self-test', 'layout'],
    ['figma-size', 'figma-size:self-test', 'figma-size'],
    ['state-diff', 'state-diff:self-test', null],
  ];
  for (const [name, selfTest, real] of HARNESSES) {
    const st = commandRow('harnesses', `harness:${name}:self-test`, `${name} --self-test`, 'npm', ['run', selfTest]);
    if (!real) continue;
    if (st.status !== 'ok') { row('harnesses', `harness:${name}`, 'error', name, 'not run — its self-test did not pass, so its answer would mean nothing'); continue; }
    commandRow('harnesses', `harness:${name}`, `npm run ${real}`, 'npm', ['run', real]);
  }
}

console.log('\ndeps');
{
  const a = run('npm', ['audit', '--json'], { timeoutMs: 120_000 });
  try {
    const f = auditFindings(a.out.slice(a.out.indexOf('{')));
    if (!f.length) row('deps', 'deps:advisory', 'ok', 'npm audit: no advisories');
    for (const x of f) row('deps', x.id, 'finding', `advisory: ${x.label}`, x.detail);
  } catch (e) { row('deps', 'deps:advisory', 'error', 'npm audit did not answer', `${e.message} — ${tail(a.out)}`); }

  const o = run('npm', ['outdated', '--json'], { timeoutMs: 120_000 });
  try {
    const rs = outdatedRows(o.out.includes('{') ? o.out.slice(o.out.indexOf('{')) : '');
    if (!rs.some((r) => r.status === 'finding')) row('deps', 'deps:in-range', 'ok', 'every in-range update is taken');
    for (const r of rs) row('deps', r.id, r.status, r.label);
  } catch (e) { row('deps', 'deps:outdated', 'error', 'npm outdated did not answer', `${e.message} — ${tail(o.out)}`); }

  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8'));
  const installed = (n) => { try { return JSON.parse(readFileSync(join(ROOT, 'node_modules', n, 'package.json'), 'utf8')).version; } catch { return null; } };
  const d = installedDrift(pkg, lock, installed);
  if (!d.length) row('deps', 'deps:installed', 'ok', 'node_modules matches the lockfile for every direct dependency');
  for (const x of d) row('deps', x.id, 'finding', x.label, 'npm ci');
}

console.log('\nskills room');
if (!existsSync(join(SKILLS_REPO, 'scripts/check-drift.mjs'))) {
  row('skills', 'skills:repo', 'error', `no skills repo at ${SKILLS_REPO}`);
} else {
  commandRow('skills', 'skills:radar', 'check-drift --gates --versions --audit --fail-on-drift', 'node', ['scripts/check-drift.mjs', '--gates', '--versions', '--audit', '--fail-on-drift'], { cwd: SKILLS_REPO }, warnings);
  // The radar a year from now. Round 1 found it would answer "move to nothing"
  // once Node 27 became LTS — a date-dependent bug only a future date shows.
  const ahead = new Date(started.getTime() + 365 * 864e5).toISOString().slice(0, 10);
  const f = run('node', ['scripts/check-drift.mjs', '--versions'], { cwd: SKILLS_REPO, env: { DRIFT_TODAY: ahead }, timeoutMs: 120_000 });
  const nodeBlock = strip(f.out).split('\n\n').find((b) => b.startsWith('node')) ?? '';
  if (f.status === 'error' || !nodeBlock) row('skills', 'skills:radar-ahead', 'error', `radar at ${ahead} did not answer`, tail(f.out));
  else if (/move to nothing —/.test(nodeBlock)) row('skills', 'skills:radar-ahead', 'finding', `radar at ${ahead} has no Node to name`, tail(nodeBlock, 2));
  else row('skills', 'skills:radar-ahead', 'ok', `radar at ${ahead} still names a target`, dim(tail(nodeBlock, 1)));

  // Wiring: every repo skill is a symlink into the repo, no copy of one sits
  // anywhere else under ~/.claude/skills, and the plugin is not loading a third.
  const repoSkills = readdirSync(join(SKILLS_REPO, 'skills'), { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name);
  const bad = [];
  for (const n of repoSkills) {
    const p = join(LIVE_SKILLS, n);
    let ok = false;
    try { ok = lstatSync(p).isSymbolicLink() && realpathSync(p).startsWith(realpathSync(join(SKILLS_REPO, 'skills'))); } catch {}
    if (!ok) bad.push(n);
  }
  row('skills', 'skills:wiring', bad.length ? 'finding' : 'ok', bad.length ? `${bad.length} repo skill(s) not linked from ~/.claude/skills` : `all ${repoSkills.length} repo skills are symlinks into the repo`, bad.join(', '));

  const copies = [];
  for (const e of existsSync(LIVE_SKILLS) ? readdirSync(LIVE_SKILLS, { withFileTypes: true }) : []) {
    if (!e.isDirectory() || e.isSymbolicLink()) continue;
    const walk = (d, depth) => { for (const c of readdirSync(d, { withFileTypes: true })) { if (!c.isDirectory()) continue; if (repoSkills.includes(c.name)) copies.push(join(d, c.name).replace(homedir(), '~')); else if (depth < 2) walk(join(d, c.name), depth + 1); } };
    walk(join(LIVE_SKILLS, e.name), 0);
  }
  row('skills', 'skills:copies', copies.length ? 'finding' : 'ok', copies.length ? `${copies.length} stale cop${copies.length > 1 ? 'ies' : 'y'} of repo skills load beside the symlinks` : 'no copy of a repo skill outside the repo', copies.length ? `e.g. ${copies[0]} — remove on claude.ai, not locally` : '');

  let pluginOn = false;
  try { pluginOn = JSON.parse(readFileSync(join(homedir(), '.claude/settings.json'), 'utf8')).enabledPlugins?.['figma-astro@figma-astro'] === true; } catch {}
  row('skills', 'skills:plugin', pluginOn ? 'finding' : 'ok', pluginOn ? 'figma-astro plugin is enabled — its cached skills load beside the symlinks' : 'figma-astro plugin is off (the symlinks are the one copy)');
}

console.log('\ngithub');
for (const [key, repo] of Object.entries(REPOS)) {
  const i = run('gh', ['issue', 'list', '-R', repo, '--state', 'open', '--json', 'number,title'], { timeoutMs: 60_000 });
  if (i.status !== 'ok') row('github', `gh:${key}:issues`, 'error', `${repo}: issues did not answer`, tail(i.out));
  else {
    const list = JSON.parse(i.out || '[]');
    if (!list.length) row('github', `gh:${key}:issues`, 'ok', `${repo}: no open issues`);
    for (const x of list) row('github', `gh:${key}#${x.number}`, 'finding', `${repo}#${x.number} open — ${x.title}`);
  }
  // A PR waits on a person and nothing reminds anyone: #11 sat six weeks
  // unreviewed before round 1 found it.
  const pr = run('gh', ['pr', 'list', '-R', repo, '--state', 'open', '--json', 'number,title,author,createdAt'], { timeoutMs: 60_000 });
  if (pr.status !== 'ok') row('github', `gh:${key}:prs`, 'error', `${repo}: PRs did not answer`, tail(pr.out));
  else {
    const list = JSON.parse(pr.out || '[]');
    if (!list.length) row('github', `gh:${key}:prs`, 'ok', `${repo}: no open PRs`);
    for (const x of list) {
      const days = Math.floor((started - new Date(x.createdAt)) / 864e5);
      row('github', `gh:${key}:pr#${x.number}`, 'finding', `${repo} PR #${x.number} open ${days} days (${x.author?.login}) — ${x.title}`);
    }
  }
  const r = run('gh', ['run', 'list', '-R', repo, '--branch', 'main', '--limit', '30', '--json', 'workflowName,conclusion,status,headSha'], { timeoutMs: 60_000 });
  if (r.status !== 'ok') { row('github', `gh:${key}:ci`, 'error', `${repo}: CI did not answer`, tail(r.out)); continue; }
  const latest = new Map();
  for (const x of JSON.parse(r.out || '[]')) if (x.status === 'completed' && !latest.has(x.workflowName)) latest.set(x.workflowName, x);
  if (!latest.size) row('github', `gh:${key}:ci`, 'error', `${repo}: no completed run on main to read`);
  for (const [wf, x] of latest) row('github', `gh:${key}:ci:${wf}`, x.conclusion === 'success' ? 'ok' : 'finding', `${repo} · ${wf}: ${x.conclusion}`, x.headSha.slice(0, 7));
}

/* ── record, compare, exit ────────────────────────────────────────────────── */

const open = rows.filter((r) => r.status === 'finding' || r.status === 'error');
mkdirSync(OUT_DIR, { recursive: true });
const earlier = readdirSync(OUT_DIR).filter((f) => /^monthly-\d{4}-\d{2}-\d{2}\.json$/.test(f) && f < `monthly-${today}.json`).sort();
writeFileSync(join(OUT_DIR, `monthly-${today}.json`), JSON.stringify({ date: today, at: started.toISOString(), skipBrowser: SKIP_BROWSER, rows }, null, 2) + '\n');

console.log('');
if (earlier.length) {
  const prev = JSON.parse(readFileSync(join(OUT_DIR, earlier.at(-1)), 'utf8'));
  const prevOpen = prev.rows.filter((r) => r.status === 'finding' || r.status === 'error').map((r) => r.id);
  const c = compare(prevOpen, open.map((r) => r.id));
  console.log(`since ${prev.date}: ${red(`${c.added.length} new`)} · ${green(`${c.resolved.length} resolved`)} · ${c.still.length} still open`);
  for (const id of c.added) console.log(`  ${red('+')} ${id}`);
  for (const id of c.resolved) console.log(`  ${green('-')} ${id}`);
} else {
  console.log(dim('no earlier .audit/monthly-*.json — this run is the baseline next month compares with'));
}

const findings = rows.filter((r) => r.status === 'finding').length, errors = rows.filter((r) => r.status === 'error').length;
const mins = ((Date.now() - started) / 60000).toFixed(1);
console.log(open.length
  ? red(`\n✖  ${findings} finding(s), ${errors} instrument(s) that did not answer — ${rows.length} rows in ${mins} min\n`)
  : green(`\n✔  nothing has decayed — ${rows.length} rows in ${mins} min\n`));
console.log(dim(`   written to .audit/monthly-${today}.json\n`));
process.exit(open.length ? 1 : 0);

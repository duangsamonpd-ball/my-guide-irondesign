/**
 * Iron Software Design System — one reader for a CSS dimension
 *
 * Lives here because two gates need the same answer and a second copy would be
 * the thing this repo keeps getting bitten by. `check:tokens` compares a token
 * across three layers; `check:specimens` compares a hand-written inline style
 * against the token it documents. Both must read `48px`, `3rem`, a bare `24`,
 * and — since 2026-09-01, when h1 and h1-hero went fluid — a `clamp()` whose
 * middle term is a sum of a rem and a vw.
 *
 * Everything returns a canonical STRING or null. Null means unreadable, and a
 * caller must treat that as a refusal rather than as agreement: two values this
 * module cannot read are not thereby equal. That is the `null !== null` shape
 * that let a clamp in the source of truth pass against a completely different
 * clamp in both consumable layers, reported as "No drift", on 2026-09-01.
 */

const REM = 16;

const LENGTH = /^(-?[\d.]+)([a-z%]*)$/i;

/** One term. Returns `{ n, unit }` in canonical units, or null if unreadable. */
export function term(v) {
  const m = String(v).trim().match(LENGTH);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (Number.isNaN(n)) return null;
  const unit = m[2].toLowerCase();
  if (unit === '' || unit === 'px') return { n, unit: '' };
  if (unit === 'rem') return { n: n * REM, unit: '' };
  return { n, unit };
}

/**
 * A length, or a SUM of lengths — `1.8143rem + 0.7619vw`, which is how the
 * middle term of a fluid size is written and therefore a shape this gate meets
 * the moment anything goes fluid. CSS requires whitespace around the operator
 * inside a math expression, which is what makes this splittable without a
 * parser and what keeps a leading `-0.8px` a single negative term rather than a
 * subtraction.
 *
 * Terms are canonicalised and SORTED, because addition is commutative and
 * `1.8143rem + 0.7619vw` and `0.7619vw + 1.8143rem` are the same value written
 * two ways. Anything one term cannot read makes the whole value unreadable,
 * which `compare()` turns into a refusal rather than a silent pass.
 */
export function len(v) {
  const s = String(v).trim();

  /* `calc(<number> / <number>)` — a RATIO, and the only calc form read here.
     `check:type-scale` already computes this shape and calls it "the shape
     Tailwind's own pairs take"; it is also how an exact ratio is written when a
     decimal would not be exact, which is why h1-hero's leading is `calc(7 / 6)`
     rather than 1.1667 — 7/6 of 48 is 56 and of 36 is 42, both whole, and no
     rounded decimal gives that.

     Every OTHER calc stays unreadable on purpose. `calc(3rem + 1px)` mixes units
     this module cannot resolve against each other, and `compare()` turning that
     into a refusal is the behaviour two self-test rows exist to hold. */
  const ratio = s.match(/^calc\(\s*([\d.]+)\s*\/\s*([\d.]+)\s*\)$/i);
  if (ratio) {
    const a = parseFloat(ratio[1]);
    const b = parseFloat(ratio[2]);
    return b === 0 || Number.isNaN(a) || Number.isNaN(b) ? null : `${a / b}`;
  }

  const parts = s.split(/\s+(?=[+-]\s)/);
  if (parts.length === 1) {
    const t = term(s);
    return t === null ? null : `${t.n}${t.unit}`;
  }
  const out = [];
  for (const raw of parts) {
    const m = raw.match(/^([+-])\s+([\s\S]*)$/);
    const t = term(m ? m[2] : raw);
    if (t === null) return null;
    const n = m && m[1] === '-' ? -t.n : t.n;
    out.push(`${n}${t.unit}`);
  }
  return out.sort().join(' + ');
}

/** Split on TOP-LEVEL commas only, so a nested call keeps its own arguments. */
export function splitArgs(s) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * Any dimension, FIXED or FLUID → a canonical string, or null if unreadable.
 *
 * The fluid half exists because of a hole measured on 2026-09-01, and the hole
 * was not that a clamp compared wrong — it was that it did not compare at all.
 * `parseFloat('clamp(32px, 5vw, 48px)')` is NaN, so the old normaliser returned
 * null for BOTH sides of the comparison, and `compare()` asked `null !== null`,
 * which is false. Proven by injection: `clamp(32px, 5vw, 48px)` in the source of
 * truth against `clamp(64px, 9vw, 96px)` in both consumable layers reported
 * "No drift", with the token still inside the checked count — a vacuous pass,
 * not a skip. `compare()` now refuses an unreadable side outright, so even a
 * shape this function has never seen cannot come back as agreement; this makes
 * the shape we DO expect comparable rather than merely refused.
 *
 * Compared structurally, argument by argument, so `clamp(2rem, 5vw, 4rem)` and
 * `clamp(32px, 5vw, 64px)` are the same value written twice and a moved
 * breakpoint is drift.
 */
export function px(v) {
  if (v == null) return null;
  if (typeof v === 'number') return String(v);
  const s = String(v).trim();
  const fn = s.match(/^(clamp|min|max)\(([\s\S]*)\)$/i);
  if (!fn) return len(s);
  const args = splitArgs(fn[2]).map(px);
  return args.some((a) => a === null) ? null : `${fn[1].toLowerCase()}(${args.join(',')})`;
}

/**
 * The ENDS of a dimension — `[min, max]` in px, equal for a fixed value.
 *
 * A fluid value states two numbers and prose about it states two numbers, so a
 * checker comparing them needs both rather than whichever `parseFloat` reaches
 * first. That is not hypothetical: `check:catalogue`'s type-row parser read the
 * first number in "36px → 48px" and compared it against `parseFloat` of the
 * whole clamp, which is NaN, and its `Number.isNaN` guard then skipped the row
 * in silence while still counting it. Blind on exactly the two rows that had
 * just changed.
 *
 * Returns null for anything without readable ends. `check:type-scale` keeps its
 * own stricter reader on purpose — a step there must be a px literal, so a
 * `1.875rem` step is a finding rather than a silent conversion — and that rule
 * is one its self-test plants.
 */
export function bounds(v) {
  if (v == null) return null;
  const s = String(v).trim();
  const fn = s.match(/^clamp\(([\s\S]*)\)$/i);
  if (!fn) {
    /* Through len(), not term(), so a RATIO has ends too. Reading it with term()
       returned null for `calc(7 / 6)`, and a caller that skips on null would
       have gone blind on exactly the value it had just been given — the same
       silent skip this function was written to end. */
    const one = len(s);
    if (one === null) return null;
    const n = parseFloat(one);
    return Number.isNaN(n) || !/^-?[\d.]+$/.test(one) ? null : [n, n];
  }
  const args = splitArgs(fn[1]);
  if (args.length !== 3) return null;
  const lo = term(args[0].trim());
  const hi = term(args[2].trim());
  return lo === null || hi === null || lo.unit || hi.unit ? null : [lo.n, hi.n];
}

# Working in this repo

Rules that cost real time when they were not known. Everything else — what the
components are, how to consume them, what each prop does — is in
[`README.md`](README.md) and [`astro-components/README.md`](astro-components/README.md).

**Deliberately not written here:** counts, token values, Figma node ids, or
anything else derivable. This repo generates what it can and gates prose that
restates a fact, so a number written down here would be the one thing nothing
checks. Keep this file to rules.

## Verify with the exit code

```sh
npm run check          # every gate; the only thing that decides is $?
```

Do not judge it by grepping the output for a failure marker. A gate that
**crashes** prints a stack trace containing no marker, so `… | grep ✖ || echo ok`
reports success on the worst failure there is. That mistake shipped two commits
with a red gate in one afternoon.

Chain it, so a failure cannot be walked past:

```sh
npm run check && git commit …
```

`npm run preview <page>` renders the docs in a real browser (needs Chrome),
`node scripts/state-diff.mjs <page> --ref HEAD` compares interactive states pixel
for pixel, and `npm run overflow` sweeps every component across nine widths for
anything that leaves its box. All three exit non-zero on failure. None is in
`npm run check`, because CI has no browser.

Reach for `overflow` before believing a layout is fine at a width you have not
looked at. The bug it exists for is invisible to every other gate: a breakpoint
set below the width its content actually needs, where flex squashes children
past their own text rather than overflowing, and an `overflow: hidden` ancestor
cuts the rest with no scrollbar and a clean `document.scrollWidth`.

Each has a `--self-test` that must pass before its output is worth anything.

## Edit the source, not the output

| Generated | Rebuild with | Authored source |
|---|---|---|
| `tailwind/theme.css`, `docs/tokens.css` | `npm run build:theme` | `tailwind/tokens.css` ← `tokens/tokens.w3c.json` |
| `docs/utilities.css` | `npm run build:utilities` | the classes components actually use |
| `<!-- demo:* -->` regions | `npm run build:demos` | `playground/src/pages/demos/*.astro` |
| `<!-- code:astro -->` samples | `npm run build:code` | the ```astro block in `astro-components/README.md` |
| `<!-- seo:* -->` blocks | `npm run build:seo` | the page's own `<h1>` and lead |
| the props manifest | `npm run build:manifest` | each component's `Props` interface |

A token starts in `tokens/tokens.w3c.json`, is written by hand into
`tailwind/tokens.css`, and reaches everything else through `build:theme`.
Adding it to the JSON alone is a **warning**, not an error — the build stays
green with the token half-added.

## Things that fail silently

- **Never hardcode a colour** in a component — hex, `rgb()`, `hsl()`. Use a
  semantic token, or `color-mix()` over one so it follows into dark mode.
  `check:tokens` enforces this.
- **A shared module in `astro-components/*.ts` must be named in two scripts** —
  `build-utilities.mjs` (`SHARED_TS`) compiles its classes, `check-component-vars.mjs`
  validates them. Miss the first and the utilities vanish from the stylesheet
  while the classes stay in the markup, with nothing red anywhere.
- **Renaming a CSS class means finding everything that wears it**, including
  hand-written cells in `docs/`. Twice in one day a rule was renamed and a user
  left behind — a native radio appeared where a styled one had been, and a
  tooltip silently lost 150px of width. The gates saw neither; a full-page box
  comparison against `HEAD` found both.
- **Tailwind only scans `.astro` and the listed `.ts`.** A class string anywhere
  else is never compiled.

## Attack your own instrument first

Before reporting a finding, prove the thing that found it is not the thing that
is broken. Real examples, all of which produced a confident, plausible, wrong
number: an unresolved `var()` reads back as the browser's default rather than as
an error; `:has()` does not re-evaluate when a script assigns `.checked`;
sampling a style mid-transition returns an interpolated value; and a state
harness that reports "0 element states identical" is telling you it compared
nothing at all.

Build the check so it proves it is aimed correctly before it reports — assert
that an injected override actually moves the number you are about to trust.

## Git

Both this repo and the skills repo work **direct to `main`**. Commit, push and
similar steps happen **on an explicit request each time** — one step per
request, not chained ahead. Commit messages here carry the reasoning and the
measurements, not just the change.

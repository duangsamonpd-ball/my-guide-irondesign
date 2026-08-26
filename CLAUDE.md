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
for pixel, `npm run overflow` sweeps every component across nine widths for
anything that leaves its box, and `npm run wide` sweeps the two widths ABOVE the
canvas for anything that keeps growing, and `npm run figma-size` measures every
band a component has DECLARED against the Figma node it comes from. All five
exit non-zero on failure. None is in `npm run check`, which stays runnable
anywhere Node runs.

`figma-size` is the only one that asks whether a number is RIGHT rather than
whether a layout is broken, and it is opt-in by design: the numbers live in the
component, in an `@figma-size` block, because a gate carrying one component's
heights only ever checks that component. It prints how many components declare
nothing, so unchecked is a visible state and not a silent pass. A declaration
that will not parse is an error, never a skip.

**Every other instrument here stops at 1440** — `overflow`'s widest width,
`layout`'s widest, `audit`'s only one, and every Figma frame. A fault above the
canvas can therefore only be reported by someone on a wide monitor, and the
first one was: FooterBar's middle band had no `max-width` while the bands either
side of it did. `wide` exists for that class and asks a different question from
`overflow` — **nothing overflowed**, the band was 1872 wide inside a 1920 parent;
it just did not stop where its neighbours did. Widening the overflow sweep would
not have found it, so do not reach for that instead.

**CI does have a browser** — this file said otherwise until 2026-08-12 and it was
never true. `ubuntu-latest` ships Google Chrome, and all three harnesses launch
`channel: 'chrome'`, which is that install. `overflow` and `npm run audit`
(`preview.mjs --all`) both run there now, in the `render` job, because that job
already pays for `npm ci` and the playground build the sweep reads. `state-diff`
does not, and the reason is not the browser: it compares against a git ref.

`audit` gates two things nothing else can see — every `<img>` by its **painted
pixels**, and every text run against WCAG AA as **composited and, over an image,
as actually painted**. It runs at 1440, which is the width its KNOWN exemptions
were measured at; text reflows over different parts of the footer artwork at
other widths, so a ruling sampled there is only a ruling there.

**`state-diff` is not gated and should not be.** It asserts "this tree renders
identically to a git ref", and on a direct-to-main repo that is either vacuous
(`--ref main` on a push to main compares HEAD with itself) or red for good
reasons (`--ref HEAD~1` flags every intended visual change). Changing how things
look is the work here; "nothing changed" is a thing to review, not to enforce.
Its **self-test** is gated, because a comparer that has stopped comparing
reports `0 differences`, which reads exactly like good news.

Do not assume a harness behaves on the runner the way it does here. Switching
`overflow` on found a bug macOS could not express: its arming check asked
`document.fonts.check('700 16px Montserrat')`, which a local Montserrat install
answers yes to on this machine no matter what the page does. Ten of nineteen
components turned out to be measured in Times, ~21% narrower than Montserrat, in
the direction that hides overflow. **A foreign machine is an instrument too, and
it can see what yours is built not to.**

Reach for `overflow` before believing a layout is fine at a width you have not
looked at. The bug it exists for is invisible to every other gate: a breakpoint
set below the width its content actually needs, where flex squashes children
past their own text rather than overflowing, and an `overflow: hidden` ancestor
cuts the rest with no scrollbar and a clean `document.scrollWidth`.

Each has a `--self-test` that must pass before its output is worth anything.

**A harness must not touch the network.** Every one of them lays out real text,
so every one needs the real font — a box measured in a fallback face is a box
measured wrong — and they used to fetch it from fonts.googleapis.com while they
ran. On the day `overflow` became a gate that CDN failed four times in
one morning, on a different page each time, and every failure was a red build
that said nothing about the code. The fonts are vendored now and served by each
harness's own server; `installOfflineGuard` aborts anything addressed elsewhere
and fails the run, so the property is checked rather than believed.

**The one exception, and it is the CDN you would actually reach for.** This file
used to end that paragraph with "if you add a CDN link to a docs page, these will
tell you", which is true of every host but Google Fonts — `useLocalFonts` rewrites
a `fonts.googleapis.com` link to the vendored copy before the guard ever sees it.
Measured 2026-08-13: a second Google Fonts `<link>` added to a page leaves
`npm run preview` at exit 0 and says nothing, while `use.typekit.net` fails it
naming the host. So a new webfont from anywhere else is caught; another Google
family is not.

The docs pages still link Google Fonts as SHIPPED, deliberately — see the header
of `scripts/lib/local-fonts.mjs`. What a reader downloads is a product decision;
the vendoring is a testing one, and the bytes are identical either way.

## Edit the source, not the output

| Generated | Rebuild with | Authored source |
|---|---|---|
| `tailwind/theme.css`, `docs/tokens.css` | `npm run build:theme` | `tailwind/tokens.css` ← `tokens/tokens.w3c.json` |
| `docs/utilities.css` | `npm run build:utilities` | the classes components actually use |
| `docs/components.css` | `npm run build:components-css` | every component's `<style>` block |
| `<!-- demo:* -->` regions | `npm run build:demos` | `playground/src/pages/demos/*.astro` |
| `<!-- code:astro -->` samples | `npm run build:code` | the ```astro block in `astro-components/README.md` |
| `<!-- seo:* -->` blocks | `npm run build:seo` | the page's own `<h1>` and lead |
| the props manifest | `npm run build:manifest` | each component's `Props` interface |
| `vendor/fonts/` | `npm run vendor:fonts` | Google Fonts, fetched once (third-party, OFL) |

A token starts in `tokens/tokens.w3c.json`, is written by hand into
`tailwind/tokens.css`, and reaches everything else through `build:theme`.
Adding it to the JSON alone is a **warning**, not an error — the build stays
green with the token half-added.

**A token change makes `docs/utilities.css` stale too, with no new class
anywhere.** The row above reads "the classes components actually use", which is
what decides the *rules* in that file — but Tailwind also inlines every theme
variable those rules reference, so editing a value in `tailwind/tokens.css`
changes the compiled stylesheet even when no markup moved. `build:theme` does not
write it and `check:theme` does not look at it: `check:utilities` is the only gate
that says so, and it says it by recompiling. **Editing a token means running both
rebuilds** — `npm run build:theme && npm run build:utilities`. Skipping the second
committed a red tree to local `main` on 2026-08-18, on a tree whose `check:theme`
was green; it was amended before the push, so nothing red reached `origin` — and
the only reason is that the gate got run again before pushing rather than once at
the start.

## Things that fail silently

- **Never hardcode a colour** in a component — hex, `rgb()`, `hsl()`. Use a
  semantic token, or `color-mix()` over one so it follows into dark mode.
  `check:tokens` enforces this.
- **Overriding a `--text-*` size without its `--text-*--line-height` leaves
  Tailwind supplying the other half.** `text-<step>` emits font-size AND
  line-height, and the second reads `var(--text-<step>--line-height)` — from
  Tailwind's theme if not from ours. Nothing here renders the consequence: this
  repo's Tailwind emits no utilities for itself, and every component that uses one
  of these classes writes an explicit `leading-*` beside it, which wins. It
  reaches consumers. `check:type-scale` enforces the pairing, that each pair is a
  rung of `--leading-*` or the single-line `1`, and that a step a role uses agrees
  with that role — deriving both the step set and the role map from `tokens.css`
  rather than restating them.
- **A shared module in `astro-components/*.ts` must be named in two scripts** —
  `build-utilities.mjs` (`SHARED_TS`) compiles its classes, `check-component-vars.mjs`
  validates them. Miss the first and the utilities vanish from the stylesheet
  while the classes stay in the markup, with nothing red anywhere.
- **A bare tag selector in a docs page styles the components on it.** `docs.css`
  learned this once — a bare `footer { padding }` padded every component footer
  below 640 — and the per-page copies of that rule outlived the fix. On
  `07-components.html` the page's own `footer { padding: 48px 40px }` was adding
  **97px** to `FooterBar`, which renders a `<footer>`: measured `.fb` at 322px
  where the component is 225. `docs.css` already owns `footer.docfoot`; use it.
  `build-component-css.mjs` refuses to write a bare-tag selector for the same
  reason, so the trap cannot come back from the component side.
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

**A check that cannot fail on the machine that wrote it is not a check.** This
is the one that got past everything else, four times in a day. The overflow
sweep armed itself with `document.fonts.check('700 16px Montserrat')`, which a
local Montserrat install answers yes to whatever the page renders — so the
condition was unfalsifiable here and ten components were being measured in
Times. The module written to fix that shipped with the same flaw: `useLocalFonts`
only replaced an existing font link, so the self-test fixture got no font at all,
and again the local install hid it. When a check concerns a resource this machine
happens to have, **assert on the plumbing as well as the result** — one row that
inspects the transform and can fail anywhere, beside the row that inspects the
render and can only fail where the resource is missing.

**Repeating a measurement is not reproducing it.** Before keying contrast
exemptions to a sampled backdrop pixel, the sweep was run three times and gave
identical pairs. That showed stability on one machine, not reproducibility: the
runner samples the same text at `#250718` where this machine gives `#1E0818`,
because glyph rectangles rasterise differently and a different rectangle takes a
different slice of a gradient. If a value is **sampled** rather than declared,
ask what it is a property of before keying anything to it — and match it with a
tolerance that still has a refusal case, or a tolerance is just a wider hole.

## Git

Both this repo and the skills repo work **direct to `main`**. Commit, push and
similar steps happen **on an explicit request each time** — one step per
request, not chained ahead. Commit messages here carry the reasoning and the
measurements, not just the change.

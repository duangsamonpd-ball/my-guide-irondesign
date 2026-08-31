<div align="center">

<img src="docs/assets/logo.svg" alt="Iron Software" width="72" height="72">

# Iron Software Design System

**A visual, token-driven design system — Figma is the source of truth, code is always in sync.**

[![Live Docs](https://img.shields.io/badge/docs-live-2693EC?style=flat-square)](https://duangsamonpd-ball.github.io/my-guide-irondesign/)
[![Tokens](https://img.shields.io/badge/tokens-W3C%20%C2%B7%20Tailwind%20%C2%B7%20CSS-E01A59?style=flat-square)](tokens/)
[![Astro](https://img.shields.io/badge/components-Astro%20%C2%B7%2018-FF5D01?style=flat-square)](astro-components/)
[![Font](https://img.shields.io/badge/type-Montserrat%20%2B%20Roboto%20Mono-63C1A0?style=flat-square)](docs/02-typography.html)
[![License](https://img.shields.io/badge/internal-Iron%20Software-185FA5?style=flat-square)](#)

[**🎨 Live Documentation**](https://duangsamonpd-ball.github.io/my-guide-irondesign/) · [**🏠 Homepage Demo**](https://duangsamonpd-ball.github.io/my-guide-irondesign/homepage.html) · [**Colors**](https://duangsamonpd-ball.github.io/my-guide-irondesign/01-colors.html) · [**Typography**](https://duangsamonpd-ball.github.io/my-guide-irondesign/02-typography.html) · [**Components**](https://duangsamonpd-ball.github.io/my-guide-irondesign/07-components.html) · [**Semantic Guide**](https://duangsamonpd-ball.github.io/my-guide-irondesign/08-semantic-guide.html)

</div>

---

## ✨ What is this?

The single reference for every design decision at Iron Software — colors, typography, spacing, borders, shadows and components — distributed as **design tokens** in four formats so any tool can consume them:

| Output | File | Use for |
|--------|------|---------|
| **CSS variables** | [`tailwind/tokens.css`](tailwind/tokens.css) | Any CSS / SCSS project — `@import` once at the root |
| **Tailwind v4 theme** | [`tailwind/theme.css`](tailwind/theme.css) | Tailwind projects — `@import` it *instead of* `tailwindcss` |
| **W3C tokens** | [`tokens/tokens.w3c.json`](tokens/tokens.w3c.json) | **Source of truth** — W3C Design Token format |
| **Legacy tokens** | [`tokens/tokens.legacy.json`](tokens/tokens.legacy.json) | Tokens Studio / older tooling compatibility |
| **Raw scale only** | [`tailwind/colors.css`](tailwind/colors.css) | Stand‑alone colour scale (50–950), no semantics |

> **Figma → code, always synced.** The Figma file is authoritative. When a value changes in Figma, it is reviewed and propagated to **every** token file and the docs in one pass (see [Workflow](#-workflow--figma--code)).

---

## 📐 What's inside

| Foundation | Page | At a glance |
|---|---|---|
| 🎨 **Color Palette** | [`01-colors.html`](docs/01-colors.html) | 10 palettes × 11 shades = **110 raw colors** + The Shade Scale guide |
| 🎯 **Semantic Colors** | [`semantic-colors.html`](docs/semantic-colors.html) | Role-based tokens — Brand, Text, Surface, Border, Feedback (light + dark) |
| 🔤 **Typography** | [`02-typography.html`](docs/02-typography.html) | Montserrat + Roboto Mono · content scale + UI scale |
| 📐 **Spacing** | [`03-spacing.html`](docs/03-spacing.html) | Named spacing scale (4px → 120px) |
| ▭ **Borders** | [`04-borders.html`](docs/04-borders.html) | Widths + corner radius |
| 🔆 **Opacity** | [`05-opacity.html`](docs/05-opacity.html) | 21-step opacity scale |
| 🌑 **Shadows** | [`06-shadows.html`](docs/06-shadows.html) | Elevation layers |
| 🧩 **Components** | [`07-components.html`](docs/07-components.html) | Buttons, inputs, badges, cards, nav |
| 🗺️ **Semantic Guide** | [`08-semantic-guide.html`](docs/08-semantic-guide.html) | Dev handoff — token map, code examples, downloads |

**By the numbers:** `110` raw color shades · `76` semantic color tokens · `20` type styles · `13`-step font-size & leading scales.

---

## 🏠 Homepage demo — the system in action

The proof that the tokens compose into a real product page: [`docs/homepage.html`](docs/homepage.html) is a complete Iron Software marketing homepage built **entirely from the design tokens** — zero hard-coded values.

[**▶ View the live homepage demo**](https://duangsamonpd-ball.github.io/my-guide-irondesign/homepage.html)

- **13 sections** — hero · product grid · Why Iron Suite · audiences · savings stats · 140M growth chart · testimonials · support · monthly releases · 1% for the Planet · CTA · mega-footer
- **100% token-driven** — every colour, font-size, weight, line-height, tracking, spacing, radius and shadow is a CSS variable (`var(--text-3xl)` · `var(--space-hero)` · `var(--leading-7)` · `var(--tracking-tight)` …)
- **Responsive layout** — 1440 design frame → 1280 container → 24px gutter, fluid down to mobile
- **Real brand assets** — product logos, partner logos, photography and a dotted world map (`docs/assets/`); the full logo family (24 product marks in colour + mono, 5 wordmark lockups, 2 lockup patterns, 13 product elements) is exported from Figma and documented in [`docs/logo.html`](docs/logo.html)

> A working reference for how to consume the system end-to-end — open the file and every value traces back to a token in `:root`.

---

## 🧬 Astro components

19 components are ported as real `.astro` files in [`astro-components/`](astro-components/) — use them instead of copy-pasting markup out of the docs. **11 of them are styled with Tailwind utility classes and need either Tailwind (pointed at this package's sources) or the pre-compiled `@iron-software/design-system/utilities.css`** — see [the package README's Setup section](astro-components/README.md#setup), which is gated so it cannot go stale.

| Component | Notes |
|---|---|
| `Button.astro` | 6 variants × 3 sizes, renders `<a>` when given `href` |
| `NugetButton.astro` | The NuGet download CTA — stacked label + install count, 2 sizes |
| `TextLink.astro` | Underlined inline link, light/dark modes, optional external-link icon |
| `Input.astro` | Label, hint/error states, disabled, required |
| `Textarea.astro` | Multi-line sibling of Input, same tokens |
| `FileUpload.astro` | Dashed dropzone, drag & drop, click-to-browse with zero JS |
| `Select.astro` | Custom dropdown + a hidden native `<select>` so forms still work with JS off |
| `Checkbox.astro` | Basic, with description, or whole-card `card` layout |
| `Radio.astro` | Same three layouts as Checkbox, grouped by `name` |
| `Badge.astro` | 6 intents × solid/subtle × sm/md, square, leading dot |
| `Notice.astro` | Non-interactive info card — title+body, lead-in+text, or minimal label, 4 intents |
| `Tooltip.astro` | Optional title, link, 4 placements, hover-with-a-gap JS interaction |
| `Logo.astro` | The product mark family — colour or mono, every product, all five lockups |
| `TopNav.astro` | Site header — brand lockup, menu, address, CTA |
| `ProductMenu.astro` | The product dropdown that hangs off Top Nav |
| `Footer.astro` | The violet IRONSUITE cross-sell band — Suite vs. Default headline, configurable product list |
| `FooterBar.astro` | The black site footer bar that sits **underneath** `Footer.astro` — the two stack, neither replaces the other |
| `FormCard.astro` | Icon+title form card wrapper — compose with Input/Select/Textarea/FileUpload |
| `TrialKeyCard.astro` | Centered single-field "instant capture" card |

Every component's CSS references `tailwind/tokens.css` — import the token file once, globally, before using any component. Full usage examples and props are in [`astro-components/README.md`](astro-components/README.md).

---

## 🚀 Quick start

### Option 1 — Plain CSS

```html
<link rel="stylesheet" href="tailwind/tokens.css">
```

```css
.cta {
  background: var(--color-primary);          /* #E01A59 — iron-pink/500 */
  color:      var(--color-primary-on);       /* #FFFFFF */
  font-size:  var(--font-size-btn-lg);       /* 16px */
  font-weight:var(--fw-btn-lg);              /* 700 — bold */
  border-radius: var(--rounded-full);        /* pill CTA */
}
```

### Option 2 — Tailwind v4

There is no `tailwind.config.js`. Tailwind v4 is CSS-first, so the theme *is* a stylesheet — import it instead of `tailwindcss` and everything is registered:

```css
/* app.css */
@import "./tailwind/theme.css";   /* pulls in Tailwind itself */
```

```html
<button class="bg-primary text-h4 rounded-cta">Download Free Trial</button>
<h1 class="text-h1">Explore our C# libraries</h1>
<p  class="text-body-lg">Streamline your .NET development…</p>
```

Colour scales stay available (`bg-iron-blue-500`, `bg-primary-100`, …), and opacity modifiers work natively: `bg-primary/50`.

#### Dark mode

Put `class="dark"` on `<html>`. Every semantic token re-points at its dark counterpart — components are untouched because they read the same names in both themes:

```html
<html class="dark">
```

```css
/* resolves to #171717 in light, #F5F5F5 in dark — same variable */
color: var(--color-text-heading);
```

> **Upgrading from v3?** `tailwind/tailwind.config.js` is gone. If you were spreading it into `theme.extend`, replace that with the `@import` above. Utility names are unchanged.

### Option 3 — Design tokens (W3C JSON)

```js
import tokens from './tokens/tokens.w3c.json';
tokens.color.primary.default.$value;   // "#E01A59"
tokens.typography.scale.h1.$value;     // { fontSize: "40px", fontWeight: 900, … }
```

### Option 4 — Astro components

```astro
---
import '../../tailwind/tokens.css';
import Button from '../../astro-components/components/Button.astro';
---
<Button variant="primary" size="lg" href="/pricing">Get started</Button>
```

See [`astro-components/README.md`](astro-components/README.md) for the full component list and props.

---

## 🎨 Color system

Two layers — **raw scales** feed **semantic tokens**. Never reference a raw shade in a component; use the semantic role.

```
raw scale  ─────────────►  semantic token  ─────────────►  component
iron-pink/500              --color-primary                 .btn-primary
neutral/800                --color-text-body               body copy
slate/200                  --color-border                  dividers
```

**Brand palettes** (each 50–950): `iron-pink` · `iron-blue` · `iron-orange` · `iron-green` · `iron-sky` · `iron-purple` · `iron-violet` · `iron-red`
**Utility palettes:** `slate` (UI surfaces / borders) · `neutral` (text / gray)

**Semantic groups:** `primary` · `secondary` · `accent 1–4` · `success / warning / error / info` · `text` (+ dark, + on-dark, + on-light) · `surface` (+ dark) · `border` · `button` (+ dark). Accent for overlines/emphasis is **NuGet blue `#185FA5`**.

---

## 🔤 Typography

**Outfit is retired — the system runs on Montserrat (content + UI) and Roboto Mono (code).** Line-heights and tracking are expressed in **px**, mirroring the Figma variable scales (`leading` = px ÷ 4; tracking: tighter −0.8 · tight −0.4 · normal 0 · wide 0.4 · wider 0.8 · widest 1.6).

Every row below is a **role token** in `tailwind/tokens.css` — `--font-size-h2`, `--line-height-h2`, `--fw-h2`, `--letter-spacing-h2`. Read the values there; the tables here are a summary and a summary can drift, which is what `check:type-scale` and `check:type-weight` exist to catch on the code side.

### Content scale

| Style | Role | Size | Weight | Line-height | Tracking |
|---|---|---|---|---|---|
| H1 · hero | `h1-hero` | 48px | 800 Extrabold | 48 | 0 |
| H1 | `h1` | 40px | 800 Extrabold | 48 | −0.8 |
| H2 | `h2` | 30px | 800 Extrabold | 36 | −0.4 |
| H3 | `h3` | 24px | 700 Bold | 32 | −0.4 |
| H4 | `h4` | 20px | 800 Extrabold | 28 | −0.4 |
| Title · Large | `title-lg` | 18px | 700 Bold | 28 | — |
| Body large | `body-lg` | 18px | 400 Regular | 28 | — |
| Quote | `quote` | 18px | 500 Medium *italic* | 28 | — |
| Body title | `body-title` | 16px | 700 Bold | 28 | 0 |
| Body | `body` | 16px | 400 Regular | 28 | — |
| Label · Large | `label-lg` | 16px | 500 Medium | 20 | 0 |
| Caption | `caption` | 14px | 400 Regular | 20 | — |
| Label | `label` | 14px | 500 Medium | 20 | 0 |
| Overline | `overline` | 14px | 700 Bold · UPPER | 16 | 0.4 |
| Code | `code` | 14px | Roboto Mono 400 | 24 | — |
| Caption SM | `caption-sm` | 12px | 500 Medium | 16 | 0.4 |

Four of those were wrong in this file until 2026-08-31, all in the same direction — a value edited in `tokens.css` and not here. `h1-hero` and `h1` read 900 Black (both are 800 since 2026-08-17), `h1-hero` claimed −0.8 tracking where it is `normal`, `body-lg` read 500 (it became 400 in `203a99a`), and `overline` read 0.8 where it is `wide`, 0.4. `body-title` and `label-lg` were missing outright.

### UI scale

| Style | Size | Weight | Line-height | Tracking |
|---|---|---|---|---|
| Button · large | 16px | 700 Bold | 1 | 0 |
| Button · default | 14px | 600 Semibold | 16 | 0 |
| Button · small | 12px | 600 Semibold | 1 | 0.4 |
| Nav · primary | 16px | 500 Medium (700 active) | 1 | — |
| Nav · sub | 14px | 500 Medium | 20 | — |
| Nav · group label | 12px | 700 Bold · UPPER | 16 | 0.4 |

---

## 📁 Project structure

```
iron-design-system/
├── docs/                      # GitHub Pages site (the visual documentation)
│   ├── index.html             #   Landing page (links every guide + demo)
│   ├── homepage.html          #   🏠 Full homepage demo — built 100% from tokens
│   ├── 01-colors.html         #   🎨 Color Palette + Shade Scale
│   ├── semantic-colors.html   #   🎯 Semantic Colors
│   ├── 02-typography.html     #   🔤 Typography
│   ├── 03-spacing.html …      #   📐 Spacing, Borders, Opacity, Shadows
│   ├── 07-components.html      #   🧩 Components
│   ├── 08-semantic-guide.html #   🗺️ Dev handoff + token downloads
│   └── assets/                #   logos, product art, photos, world map
│
├── tailwind/
│   ├── tokens.css             # ⭐ All CSS custom properties (colors + type + spacing …)
│   ├── theme.css              # 🤖 Tailwind v4 theme — generated from tokens.css
│   └── colors.css             #    Raw 50–950 scale only
│
├── scripts/
│   ├── build-theme.mjs        #    tokens.css → theme.css
│   ├── check-token-drift.mjs  #    w3c ↔ tokens.css ↔ theme.css
│   ├── check-component-vars.mjs #  every component var resolves after compile
│   └── preview.mjs            #    renders the docs in a real browser and measures them
│
├── tokens/
│   ├── tokens.w3c.json        # ⭐ Source of truth (W3C Design Token format)
│   └── tokens.legacy.json     #    Tokens Studio format
│
└── astro-components/          # 🧬 .astro wrapper components (18, token-driven)
    ├── README.md               #   Props + usage for every component
    └── components/
        ├── Button.astro
        ├── TextLink.astro
        ├── Input.astro
        ├── Textarea.astro
        ├── FileUpload.astro
        ├── Select.astro
        ├── Checkbox.astro
        ├── Radio.astro
        ├── Badge.astro
        ├── Notice.astro
        ├── Tooltip.astro
        ├── Footer.astro
        ├── FormCard.astro
        └── TrialKeyCard.astro
```

---

## 🔄 Workflow — Figma → code

Every change starts in Figma and lands in **all** token files plus the docs in a single, reviewed pass. This is the loop used for every update in this repo:

```
┌─────────────┐   ┌──────────────┐   ┌──────────────────────┐   ┌───────────┐   ┌──────────┐
│  1. Figma   │──▶│  2. Review   │──▶│  3. Propagate tokens │──▶│ 4. Verify │──▶│ 5. Ship  │
│  (source)   │   │  diff vs.    │   │  css · tailwind ·    │   │  preview  │   │  commit  │
│             │   │  our system  │   │  w3c · legacy        │   │  + check  │   │  + push  │
└─────────────┘   └──────────────┘   └──────────────────────┘   └───────────┘   └──────────┘
```

1. **Source** — a Figma node/variable export, an HTML spec, or a screenshot defines the new values.
2. **Review** — diff against the current system; list exactly what changed or is new (no blind overwrites).
3. **Propagate** — apply the change to **every** representation so they never drift:
   - `tokens/tokens.w3c.json` (source of truth — start here)
   - `tailwind/tokens.css` (CSS variables)
   - `tokens/tokens.legacy.json` (Tokens Studio)
   - the relevant `docs/*.html` reference page(s)
   - the matching `astro-components/components/*.astro` file, if the component has one
   - then run `npm run build:theme` — `tailwind/theme.css` is generated, never hand-edited
4. **Verify** — run `npm run check`, then preview the docs locally and confirm computed values match the spec.
5. **Ship** — commit with a descriptive message and push (GitHub Pages auto-deploys).

> **Golden rule:** a value lives in one place per format. Semantic tokens reference primitives via `var()`; primitives mirror the Figma variable scales (font-size `xs–9xl`, leading `3–32`). Change a value once, everything downstream updates.

### Syncing text styles into Figma

A companion **Figma Scripter** script generates all text styles from this scale directly in Figma (idempotent, resolves font-weight names automatically). Ask for the latest `Typography/*` script, paste it into **Plugins → Scripter → Run**.

---

## 🛠️ Local development

The docs are static HTML — no build step. Serve the `docs/` folder:

```bash
# Python (built-in)
python3 -m http.server 4200 --directory docs
# → http://localhost:4200

# …or any static server
npx serve docs
```

Edit a `docs/*.html` page or a token file, refresh, done.

### Checking for token drift

`tokens/tokens.w3c.json` is the source of truth; `tailwind/tokens.css` and `tailwind/theme.css` must agree with it. Verify everything:

```bash
npm run check          # 24 gates; the only thing that decides is the exit code
```

**The list below is a summary — `npm run check` in `package.json` is the list.** Read the exit code, never the output: a gate that *crashes* prints a stack trace with no failure marker, so grepping the log for one reports success on the worst failure there is.

| Gate | Asserts |
|---|---|
| `check:theme` | `theme.css` has been regenerated from `tokens.css` |
| `check:utilities` | `docs/utilities.css` still carries every class the converted components wear — and it goes stale on a *token* edit too, with no new class anywhere |
| `check:tokens` | every token agrees across `tokens.w3c.json`, `tokens.css` and `theme.css` — and no component hardcodes a hex where a semantic token exists |
| `check:alt-text` | every `<img>` a component ships either describes itself or is explicitly decorative |
| `check:logo-fills` | the brand artwork is painted in colours this system still uses |
| `check:artwork-sync` | the four cuts of the wordmark are one drawing, so a stale export cannot hide among them |
| `check:logo-grid` | `Logo`'s size ladder and the measured table in its JSDoc are re-derived from the SVGs |
| `check:parts` | a component's published `[data-part]` hooks still exist in what it renders |
| `check:type-scale` | every `--text-*` step is paired with its `--text-*--line-height`, each pair is a rung of `--leading-*`, and a step a role uses agrees with that role |
| `check:type-weight` | a class list that *names* a type role agrees with that role on every axis |
| `check:parity` | every CSS rule in a component's `<style>` also appears in its `docs/component-*.html` page |
| `check:props-table` | the hand-typed Prop / Type / Default tables in the docs match the generated manifest, both directions |
| `check:exports` | every component is in the barrel, every `exports` map target resolves, and every component has a README section |
| `check:vars` | every `var(--…)` a component reads still resolves once Tailwind has compiled the theme |
| `check:docs-css` | no docs page redefines a rule it should inherit from the shared `docs.css` shell |
| `check:components-css` | `docs/components.css` is current with the component `<style>` blocks it is generated from |
| `check:contrast` | every colour pair Badge paints meets WCAG AA, derived from `Badge.astro` and resolved through `tokens.css` |
| `check:catalogue` | every colour value and every count the docs **write out by hand** still equals the thing it names |
| `check:seo` | the generated description, canonical, OG and JSON-LD blocks are current on every docs page |
| `check:shell` | the shared page shell — nav, sidebar, footer — is identical across the docs pages |
| `check:manifest` | `components.json` still matches the `interface Props` blocks it is parsed from |
| `check:fonts` | the pages ask for the faces the type scale actually uses |
| `check:code` | the `astro` samples in the docs pages match the ones in `astro-components/README.md` |
| `check:render` | the demo **markup** in the docs pages still matches what the components actually render |

Most are plain Node with no dependencies. Two are not: `check:vars` compiles `theme.css` with the real Tailwind v4 CLI first, because a `var()` that resolves in the source can still be missing after compilation; and `check:render` builds the [playground](playground/README.md) with Astro to render the components for real, which is the only way to see a DOM change — `check:parity` compares CSS and is blind to markup.

Four more gates run in CI rather than here, because each needs a build: `check:types` (`astro check`), `check:peer-range` (compiles every component against the oldest Astro the `peerDependencies` range advertises), `check:prose-classes` (compiles this package the way a *consumer* does, and refuses a rule that carries a relative `url()` or that does not parse) and `check:flat-scope` (asks the rendered tree what each rule reaches once Astro's scoping is stripped).

Several carry a `--self-test` that must pass before their output is worth anything. A checker that parses hand-written HTML fails by matching **nothing**, which reads as a clean page; each such parser therefore carries a floor and has to react to a planted error before its silence means anything.

Every gate above reads source text. For what a browser sees instead, see [Looking at the rendered result](#looking-at-the-rendered-result) below — and note that `npm run overflow`, `npm run wide`, `npm run layout` and `npm run figma-size` are **tools, not gates**, run on purpose rather than on every commit.

Token coverage spans colors, spacing, radius, shadows, blur, opacity, sizing, the semantic type scale and breakpoints.

`theme.css` is generated, so a stale copy counts as drift:

```bash
npm run build:theme    # regenerate after editing tokens.css
npm run check:theme    # fails if it is out of date
```

| Result | Meaning |
|---|---|
| ✔ **no drift** | all three layers agree — exit `0` |
| ⚠ **warning** | a generated layer declares a token the source doesn't have, or the script has no mapping for one — exit `0` |
| ✖ **drift** | a value disagrees, a token is missing, or a component hardcodes a color — exit `1` |

**Fix the generated layer, not the source** — unless the design genuinely changed in Figma, in which case update `tokens.w3c.json` first and propagate outward.

CI runs the dependency-free gates on every push and PR, compiles `theme.css` with real Tailwind v4 in a second job so `check:vars` runs against a genuinely compiled stylesheet, and renders the components with Astro in a third so `check:render`, the overflow sweep and the contrast audit can work against real markup in a real browser ([`.github/workflows/token-drift.yml`](.github/workflows/token-drift.yml)).

### Generated demo markup

The demo markup inside `docs/component-*.html` is **generated, not hand-typed**. Each region sits between sentinels:

```html
<!-- demo:preview -->
…generated from the real component…
<!-- /demo:preview -->
```

The source is `playground/src/pages/demos/<name>.astro`, which renders real components inside `<div data-demo="…">` wrappers. After changing a component or its demo:

```bash
npm run build:demos    # re-render and rewrite the docs pages
npm run check:render   # fails if they are out of date
```

Edit the playground page, never the markup between the sentinels — the next `build:demos` overwrites it. See [`playground/README.md`](playground/README.md) for what the generator normalises and which regions are deliberately left hand-written.

### Looking at the rendered result

Every gate above reads source text, and all of them will happily stay green on a component that renders wrong. FooterBar shipped twice with a grey box behind every logo, a broken image and a pink wordmark where the design says white, with every gate passing throughout.

`scripts/preview.mjs` opens the docs pages in a real browser and measures what comes out:

```bash
npm run preview -- footerbar                       # audit one component page
npm run preview -- --all                           # audit every component page
npm run preview -- footerbar --measure '.fb-menu'  # box metrics, to diff against Figma
npm run preview -- footerbar --shot /tmp/fb.png    # full-page screenshot at 1440
npm run preview -- footerbar --serve               # serve docs/ and leave it up
```

It reports three things, each one an answer to an instrument that has lied here before:

| Probe | Asserts |
|---|---|
| **assets** | every `<img>` paints non-transparent pixels onto a canvas. `naturalWidth` is not evidence — it called all 13 FooterBar logos fine while 7 of them painted nothing |
| **contrast** | every run of text, composited down its real ancestor chain with opacity groups included, meets WCAG AA. `check:contrast` resolves tokens on paper, so text dimmed to 60% by a CSS `opacity` rule reads there as full strength |
| **measure** | `getBoundingClientRect` for any selector, to diff against the numbers in a Figma node tree |

Disabled controls are exempt (WCAG 1.4.3 says so, and every disabled state here is drawn by dimming to 50%). Text over a gradient is reported as unmeasured rather than guessed at. Colour pairs that are a settled decision rather than a regression — the brand blue and the brand pink both sit below AA deliberately — are listed in `KNOWN` at the top of the script and warn instead of failing; an entry that stops coming up below its bar is reported as stale on a full sweep, so the list cannot rot.

This is **not** in `npm run check`: the gates run anywhere Node runs, and this needs Google Chrome installed. It exits non-zero, so it can be wired into CI the day CI has a browser.

Before believing a reading, check the instrument:

```bash
npm run preview:self-test    # 11 cases whose answers are known before the browser starts
```

Each case corresponds to a real misfire — a file that exists on disk but 404s, an image that loads and paints nothing, and a colour pair whose contrast depends on how opacity groups are composited. The last one is the sharp one: the correct answer is 3.98:1 and the tempting shortcut says 1.9:1, so a refactor that flattens the compositor fails here instead of shipping.

### Deploy

GitHub Pages serves the `docs/` folder on every push to `main` → **https://duangsamonpd-ball.github.io/my-guide-irondesign/**
(`docs/.nojekyll` keeps Pages from touching the static files.)

### Social card (og:image)

`scripts/build-seo.mjs` writes the `<!-- seo:* -->` block into all 31 pages —
canonical, Open Graph, Twitter card and JSON-LD. One thing is missing on purpose:
**`OG_IMAGE` is `null`, so no `og:image` is emitted.**

That is a decision, not an oversight. A card is the picture a chat client shows
when someone pastes a link, and these clients **cache the first image they
fetch** — so pointing the tag at some existing asset, a logo or a screenshot,
is harder to undo later than having no card at all. It stays empty until a real
one is drawn.

The tag is not the only thing that changes when it lands. `twitter:card` is
written as `summary` while the constant is null and `summary_large_image` once it
is set, which is the difference between a small square card and a full-width
banner. Nothing else needs editing to get that.

**To add one:**

1. Draw it at **1200×630** (1.91:1 — the ratio these clients crop to; under
   600×315 most of them fall back to the small card anyway).
2. Save it as **PNG or JPG** into `docs/assets/`. Not SVG: most crawlers do not
   render it. Keep it under ~1 MB.
3. Set the one constant — `const OG_IMAGE = 'assets/<file>.png';` — and run
   `npm run build:seo`.

`check:seo` is part of `npm run check`, so setting the constant without
rebuilding fails the gate rather than shipping 31 stale pages.

Two things worth knowing before drawing it. It is rendered around 400–500px wide
in a chat list, so thin or small type disappears; and some clients crop the
edges, so nothing load-bearing should sit against them.

The constant is a single value, so **one card covers all 31 pages**. Per-page
cards would need each page to carry its own field — worth doing only if the one
card turns out not to be enough.

---

## 🤝 Contributing

1. Branch from `main`.
2. Make the change in Figma first, then propagate to **all** token files + docs (see [Workflow](#-workflow--figma--code)).
3. Verify locally; keep all four token formats in sync.
4. Commit with a clear, specific message describing what value changed and why.
5. Open a PR.

**Conventions**
- Components consume **semantic** tokens, never raw scale steps.
- Brand hues keep the `iron-` prefix; utilities are plain `slate` / `neutral`.
- Line-heights & tracking are **px**, aligned to the Figma variable scales.

---

<div align="center">
<sub>Iron Software Design System · Montserrat + Roboto Mono · Figma-synced design tokens</sub>
</div>

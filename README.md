<div align="center">

<img src="docs/assets/logo.svg" alt="Iron Software" width="72" height="72">

# Iron Software Design System

**A visual, token-driven design system — Figma is the source of truth, code is always in sync.**

[![Live Docs](https://img.shields.io/badge/docs-live-2693EC?style=flat-square)](https://duangsamonpd-ball.github.io/my-guide-irondesign/)
[![Tokens](https://img.shields.io/badge/tokens-W3C%20%C2%B7%20Tailwind%20%C2%B7%20CSS-E01A59?style=flat-square)](tokens/)
[![Astro](https://img.shields.io/badge/components-Astro%20%C2%B7%208%2F8-FF5D01?style=flat-square)](astro-components/)
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
| **Tailwind config** | [`tailwind/tailwind.config.js`](tailwind/tailwind.config.js) | Tailwind projects — spread into `theme.extend` |
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

- **13 sections** — hero · product grid · Why Iron Suite · audiences · savings stats · 140M growth chart · testimonials · support · monthly releases · 1% For The Planet · CTA · mega-footer
- **100% token-driven** — every colour, font-size, weight, line-height, tracking, spacing, radius and shadow is a CSS variable (`var(--text-3xl)` · `var(--space-hero)` · `var(--leading-7)` · `var(--tracking-tight)` …)
- **Responsive layout** — 1440 design frame → 1280 container → 24px gutter, fluid down to mobile
- **Real brand assets** — product logos, partner logos, photography and a dotted world map (`docs/assets/`)

> A working reference for how to consume the system end-to-end — open the file and every value traces back to a token in `:root`.

---

## 🧬 Astro components

All 8 core components are ported as real `.astro` files in [`astro-components/`](astro-components/) — copy them straight into an Astro project instead of copy-pasting markup out of the docs.

| Component | Notes |
|---|---|
| `Button.astro` | 6 variants × 3 sizes, renders `<a>` when given `href` |
| `Input.astro` | Label, hint/error states, disabled, required |
| `Select.astro` | Custom dropdown + a hidden native `<select>` so forms still work with JS off |
| `Checkbox.astro` | Basic, with description, or whole-card `card` layout |
| `Radio.astro` | Same three layouts as Checkbox, grouped by `name` |
| `Badge.astro` | 5 intents, solid/subtle, small, square, leading dot |
| `Tooltip.astro` | Optional title, link, 4 placements, hover-with-a-gap JS interaction |
| `Footer.astro` | Suite vs. Default headline variant, configurable product list |

Every component's CSS references `tailwind/tokens.css` — import the token file once, globally, before using any component. Full usage examples and props are in [`astro-components/README.md`](astro-components/README.md).

> **Known gap:** `Badge.astro`'s subtle-background and solid-text colors are copied from the docs page as-is and don't fully match the canonical `iron-*-100` scale (a couple of shades — success/warning text — don't exist as tokens anywhere yet). Flagged in the component's own code comment, pending a real color decision before promoting them to `tailwind/tokens.css`.

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

### Option 2 — Tailwind

```js
// tailwind.config.js
const iron = require('./tailwind/tailwind.config.js');
module.exports = { presets: [iron] };
```

```html
<button class="bg-primary text-h4 rounded-cta">Download Free Trial</button>
<h1 class="text-h1">Explore our C# libraries</h1>
<p  class="text-body-lg">Streamline your .NET development…</p>
```

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

**Semantic groups:** `primary` · `secondary` · `accent 1–4` · `success / warning / error / info` · `text` (+ dark, + on-color) · `surface` (+ dark) · `border` · `button` (+ dark). Accent for overlines/emphasis is **NuGet blue `#185FA5`**.

---

## 🔤 Typography

**Outfit is retired — the system runs on Montserrat (content + UI) and Roboto Mono (code).** Line-heights and tracking are expressed in **px**, mirroring the Figma variable scales (`leading` = px ÷ 4; tracking: tighter −0.8 · tight −0.4 · normal 0 · wide 0.4 · wider 0.8).

### Content scale

| Style | Size | Weight | Line-height | Tracking |
|---|---|---|---|---|
| H1 · hero | 48px | 900 Black | 48 | −0.8 |
| H1 | 40px | 900 Black | 48 | −0.8 |
| H2 | 30px | 800 Extrabold | 36 | −0.4 |
| H3 | 24px | 700 Bold | 32 | −0.4 |
| H4 | 20px | 800 Extrabold | 28 | −0.4 |
| Title · Large | 18px | 700 Bold | 28 | — |
| Body large | 18px | 500 Medium | 28 | — |
| Quote | 18px | 500 Medium *italic* | 28 | — |
| Body | 16px | 400 Regular | 28 | — |
| Caption | 14px | 400 Regular | 20 | — |
| Label | 14px | 500 Medium | 20 | — |
| Caption SM | 12px | 500 Medium | 16 | 0.4 |
| Overline | 14px | 700 Bold · UPPER | 16 | 0.8 |
| Code | 14px | Roboto Mono | 24 | — |

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
│   ├── tailwind.config.js     #    Tailwind theme (colors, fontSize, leading, screens …)
│   └── colors.css             #    Raw 50–950 scale only
│
├── tokens/
│   ├── tokens.w3c.json        # ⭐ Source of truth (W3C Design Token format)
│   └── tokens.legacy.json     #    Tokens Studio format
│
└── astro-components/          # 🧬 .astro wrapper components (all 8, token-driven)
    ├── README.md               #   Props + usage for every component
    └── components/
        ├── Button.astro
        ├── Input.astro
        ├── Select.astro
        ├── Checkbox.astro
        ├── Radio.astro
        ├── Badge.astro
        ├── Tooltip.astro
        └── Footer.astro
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
   - `tailwind/tokens.css` (CSS variables)
   - `tailwind/tailwind.config.js` (Tailwind theme)
   - `tokens/tokens.w3c.json` (source of truth)
   - `tokens/tokens.legacy.json` (Tokens Studio)
   - the relevant `docs/*.html` reference page(s)
   - the matching `astro-components/components/*.astro` file, if the component has one
4. **Verify** — preview the docs locally and confirm computed values match the spec.
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

### Deploy

GitHub Pages serves the `docs/` folder on every push to `main` → **https://duangsamonpd-ball.github.io/my-guide-irondesign/**
(`docs/.nojekyll` keeps Pages from touching the static files.)

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

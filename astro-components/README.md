# Iron Software Astro Components

Astro wrapper components for the Iron Software Design System.

A component is styled one of two ways, and `npm run check:parity` checks both —
which one applies to a given component is read from the file, never assumed:

- **scoped `<style>`** — that block is the source of truth, and the matching docs
  page under `../docs/component-*.html` must mirror every rule in it inline, so
  the page renders standalone on GitHub Pages.
- **Tailwind utility classes** — nothing to mirror, so the checks change: the docs
  page must link `utilities.css`, every class in its markup must resolve, and no
  rule may be left behind describing markup the component no longer emits.

See [Setup](#setup) for what each kind needs from you.

## Setup

These components are token-driven — they don't ship their own colors, sizes,
or radii. Import the design system's token file once, globally, before using
any component (e.g. in your root layout).

### Two kinds of component, and they need different things

The components are being converted from scoped `<style>` blocks to Tailwind
utility classes, at the request of Iron Software's dev team. Both kinds are in
this package right now, and they do not have the same requirements:

| | Styled by | You need |
|---|---|---|
| **Converted** (11 of 19) | Tailwind utility classes | Tailwind, or the pre-compiled stylesheet |
| **Not yet converted** (8 of 19) | their own scoped `<style>` | the tokens, nothing else |

Every converted component's section below carries a **Needs Tailwind** note, and
`npm run check:exports` fails if one is missing or stale — the list above is not
kept by hand.

**If you run Tailwind**, import the theme and point Tailwind at this package's
sources — Tailwind only emits a class it has seen in a file it scanned, and it
does not scan `node_modules` by default:

```css
@import "@iron-software/design-system/theme.css";

@source "../../node_modules/@iron-software/astro-components/components/*.astro";
@source "../../node_modules/@iron-software/astro-components/internal/*.astro";
@source "../../node_modules/@iron-software/astro-components/field.ts";
@source "../../node_modules/@iron-software/astro-components/choice.ts";
```

Those four are not a suggestion: they are the exact source set the design system
compiles its own stylesheet from, and `npm run check:exports` fails if this block
and that set stop matching. `internal/` holds partials a component renders,
`field.ts` and `choice.ts` hold class strings shared between components — miss
either and the classes are in the markup with no rules behind them, which looks
like nothing at all going wrong.

**If you do not run Tailwind**, import the pre-compiled stylesheet instead. It is
generated from the components' own class usage and committed, so it cannot go
stale:

```css
@import "@iron-software/design-system/utilities.css";
```

A converted component copied into a project with neither renders as **unstyled
markup, with no error anywhere** — no build warning, no console message. That is
the whole reason this section exists.

**Resolved by package name** (preferred). Both packages are `private`, so make
them resolvable first — a workspace entry in a monorepo, otherwise `npm link` or
a symlink into `node_modules/@iron-software/`:

```astro
---
// src/layouts/Layout.astro
import '@iron-software/design-system/tokens.css';
---
```

```astro
---
// any page or component
import { Badge, Button, Input } from '@iron-software/astro-components';
---
<Badge intent="success" dot>Active</Badge>
```

Deep imports stay available, and are the better choice when you want one
component and nothing else:

```astro
import Badge from '@iron-software/astro-components/components/Badge.astro';
import { icons } from '@iron-software/astro-components/icons';
```

The `exports` map is **only consulted for name-based resolution**. A relative
directory import (`import { Badge } from '../../astro-components'`) will not find
the barrel — point at the file instead, or resolve by name:

```astro
// relative fallback, no package resolution needed
import '../../astro-components/../tailwind/tokens.css';
import Badge from '../../astro-components/components/Badge.astro';
```

### What each package exposes

| Import | Resolves to |
|---|---|
| `@iron-software/astro-components` | `index.ts` — every component + `icons` |
| `@iron-software/astro-components/components/*.astro` | one component |
| `@iron-software/astro-components/icons` | shared icon path data |
| `@iron-software/design-system/tokens.css` | hand-authored token layer |
| `@iron-software/design-system/theme.css` | generated Tailwind theme |
| `@iron-software/design-system/colors.css` | raw palette |
| `@iron-software/design-system/tokens.json` | W3C DTCG source of truth |

`index.ts` must list every file in `components/`, and `npm run check:exports`
enforces it — along with every barrel target resolving, the exports staying
alphabetical, and every path in either `exports` map existing on disk. Without
that gate a missing export only surfaces as a build-time `[MISSING_EXPORT]`
inside the consuming app, which is a long way from the mistake.

Adjust the relative path to wherever you copy/symlink `tailwind/tokens.css`
into your Astro project.

## Where these sit

**No component here renders a page-level landmark it cannot own.** A component
knows what it is; only the page knows where it is. So `TopNav` and `ProductMenu`
each emit their own `<nav>` with a name, but neither emits `<header>` — two
headers on one page would be wrong — and `Footer.astro` is a `<section>`, because
it is a band that stacks above `FooterBar`, which *is* the `<footer>`.

```astro
<header>
  <TopNav items={items} />          <!-- <nav aria-label="Corporate"> -->
  <ProductMenu … />                 <!-- <nav aria-label="Product">   -->
</header>

<main>
  <h1>…</h1>                        <!-- one per page, and it is the subject -->
  <FormCard headingLevel={2} … />   <!-- the card is the <form> -->
</main>

<footer>
  <Footer products={products} />    <!-- a <section>, named by `label` -->
  <FooterBar />                     <!-- already a <footer>; do not wrap it -->
</footer>
```

The same rule governs headings: a component that hard-codes its level breaks the
outline wherever it does not happen to sit at that depth, so `Footer`, `FormCard`
and `TrialKeyCard` take a `headingLevel` prop and default to what they rendered
before.

The full reference — element-by-element, with the mistakes this library actually
had — is `docs/09-semantic-html.html`.

## Components

### `Button.astro`

> **Needs Tailwind.** This component has no `<style>` of its own — every value
> comes from a utility class. See [Setup](#setup) for the two ways to satisfy that.

```astro
---
import Button from '.../astro-components/components/Button.astro';
---
<Button variant="primary" size="md">Get started</Button>
<Button variant="outline" size="sm" href="/pricing">Outline link</Button>
<Button variant="ghost" disabled>Disabled</Button>
```

Props: `variant` (`primary` | `secondary` | `tertiary` | `outline` | `ondark` | `ghost`, default `primary`),
`size` (`lg` | `md` | `sm`, default `md`), `wrap`, `disabled`, `type`, `href` (renders an `<a>` instead of `<button>`), `class`.

`wrap` lets a long label break onto a second line instead of leaving the button.
It is off by default — one line reads better, and most labels are short. Reach
for it where the label is long and the container is narrow: a label that cannot
bend does not shrink, so it overflows, and if any ancestor is `overflow: hidden`
it is cut with no scrollbar to show for it. Turning it on also swaps the fixed
height for the same value as a minimum, so the pill grows rather than clipping
the second line. It has to be this prop and not a `whitespace-normal` you pass
through `class`: both are one class deep, so the winner is decided by their
order in the compiled stylesheet, and `nowrap` is emitted after `normal`.

### `TextLink.astro`

Two variants for two contexts:

```astro
<!-- plain — general / marketing pages: coloured text, no underline -->
<p>Save 80% on all 10 products with the new <TextLink href="/iron-suite">Iron Suite</TextLink></p>

<!-- underline — long-form content (blog, news): neutral text, underline thickens + darkens on hover -->
<p>Save 80% on all 10 products with the new <TextLink href="/iron-suite" variant="underline">Iron Suite</TextLink></p>

<TextLink href="/docs" variant="underline" dark>Create Blank PDF</TextLink>
<TextLink href="https://example.com" external>Learn more</TextLink>
```

Props: `href` (required), `variant` (`plain` | `underline`, default `plain`), `dark` (use on dark backgrounds — code blocks, dark sections), `external` (adds `target="_blank" rel="noopener"` + a trailing north-east arrow icon), `class`. The slot is the link text.

- **`plain`** — `--color-text-link` / hover `--color-text-link-hover`, no underline. For general and marketing pages where a whole paragraph of underlines would read as dense.
- **`underline`** — text stays `--color-text-heading` throughout; a separate `--color-border-selected`-coloured underline goes from 50% opacity/1px thick (default) to 100% opacity/2px thick (hover) — implemented with `text-decoration-color: color-mix(in srgb, var(--color-border-selected) 50%, transparent)` rather than a separate absolutely-positioned line (which is how the Figma source models it); real `text-decoration` reflows correctly with text wrapping, a manual line does not.

`dark` swaps each variant's light-mode tokens for the matching dark-mode ones — currently identical values, kept separate for when dark mode diverges from light.

The external marker is an **icon, not a `↗` character** — this was the last
component still setting one in type. Montserrat carries `U+2191` and `U+2193`
but not `U+2197`, so the arrow fell through `--font-sans` onto whatever face the
OS picked: at 0.7em of 16px text, `.SF NS` painted 6.63px of ink in an 8.88px
box while `Hiragino Sans` painted 9.90px in 11.20px. Same trap as FormCard,
Select, FileUpload and Tooltip. It is `icons.arrowRight` **rotated -45°**,
because Font Awesome Free Solid has no bare north-east arrow (`arrow-up-right`
is Pro, and `arrow-up-right-from-square` is a different mark) — which is also
why it is the one caller that does not use the module's own `viewBox`: 512×384
of ink turned 45° needs 633 units of box, so the stock 512 would clip the tips.
Sized `0.55em`, since `TextLink` sets no `font-size` and inherits the run it
sits in; that puts 8.7px of ink against Montserrat 600's measured 8.66px
x-height at 16px, so it reads level with the lowercase at any size.

**Known, and unchanged from the character it replaced:** in a narrow column the
arrow can wrap onto a line of its own — an atomic inline offers a line-break
opportunity at its own boundary, with no whitespace needed, and a `U+2060` word
joiner in that gap does not stop Chrome (measured at 375px, with the joiner
confirmed present in the built markup). The only reliable fix is
`white-space: nowrap` around the last word *and* the icon, which a `<slot>`
cannot reach into.

### `Input.astro`

> **Needs Tailwind.** This component has no `<style>` of its own — every value
> comes from a utility class. See [Setup](#setup) for the two ways to satisfy that.

```astro
<Input label="Email address" name="email" type="email" placeholder="you@example.com" hint="We'll never share your email." />
<Input label="Email address" name="email" error errorMessage="Enter a valid email address." value="not-an-email" />
```

Props: `label`, `id`, `name`, `type` (default `text`), `placeholder`, `value`, `hint`,
`error`, `errorMessage`, `disabled`, `required`, `class`.

### `Textarea.astro`

> **Needs Tailwind.** This component has no `<style>` of its own — every value
> comes from a utility class. See [Setup](#setup) for the two ways to satisfy that.

```astro
<Textarea label="Message" name="message" placeholder="Type your message here…" hint="Tell us a bit about what you need." />
<Textarea label="Message" name="message" error errorMessage="Message must be at least 20 characters." value="too short" />
```

Props: `label`, `id`, `name`, `placeholder`, `value`, `rows` (default `3`), `hint`,
`error`, `errorMessage`, `disabled`, `required`, `class`. Shares Input's field/label/hint/error tokens — the two always feel like one family.

### `FileUpload.astro`

```astro
<FileUpload name="doc" />
<FileUpload name="doc" error errorMessage="File too large" />
<FileUpload name="doc" fileName="quote-request.pdf" fileSize="2.4 MB" />
```

Props: `label` (default `Drag & drop your file`), `linkText`, `sizeLimitText`, `name`, `accept`,
`error`, `errorMessage`, `disabled`, `fileName` + `fileSize` (renders the has-file state), `class`.

The whole dropzone is a `<label>` wrapping a visually-hidden native `<input type="file">`, so click-to-browse works with zero JS. A scoped `<script>` adds drag-over styling and wires a `Remove` button that dispatches a `file-remove` custom event (bubbles) — the consuming app decides what removal actually does, this component only handles the visual state.

The dropzone icon (upload / has-file / error) is an inline **Font Awesome Free Solid** SVG — `cloud-arrow-up`, `circle-check`, `triangle-exclamation` — path data hard-coded directly in the component, `fill="currentColor"` so it inherits the icon-box's tint color per state. No icon font or CDN dependency.

### `Select.astro`

> **Needs Tailwind.** This component has no `<style>` of its own — every value
> comes from a utility class. See [Setup](#setup) for the two ways to satisfy that.

```astro
<Select
  label="Country"
  name="country"
  placeholder="Select a country"
  options={[
    { value: 'us', label: 'United States' },
    { value: 'th', label: 'Thailand' },
    { value: 'jp', label: 'Japan' },
  ]}
  value="us"
/>
```

Props: `label`, `options` (`{ value, label }[]`, required), `value`, `placeholder`,
`name`, `error`, `errorMessage`, `hint`, `disabled`, `required` (blocks form
submit when empty; also sets `aria-required` on the trigger), `class`.

A hidden native `<select>` mirrors the chosen value so the component still
works inside a plain HTML `<form>` submit without JS — `tabindex="-1"` +
`aria-hidden="true"` keep it out of the tab order and the accessibility tree
once the enhanced UI takes over, so keyboard/AT users don't hit two controls
for one field. The visible dropdown is progressively enhanced via the
component's own `<script>` (safe with multiple `<Select>` instances on one
page, and re-initializes on Astro View Transitions).

The selected-option checkmark is an inline **Font Awesome Free Solid** `check` SVG (`fill="currentColor"`), shown via `opacity` toggle — no icon font or CDN dependency.

**Accessibility (WAI-ARIA "select only" listbox pattern):** the trigger carries `aria-haspopup="listbox"` + `aria-expanded` + `aria-controls`, and is named via `aria-labelledby` (label + trigger, so the accessible name includes the current value). The menu is `role="listbox"` with `aria-activedescendant` tracking the highlighted option as DOM focus stays on the listbox — options are `role="option"` + `aria-selected`. Full keyboard support: `↑`/`↓` moves the highlight, `Home`/`End` jump to the ends, `Enter`/`Space` commits and closes, `Esc` closes without changing the value, and both close paths return focus to the trigger. `error`/`hint` wire up `aria-invalid` + `aria-describedby`. Fixed 2026-07-20 — previously the custom dropdown had zero ARIA and the hidden native `<select>` was still keyboard-focusable, creating an invisible duplicate tab stop.

### `Checkbox.astro`

> **Needs Tailwind.** This component has no `<style>` of its own — every value
> comes from a utility class. See [Setup](#setup) for the two ways to satisfy that.

```astro
<Checkbox label="Accept terms" description="By clicking, you agree." checked />
<Checkbox label="Required" invalid />
<Checkbox label="Accept terms" description="Whole card is the target." card />
```

Props: `label`, `description`, `id`, `name`, `checked`, `invalid`, `disabled`, `card` (renders the whole-card selectable layout), `class`.

### `Radio.astro`

> **Needs Tailwind.** This component has no `<style>` of its own — every value
> comes from a utility class. See [Setup](#setup) for the two ways to satisfy that.

```astro
<Radio name="bill" value="monthly" label="Monthly" description="$29/month" checked />
<Radio name="bill" value="yearly" label="Yearly" />
<Radio name="bill" value="monthly" label="Monthly" card checked />
```

Props: `name` (required — groups radios), `value` (required), `label`, `description`, `id`, `checked`, `invalid`, `disabled`, `card`, `class`.

### `Badge.astro`

> **Needs Tailwind.** This component has no `<style>` of its own — every value
> comes from a utility class. See [Setup](#setup) for the two ways to satisfy that.

```astro
<Badge intent="success" dot>Active</Badge>
<Badge intent="warning">Pending</Badge>
<Badge intent="info" variant="solid">Beta</Badge>
<Badge intent="important">Important</Badge>
<Badge intent="neutral" pill>Draft</Badge>
<Badge intent="info" size="sm">Small</Badge>

<!-- dark mode: no prop — a .dark ancestor re-themes every badge -->
<div class="dark"><Badge intent="success">Active</Badge></div>
```

Props: `intent` (`success` | `warning` | `danger` | `info` | `important` | `neutral`, default `neutral`), `variant` (`subtle` | `solid`, default `subtle`), `size` (`sm` | `md`, default `md`), `pill`, `dot`, `class`.


Subtle fill/text use the semantic `--color-{intent}-subtle` / `--color-{intent}-strong` pair; solid uses the base `--color-{intent}` (verified against Figma node `776-899`). Every value is a semantic token, so dark mode needs no per-badge rule — inside a `.dark` ancestor those tokens swap to their Dark Purple counterparts (see the `.dark` block in `tokens.css`) and the badge re-themes automatically. `important` and `neutral` are full semantic intents with their own subtle/strong/base tokens (from the Figma color_ui export), the same as the original four.

Default shape is `--rounded-sm` — Figma's Badge frame (node `776-899`) uses this on every badge, not a pill. `pill` opts into the fully-rounded `--rounded-full` shape instead (this used to be the component's default, with a `square` prop for the opposite; the default and prop were swapped 2026-07-17 to match Figma).

### `Notice.astro`

Non-interactive informational block — disclaimers, notes, tips, callouts. Two shells for two contexts, five intents shared by both:

```astro
<!-- filled — tinted rounded card, icon + title on their own line -->
<Notice variant="filled" intent="info" title="Please note" text="Aspose, SyncFusion, and iText are registered trademarks of their respective owner." />

<!-- bordered — coloured left bar, icon + bold label lead straight into the paragraph -->
<Notice variant="bordered" intent="info" title="Please note" text="Aspose, SyncFusion, and iText are registered trademarks of their respective owner." />

<Notice variant="filled" intent="important" title="Important" text="Requires design sign-off before shipping." />
```

Props: `variant` (`filled` | `bordered`, default `filled`), `intent` (`info` | `success` | `important` | `warning` | `danger`, default `info`), `title` (required), `text` (required), `live` (default `true`), `class`.

The root is an `<aside>` — the HTML spec names "call-out boxes" as an aside, which is what this is. By default it also carries a live-region role derived from the intent: `alert` for `warning` and `danger`, `status` for the rest. Because an explicit role overrides the element's implicit one, a default notice adds **no** complementary landmark. Pass `live={false}` for a notice that is standing page furniture rather than a response to something the user did — a live region already on screen at load can be announced out of nowhere. That variant does become a landmark, which is the case where a standing call-out genuinely is complementary content.

Only the icon (and, on `bordered`, the left bar) carries the intent colour — the title and paragraph always stay neutral (`--color-text-heading` on `filled`, `--color-text-body` on `bordered`). `important` is a genuinely new intent (not one of the system's original 4 semantic colours) — it uses the `iron-purple-50`/`iron-purple-500` primitives directly since there's no `status/important` semantic token yet.

Each intent's icon is an inline **Font Awesome Free Solid** SVG (`circle-info`, `circle-check`, `circle-exclamation`, `triangle-exclamation`, `circle-xmark`) — path data hard-coded in the component, `fill="currentColor"` so it inherits the intent color. No icon font or CDN dependency; see "Icon strategy" below.

### `Tooltip.astro`

```astro
<Tooltip title="Title" body="Supplementary detail here." linkHref="/docs" linkText="Learn more">
  <button class="tt-trigger">Hover me</button>
</Tooltip>
<Tooltip body="Compact, title-less tooltip." placement="below">
  <button class="tt-trigger">No title</button>
</Tooltip>
```

Props: `variant` (`default` | `action`, default `default`), `title` (omit for the compact, title-less variant), `icon` (a name from `../icons`), `body` (required), `linkHref`, `linkText`, `placement` (`above` | `below` | `left` | `right`, default `above`), `wide` (widens the bubble for longer copy), `class`. The trigger is whatever you put in the default slot.

`variant` is Figma's own axis. `action` left-aligns the bubble and opens the
title's icon slot; `default` centres everything and draws no icon. **A tooltip
with a link is `action` whether or not you pass the prop** — Figma draws no
centred tooltip carrying a link, and that inference is what the component did
before the prop existed, so nothing written earlier changes behaviour. `icon`
needs a `title` to sit in and is ignored on `default`, which is the one
combination the canvas does not draw.

The link's trailing arrow is an **icon, not a `→` character**. Montserrat has no
arrow glyph, so a bare one falls out of the font stack onto the system face and
changes width — the trap FormCard and Select both hit. The arrow beside the
bubble is a rotated, corner-rounded square rather than the usual CSS border
triangle: Figma's 5.17157px depth is a 90° tip with a 2px radius
(`6 − 2(√2−1)`), and a border triangle can neither round its tip nor stop at
anything but the full 6px.

Ships its own `<script>` for the hover-with-a-gap interaction (JS open/close with a 200ms close-delay, since pure CSS `:hover` breaks once there's a gap between trigger and bubble and the mouse can't reach a link inside) — scoped per-instance, safe with multiple `<Tooltip>`s per page, re-initializes on Astro View Transitions.

### `FlyoutMenu.astro`

A trigger that reveals a floating panel of navigation links — the mega-menu behind **PRODUCTS** on ironsoftware.com, built for `TopNav` to compose.

```astro
<FlyoutMenu label="Products" align="center" notch>
  <div class="my-column">…</div>
  <div class="my-column">…</div>
</FlyoutMenu>
```

| Prop | |
|---|---|
| `label` | trigger text, required |
| `openOnHover` | adds hover to click and focus; off by default |
| `align` | `start` / `center` / `end` — which edge the panel pins to |
| `notch` | draws the pointer up at the trigger |
| `open` | render open on first paint, for docs and tests |
| `class` | |

The panel is a slot — whatever you put in it becomes the flyout. Its direct children are numbered by the script and rise in turn as it opens, so composing columns needs no hand-numbering and a column inserted in the middle cannot leave the sequence stale.

**It is a disclosure, not a `role="menu"`, and that is the one decision here worth defending.** `menuitem` tells assistive tech the contents are *commands*, which strips link semantics — a screen reader stops announcing "link" and stops listing them — and it commits to arrow-key navigation with a roving `tabindex` where Tab leaves the whole menu instead of walking it. This follows the WAI-ARIA APG's Disclosure Navigation pattern instead, the same as `FooterBar`'s Free tools panel: `aria-expanded` + `aria-controls` on a real `<button>`, ordinary links inside, `inert` while closed, Escape closing and returning focus, focus leaving the component closing it, a pointer press outside closing it, and only one open at a time across the page.

`openOnHover` adds hover *on top of* click and focus rather than replacing them, ignores `pointerType: 'touch'` so a tap is never read as a hover, and carries a 150ms close delay so a diagonal cursor path from trigger to panel does not drop it.

**On a hover flyout a click only ever opens** (Ball's call, 2026-08-05). The failure that fixes is common and feels broken: the pointer arrives, the panel opens, and the user clicks the trigger anyway — because that is what triggers are for — which shuts the panel in their face and leaves it shut until they move away and come back. The rule is narrowed by a `:hover` test rather than applied blindly, so the keyboard keeps its toggle: a disclosure reporting `aria-expanded="true"` that refuses to collapse on Enter is a broken contract, and opened by Tab and Enter it still closes on Enter. Escape, an outside press and focus leaving all still close it either way.

**The visual layer is provisional** — built ahead of the Figma frame on purpose, since the interaction contract does not depend on it. Padding, radius, shadow, panel width and the caret are neutral token placeholders. The live site's own nav fails three things this does not: its trigger is an `<a href>` so the panel is hover-only, its `aria-expanded` is hard-coded `false` and never updates, and its `aria-haspopup="true"` promises a `role="menu"` that is not there.

### `Footer.astro`

> **Needs Tailwind.** This component has no `<style>` of its own — every value
> comes from a utility class. See [Setup](#setup) for the two ways to satisfy that.

```astro
<Footer
  variant="default"
  productName="IronPDF"
  products={[
    { prefix: 'IRON', suffix: 'PDF', desc: 'Create, read, and edit PDFs.', accent: 'var(--iron-blue-500)' },
    { prefix: 'IRON', suffix: 'WORD', desc: 'Edit DOCX Word files.' },
  ]}
/>
```

Props: `variant` (`suite` shows the full-brand logo headline; `default` names the current product for cross-sell, default `default`), `productName` (required when `variant="default"`), `products` (`{ prefix, suffix, desc, accent?, href? }[]`, required), `headingLevel` (`2` | `3` | `4`, default `2`), `label` (landmark name, default `Iron Suite`), `donateImgSrc`, `suiteLogoImgSrc`, `productLogoSrc` (asset path overrides — defaults point at the docs' relative paths, supply your own), `class`.

**`product.href` is rendered.** Each row is an `<a>`. It had been in the interface since this component shipped and was never used — the rows were `<span>`s with `cursor: pointer`, so ten internal links were invisible to a crawler and unreachable by keyboard. Rows with no `href` fall back to `#`, matching every other component here. The band's root is a `<section>` named by `label`, and the headline is a real heading whose level you set with `headingLevel` — the band cannot know how deep it sits in your page.

**The two CTAs are real `Button` instances** — `variant="tertiary"` and `variant="ghost"`, both `size="lg"` — because that is what Figma composes here (nodes `507:4078` / `507:4079`). They were hand-rolled `.btn-dark` / `.btn-text-light` rules until 2026-08-03 and had drifted: gap 8 against the DS's 12, and the ghost one was not a button at all, rendering as a 19px text link with no padding, no pill, and a white label where Figma paints `on-action-tertiary` blue. If you restyle these, restyle `Button.astro`.

Their icons are inline **Font Awesome Free Solid** `key` and `arrow-right` SVGs. Figma sets both in FA 7 Pro *Regular*, which is not reachable — free-regular ships 273 icons and neither is among them — so Solid is the closest weight and the buttons come out 3–4px wider than the design file's. That is why the CTA row is `justify-content: space-between` with no column gap: Figma's own 18px spacing is what space-between produced at its narrower widths, and any fixed gap pushes the pair past the 567 column.

### `FooterBar.astro`

**Not the same component as `Footer.astro`, despite the name.** `Footer` is the violet IRONSUITE cross-sell band; `FooterBar` is the black bar that sits *underneath* it — menu, review badges, brand, socials, partner logos, legal line. They stack; neither replaces the other. From Figma's "Footer 2026" section (node `263:1386`, set `footer-lg` `877:2953`).

```astro
<!-- every band, all defaults -->
<FooterBar basePath="/assets" />

<!-- Figma's "Free tools version" — reveals the Free Tools menu item -->
<FooterBar freeTools basePath="/assets" />

<!-- Figma's "Free tool open" — the item becomes a disclosure for the tools panel -->
<FooterBar freeTools toolsOpen basePath="/assets" />
```

**No `variant` prop**, unlike the other seven components that have one. Figma's `Property 1` axis (`Default` / `Free tools version` / `Free tool open`) is two booleans here, because the three values are not mutually exclusive looks — they are cumulative states, and `toolsOpen` is a starting position the component's own trigger takes over from the moment anyone clicks. A `variant` union would have made "open" a thing the caller sets and the component then contradicts.

Props, all optional — every one has a real default, so `<FooterBar />` renders the whole Iron Software footer as drawn:

| | |
|---|---|
| `menu` | `{ label, href?, caret? }[]` — the top row |
| `freeTools` | reveals the Free Tools item (hidden in Figma's Default variant, not absent) |
| `freeToolsLabel`, `freeToolsHref` | its label and target |
| `toolGroups` | `{ title, icon?, columns }[]` — the panel. `columns` is `Link[][]`: a list *of columns*, each a list of links, because Figma's column breaks are editorial, not something a layout algorithm should guess at. `icon` is a named glyph (`arrowsRotate` \| `penToSquare` \| `wrench`) |
| `toolsOpen` | render the panel already open; the trigger owns it after that |
| `closeToolsLabel` | `aria-label` for the close button |
| `reviews` | `{ name, logo, stars, starsHover, score, outOf? }[]` — two artwork files per row, not one plus a CSS filter (see below) |
| `address`, `copyright` | single strings |
| `socials` | `{ name, icon, href? }[]` |
| `slackLabel`, `slackHref` | the Join Iron Slack row |
| `partners` | `{ name, logo, width }[]` — `width` in px, height is fixed at 28 |
| `legal` | `{ label, href? }[]` — the Terms / Privacy / Cookie line |
| `donateLabel`, `donateImg` | the 1% for the Planet block |
| `basePath` | where `docs/assets/` was copied to, default `assets` |
| `class` | |

Assets are real files here, like `Logo.astro` — a partner logo is artwork and no token can stand in for it. `basePath` is the escape hatch; filenames are URL-encoded rather than interpolated raw, because `1% logo - Horizontal.png` contains a percent sign and `% l` is an invalid escape sequence.

Three things that look like bugs and are not:

- **The band fills are the opposite way round to the token names.** The menu row and brand row are both `--color-bg-footer-alt`; only the bottom legal row is `--color-bg-footer`. This component is the first consumer either token has ever had.
- **Both star rows are white at 30%** — that is the *empty* state, which is why they read as grey. The filled row is a second artwork file, not a CSS filter: the 30% is baked into the resting SVG as `opacity="0.3"` on white paths, and nothing CSS can do to an `<img>` reaches inside to raise the alpha, let alone recolour it.
- **The Free tools panel opens with `grid-template-rows: 0fr → 1fr`**, not an animated `max-height` — no number to guess, no number to go stale when someone adds a link. It keeps `inert` while collapsed (it has to stay in the DOM to animate, and without `inert` a closed panel silently holds nine links in the tab order), and collapses to a cut under `prefers-reduced-motion`.

Ships its own `<script>` for the disclosure — scoped per-instance, safe with multiple `<FooterBar>`s per page, re-initializes on Astro View Transitions, same pattern as `Tooltip`.

**All three of Figma's frames are built** — `footer-lg` (877:2953), `footer-md` (879:649) and `footer-sm` (879:650) — mapped onto the project's own breakpoints: lg holds down to 1024, md covers 768–1023, sm everything below. The two smaller frames are two bands where lg is three, but the top two lg bands already share a fill, so only padding and gaps change; the menu drops its 16px per-item padding for a flat 12px gap and wraps, and the middle and legal bands become grids so the brand lockup and the socials can stay on one row at md while everything centres and stacks at sm. The breakpoints are literal numbers, not `var(--breakpoint-lg)` — a custom property in a media query condition never matches.

**The Free tools panel has no md or sm frame** — all three of its variants live on `footer-lg` — so instead of inventing two fixed layouts it fits itself to any width, with no breakpoint-specific number in it. The groups stack, and inside each one Figma's editorial column breaks stay intact as grid items while `auto-fill` decides how many sit per row: 4 at 768, 2 at 375, 1 at 320. Note that the `auto-fill` floor and the column gap spend the same pixels (`n × floor + (n−1) × gap ≤ width`), so raising one costs the other a column.

The docs page previews all of this in a **resizable frame** — drag the handle or use the 375/768/1024 presets, and the readout names which of the three layouts you are looking at. It has to be an `<iframe>`: these layouts key off the viewport, and `.frame-scroll` pins every ordinary demo on the page to 1440. The frame loads the same page again at `?frame=<region>`, so nothing is duplicated to make it work. Deviations from the design file — including two the design side agreed to fix — are listed on that page too.

### `FormCard.astro`

> **Needs Tailwind.** This component has no `<style>` of its own — every value
> comes from a utility class. See [Setup](#setup) for the two ways to satisfy that.

Generic wrapper for icon+title form cards (the "Request a Quote" / "Tell us what you're migrating from" pattern) — compose it with `Input` / `Select` / `Textarea` / `FileUpload` / a plain `<button>` submit as children:

```astro
<FormCard
  icon="quote"
  title="Request Your Discounted Quote"
  submitLabel="Get Your Migration Quote"
  action="/api/quote"
  method="post"
  noteLeft="No obligation to proceed"
  noteRight="Response within 1 business day"
>
  <Input label="First name *" name="firstName" />
  <Input label="Last name *" name="lastName" />
  <Input label="Email address *" name="email" type="email" placeholder="you@example.com" />
  <Select label="Document library I am replacing" name="library" placeholder="Choose option" options={[...]} />
  <FileUpload name="quoteFile" />
</FormCard>
```

Props: `icon` (`'quote' | 'key' | 'check'`), `title`, `subtitle`, `submitLabel`, `noteLeft`, `noteRight`, `headingLevel` (`2`–`5`, default `3`), `action`, `method` (`get` | `post`), `class`. Fields go in the default slot.

**The card's root is the `<form>` — do not wrap it in one.** It used to be a `<div>` holding a `type="submit"` button with no form anywhere, so the submit did nothing on its own and this README told you to add the `<form>` yourself; nesting one now would be invalid HTML. Omit `action` to post to the current URL. The form is named by its own title via `aria-labelledby`, and the title's level is a prop — it was a hard-coded `<h3>`, which broke the page outline anywhere the card did not happen to sit under an `<h2>`.

`icon` is a named icon, not a free-form string — it resolves to an inline **Font Awesome Free Solid** SVG (`file-invoice` / `key` / `check`) inside the component, same approach as `Notice.astro`/`FileUpload.astro`. Previously this took an emoji string directly; changed 2026-07-17 for consistency with the rest of the icon system. Ask before adding a 4th icon name — extract the path data with the method in "Icon strategy" below.

### `TrialKeyCard.astro`

> **Needs Tailwind.** This component has no `<style>` of its own — every value
> comes from a utility class. See [Setup](#setup) for the two ways to satisfy that.

The centered, single-field "instant capture" card pattern (different enough from `FormCard` — centered icon halo, one input, no label row — that it's its own component rather than a `FormCard` variant):

```astro
<TrialKeyCard
  icon="key"
  headingBold="30-day Trial Key"
  inputPlaceholder="Your Business Email*"
  inputName="trialEmail"
  hint="Your trial license will be sent to this address"
  submitLabel="Get my free trial key"
  submitIcon="key"
  footerNotes={['Free for development', 'Trial key in 60 seconds', 'No credit card']}
/>
```

Props: `icon` (`'quote' | 'key' | 'check'`), `headingPrefix` (default `"Get your free"`), `headingBold` (required — rendered bold), `headingSuffix` (default `"instantly."`), `inputPlaceholder`, `inputName`, `inputLabel` (defaults to the placeholder), `hint`, `submitLabel`, `submitIcon` (same 3-value type, optional), `footerNotes` (`string[]`), `headingLevel` (`2`–`5`, default `3`), `action`, `method` (`get` | `post`), `class`.

Both `icon` and `submitIcon` resolve to inline Font Awesome SVGs the same way as `FormCard.astro` — see that section above.

**The root is the `<form>`** (same change as `FormCard`), and the email field now has a real `<label>`, rendered visually hidden because the design has no room for a visible one. A placeholder is not a label: it is not announced by every screen reader, and it vanishes the moment the user types, taking the only description of the field with it. Override the wording with `inputLabel`. The field also gained `autocomplete="email"` and `required`, and the headline is a real heading rather than a `<p>`, so the card contributes to the page outline.

The `footerNotes` row is a `<ul>`, and each dot separator sits **inside** the item it precedes rather than between items — the row wraps, and a separator that is its own flex child gets stranded at the end of a line. Same convention as the `FooterBar` menu dividers. This is the one visible change in the semantic pass: where the row wraps, the dot now travels to the next line with its label instead of dangling at the end of the previous one.

### `Logo.astro`

> **Needs Tailwind.** This component has no `<style>` of its own — every value
> comes from a utility class. See [Setup](#setup) for the two ways to satisfy that.

The three logo families from Figma section `471:112` behind one prop API:

```astro
<!-- marks — 12 products × colour/mono -->
<Logo product="pdf" />
<Logo product="pdf" mono />
<Logo product="suite" size={96} />

<!-- wordmarks — iron: default/ondark/mono · suite: default/ondark -->
<Logo kind="wordmark" brand="iron" />
<Logo kind="wordmark" brand="iron" variant="ondark" height={40} />

<!-- illustrative product elements -->
<Logo kind="element" product="drawing" />

<!-- as a link, and decorative next to a visible name -->
<Logo product="pdf" href="/ironpdf" />
<Logo product="pdf" label="" /> <span>IronPDF</span>
```

Props: `kind` (`mark` | `wordmark` | `element`, default `mark`), `product`, `brand`
(`iron` | `suite`), `variant` (`default` | `ondark` | `mono`), `mono` (mark only),
`size` (`24` | `48` | `96` | `192`, default `48`), `height` (wordmark only, default `32`),
`href` (renders an `<a>` with `aria-label`), `label` (alt override — pass `""` for
decorative use), `basePath` (default `assets`), `class`.

**This is the one component that references real files.** A logo *is* its artwork —
there is no token that can stand in for it — so `basePath` is the escape hatch,
same idea as `Footer.astro`'s `*ImgSrc` props: point it at wherever you copied
`docs/assets/` to.

`size` is typed to exactly four values on purpose. The mark is drawn on an 8-unit
grid at 192px; each halving halves the grid unit, so only 24/48/96/192 keep every
edge on a whole pixel. Off-grid sizes aren't in the type.

Two naming traps worth knowing:

- **Marks and elements are different families with different keys.** A mark is
  `wd`/`bc`/`prt`/`ws`; the matching element is `word`/`barcode`/`print`/`webscraper`.
  The element files also kept their original export names (`logo-01-pdf.svg` …
  `logo-13-freetools.svg`) — the numbering is a Figma export artefact, and several
  docs pages already link them, so they were not renamed when the `mark-*.svg`
  family was added. `ELEMENT_FILES` in the component maps over it.
- **Iron Suite has no mono wordmark in Figma.** `brand="suite" variant="mono"`
  falls back to `default` rather than requesting a file that doesn't exist.

### `ProductMenu.astro`

The full-width product header from Figma node `790:4778` — brand lockup, main
navigation, Search / Ask AI utilities and the primary CTA, plus an optional
second tier of sub-navigation chips:

```astro
<ProductMenu
  product="pdf" productName="PDF"
  items={[
    { label: 'Home', active: true },
    { label: 'Licensing', href: '/licensing' },
    { label: 'Features' },
    { label: 'Demos' },
    { label: 'Docs' },
  ]}
/>

<!-- with the sub tier -->
<ProductMenu
  variant="submenu"
  items={items}
  subLead={{ label: 'Get Started' }}
  subItems={[{ label: 'Tutorials' }, { label: 'API Reference' }]}
  showMenuItems2
  subItemsTrailing={[{ label: 'Licensing' }]}
/>
```

Props: `variant` (`default` | `submenu`), `product`, `productName`, `runtime`
(default `"for .NET"` — pass `""` to hide), `productHref`, `hasTrailingIcon`,
`items` (`{ label, href?, active?, caret? }[]`), `subLead`, `subItems`,
`showMenuItems2`, `subItemsTrailing`, `ctaLabel`, `ctaHref`, `showSearch`,
`showAskAi`, `searchLabel`, `askAiLabel`, `basePath` (default `assets`), `class`.

`hasTrailingIcon` and `showMenuItems2` keep Figma's own property names so the
component stays traceable to the design file — the first toggles the caret after
the product lockup, the second the divided trailing group at the right end of the
sub tier.

Every Figma variable on this component already had a system counterpart, so it
introduced **no new tokens** — `surface/card-alt` → `--color-bg-card-alt`,
`border/strong` → `--color-border-strong`, `neutral/50` → `--neutral-50`, and so
on. Menu items use Figma's "Typography/UI/Button large" style (`--fw-btn-lg` /
`--font-size-base`); the CTA uses "Typography/UI/Button default" (`--fw-btn` /
`--font-size-sm` / `--leading-4`).

Three things worth knowing before you change it:

- **The tier is 72px *including* its bottom rule** (Figma's submenu variant is
  137px = 72 + 65). `.pm-bar` therefore sets `box-sizing: border-box`, and menu
  items stretch to the bar instead of carrying their own height.
- **Both side columns are `flex: 1 0 0`**, not `1 0 auto`. That is what keeps the
  menu optically centred instead of being pushed around by the brand's width —
  but only above 1058. Below that the rule flips to `1 0 auto`, because basis 0
  on two columns that cannot shrink splits the free space equally whatever each
  one needs, and never asks the centre column (which scrolls) to give anything
  up. That is what put the CTA and the wordmark outside their boxes at 769–1057.
- **The 40px brand mark is off the logo grid.** `Logo.astro`'s `size` is typed to
  24/48/96/192, but Figma uses 40px here, so the mark is a plain `<img>` rather
  than a `<Logo>`. Widening Logo's union would undermine the grid rule for every
  other caller.

Figma covers 1440px desktop only — there is no mobile frame. The narrow-viewport
behaviour is an implementation decision, not a handed-over design: drop the
runtime label at 1180px, the utility bubbles and the menu's optical centring at
1058px, let the sub tier scroll at 1043px, turn the centre group into a panel at
769px, and take the CTA down to its two glyphs at 434px. Every number except
1180 is the width its own content measured out at, found by sweeping 1px at a
time — the one that used to be round, 1024, was 33px and 275px under what two
different pieces needed, which is the band the CTA and the trailing chip group
were spilling in.

- **The centre group is a disclosure below 769**, not a deletion. Same WAI-ARIA
  pattern as `TopNav`'s corporate menu and `FooterBar`'s tools tab, and the same
  `<ul>` at every width — inline above the breakpoint, stacked below it — so one
  set of links, nothing to keep in sync, and no screen reader hears "Licensing"
  twice. Escape closes and returns focus; an outside click closes without taking
  it.
- **434 is the trigger's own cost.** The bar needs 410 for the brand and the full
  CTA; a 24px button and its 16px gap took that to 434, which broke 320/375/414
  — clean a moment earlier. This is the second time adding an affordance moved a
  narrow-end number (`deb78df` was the first), so re-sweep the narrow end after
  adding one, not just the band being fixed. Below 434 the brand drops its
  chevron and the CTA's label moves to a clipped 1px box — **not**
  `display: none`, which would leave a pink pill with no accessible name.

### `TopNav.astro`

The 40px corporate utility strip that sits above `ProductMenu`, from Figma node
`507:5349`:

```astro
<!-- both strips belong inside the page's own <header> — see "Where these sit" -->
<header>
  <TopNav items={[
    { label: 'Products', href: '/products' },
    { label: 'Enterprise' },
    { label: 'Solutions' },
    { label: 'Resources' },
    { label: 'About US' },
  ]} />
  <ProductMenu product="pdf" productName="PDF" items={menu} />
</header>

<!-- over a hero image -->
<TopNav variant="transparent" items={items} />

<!-- region-neutral, single locale -->
<TopNav items={items} showAddress={false} showLanguage={false} />
```

The office line renders as `<address>`, the element for the contact details of the nearest article or document. It costs two resets the component already carries — the UA italicises `<address>` and gives it block margins.

**Narrow widths need no props.** The strip sheds in three measured stages, and a
hamburger takes over where the menu no longer fits inline:

| below | what changes |
|---|---|
| **1260** | the address goes — the longest item and the least navigational |
| **945** | the corporate menu becomes a panel under the bar, opened by the hamburger |
| **420** | Contact Us and the language picker move into that same panel |

Every number is the width the content actually stops fitting at, measured on the
rendered bar rather than read off Figma, which covers 1440 only. The menu is the
same `<ul>` at every width — inline above 945, the panel below it — so a screen
reader is never offered two copies of the same link. The trigger follows the
WAI-ARIA disclosure pattern: it owns `aria-expanded`, points at the panel with
`aria-controls`, closes on Escape with focus handed back, and closes on a click
outside without stealing focus.

Props: `variant` (`default` | `transparent` — Figma's "Without bg"), `items`
(`{ label, href?, caret? }[]`, caret on by default), `showAddress` (Figma's own
toggle), `address`, `contact`, `language`, `showLanguage`, `brandHref`, `class`.

Like `ProductMenu` it introduced **no new tokens**: `slate/800` →
`--slate-800`, `text/on-dark/heading` → `--color-text-on-dark-heading`, and
the two type styles land on the system's existing nav-label / caption-sm
weights and letter-spacings.

Two details worth keeping:

- **The Iron Software mark is `--color-neutral` (#62748E), not white.** Verified
  against both the exported SVG's fill and the pixels of Figma's own render — it
  is deliberately recessive next to the white wordmark. Don't "fix" it to white.
- **Figma sets `gap: 0` between a label and its caret**, letting the caret's own
  16×16 box provide the spacing. The caret SVG therefore uses an offset
  `viewBox` (`-4.8768 -6.1177 16 16`) to centre its 6.2×3.8 triangle inside
  16×16, rather than adding a wrapper element or a gap.

Figma covers 1440px desktop only; the address drops at 1100px and the corporate
menu at 720px, which is an implementation decision rather than a handed-over
design.

## Prop API conventions

These are **descriptive, not aspirational** — they were read off the 18 existing
components (181 prop declarations, 100 distinct names). Follow them so a new
component feels like the rest of the family; where reality is already split, that
is called out rather than papered over.

### The shape every component has

Universal — all 18 do this, so a new component should too:

```astro
---
interface Props {
  /* … component-specific props … */
  class?: string;
}

const { /* …defaults… */, class: className } = Astro.props;
---

<div class:list={['root', { someFlag }, className]}>…</div>

<style>/* one block, the source of truth for this component's CSS */</style>
```

- **`class?: string`, destructured as `class: className`** — 18/18. `class` is a
  reserved word, so the alias is not optional.
- **`class:list` on the root, with `className` last** — 18/18. Trailing position
  is what lets a caller's utility class land after the component's own.
- **Exactly one `<style>` block** — 18/18, and it is the source of truth that
  `check:parity` holds the docs page to.

### Choosing a prop shape

| The prop expresses… | Shape | Examples in this library |
|---|---|---|
| One of several mutually exclusive looks | string union | `variant`, `intent`, `size`, `placement`, `kind` |
| A state that is either on or off | `boolean` | `disabled`, `error`, `checked`, `pill`, `dot` |
| Whether an optional part renders | `boolean`, named `show…` | `showSearch`, `showAskAi`, `showAddress`, `showLanguage`, `showMenuItems2` |
| Free-form content | slot (not a prop) | `Badge`, `Button`, `FormCard`, `TextLink`, `Tooltip` |
| Repeating content | array of small objects | `items`, `options`, `products`, `subItems`, `footerNotes` |

Never take a boolean where a union belongs. `variant="filled" \| "bordered"`
survives a third option; `filled={true}` does not.

### Naming

- **The variant axis is `variant`** unless the component has a more precise word
  for it: `Badge`/`Notice` use `intent` because the choice carries meaning rather
  than looks, `Logo` uses `kind` for its three families. Seven components use
  plain `variant`.
- **Booleans read as adjectives or `show…`/`has…`** — `disabled`, `checked`,
  `invalid`, `external`, `showAddress`, `hasTrailingIcon`. No `isX`.
- **Port names verbatim from Figma when they exist.** `hasTrailingIcon`,
  `showMenuItems2` and `variant` on the nav components are Figma's own property
  names, kept so the component stays traceable to the design file — even where a
  different name would read better in isolation.
- **Form-field props are a fixed set**, and a new field-like component should use
  all of them rather than inventing near-synonyms: `label`, `name`, `id`,
  `value`, `placeholder`, `hint`, `error`, `errorMessage`, `required`,
  `disabled`.

### Defaults and required props

- **Give every prop a default that has an obvious "plain" value**, in the
  destructure rather than the interface. Only 8 of 19 components take a required
  prop at all, and each one is genuinely un-defaultable content: `Notice.title`,
  `Select.options`, `Radio.name`/`value`, `TextLink.href`, `Footer.products`,
  `Tooltip.body`, and the card components' labels.
- **A required prop must be un-defaultable.** `TrialKeyCard` requires five, which
  is the most in the library — it renders blank or throws without them.
  `footerNotes` is required for exactly this reason: it is read with `.length`.
- **`href` switches the rendered tag** where it makes sense — `Button`, `Logo`,
  `ProductMenu` and `TopNav` render an `<a>` when given one and a
  `<button>`/`<span>` otherwise. Add `aria-label` on the anchor when the visible
  content is an icon.

### Naming rules

Settled 2026-08-06 after auditing every prop against its Figma node. Two were
genuinely wrong and were renamed; two looked wrong and turned out to be a rule
worth writing down.

**Renamed — breaking, done once, together:**

- **`Badge.small` → `size?: 'sm' | 'md'`** (default `md`). Figma's Badge set has
  shipped `size=sm|md` all along, and every other sized component takes `size`.
  A two-step boolean was the odd one out, not a simpler spelling of the same idea.
- **`Tooltip.maxWidth` → `wide?: boolean`.** The old name was wrong twice over: a
  boolean that reads like a length, and what it actually sets is `width: 350px` —
  a fixed width, not a maximum.

**Not inconsistencies — these two splits are deliberate, and Figma models them
the same way. Do not "unify" them:**

- **`invalid` (choice) vs `error` (text entry).** `Checkbox` and `Radio` take
  `invalid`; `Input`, `Textarea`, `Select` and `FileUpload` take `error` +
  `errorMessage`. Figma draws the same line — `Variant=Invalid` on the choice
  controls, `State=Error` on the fields — and so does HTML, where `:invalid` is a
  control state while an error message is content. A checkbox is not "in error";
  it is in an invalid selection. **Use `error` when there is a message to show,
  `invalid` when the control itself is the signal.**
- **`Logo.mono` (boolean) vs `variant="mono"`.** `kind="mark"` takes
  `mono?: boolean` because a mark is only ever colour or mono; `kind="wordmark"`
  takes `variant` because a wordmark also has an on-dark form, which a boolean
  cannot express. Figma models it identically — `Product` × `Mono` on the marks,
  `Variant=Default|Ondark|Mono` on the wordmark.

## Shared field styles

`Input` and `Textarea` render the same field — wrapper, label, control, and one
message slot that is a hint or an error — differing only in the control's box.
The class strings they must agree on live in **`astro-components/field.ts`**,
not in either component. What legitimately differs stays inline, where it reads
as the difference: `h-[var(--size-input)] px-sm` against
`min-h-[86px] p-sm resize-y`.

This exists because the duplication demonstrably drifted. On 2026-08-06 five
values were edited in both files in lockstep — inline padding, the hint ramp,
the hint colour, the label colour and `leading-7` — and **no gate would have
caught one of them being missed.** `check:parity` matches each component against
*its own* docs page, so two components drifting apart from each other is the one
shape it cannot see.

**Two scripts know about this file, and both had to.** `build-utilities.mjs`
scans it for Tailwind (its `@source` glob was `*.astro`, so a class moved here
would simply have stopped being compiled — absent from the stylesheet every docs
page links, with the class still in their markup). `check-component-vars.mjs`
validates its strings, so a typo here fails the same way it would in a
component. Adding another shared module means adding it to both lists.

## Icon strategy

Components inline real **Font Awesome Free Solid** vectors as
`<svg viewBox="…" fill="currentColor"><path d="…"/></svg>` — no `@fortawesome/*`
package, icon font, or CDN link ships at runtime, so components stay
self-contained.

**Shared path data lives in [`icons.ts`](icons.ts).** The same vectors used to be
retyped in several components (`key` in three, `check` in three, `circle-check`
and `triangle-exclamation` in two each), which is exactly the kind of copy that
drifts. Each entry is a `{ viewBox, path }` pair; components keep their own
`<svg>` wrapper so per-use classes, sizing and `aria-hidden` stay where they are
read:

```astro
import { icons } from '../icons';
<svg viewBox={icons.key.viewBox} fill="currentColor"><path d={icons.key.path} /></svg>
```

Deliberately still inline: `Checkbox`'s tick (stroke-drawn — needs `fill="none"`
plus stroke attributes), `ProductMenu`'s CTA glyph (needs `fill-rule="evenodd"`),
and the single-use vectors in `TopNav` / `ProductMenu`. Each is used once and
carries attributes the shared `Icon` shape doesn't model, so moving them buys
nothing.

To add another icon: temporarily `npm install @fortawesome/free-solid-svg-icons` somewhere scratch (not in this repo), `require()` the icon you need, and read `icon.icon` — it's `[width, height, ligatures, unicode, svgPathData]`. Use `viewBox="0 0 {width} {height}"` and that path data; put it in `icons.ts` if more than one component will draw it, then remove the temporary install. Free Solid icons are CC-BY-4.0-compatible for this kind of embedding. Never hand-draw path data — for vectors that only exist in Figma, export the node instead (see the navigation components above).

**An icon in Figma may not be a vector at all.** The four in `FooterBar`'s Free tools panel are `<text>` nodes set in `Font Awesome 7 Pro: Solid`, so `download_assets` returns nothing for them and they look like a missing export. Read the character instead: `get_design_context` gives it back as an escape (`\uF021`), which is the Font Awesome code point and names the icon. Check the Free tier before assuming Pro is needed — all four of those were Free, and Free Solid 7.3.1 turned out to match every icon already in `icons.ts` byte for byte, so "Pro" in the font name says nothing about whether the artwork is reachable.

## Verifying changes

There's no permanent Astro app in this repo to preview against. Before committing changes to any `.astro` file here, scaffold a throwaway Astro project (`npm init -y && npm install astro@latest`), copy the component(s) + `tailwind/tokens.css` (+ `icons.ts`, if the component imports it) in, write a quick test page, run `astro build`, and inspect the rendered HTML — then delete the throwaway project. Don't skip this just because there's nothing permanent to run it against.

For a refactor that is meant to change nothing — the `icons.ts` extraction was one — save the rendered HTML **before** the change and diff it after. Two ids regenerate on every build and will always differ: `Select`'s `randomUUID()` and `Checkbox`'s `Math.random()` fallback. Normalise those two, and the rest of the document should match byte for byte.

## 19 components ported

Button, TextLink, Input, Textarea, FileUpload, Select, Checkbox, Radio, Badge,
Notice, Tooltip, Product Footer, FooterBar, FormCard, TrialKeyCard, Logo, TopNav
and ProductMenu are all available. `TopNav` + `ProductMenu` together are the full
two-bar site header, and `Footer` + `FooterBar` the full two-band site footer. If
the design system docs (`docs/component-*.html`) gain a new
variant or pattern, check it here too — the docs' own Code-tab samples have
a history of drifting out of sync with the live markup on the same page.

This count is a gate, not a claim: `check:exports` fails when a component has no
``### `Name.astro` `` section below, and when the heading above disagrees with the
number of components on disk. It went stale once — `FooterBar` shipped in four
commits without ever reaching this file — which is what the check is for.

`Logo` was ported from the "Logo" section of the Figma file (node `471:112`)
together with its 34 new SVG assets; `docs/logo.html` is the brand-guidelines
page for the same artwork, while `docs/component-logo.html` is the component's
API reference and the page `check:parity` holds it to.

`FormCard` and `TrialKeyCard` were ported from the "04 Form & Input Cards"
section of the "Other element" page in Figma (node `723:5520`), not from a
`docs/component-*.html` page. Their docs pages
(`docs/component-formcard.html`, `docs/component-trialkeycard.html`) were
added afterward and are now covered by `check:parity` like every other
component — so the same "keep the Code-tab / inline CSS in sync" rule applies.

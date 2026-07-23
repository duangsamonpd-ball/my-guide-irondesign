# Iron Software Astro Components

Astro wrapper components for the Iron Software Design System. Markup and CSS
are copied 1:1 from the live docs pages under `../docs/component-*.html`, so
behaviour and appearance stay in sync with the reference site.

## Setup

These components are token-driven — they don't ship their own colors, sizes,
or radii. Import the design system's token file once, globally, before using
any component (e.g. in your root layout):

```astro
---
// src/layouts/Layout.astro
import '../../astro-components/../tailwind/tokens.css';
---
```

Adjust the relative path to wherever you copy/symlink `tailwind/tokens.css`
into your Astro project.

## Components

### `Button.astro`

```astro
---
import Button from '.../astro-components/components/Button.astro';
---
<Button variant="primary" size="md">Get started</Button>
<Button variant="outline" size="sm" href="/pricing">Outline link</Button>
<Button variant="ghost" disabled>Disabled</Button>
```

Props: `variant` (`primary` | `secondary` | `tertiary` | `outline` | `ondark` | `ghost`, default `primary`),
`size` (`lg` | `md` | `sm`, default `md`), `disabled`, `type`, `href` (renders an `<a>` instead of `<button>`), `class`.

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

Props: `href` (required), `variant` (`plain` | `underline`, default `plain`), `dark` (use on dark backgrounds — code blocks, dark sections), `external` (adds `target="_blank" rel="noopener"` + a trailing ↗ icon), `class`. The slot is the link text.

- **`plain`** — `--color-text-link` / hover `--color-text-link-hover`, no underline. For general and marketing pages where a whole paragraph of underlines would read as dense.
- **`underline`** — text stays `--color-text-heading` throughout; a separate `--color-border-selected`-coloured underline goes from 50% opacity/1px thick (default) to 100% opacity/2px thick (hover) — implemented with `text-decoration-color: color-mix(in srgb, var(--color-border-selected) 50%, transparent)` rather than a separate absolutely-positioned line (which is how the Figma source models it); real `text-decoration` reflows correctly with text wrapping, a manual line does not.

`dark` swaps each variant's light-mode tokens for the matching dark-mode ones — currently identical values, kept separate for when dark mode diverges from light.

### `Input.astro`

```astro
<Input label="Email address" name="email" type="email" placeholder="you@example.com" hint="We'll never share your email." />
<Input label="Email address" name="email" error errorMessage="Enter a valid email address." value="not-an-email" />
```

Props: `label`, `id`, `name`, `type` (default `text`), `placeholder`, `value`, `hint`,
`error`, `errorMessage`, `disabled`, `required`, `class`.

### `Textarea.astro`

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

```astro
<Checkbox label="Accept terms" description="By clicking, you agree." checked />
<Checkbox label="Required" invalid />
<Checkbox label="Accept terms" description="Whole card is the target." card />
```

Props: `label`, `description`, `id`, `name`, `checked`, `invalid`, `disabled`, `card` (renders the whole-card selectable layout), `class`.

### `Radio.astro`

```astro
<Radio name="bill" value="monthly" label="Monthly" description="$29/month" checked />
<Radio name="bill" value="yearly" label="Yearly" />
<Radio name="bill" value="monthly" label="Monthly" card checked />
```

Props: `name` (required — groups radios), `value` (required), `label`, `description`, `id`, `checked`, `invalid`, `disabled`, `card`, `class`.

### `Badge.astro`

```astro
<Badge intent="success" dot>Active</Badge>
<Badge intent="warning">Pending</Badge>
<Badge intent="info" solid>Beta</Badge>
<Badge intent="important">Important</Badge>
<Badge intent="neutral" pill>Draft</Badge>
<Badge intent="info" small>Small</Badge>
<Badge intent="success" dark>Active</Badge>
```

Props: `intent` (`success` | `warning` | `danger` | `info` | `important` | `neutral`, default `neutral`), `solid`, `small`, `pill`, `dot`, `dark` (use on dark backgrounds — footers, dark hero sections), `class`.

Subtle fill/text colors are the canonical `iron-*-100` / `iron-*-700` pair per intent (verified against Figma node `776-899`); `dark` swaps to the `iron-*-900` / `iron-*-300` pair for contrast on dark backgrounds. `important` is a genuinely new intent (not one of the system's original 4 semantic colours) — it uses the `iron-purple-100/500/700` primitives directly, matching `Notice.astro`'s `important` intent, since there's no `status/important` semantic token yet.

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

Props: `variant` (`filled` | `bordered`, default `filled`), `intent` (`info` | `success` | `important` | `warning` | `danger`, default `info`), `title` (required), `text` (required), `class`.

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

Props: `title` (omit for the compact, title-less variant), `body` (required), `linkHref`, `linkText`, `placement` (`above` | `below` | `left` | `right`, default `above`), `maxWidth` (widens the bubble for longer copy), `class`. The trigger is whatever you put in the default slot.

Ships its own `<script>` for the hover-with-a-gap interaction (JS open/close with a 200ms close-delay, since pure CSS `:hover` breaks once there's a gap between trigger and bubble and the mouse can't reach a link inside) — scoped per-instance, safe with multiple `<Tooltip>`s per page, re-initializes on Astro View Transitions.

### `Footer.astro`

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

Props: `variant` (`suite` shows the full-brand logo headline; `default` names the current product for cross-sell, default `default`), `productName` (required when `variant="default"`), `products` (`{ prefix, suffix, desc, accent?, href? }[]`, required), `donateImgSrc`, `suiteLogoImgSrc`, `productLogoSrc` (asset path overrides — defaults point at the docs' relative paths, supply your own), `class`.

The "Start Free Trial" CTA's key icon is an inline **Font Awesome Free Solid** `key` SVG (`fill="currentColor"`) — no icon font or CDN dependency.

### `FormCard.astro`

Generic wrapper for icon+title form cards (the "Request a Quote" / "Tell us what you're migrating from" pattern) — compose it with `Input` / `Select` / `Textarea` / `FileUpload` / a plain `<button>` submit as children:

```astro
<form>
  <FormCard
    icon="quote"
    title="Request Your Discounted Quote"
    submitLabel="Get Your Migration Quote"
    noteLeft="No obligation to proceed"
    noteRight="Response within 1 business day"
  >
    <Input label="First name *" name="firstName" />
    <Input label="Last name *" name="lastName" />
    <Input label="Email address *" name="email" type="email" placeholder="you@example.com" />
    <Select label="Document library I am replacing" name="library" placeholder="Choose option" options={[...]} />
    <FileUpload name="quoteFile" />
  </FormCard>
</form>
```

Props: `icon` (`'quote' | 'key' | 'check'`), `title`, `subtitle`, `submitLabel`, `noteLeft`, `noteRight`, `class`. Fields go in the default slot.

`icon` is a named icon, not a free-form string — it resolves to an inline **Font Awesome Free Solid** SVG (`file-invoice` / `key` / `check`) inside the component, same approach as `Notice.astro`/`FileUpload.astro`. Previously this took an emoji string directly; changed 2026-07-17 for consistency with the rest of the icon system. Ask before adding a 4th icon name — extract the path data with the method in "Icon strategy" below.

### `TrialKeyCard.astro`

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

Props: `icon` (`'quote' | 'key' | 'check'`), `headingPrefix` (default `"Get your free"`), `headingBold` (required — rendered bold), `headingSuffix` (default `"instantly."`), `inputPlaceholder`, `inputName`, `hint`, `submitLabel`, `submitIcon` (same 3-value type, optional), `footerNotes` (`string[]`), `class`.

Both `icon` and `submitIcon` resolve to inline Font Awesome SVGs the same way as `FormCard.astro` — see that section above.

## Icon strategy

`Notice.astro` and `FileUpload.astro` use real **Font Awesome Free Solid** icons, inlined as `<svg viewBox="..." fill="currentColor"><path d="..."/></svg>` directly in the component — no `@fortawesome/*` npm package, icon font, or CDN link shipped at runtime, keeping components self-contained.

To add another icon: temporarily `npm install @fortawesome/free-solid-svg-icons` somewhere scratch (not in this repo), `require()` the icon you need, and read `icon.icon` — it's `[width, height, ligatures, unicode, svgPathData]`. Hard-code `viewBox="0 0 {width} {height}"` and the path data into the component, then remove the temporary install. Free Solid icons are CC-BY-4.0-compatible for this kind of embedding.

## Verifying changes

There's no permanent Astro app in this repo to preview against. Before committing changes to any `.astro` file here, scaffold a throwaway Astro project (`npm init -y && npm install astro@latest`), copy the component(s) + `tailwind/tokens.css` in, write a quick test page, run `astro build`, and inspect the rendered HTML — then delete the throwaway project. Don't skip this just because there's nothing permanent to run it against.

## 14 components ported

Button, TextLink, Input, Textarea, FileUpload, Select, Checkbox, Radio, Badge,
Notice, Tooltip, Product Footer, FormCard, and TrialKeyCard are all
available. If the design system docs (`docs/component-*.html`) gain a new
variant or pattern, check it here too — the docs' own Code-tab samples have
a history of drifting out of sync with the live markup on the same page.

`FormCard` and `TrialKeyCard` were ported from the "04 Form & Input Cards"
section of the "Other element" page in Figma (node `723:5520`), not from a
`docs/component-*.html` page — there's no matching docs page for these two
composite patterns yet.

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

Inline link where only the underline speaks — the text stays neutral heading-colour, and a separate `border/selected`-coloured underline goes from 50% to 100% opacity on hover:

```astro
<p>Save 80% on all 10 products with the new <TextLink href="/iron-suite">Iron Suite</TextLink></p>
<TextLink href="/docs" dark>Create Blank PDF</TextLink>
<TextLink href="https://example.com" external>Learn more</TextLink>
```

Props: `href` (required), `dark` (use on dark backgrounds — code blocks, dark sections), `external` (adds `target="_blank" rel="noopener"` + a trailing ↗ icon), `class`. The slot is the link text.

Implemented with `text-decoration-color: color-mix(in srgb, var(--color-border-selected) 50%, transparent)` rather than a separate absolutely-positioned line (which is how the Figma source models it) — real `text-decoration` reflows correctly with text wrapping, a manual line does not. `dark` swaps `--color-text-heading`/`--color-border-selected` for `--color-text-dark-heading`/`--color-border-dark-alt` — currently the same underline colour, kept as separate tokens for when dark mode diverges from light.

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
`name`, `error`, `errorMessage`, `hint`, `disabled`, `class`.

A hidden native `<select>` mirrors the chosen value so the component still
works inside a plain HTML `<form>` submit without JS. The visible dropdown
is progressively enhanced via the component's own `<script>` (safe with
multiple `<Select>` instances on one page, and re-initializes on Astro View
Transitions).

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
<Badge intent="neutral" square>Draft</Badge>
<Badge intent="info" small>Small</Badge>
```

Props: `intent` (`success` | `warning` | `danger` | `info` | `neutral`, default `neutral`), `solid`, `small`, `square`, `dot`, `class`.

**Known gap:** the subtle-background and solid-text colors here are copied verbatim from `docs/component-badge.html`'s own `<style>` override, which does **not** match the canonical `iron-*-100` subtle scale in `tailwind/tokens.css` (e.g. success subtle is `#EBF9F3` here vs. the canonical `--color-success-subtle` `#E8F6F1`), and the success/warning *text* colors (`#2E9468`, `#B45309`) don't exist anywhere in the canonical scale at all. These look like bespoke, darker shades picked for text-on-light-background contrast that were never promoted to real tokens. Flagged in the component's own CSS comment — needs design sign-off before these become canonical tokens.

### `Notice.astro`

Non-interactive informational container — disclaimers, notes, short callouts. Three content patterns share one component depending on which props you pass:

```astro
<Notice intent="info" title="Please note" text="Aspose, SyncFusion, and iText are registered trademarks of their respective owner." />
<Notice intent="info" leadIn="Iron Software" text="developer-based licensing with OEM, cloud, and redistribution rights included." />
<Notice intent="success" text="Check" />
```

Props: `intent` (`info` | `success` | `warning` | `danger`, default `info`), `title` (renders title + body), `leadIn` (renders an inline bold prefix before `text`, no title), `text` (required), `class`. Pass neither `title` nor `leadIn` for the minimal, label-only pattern (bold `text` in the intent colour, no separate paragraph).

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

### `FormCard.astro`

Generic wrapper for icon+title form cards (the "Request a Quote" / "Tell us what you're migrating from" pattern) — compose it with `Input` / `Select` / `Textarea` / `FileUpload` / a plain `<button>` submit as children:

```astro
<form>
  <FormCard
    icon="🧾"
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

Props: `icon` (emoji or short glyph), `title`, `subtitle`, `submitLabel`, `noteLeft`, `noteRight`, `class`. Fields go in the default slot.

### `TrialKeyCard.astro`

The centered, single-field "instant capture" card pattern (different enough from `FormCard` — centered icon halo, one input, no label row — that it's its own component rather than a `FormCard` variant):

```astro
<TrialKeyCard
  icon="🔑"
  headingBold="30-day Trial Key"
  inputPlaceholder="Your Business Email*"
  inputName="trialEmail"
  hint="Your trial license will be sent to this address"
  submitLabel="Get my free trial key"
  submitIcon="🔑"
  footerNotes={['Free for development', 'Trial key in 60 seconds', 'No credit card']}
/>
```

Props: `icon`, `headingPrefix` (default `"Get your free"`), `headingBold` (required — rendered bold), `headingSuffix` (default `"instantly."`), `inputPlaceholder`, `inputName`, `hint`, `submitLabel`, `submitIcon`, `footerNotes` (`string[]`), `class`.

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

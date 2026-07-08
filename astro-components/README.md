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

### `Input.astro`

```astro
<Input label="Email address" name="email" type="email" placeholder="you@example.com" hint="We'll never share your email." />
<Input label="Email address" name="email" error errorMessage="Enter a valid email address." value="not-an-email" />
```

Props: `label`, `id`, `name`, `type` (default `text`), `placeholder`, `value`, `hint`,
`error`, `errorMessage`, `disabled`, `required`, `class`.

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

## Not yet ported

Checkbox, Radio, Badge, Tooltip, and Product Footer still only exist as
static docs pages — port them the same way (copy markup + CSS from the
`docs/component-*.html` Code tab, replace hard-coded example content with
props) when needed.

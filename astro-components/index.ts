/**
 * Barrel for the Astro components.
 *
 *   import { Badge, Button, Input } from '@iron-software/astro-components';
 *
 * Resolving by package name is what makes this work — the `exports` map in
 * package.json is only consulted for name-based resolution, never for a relative
 * directory import, so `import … from '../../astro-components'` will not find it.
 * Inside a monorepo use a workspace; otherwise `npm link` or a symlink into
 * node_modules/@iron-software/.
 *
 * Deep imports stay available and are the better choice when you want one
 * component and nothing else:
 *
 *   import Badge from '@iron-software/astro-components/components/Badge.astro';
 *   import { icons } from '@iron-software/astro-components/icons';
 *
 * Components are token-driven: import the token layer once, globally, before
 * using any of them (see README "Setup").
 *
 * Kept alphabetical, and it must list every file in components/ —
 * `npm run check:exports` enforces both.
 */

export { default as Badge } from './components/Badge.astro';
export { default as Button } from './components/Button.astro';
export { default as Checkbox } from './components/Checkbox.astro';
export { default as FileUpload } from './components/FileUpload.astro';
export { default as FlyoutMenu } from './components/FlyoutMenu.astro';
export { default as Footer } from './components/Footer.astro';
export { default as FooterBar } from './components/FooterBar.astro';
export { default as FormCard } from './components/FormCard.astro';
export { default as Input } from './components/Input.astro';
export { default as Logo } from './components/Logo.astro';
export { default as Notice } from './components/Notice.astro';
export { default as NugetButton } from './components/NugetButton.astro';
export { default as ProductMenu } from './components/ProductMenu.astro';
export { default as Radio } from './components/Radio.astro';
export { default as Select } from './components/Select.astro';
export { default as TextLink } from './components/TextLink.astro';
export { default as Textarea } from './components/Textarea.astro';
export { default as Tooltip } from './components/Tooltip.astro';
export { default as TopNav } from './components/TopNav.astro';
export { default as TrialKeyCard } from './components/TrialKeyCard.astro';

export { icons, type Icon, type IconName } from './icons';

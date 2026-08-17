/**
 * Iron Software Design System — the docs navigation, in order.
 *
 * Lifted out of build-shell.mjs on 2026-08-17 so a SECOND consumer could read
 * it without importing a script that writes files on load: the components
 * gallery on 07-components.html derives its cards — label, icon, href and
 * ORDER — from this array rather than retyping it. Retyping it is exactly what
 * went wrong the first time; the note in build-shell.mjs lists what a hand copy
 * got wrong (the Spacing icon, the Borders label, the Opacity icon, the last
 * category name, and most of the component order).
 *
 * A category is a heading with no href.
 */
export const NAV = [
  { href: 'index.html', icon: '🏠', label: 'Home' },
  { category: 'Foundations' },
  { href: 'logo.html', icon: '✳️', label: 'Logo' },
  { href: '01-colors.html', icon: '🎨', label: 'Color Palette' },
  { href: 'semantic-colors.html', icon: '🎯', label: 'Semantic Colors' },
  { href: '02-typography.html', icon: '🔤', label: 'Typography' },
  { href: '03-spacing.html', icon: '📐', label: 'Spacing' },
  { href: '04-borders.html', icon: '▭', label: 'Borders' },
  { href: '05-opacity.html', icon: '🔆', label: 'Opacity' },
  { href: '06-shadows.html', icon: '🌑', label: 'Shadow' },
  { category: 'Components' },
  { href: '07-components.html', icon: '🧩', label: 'Overview' },
  { href: 'component-button.html', icon: '🔘', label: 'Button' },
  { href: 'component-textlink.html', icon: '🔗', label: 'Text Link' },
  { href: 'component-checkbox.html', icon: '☑️', label: 'Checkbox' },
  { href: 'component-input.html', icon: '⌨️', label: 'Input' },
  { href: 'component-textarea.html', icon: '📝', label: 'Textarea' },
  { href: 'component-fileupload.html', icon: '📎', label: 'File Upload' },
  { href: 'component-flyoutmenu.html', icon: '🪟', label: 'Flyout Menu' },
  { href: 'component-radio.html', icon: '⦿', label: 'Radio' },
  { href: 'component-select.html', icon: '🔽', label: 'Select' },
  { href: 'component-badge.html', icon: '🏷️', label: 'Badge' },
  { href: 'component-notice.html', icon: '💡', label: 'Notice' },
  { href: 'component-logo.html', icon: '✳️', label: 'Logo' },
  { href: 'component-topnav.html', icon: '📍', label: 'Top Nav' },
  { href: 'component-productmenu.html', icon: '🧭', label: 'Product Menu' },
  { href: 'component-footer.html', icon: '🦶', label: 'Product Footer' },
  { href: 'component-footerbar.html', icon: '🧱', label: 'Footer Bar' },
  { href: 'component-tooltip.html', icon: '💬', label: 'Tooltip' },
  { href: 'component-formcard.html', icon: '🗂️', label: 'Form Card' },
  { href: 'component-trialkeycard.html', icon: '🔑', label: 'Trial Key Card' },
  { category: 'Reference' },
  { href: '08-semantic-guide.html', icon: '🗺️', label: 'Semantic Guide' },
];

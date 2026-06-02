/** @type {import('tailwindcss').Config} */

// ─────────────────────────────────────────────────────────────────────────────
// Iron Software Design System — Tailwind CSS Config
// Source: tokens.w3c.json + tokens.legacy.json + Figma Color Scale
// ─────────────────────────────────────────────────────────────────────────────

// ── 1. COLOR SCALES (Figma / 01 - Color Scale) ───────────────────────────────

const ironColors = {
  'iron-pink': {
    50:  '#FDF1F5',
    100: '#FADDE8',
    200: '#F6BACD',
    300: '#F08DAC',
    400: '#E95F8B',
    500: '#E01A59', // BASE
    600: '#BA174B',
    700: '#94153D',
    800: '#6E122F',
    900: '#471022',
    950: '#2E0E18',
  },
  'iron-blue': {
    50:  '#F2F9FE',
    100: '#DEEFFC',
    200: '#BEDFF9',
    300: '#93C9F6',
    400: '#67B3F2',
    500: '#2693EC', // BASE
    600: '#217BC4',
    700: '#1D629B',
    800: '#184A73',
    900: '#13324B',
    950: '#102230',
  },
  'iron-orange': {
    50:  '#FFFAF0',
    100: '#FFF2DA',
    200: '#FEE4B5',
    300: '#FED284',
    400: '#FEC053',
    500: '#FDA509', // BASE
    600: '#D2890A',
    700: '#A66E0A',
    800: '#7B520B',
    900: '#4F370B',
    950: '#33240C',
  },
  'iron-green': {
    50:  '#F6FBF9',
    100: '#E8F6F1',
    200: '#D0ECE3',
    300: '#B1E0D0',
    400: '#92D4BD',
    500: '#63C1A0', // BASE
    600: '#53A085',
    700: '#44806B',
    800: '#345F50',
    900: '#243F35',
    950: '#1A2924',
  },
  'iron-sky': {
    50:  '#F8FCFD',
    100: '#EDF8FA',
    200: '#DCF2F5',
    300: '#C4E9EF',
    400: '#ACE0E9',
    500: '#89D3DF', // BASE
    600: '#73AFB9',
    700: '#5C8B93',
    800: '#46686D',
    900: '#2F4447',
    950: '#202C2E',
  },
  'iron-purple': {
    50:  '#F5F3F9',
    100: '#E6E2F0',
    200: '#CCC4E0',
    300: '#AB9DCC',
    400: '#8976B8',
    500: '#563B99', // BASE
    600: '#493380',
    700: '#3B2A66',
    800: '#2E224D',
    900: '#211933',
    950: '#161423',
  },
  'iron-violet': {
    50:  '#F9F4F8',
    100: '#F0E5EE',
    200: '#E2CADE',
    300: '#CEA7C8',
    400: '#BA84B1',
    500: '#9D4F90', // BASE
    600: '#834378',
    700: '#693760',
    800: '#4F2B49',
    900: '#351F31',
    950: '#231721',
  },
  'iron-red': {
    50:  '#FFF1F1',
    100: '#FFE1E2',
    200: '#FFC7C9',
    300: '#FF9DA1',
    400: '#FF666D',
    500: '#E5242A', // BASE
    600: '#C91D23',
    700: '#A8181D',
    800: '#89171B',
    900: '#72181B',
    950: '#3D080A',
  },
  // Utility — UI surfaces, borders, structural backgrounds
  'iron-slate': {
    50:  '#F8FAFC',
    100: '#F1F5F9',
    200: '#E2E8F0',
    300: '#CAD5E2',
    400: '#90A1B9',
    500: '#62748E', // BASE
    600: '#45556C',
    700: '#314158',
    800: '#1D293D',
    900: '#0F172B',
    950: '#020618',
  },
  // Utility — text, icons, pure gray
  'iron-neutral': {
    50:  '#FAFAFA',
    100: '#F5F5F5',
    200: '#E5E5E5',
    300: '#D4D4D4',
    400: '#A1A1A1',
    500: '#737373', // BASE
    600: '#525252',
    700: '#404040',
    800: '#262626',
    900: '#171717',
    950: '#0A0A0A',
  },
};

// ── Semantic Aliases ──────────────────────────────────────────────────────────
// Source of truth: Figma / 02 - Color Palette (node 84-1754)
// Write bg-primary-500, text-secondary-700, border-success-300, etc.

const semanticColors = {
  // primary   = Iron Pink/500  — all primary CTAs, brand wordmark
  primary:   ironColors['iron-pink'],

  // secondary = Iron Blue/500  — secondary CTAs, headlines, links
  secondary: ironColors['iron-blue'],

  // success   = Iron Green/500 — confirmations, success messages
  success:   ironColors['iron-green'],

  // warning   = Iron Orange/500— warnings, pending states
  warning:   ironColors['iron-orange'],

  // danger    = Iron Red/500   — validation errors, destructive actions
  danger:    ironColors['iron-red'],

  // info      = Iron Blue/500  — info banners, help text (same scale as secondary)
  info:      ironColors['iron-blue'],
};

// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  content: [
    './src/**/*.{html,js,ts,jsx,tsx,vue,svelte}',
  ],

  theme: {
    // ── 2. BREAKPOINTS ─────────────────────────────────────────────────────────
    screens: {
      'xs': '320px',   // Mobile
      'sm': '480px',   // Tablet
      'md': '768px',   // Tablet Large
      'lg': '1024px',  // Desktop
      'xl': '1440px',  // Desktop XL
    },

    extend: {

      // ── 3. COLORS ───────────────────────────────────────────────────────────
      colors: {
        ...ironColors,
        ...semanticColors,
      },

      // ── 4. TYPOGRAPHY ───────────────────────────────────────────────────────
      fontFamily: {
        // 'sans' overrides Tailwind's built-in sans; 'body' is the project alias
        sans: ['Montserrat', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        body: ['Montserrat', 'sans-serif'],
        mono: ['SF Mono', 'Cascadia Code', 'Consolas', 'Roboto Mono', 'monospace'],
      },

      fontWeight: {
        regular:   '400',
        medium:    '500',
        semibold:  '600',
        bold:      '700',
        extrabold: '800',
        black:     '900',
      },

      fontSize: {
        // ── Content scale — [size (px), { lineHeight (px), letterSpacing (px), fontWeight }]
        // Line heights follow Figma space scale (n×4); tracking follows Figma tracking scale.
        'h1-hero': ['48px', { lineHeight: '48px', letterSpacing: '-0.8px', fontWeight: '900' }],
        'h1':      ['40px', { lineHeight: '48px', letterSpacing: '-0.8px', fontWeight: '900' }],
        'h2':      ['30px', { lineHeight: '36px', letterSpacing: '-0.4px', fontWeight: '800' }],
        'h3':      ['24px', { lineHeight: '32px', letterSpacing: '-0.4px', fontWeight: '700' }],
        'h4':      ['20px', { lineHeight: '28px',                          fontWeight: '600' }],
        'body-lg': ['18px', { lineHeight: '28px',                          fontWeight: '400' }],
        'body':    ['16px', { lineHeight: '28px',                          fontWeight: '400' }],
        'caption': ['14px', { lineHeight: '20px',                          fontWeight: '400' }],
        'overline':['13px', { lineHeight: '16px', letterSpacing: '1.6px',  fontWeight: '700' }],
        'code':    ['14px', { lineHeight: '24px',                          fontWeight: '400' }],
        // ── UI scale — content sizes, own weight, line-height 1 (centred via padding)
        'btn-lg':   ['16px', { lineHeight: '1',    letterSpacing: '0px',   fontWeight: '600' }],
        'btn':      ['14px', { lineHeight: '1',    letterSpacing: '0px',   fontWeight: '600' }],
        'btn-sm':   ['12px', { lineHeight: '1',    letterSpacing: '0.4px', fontWeight: '600' }],
        'nav':      ['16px', { lineHeight: '1',                             fontWeight: '500' }],
        'nav-sub':  ['14px', { lineHeight: '20px',                          fontWeight: '500' }],
        'nav-label':['12px', { lineHeight: '16px', letterSpacing: '0.8px', fontWeight: '700' }],
      },

      // ── 5. SPACING ──────────────────────────────────────────────────────────
      // Extends Tailwind's default scale — use these named tokens in components
      spacing: {
        'micro': '0.25rem',  //  4px — icon-text gaps, tight groups
        'xs':    '0.5rem',   //  8px — small spacing within components
        'sm':    '0.75rem',  // 12px — component internal padding
        'md':    '1rem',     // 16px — standard padding and gaps
        'lg':    '1.25rem',  // 20px — card padding, list item gaps
        'xl':    '1.5rem',   // 24px — section spacing
        '2xl':   '1.75rem',  // 28px — between major sections
        '3xl':   '2rem',     // 32px — between layout regions
        'hero':  '5rem',     // 80px — hero-scale top/bottom margins
      },

      // ── 6. BORDER RADIUS ────────────────────────────────────────────────────
      borderRadius: {
        'none':    '0px',
        'xs':      '0.25rem',  //  4px — inputs, small controls
        'sm':      '0.5rem',   //  8px — feature cards, secondary containers
        'pill-sm': '1.25rem',  // 20px — badges, small pills
        'pill':    '2.0625rem',// 33px — secondary action buttons
        'cta':     '2.5rem',   // 40px — ★ primary large CTA, signature style
        'cta-alt': '2.625rem', // 42px — alternative secondary CTA
        'compact':  '4rem',    // 64px — destructive / compact buttons
        'hero':    '5rem',     // 80px — hero cards, feature highlights
        'full':    '9999px',   // Perfect circle / pill
      },

      // ── 7. BOX SHADOWS ──────────────────────────────────────────────────────
      boxShadow: {
        'card':           '0 0 12px 0 rgba(67, 31, 67, 0.20)',    // Raised — feature cards
        'float':          '0 2px 16px 0 rgba(67, 31, 67, 0.30)', // Floating — dropdowns
        'modal':          '0 8px 24px 0 rgba(0, 0, 0, 0.40)',    // Modal / dialogs
        'card-hover':     '0 4px 12px 0 rgba(24, 24, 24, 0.08)',  // Card hover state
        'focus-blue':     '0 0 0 3px rgba(42, 149, 213, 0.25)',   // Focus ring — primary
        'focus-teal':     '0 0 0 3px rgba(99, 193, 160, 0.25)',   // Focus ring — secondary
        'focus-magenta':  '0 0 0 3px rgba(224, 26, 89, 0.25)',    // Focus ring — destructive
      },

      // ── 8. SIZING / MIN-MAX ─────────────────────────────────────────────────
      height: {
        'btn-primary':   '3.375rem', // 54px
        'btn-secondary': '2.875rem', // 46px
        'input':         '2.75rem',  // 44px
        'nav':           '2.5rem',   // 40px
      },

      minHeight: {
        'touch':     '2.75rem', // 44px — minimum touch target
        'touch-nav': '3rem',    // 48px — mobile nav icons
      },

      maxWidth: {
        'container': '90rem', // 1440px
      },

      // ── 9. OPACITY ──────────────────────────────────────────────────────────
      opacity: {
        'disabled':     '0.5',
        'hover-ghost':  '0.9',
        'hover-footer': '0.8',
      },
    },
  },

  plugins: [],
};

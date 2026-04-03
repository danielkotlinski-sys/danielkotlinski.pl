import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // --- Legacy tokens (keep for existing pages) ---
        beige: {
          DEFAULT: '#e8e4e1',
          light: '#ede9e7',
          dark: '#d8d4d1',
        },
        dk: {
          orange: '#ff4800',
          'orange-hover': '#e04000',
          teal: '#368786',
          'teal-hover': '#2a6f6f',
        },
        text: {
          primary: '#0d0d0d',
          dark: '#161a28',
          muted: '#424242',
          secondary: '#636363',
          gray: '#757575',
        },

        // --- CATSCAN Design System ---
        cs: {
          'black':    '#000000',
          'canvas':   '#FAF0F5',
          'white':    '#FFFFFF',
          'ink':      '#1a1a1a',
          'gray':     '#6b6b6b',
          'silver':   '#999999',
          'mist':     '#e8e5e1',
          'border':   '#d4d0cc',
        },
      },

      fontFamily: {
        // Legacy
        heading: ['Instrument Serif', 'Georgia', 'serif'],
        body: ['DM Sans', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],

        // CATSCAN DS — 3 type layers
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        editorial: ['"Newsreader"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', '"SF Mono"', 'Menlo', 'Consolas', 'monospace'],
      },

      fontSize: {
        'cs-xs':    ['0.625rem',  { lineHeight: '0.875rem',  letterSpacing: '0.12em' }],   // 10px
        'cs-sm':    ['0.6875rem', { lineHeight: '1rem',      letterSpacing: '0.1em' }],    // 11px
        'cs-base':  ['0.75rem',   { lineHeight: '1.125rem',  letterSpacing: '0.06em' }],   // 12px
        'cs-md':    ['0.875rem',  { lineHeight: '1.375rem',  letterSpacing: '0.02em' }],   // 14px
        'cs-lg':    ['1.125rem',  { lineHeight: '1.5rem',    letterSpacing: '0.01em' }],   // 18px
        'cs-xl':    ['1.5rem',    { lineHeight: '1.75rem',   letterSpacing: '0em' }],      // 24px
        'cs-2xl':   ['2.25rem',   { lineHeight: '2.5rem',    letterSpacing: '-0.01em' }],  // 36px
        'cs-3xl':   ['3rem',      { lineHeight: '3.25rem',   letterSpacing: '-0.02em' }],  // 48px
        'cs-hero':  ['4rem',      { lineHeight: '4rem',      letterSpacing: '-0.03em' }],  // 64px
      },

      borderRadius: {
        'card': '16px',
        'pill': '100px',
        'cs-none': '0px',
      },

      maxWidth: {
        'container': '1200px',
        'report': '820px',
        'cs-content': '1120px',
      },

      keyframes: {
        'cs-blink': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
      },
      animation: {
        'cs-blink': 'cs-blink 1.2s step-end infinite',
      },
    },
  },
  plugins: [],
};
export default config;

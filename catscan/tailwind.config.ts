import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
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
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        editorial: ['"Newsreader"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', '"SF Mono"', 'Menlo', 'Consolas', 'monospace'],
      },

      fontSize: {
        'cs-xs':    ['0.625rem',  { lineHeight: '0.875rem',  letterSpacing: '0.12em' }],
        'cs-sm':    ['0.6875rem', { lineHeight: '1rem',      letterSpacing: '0.1em' }],
        'cs-base':  ['0.75rem',   { lineHeight: '1.125rem',  letterSpacing: '0.06em' }],
        'cs-md':    ['0.875rem',  { lineHeight: '1.375rem',  letterSpacing: '0.02em' }],
        'cs-lg':    ['1.125rem',  { lineHeight: '1.5rem',    letterSpacing: '0.01em' }],
        'cs-xl':    ['1.5rem',    { lineHeight: '1.75rem',   letterSpacing: '0em' }],
        'cs-2xl':   ['2.25rem',   { lineHeight: '2.5rem',    letterSpacing: '-0.01em' }],
        'cs-3xl':   ['3rem',      { lineHeight: '3.25rem',   letterSpacing: '-0.02em' }],
        'cs-hero':  ['4rem',      { lineHeight: '4rem',      letterSpacing: '-0.03em' }],
      },

      borderRadius: {
        'cs-none': '0px',
      },

      maxWidth: {
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

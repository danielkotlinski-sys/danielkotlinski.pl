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
          // Backgrounds
          'bg':       '#f5f3f0',
          'bg-alt':   '#eae7e3',
          'bg-card':  '#ffffff',
          'bg-dark':  '#1a1a1a',
          'bg-input': '#f9f8f6',

          // Foreground / text
          'fg':       '#0d0d0d',
          'fg-muted': '#6b6b6b',
          'fg-dim':   '#999999',
          'fg-inv':   '#f5f3f0',

          // Accent
          'red':       '#c0392b',
          'red-hover': '#a93226',
          'green':     '#27ae60',

          // Borders
          'border':      '#d0ccc8',
          'border-bold': '#0d0d0d',
        },
      },

      fontFamily: {
        // Legacy
        heading: ['Instrument Serif', 'Georgia', 'serif'],
        body: ['DM Sans', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],

        // CATSCAN DS
        mono: [
          '"JetBrains Mono"',
          '"Fira Code"',
          '"SF Mono"',
          'Menlo',
          'Consolas',
          'monospace',
        ],
      },

      fontSize: {
        // CATSCAN type scale
        'cs-xs':    ['0.6875rem', { lineHeight: '1rem',    letterSpacing: '0.08em' }],    // 11px
        'cs-sm':    ['0.75rem',   { lineHeight: '1.125rem', letterSpacing: '0.06em' }],   // 12px
        'cs-base':  ['0.8125rem', { lineHeight: '1.375rem', letterSpacing: '0.04em' }],   // 13px
        'cs-md':    ['0.9375rem', { lineHeight: '1.5rem',   letterSpacing: '0.03em' }],   // 15px
        'cs-lg':    ['1.125rem',  { lineHeight: '1.5rem',   letterSpacing: '0.02em' }],   // 18px
        'cs-xl':    ['1.5rem',    { lineHeight: '1.875rem', letterSpacing: '0.02em' }],   // 24px
        'cs-2xl':   ['2rem',      { lineHeight: '2.25rem',  letterSpacing: '0.01em' }],   // 32px
        'cs-3xl':   ['2.5rem',    { lineHeight: '2.75rem',  letterSpacing: '0em' }],      // 40px
        'cs-hero':  ['3.5rem',    { lineHeight: '3.75rem',  letterSpacing: '-0.01em' }],  // 56px
      },

      borderRadius: {
        // Legacy
        'card': '16px',
        'pill': '100px',

        // CATSCAN — sharp corners
        'cs-none': '0px',
        'cs-sm':   '2px',
      },

      spacing: {
        'cs-1': '4px',
        'cs-2': '8px',
        'cs-3': '12px',
        'cs-4': '16px',
        'cs-5': '20px',
        'cs-6': '24px',
        'cs-8': '32px',
        'cs-10': '40px',
        'cs-12': '48px',
        'cs-16': '64px',
        'cs-20': '80px',
      },

      maxWidth: {
        'container': '1200px',
        'report': '820px',
        'cs-content': '1280px',
        'cs-narrow':  '960px',
      },

      boxShadow: {
        'cs-card':  '0 1px 3px rgba(0,0,0,0.06)',
        'cs-hover': '0 2px 8px rgba(0,0,0,0.1)',
        'cs-modal': '0 8px 32px rgba(0,0,0,0.15)',
      },

      keyframes: {
        'cs-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
        'cs-slide-up': {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'cs-pulse':    'cs-pulse 2s ease-in-out infinite',
        'cs-slide-up': 'cs-slide-up 0.3s ease-out',
      },
    },
  },
  plugins: [],
};
export default config;

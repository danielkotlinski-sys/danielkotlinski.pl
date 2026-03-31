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
      },
      fontFamily: {
        heading: ['Instrument Serif', 'Georgia', 'serif'],
        body: ['DM Sans', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      borderRadius: {
        'card': '16px',
        'pill': '100px',
      },
      maxWidth: {
        'container': '1200px',
        'report': '820px',
      },
    },
  },
  plugins: [],
};
export default config;

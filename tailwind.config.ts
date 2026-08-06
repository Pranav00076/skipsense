import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#09090b',
        foreground: '#fafafa',
        border: '#27272a',
        muted: {
          DEFAULT: '#18181b',
          foreground: '#a1a1aa'
        },
        primary: {
          DEFAULT: '#6366f1',
          foreground: '#ffffff',
        }
      }
    },
  },
  plugins: [],
  darkMode: 'class',
};

export default config;

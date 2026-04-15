import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: '#0d0c0a',
        'bg-elev': '#14130f',
        ink: '#e8e2d4',
        'ink-dim': '#8a8272',
        'ink-faint': '#3d392f',
        rule: '#28251e',
        accent: '#c8a55b',
        'accent-dim': '#7a6638',
        silence: '#7a3a2e',
        speech: '#4a6850',
      },
      fontFamily: {
        display: ['Cormorant Garamond', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;

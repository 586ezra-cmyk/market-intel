import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-heebo)', 'Heebo', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50:  '#f0f9ff',
          100: '#e0f2fe',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          900: '#0c4a6e',
        },
        bull: {
          DEFAULT: 'rgba(50,205,50,1)',
          muted: 'rgba(50,180,50,0.12)',
        },
        bear: {
          DEFAULT: 'rgba(220,50,50,1)',
          muted: 'rgba(220,50,50,0.12)',
        },
        surface: {
          DEFAULT: '#0f1117',
          raised: '#161b27',
          border: '#1e2533',
        },
      },
    },
  },
  plugins: [],
}
export default config

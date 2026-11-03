/** @type {import('tailwindcss').Config} */
// Palette mirrors mobile/src/lib/theme.tsx so the website and the app read as one product.
// `gray` is remapped (not a new name) so every existing gray-* / dark:gray-* class picks up
// the premium dark surfaces: 900 = page, 800 = card, 700 = lines/hover.
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        gray: {
          50: '#F3F4F7', 100: '#E9ECF1', 200: '#DDE1E8', 300: '#C5CBD6', 400: '#8E97AB',
          500: '#7A8499', 600: '#343A48', 700: '#242935', 800: '#12151B', 900: '#0A0C10', 950: '#06080B',
        },
        accent: { DEFAULT: 'rgb(var(--accent) / <alpha-value>)', hover: 'rgb(var(--accent-hover) / <alpha-value>)', ink: 'rgb(var(--accent-ink) / <alpha-value>)' },
        red: { 400: '#FF6B7A' },
        green: { 400: '#3DDC97' },
        amber: { 400: '#FFB547' },
      },
      borderRadius: { xl: '1rem', '2xl': '1.25rem' },
    },
  },
  plugins: [],
};

/** @type {import('tailwindcss').Config} */
// Design tokens. One ground, three surface steps, one ink, one accent.
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ground: '#0e0f0d',
        surface: {
          DEFAULT: '#161714',
          2: '#1f201d',
          3: '#2a2b27',
        },
        ink: '#f3f2ec',
        accent: {
          DEFAULT: '#d4ff3a',
          hover: '#e2ff6e',
        },
        danger: '#ff7a66',
      },
      fontFamily: {
        sans: ['"Instrument Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.4s ease-out both',
        'pulse-soft': 'pulse-soft 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

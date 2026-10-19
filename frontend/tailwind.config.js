/** @type {import('tailwindcss').Config} */
// Design tokens for the ViraClip-inspired look: near-black ground, a bold sans
// with one italic serif accent phrase, orange-to-pink gradient, pill shapes.
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ground: '#07070b',
        surface: {
          DEFAULT: '#0e0e15',
          2: '#151520',
          3: '#1f1f2d',
        },
        ink: '#f6f6f8',
        accent: {
          DEFAULT: '#ffab5e',
          hover: '#ffc088',
        },
        glow: '#7c3aed',
        danger: '#ff7a8a',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['"Instrument Serif"', 'ui-serif', 'Georgia', 'serif'],
      },
      backgroundImage: {
        brand: 'linear-gradient(90deg, #ffbd59 0%, #ff7f7f 55%, #ff6f9c 100%)',
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
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.4s ease-out both',
        'pulse-soft': 'pulse-soft 1.6s ease-in-out infinite',
        marquee: 'marquee 45s linear infinite',
      },
    },
  },
  plugins: [],
};

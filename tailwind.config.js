/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.tsx', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: { extend: { colors: { orbit: '#8570D9', ink: '#252936', canvas: '#F6F7F9' } } },
  plugins: [],
};

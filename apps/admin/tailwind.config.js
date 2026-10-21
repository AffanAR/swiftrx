/** @type {import('tailwindcss').Config} */
import preset from '../shared/tailwind-preset.js';

export default {
  presets: [preset],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  plugins: [],
};

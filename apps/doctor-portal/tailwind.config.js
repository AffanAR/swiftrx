/** @type {import('tailwindcss').Config} */
import preset from '../shared/tailwind-preset.js';

export default {
  presets: [preset],
  // Include the shared package so classes used only by its components
  // (Toggle, TextField, …) are generated too.
  content: ['./index.html', './src/**/*.{ts,tsx}', '../shared/src/**/*.{ts,tsx}'],
  plugins: [],
};

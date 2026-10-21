/** @type {import('tailwindcss').Config} */
// Shared Tailwind preset. Each app imports this in its own tailwind.config.js
// so the design tokens stay in lock-step across Admin, Hospital, and Rx.
module.exports = {
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        ink: {
          50: '#f7f8fa',
          100: '#eef0f4',
          200: '#dde1ea',
          300: '#bcc3d2',
          400: '#8b94ab',
          500: '#5e6781',
          600: '#3f4762',
          700: '#2a3149',
          800: '#191f33',
          900: '#0c1122',
        },
        rx: {
          accent: '#10b981',
          accentDark: '#047857',
          warn: '#f59e0b',
          danger: '#ef4444',
          focus: '#3b82f6',
        },
      },
      boxShadow: {
        glow: '0 0 0 3px rgba(59,130,246,0.35)',
        card: '0 1px 0 rgba(255,255,255,0.04) inset, 0 1px 2px rgba(0,0,0,0.4)',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0', transform: 'translateY(2px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        pulseRing: { '0%,100%': { boxShadow: '0 0 0 0 rgba(16,185,129,0.5)' }, '50%': { boxShadow: '0 0 0 8px rgba(16,185,129,0)' } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        breathe: { '0%,100%': { opacity: '0.55', transform: 'scale(1)' }, '50%': { opacity: '1', transform: 'scale(1.15)' } },
        float: { '0%,100%': { transform: 'translateY(0px)' }, '50%': { transform: 'translateY(-3px)' } },
        slideInRight: { from: { opacity: '0', transform: 'translateX(8px)' }, to: { opacity: '1', transform: 'translateX(0)' } },
        slideUpIn: { from: { opacity: '0', transform: 'translateY(6px) scale(0.98)' }, to: { opacity: '1', transform: 'translateY(0) scale(1)' } },
        ripple: { from: { opacity: '0.5', transform: 'scale(0.6)' }, to: { opacity: '0', transform: 'scale(2.4)' } },
        countTick: { from: { transform: 'translateY(8px)', opacity: '0' }, to: { transform: 'translateY(0)', opacity: '1' } },
        underlineSweep: { from: { transform: 'translateX(-100%)' }, to: { transform: 'translateX(100%)' } },
        caretBlink: { '0%,49%': { opacity: '1' }, '50%,100%': { opacity: '0' } },
        spinSlow: { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } },
        spinSlowReverse: { from: { transform: 'rotate(360deg)' }, to: { transform: 'rotate(0deg)' } },
        aura: { '0%,100%': { boxShadow: '0 0 0 0 rgba(16,185,129,0.0)' }, '50%': { boxShadow: '0 0 18px 2px rgba(16,185,129,0.18)' } },
      },
      animation: {
        fadeIn: 'fadeIn 120ms ease-out',
        pulseRing: 'pulseRing 1.6s ease-in-out infinite',
        shimmer: 'shimmer 2.2s linear infinite',
        breathe: 'breathe 2.4s ease-in-out infinite',
        float: 'float 3.2s ease-in-out infinite',
        slideInRight: 'slideInRight 220ms ease-out',
        slideUpIn: 'slideUpIn 160ms ease-out',
        ripple: 'ripple 600ms ease-out forwards',
        countTick: 'countTick 240ms ease-out',
        underlineSweep: 'underlineSweep 2.2s ease-in-out infinite',
        caretBlink: 'caretBlink 1.1s steps(2,end) infinite',
        spinSlow: 'spinSlow 6s linear infinite',
        spinSlowReverse: 'spinSlowReverse 9s linear infinite',
        aura: 'aura 3.2s ease-in-out infinite',
      },
    },
  },
};

import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './app/components/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './modules/**/*.{ts,tsx}',
  ],
  safelist: [
    // 绿色（live）
    'text-emerald-300',
    'bg-emerald-500/10',
    'ring-emerald-500/30',
    'bg-emerald-400',
    // 琥珀色（degraded）
    'text-amber-300',
    'bg-amber-500/10',
    'ring-amber-500/30',
    'bg-amber-400',
    // 天蓝（close）
    'text-sky-300',
    'bg-sky-500/10',
    'ring-sky-500/30',
    'bg-sky-400',
    // 灰（unknown）
    'text-gray-200',
    'bg-gray-500/10',
    'ring-gray-500/30',
    // halo 专用
    'ring-2',
    'ring-emerald-400/50',
    'ring-amber-400/50',
    'ring-sky-400/50',
    'ring-gray-400/40',
    // 动效类（带与不带 motion-safe 的两套）
    'motion-safe:animate-ping',
    'motion-safe:animate-pulse',
    'animate-ping',
    'animate-pulse',
  ],
  theme: {
    extend: {
      colors: {
        bg: 'var(--c-bg)',
        'bg-dark': 'var(--c-bg-dark)',
        green: 'var(--c-green)',
        'green-alt': 'var(--c-green-alt)',
        red: 'var(--c-red)',
        purple: 'var(--c-purple)',
        blue: 'var(--c-blue)',
        gray: 'var(--c-gray)',
      },
      borderRadius: {
        card: 'var(--radius-card)',
        btn: 'var(--radius-btn)',
      },
      spacing: {
        1: 'var(--space-1)',
        2: 'var(--space-2)',
        3: 'var(--space-3)',
      },
      fontSize: {
        base: 'var(--font-base)',
      },
      fontFamily: {
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Noto Sans',
          'Ubuntu',
          'Cantarell',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
    }
  },
  plugins: []
} satisfies Config;

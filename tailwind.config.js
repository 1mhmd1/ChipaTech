/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#f7f8fa',
          100: '#eef0f4',
          200: '#dde1ea',
          300: '#bcc3d2',
          400: '#8a93a8',
          500: '#5e6577',
          600: '#434a5c',
          700: '#2f3445',
          800: '#1d2230',
          900: '#0f1320',
        },
        brand: {
          50: '#eef7ff',
          100: '#d9ecff',
          200: '#bcdfff',
          300: '#8ecbff',
          400: '#58aeff',
          500: '#2e90ff',
          600: '#1672ed',
          700: '#125ad6',
          800: '#1349a8',
          900: '#143f85',
        },
        success: {
          50: '#ecfdf5',
          100: '#d1fae5',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
        },
        warning: {
          50: '#fffbeb',
          100: '#fef3c7',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
        },
        danger: {
          50: '#fef2f2',
          100: '#fee2e2',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        soft: '0 1px 2px 0 rgb(15 19 32 / 0.04), 0 1px 3px 0 rgb(15 19 32 / 0.06)',
        elevated: '0 4px 12px -2px rgb(15 19 32 / 0.08), 0 2px 4px -2px rgb(15 19 32 / 0.06)',
      },
    },
  },
  plugins: [],
}

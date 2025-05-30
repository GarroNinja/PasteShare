/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        green: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
      },
      backgroundColor: {
        dark: {
          primary: '#121212',
          secondary: '#1e1e1e',
          accent: '#22c55e',
        }
      },
      textColor: {
        dark: {
          primary: '#ffffff',
          secondary: '#a3a3a3',
          accent: '#4ade80',
        }
      },
      borderColor: {
        dark: {
          primary: '#333333',
          accent: '#22c55e',
        }
      }
    },
  },
  plugins: [],
} 
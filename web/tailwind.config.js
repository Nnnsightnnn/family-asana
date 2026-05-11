/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Asana-inspired palette
        asana: {
          blue: '#4573D2',
          coral: '#F06A6A',
          green: '#5DAB6E',
          amber: '#EBA63F',
          purple: '#9C6ADE',
          teal: '#26B5CE',
          ink: '#1E1F21',
          slate: '#6B6F76',
          stone: '#F6F8F9',
          line: '#E8E8E9',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};

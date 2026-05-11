/** @type {import('tailwindcss').Config} */
// Stoop Light theme — warm cream canvas, single clay accent.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Stoop Light — warm neutrals + one muted clay accent.
        // Hierarchy is carried by type weight and spacing, never saturation.
        stoop: {
          canvas: '#FAF7F2',
          page: '#ECE7DC',
          panel: '#FFFFFF',
          'panel-warm': '#F4EFE6',
          ink: '#1F1B17',
          'ink-soft': '#3A332C',
          muted: '#7A7066',
          hairline: '#EFE7DA',
          'hairline-2': '#E4DBCB',
          accent: '#A86A4B',
          'accent-deep': '#874F33',
          'accent-soft': '#F1E3D8',
          'accent-soft-2': '#E9D5C3',
          'status-todo': '#6F6358',
          'status-doing': '#5A7A8E',
          'status-doing-bg': '#E3ECF1',
          'status-blocked': '#B36447',
          'status-blocked-bg': '#F1E0D6',
          'status-done': '#6B8A6E',
          'status-done-bg': '#E2EBE3',
        },
      },
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        card: '18px',
        input: '12px',
        button: '12px',
      },
      boxShadow: {
        drawer: '-30px 0 60px -40px rgba(80,50,20,0.15)',
        soft: '0 30px 60px -30px rgba(80,50,20,0.25)',
      },
    },
  },
  plugins: [],
};

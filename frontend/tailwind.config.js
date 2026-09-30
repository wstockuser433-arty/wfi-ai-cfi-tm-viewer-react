/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx,js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        space: {
          950: "#0A0E1A",
          900: "#0F1422",
          800: "#141925",
          700: "#1B2233",
          600: "#232B3F",
          500: "#2C3548",
        },
        accent: {
          cyan: "#00E5FF",
          amber: "#FFB020",
          red: "#FF4D5E",
          green: "#22C55E",
          purple: "#A855F7",
        },
        muted: "#8B95A9",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        "2xs": ["10px", "14px"],
      },
      animation: {
        "pulse-slow": "pulse 2s cubic-bezier(0.4,0,0.6,1) infinite",
      },
      boxShadow: {
        glow: "0 0 20px rgba(0,229,255,0.15)",
        "glow-amber": "0 0 20px rgba(255,176,32,0.15)",
        "glow-red": "0 0 20px rgba(255,77,94,0.2)",
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
};
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],   // ← enables `dark:` variant based on `<html class="dark">`
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Theme-aware aliases — resolve to CSS vars
        bg: {
          DEFAULT: "rgb(var(--bg) / <alpha-value>)",           // main background
          card:    "rgb(var(--bg-card) / <alpha-value>)",       // card/panel background
          elevated:"rgb(var(--bg-elevated) / <alpha-value>)",   // modals, dropdowns
          sidebar: "rgb(var(--bg-sidebar) / <alpha-value>)",
        },
        border: {
          DEFAULT: "rgb(var(--border) / <alpha-value>)",
          strong:  "rgb(var(--border-strong) / <alpha-value>)",
        },
        text: {
          primary: "rgb(var(--text-primary) / <alpha-value>)",
          muted:   "rgb(var(--text-muted) / <alpha-value>)",
          faint:   "rgb(var(--text-faint) / <alpha-value>)",
        },

        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          soft:    "rgb(var(--accent-soft) / <alpha-value>)",
          hover:   "rgb(var(--accent-hover) / <alpha-value>)",

          // ⭐ THIS is the fix — remap the legacy name to the CSS var
          cyan:    "rgb(var(--accent) / <alpha-value>)",

          // Keep the semantic accents
          amber:  "#FFB020",
          red:    "#FF4D5E",
          green:  "#22C55E",
          purple: "#A855F7",
        },

        muted: "rgb(var(--text-muted) / <alpha-value>)",        // legacy alias
        space: {
          // Legacy aliases that point to theme-aware tokens
          950: "rgb(var(--bg) / <alpha-value>)",
          900: "rgb(var(--bg-card) / <alpha-value>)",
          800: "rgb(var(--bg-card) / <alpha-value>)",
          700: "rgb(var(--bg-elevated) / <alpha-value>)",
          600: "rgb(var(--border-strong) / <alpha-value>)",
          500: "rgb(var(--border-strong) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      fontSize: { "2xs": ["10px", "14px"] },
      animation: { "pulse-slow": "pulse 2s cubic-bezier(0.4,0,0.6,1) infinite" },
      boxShadow: {
        card:  "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03)",
        panel: "0 8px 24px rgba(0,0,0,0.12)",
      },
    },
  },
  plugins: [],
};
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
        serif: ["var(--font-fraunces)", "serif"],
      },
      // All palette tokens resolve to RGB-triplet CSS variables defined in
      // app/globals.css (:root = light, .dark = dark) so the whole app theme
      // switches with a single class while alpha modifiers keep working.
      colors: {
        surface: {
          primary: "rgb(var(--bg-primary) / <alpha-value>)",
          secondary: "rgb(var(--bg-secondary) / <alpha-value>)",
          hover: "rgb(var(--bg-accent) / <alpha-value>)",
          card: "rgb(var(--bg-card) / <alpha-value>)",
        },
        ink: {
          primary: "rgb(var(--text-primary) / <alpha-value>)",
          secondary: "rgb(var(--text-secondary) / <alpha-value>)",
          tertiary: "rgb(var(--text-tertiary) / <alpha-value>)",
        },
        stone: "rgb(var(--border) / <alpha-value>)",
        forest: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          soft: "rgb(var(--accent-soft) / <alpha-value>)",
          deep: "rgb(var(--accent-deep) / <alpha-value>)",
        },
      },
    },
  },
  plugins: [],
};

export default config;

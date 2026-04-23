import type { Config } from "tailwindcss";

const config: Config = {
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
      colors: {
        surface: {
          primary: "#FAFAF7",
          secondary: "#F3F1EC",
          hover: "#E8E4DC",
        },
        ink: {
          primary: "#1C1C1A",
          secondary: "#6B6B66",
          tertiary: "#A0A09A",
        },
        stone: "#E8E4DC",
        forest: {
          DEFAULT: "#2D5F3F",
          soft: "#E8EEE9",
          deep: "#1F4A2E",
        },
      },
    },
  },
  plugins: [],
};

export default config;

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      screens: { nav: "900px" }, // the navbar collapses into a menu below this width
      colors: {
        ink: "#0f1b2d",
        muted: "#5a6a7a",
        canvas: "#f1f4f7",
        line: "#d9e0e7",
        navy: { DEFAULT: "#0f1b2d", 2: "#16263b", 3: "#2c4060" },
        brand: { DEFAULT: "#0b7a84", dark: "#096870", light: "#3cc4cf" },
        coral: "#c5432d",
        good: "#1f7a4d",
        warn: "#b26a00",
      },
      fontFamily: { sans: ['"Segoe UI"', "system-ui", "-apple-system", "Roboto", "sans-serif"] },
    },
  },
  plugins: [],
};

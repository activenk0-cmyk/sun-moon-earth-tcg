/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./lib/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        sun: "#f59e0b",
        moon: "#818cf8",
        earth: "#34d399",
      },
    },
  },
  plugins: [],
};

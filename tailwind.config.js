/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#06C1A0",   // Teal accent
          dark: "#041B2D",      // Navy base
          light: "#A8F0E4",     // Soft mint highlight
        },
        gray: {
          950: "#0A0A0A", // deep gray for luxury vibe
        },
      },
      fontFamily: {
        sans: ["Inter", "Arial", "sans-serif"], // Inter as default
        display: ["Poppins", "Arial", "sans-serif"], // for headers
      },
      boxShadow: {
        luxury: "0 8px 20px rgba(0, 0, 0, 0.12)",
      },
    },
  },
  plugins: [],
};

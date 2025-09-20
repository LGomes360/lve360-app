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
        sans: ["Inter", "Arial", "sans-serif"],   // Inter as default
        display: ["Poppins", "Arial", "sans-serif"], // Poppins for headers
      },
      boxShadow: {
        luxury: "0 8px 20px rgba(0, 0, 0, 0.12)",
      },
      typography: {
        DEFAULT: {
          css: {
            color: "#041B2D", // brand.dark for body text
            a: {
              color: "#06C1A0", // brand teal
              "&:hover": { color: "#041B2D" }, // navy hover
            },
            strong: { color: "#041B2D" },
            h1: { color: "#041B2D", fontFamily: "Poppins" },
            h2: { color: "#041B2D", fontFamily: "Poppins" },
            h3: { color: "#041B2D", fontFamily: "Poppins" },
            h4: { color: "#041B2D", fontFamily: "Poppins" },
            table: {
              width: "100%",
              borderCollapse: "collapse",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            },
            th: {
              backgroundColor: "#A8F0E4", // brand.light
              color: "#041B2D",
              fontWeight: "600",
              padding: "0.5rem",
            },
            td: {
              border: "1px solid #E5E7EB", // Tailwind gray-200
              padding: "0.5rem",
            },
          },
        },
      },
      animation: {
        fadeIn: "fadeIn 0.6s ease-in-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: 0 },
          "100%": { opacity: 1 },
        },
      },
    },
  },
  plugins: [
    require("@tailwindcss/typography"), // ✅ Markdown styling
  ],
};

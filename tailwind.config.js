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
          light: "#A8F0E4",     // Mint highlight
        },
        gray: {
          950: "#0A0A0A", // Deep gray
        },
        gold: {
          light: "#FDE68A",
          DEFAULT: "#D4AF37",
          dark: "#B8860B",
        },
      },
      fontFamily: {
        sans: ["Poppins", "Inter", "Arial", "sans-serif"], // ✅ brand-first
        display: ["Poppins", "Inter", "Arial", "sans-serif"],
      },
      boxShadow: {
        luxury: "0 8px 20px rgba(0, 0, 0, 0.12)",
        premium: "0 4px 12px rgba(212, 175, 55, 0.4)", // gold glow
      },
      typography: {
        DEFAULT: {
          css: {
            color: "#041B2D",
            fontFamily: "Poppins, Inter, Arial, sans-serif",
            lineHeight: "1.7",
            a: {
              color: "#06C1A0",
              fontWeight: "500",
              "&:hover": { color: "#041B2D" },
            },
            strong: { color: "#041B2D" },
            h1: { color: "#041B2D", fontWeight: "700" },
            h2: { color: "#041B2D", fontWeight: "600" },
            h3: { color: "#041B2D", fontWeight: "600" },
            h4: { color: "#041B2D", fontWeight: "500" },
            table: {
              width: "100%",
              borderCollapse: "collapse",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            },
            th: {
              backgroundColor: "#A8F0E4",
              color: "#041B2D",
              fontWeight: "600",
              padding: "0.5rem",
            },
            td: {
              border: "1px solid #E5E7EB",
              padding: "0.5rem",
            },
          },
        },
      },
       animation: {
        fadeIn: "fadeIn 0.6s ease-in-out",
        "fade-in-up": "fade-in-up 0.5s ease-out forwards",
        "fade-out-down": "fade-out-down 0.5s ease-in forwards",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: 0 },
          "100%": { opacity: 1 },
        },
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-out-down": {
          "0%": { opacity: "1", transform: "translateY(0)" },
          "100%": { opacity: "0", transform: "translateY(10px)" },
        },
      },
    },
  },
  plugins: [
    require("@tailwindcss/typography"),
  ],
};

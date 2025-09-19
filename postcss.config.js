// postcss.config.js
module.exports = {
  plugins: {
    "@tailwindcss/postcss": {},  // ✅ Tailwind v4 requires this
    autoprefixer: {},
  },
};

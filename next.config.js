const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // IMPORTANT: do NOT set `output: 'export'`
  webpack: (config) => {
    config.resolve.alias["@"] = path.resolve(__dirname, "src");
    return config;
  },
  async redirects() {
    return ["lve360.com", "www.lve360.com"].map((host) => ({
      source: "/:path*",
      has: [{ type: "host", value: host }],
      destination: "https://app.lve360.com/:path*",
      permanent: true,
    }));
  },
};

module.exports = nextConfig;

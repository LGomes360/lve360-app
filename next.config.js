const path = require('path');

module.exports = {
  webpack: (config) => {
    config.resolve.alias['@'] = path.resolve(__dirname, 'src');
    return config;
  },
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true
  // IMPORTANT: do NOT set `output: 'export'`
};
module.exports = nextConfig;

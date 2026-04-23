/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["heic-convert"],
  },
};

module.exports = nextConfig;

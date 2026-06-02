/** @type {import('next').NextConfig} */
const nextConfig = {
  // Strict mode
  reactStrictMode: true,

  // Skip TypeScript type checking during build
  typescript: {
    ignoreBuildErrors: true,
  },

  // Image domains
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
};

module.exports = nextConfig;

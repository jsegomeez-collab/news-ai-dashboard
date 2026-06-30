/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  webpack: (config) => {
    // node:sqlite es un built-in de Node.js 22+ — hay que externalizarlo manualmente.
    config.externals = [...(config.externals ?? []), { "node:sqlite": "node:sqlite" }];
    return config;
  },
};

export default nextConfig;

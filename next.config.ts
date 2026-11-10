import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for Docker / any Node host (see Dockerfile and docs/DEPLOY.md).
  output: "standalone",
  // Every page is per-user, database-backed and rendered at request time, so Cache Components
  // is left off for now. Revisit once there are public, cacheable pages.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  serverExternalPackages: ["pg", "@prisma/adapter-pg"],
};

export default nextConfig;

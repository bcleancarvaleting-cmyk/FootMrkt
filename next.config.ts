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
  // Withdrawals include a photo of the manager's ID (up to 6MB).
  experimental: { serverActions: { bodySizeLimit: "8mb" } },
  // Security headers on every page (security sweep, 11 Nov 2026): no framing (clickjacking), no
  // MIME sniffing, no referrer leaks to other sites, browser features off, HTTPS only in production.
  async headers() {
    const headers = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
      ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
    ];
    return [{ source: "/:path*", headers }];
  },
};

export default nextConfig;

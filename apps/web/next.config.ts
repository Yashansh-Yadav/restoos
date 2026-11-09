import type { NextConfig } from "next";

// The backend (apps/api, Fastify) owns every /api route. Next.js is frontend only and
// proxies /api/* so browser calls stay same-origin (first-party cookies, no CORS).
// In production Caddy routes /api/* to the API directly. Env validation arrives in M0-T3.
const apiInternalUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  // Internal workspace packages ship TypeScript source.
  transpilePackages: ["@restoos/shared", "@restoos/print"],
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiInternalUrl}/api/:path*` }];
  },
};

export default nextConfig;

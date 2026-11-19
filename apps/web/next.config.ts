import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { EnvError } from "@restoos/shared/env";
import { loadRootEnv } from "@restoos/shared/env/node";
import { loadWebClientEnv, loadWebServerEnv } from "./src/env";

// Fail fast (M0-T3): validate env before Next starts or builds.
loadRootEnv();
let apiInternalUrl: string;
try {
  apiInternalUrl = loadWebServerEnv().API_INTERNAL_URL;
  loadWebClientEnv();
} catch (err) {
  if (err instanceof EnvError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}

// The backend (apps/api, Fastify) owns every /api route. Next.js is frontend only and proxies
// /api/* so browser calls stay same-origin (first-party cookies, no CORS). In production Caddy
// routes /api/* to the API directly.
const nextConfig: NextConfig = {
  // Internal workspace packages ship TypeScript source.
  transpilePackages: ["@restoos/shared", "@restoos/print"],
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiInternalUrl}/api/:path*` }];
  },
};

// next-intl (M5-T6a): locale + messages per request from src/i18n/request.ts (cookie-based).
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Internal workspace packages ship TypeScript source.
  transpilePackages: ["@restoos/shared", "@restoos/db", "@restoos/print"],
};

export default nextConfig;

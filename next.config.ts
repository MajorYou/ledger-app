import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['canvas'],
  turbopack: {
    resolveAlias: {
      canvas: './lib/empty-module.ts',
    },
  },
};

export default nextConfig;

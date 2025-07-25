import type { NextConfig } from "next";

import createNextIntlPlugin from 'next-intl/plugin';

const config = {
  eslint: { ignoreDuringBuilds: true },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { hostname: "**.githubassets.com", protocol: "https" },
      { hostname: "**.githubusercontent.com", protocol: "https" },
      { hostname: "**.googleusercontent.com", protocol: "https" },
      { hostname: "**.ufs.sh", protocol: "https" },
      { hostname: "**.unsplash.com", protocol: "https" },
      { hostname: "api.github.com", protocol: "https" },
      { hostname: "utfs.io", protocol: "https" },
      { hostname: "zvcxdyuidlhzvmhsviwc.supabase.co", protocol: "https" },
    ],
  },
  webpack: (config) => {
    config.ignoreWarnings = [
      (warning: { message: string }) =>
        typeof warning.message === 'string' &&
        warning.message.includes('Critical dependency: the request of a dependency is an expression'),
    ];
    return config;
  },
} satisfies NextConfig;

const withNextIntl = createNextIntlPlugin('./src/i18n/i18nServer.ts');

export default withNextIntl(config);

import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const config: NextConfig = {
  // The image copies .next/standalone.
  output: "standalone",
  // fileURLToPath, not URL.pathname, which yields "/C:/..." on Windows.
  outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),
  reactStrictMode: true,
  poweredByHeader: false,
  // ISR pages (lib/data.ts) revalidate every 300s. Past 600s a cached page is
  // re-rendered before it is served, and browsers get stale-while-revalidate=300
  // instead of Next's default of a year.
  expireTime: 600,
  experimental: {
    // Keep ISR in the 50 MB in-memory LRU only. The cache dies with the replica
    // on scale to zero anyway, and on disk every made-up URL's 404 would stay.
    isrFlushToDisk: false,
  },
  async headers() {
    // GLK's hardening set. The app has no login, cookies or forms, so there is
    // little to steal, but nothing should frame it or load scripts into it.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            // 'unsafe-inline' scripts because Next's hydration is inline and
            // nonces need middleware on every request. No external origins.
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              process.env.NODE_ENV === "production"
                ? "script-src 'self' 'unsafe-inline'"
                : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data:",
              "font-src 'self' data:",
              "connect-src 'self'",
              "form-action 'none'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "object-src 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default config;

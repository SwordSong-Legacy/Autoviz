import type { NextConfig } from "next";

// Content Security Policy directives
const ContentSecurityPolicy = `
  default-src 'self';
  script-src 'self' 'unsafe-eval' 'unsafe-inline';
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data: https:;
  font-src 'self' data:;
  connect-src 'self' ws: wss: http://localhost:* https://localhost:* https://*.run.app;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
`
  .replace(/\n/g, " ")
  .trim();

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: ContentSecurityPolicy,
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-XSS-Protection",
    value: "1; mode=block",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  // Static export for Firebase Hosting (out/ folder).
  // Only enable for production build; dev mode needs API proxy (force-dynamic).
  ...(process.env.NODE_ENV === "production" && { output: "export" as const }),

  // Security headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },

  // Environment variables available on the server side only
  serverRuntimeConfig: {
    apiUrl: process.env.BACKEND_URL || "http://localhost:8000",
  },

  // Environment variables available on both server and client
  publicRuntimeConfig: {
    appName: "autoviz",
  },
};

export default nextConfig;

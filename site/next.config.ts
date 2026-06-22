import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const appRoot = dirname(fileURLToPath(import.meta.url));

// Reversed "X vs BrowserBash" duplicates: keep the `<tool>-vs-browserbash`
// form and 308 the `browserbash-vs-<tool>` twin to it so they stop splitting
// ranking signal (the browserbash-vs-* .md files are deleted).
const VS_DUPES = ['taiko', 'midscene', 'shortest', 'skyvern'];

const nextConfig: NextConfig = {
  turbopack: {
    root: appRoot,
  },
  outputFileTracingRoot: appRoot,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
          },
        ],
      },
    ];
  },
  async redirects() {
    return VS_DUPES.map((tool) => ({
      source: `/blog/browserbash-vs-${tool}`,
      destination: `/blog/${tool}-vs-browserbash`,
      permanent: true,
    }));
  },
};

export default nextConfig;

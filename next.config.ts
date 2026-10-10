import type { NextConfig } from "next";

const SHARE_PAGE_HEADERS = [
  { key: "Cache-Control", value: "no-store, max-age=0" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  { key: "Referrer-Policy", value: "no-referrer" },
];

const nextConfig: NextConfig = {
  // LAN / VM hostname used when opening next via Network IP (not localhost).
  // Without this, Next 16 blocks /_next/* and the page stays white.
  allowedDevOrigins: ["100.115.92.204"],
  async headers() {
    return [
      { source: "/c/:token", headers: SHARE_PAGE_HEADERS },
      { source: "/s/:token", headers: SHARE_PAGE_HEADERS },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },
};

export default nextConfig;

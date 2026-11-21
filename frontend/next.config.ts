import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { IMAGE_HOSTS } from "./lib/imageHosts";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// El navegador SOLO habla con este mismo origen: /api/* se reenvía al backend.
// Así las cookies httpOnly son "same-site" y no hace falta abrir CORS ni complicar el CSRF.
const RAW_API = (process.env.API_INTERNAL_URL || "http://localhost:8000").replace(/\/$/, "");
const API_INTERNAL_URL = /^https?:\/\//.test(RAW_API) ? RAW_API : `http://${RAW_API}`;

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  images: {
    remotePatterns: IMAGE_HOSTS.map((hostname) => ({ protocol: "https" as const, hostname })),
    formats: ["image/webp"],
    minimumCacheTTL: 60 * 60 * 24,
    deviceSizes: [400, 640, 828, 1080, 1280],
    imageSizes: [380, 700],
  },
  // Tailwind v4 se procesa con el loader de Turbopack (sin PostCSS). Si se quita, la web sale SIN estilos.
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_INTERNAL_URL}/api/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);

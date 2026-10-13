import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // En Vercel, /api/* lo enruta vercel.json al servicio backend (mismo dominio).
  // En `next dev` lo redirigimos al backend local.
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    const backend = process.env.BACKEND_URL ?? "http://localhost:3001";
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};

export default nextConfig;

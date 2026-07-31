const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || "http://127.0.0.1:8001";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: "/meetings/:path*", destination: `${BACKEND_URL}/meetings/:path*` },
      { source: "/users/:path*", destination: `${BACKEND_URL}/users/:path*` },
      { source: "/health", destination: `${BACKEND_URL}/health` },
      { source: "/socket.io/:path*", destination: `${BACKEND_URL}/socket.io/:path*` },
    ];
  },
};

module.exports = nextConfig;

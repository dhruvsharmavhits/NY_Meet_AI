const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || "http://127.0.0.1:8001";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The meeting room owns real singleton side effects — a socket.io
  // connection, getUserMedia streams, MediaRecorder — that a second
  // mount/cleanup/remount (StrictMode's deliberate dev-only double-invoke)
  // replays for real: e.g. a single-use join token gets consumed by the
  // throwaway first invocation, so the one that actually stays mounted gets
  // rejected. Not worth fighting effect-by-effect; this class of app is the
  // standard case for leaving it off.
  reactStrictMode: false,
  async rewrites() {
    return [
      { source: "/meetings/:path*", destination: `${BACKEND_URL}/meetings/:path*` },
      { source: "/users/:path*", destination: `${BACKEND_URL}/users/:path*` },
      { source: "/admin/:path*", destination: `${BACKEND_URL}/admin/:path*` },
      { source: "/patient-links/:path*", destination: `${BACKEND_URL}/patient-links/:path*` },
      { source: "/health", destination: `${BACKEND_URL}/health` },
      { source: "/socket.io/:path*", destination: `${BACKEND_URL}/socket.io/:path*` },
    ];
  },
};

module.exports = nextConfig;

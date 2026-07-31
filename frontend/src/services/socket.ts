import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket) return socket;

  const userId = typeof window !== "undefined" ? localStorage.getItem("user_id") : null;
  // Same rule as api.ts: empty/unset means "connect to the page's own origin"
  // (socket.io-client's default when no URL is given), which is what we want
  // when Next.js is proxying /socket.io to the backend.
  socket = io(process.env.NEXT_PUBLIC_API_URL || undefined, {
    auth: { user_id: userId },
    // Websocket-only breaks when a proxy in front of the backend doesn't
    // forward Upgrade requests (e.g. Next.js rewrites, used to share both
    // the app and API/socket traffic behind one ngrok tunnel) — allow
    // falling back to (and staying on) HTTP long-polling in that case.
    transports: ["polling", "websocket"],
    autoConnect: false,
  });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

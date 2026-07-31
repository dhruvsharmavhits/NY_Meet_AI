import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket) {
    return socket;
  }

  const userId =
    typeof window !== "undefined"
      ? localStorage.getItem("user_id")
      : null;

  const socketUrl =
    process.env.NEXT_PUBLIC_SOCKET_URL ||
    window.location.origin;

  console.log("Socket URL:", socketUrl);
  console.log("User ID:", userId);

  socket = io(socketUrl, {
    path: "/socket.io",
    auth: {
      user_id: userId,
    },
    transports: ["websocket", "polling"],
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    timeout: 20000,
    withCredentials: true,
  });

  socket.on("connect", () => {
    console.log("✅ Socket Connected:", socket?.id);
  });

  socket.on("disconnect", (reason) => {
    console.log("❌ Socket Disconnected:", reason);
  });

  socket.on("connect_error", (err) => {
    console.error("❌ Socket Connection Error:", err);
  });

  socket.io.on("reconnect", (attempt) => {
    console.log("🔄 Reconnected:", attempt);
  });

  socket.io.on("reconnect_attempt", (attempt) => {
    console.log("🔄 Reconnect Attempt:", attempt);
  });

  socket.io.on("error", (err) => {
    console.error("Socket.IO Error:", err);
  });

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

import { io } from "socket.io-client";

function connectToSocket() {
  return io(import.meta.env.VITE_BACKEND_URL as string, {
    transports: ["websocket", "polling"],
    path: "/socket.io",
    autoConnect: false,
    withCredentials: true,
    // Reconnection configuration
    reconnection: true, // Enable automatic reconnection
    reconnectionAttempts: Infinity, // Keep trying to reconnect
    reconnectionDelay: 1000, // Start with 1 second delay
    reconnectionDelayMax: 5000, // Max 5 seconds between attempts
    randomizationFactor: 0.5, // Randomize reconnection delay to prevent thundering herd
    // Timeout configuration
    timeout: 20000, // 20 seconds connection timeout
    // Keep connection alive with ping/pong
    forceNew: false, // Reuse existing connection if available
    // Upgrade transport smoothly
    upgrade: true,
    rememberUpgrade: true,
  });
}

const socket = connectToSocket();

export { socket };

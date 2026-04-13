import { createContext, useEffect, useState, useRef, useCallback } from "react";
import store from "src/redux/store";
import type { RootState } from "src/redux/store";
import type { ReactNode, FC } from "react";
import { Socket } from "socket.io-client";
import { socket as socketInstance } from "src/lib/socket-io";
import useBookingCancellationEvents from "src/hooks/useBookingCancellationEvents";

type SocketContextType = {
  socket: Socket | null;
  isConnected: boolean;
};

// eslint-disable-next-line react-refresh/only-export-components
export const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
});

interface SocketProviderProps {
  children: ReactNode;
}

export const SocketProvider: FC<SocketProviderProps> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isWindowFocused, setIsWindowFocused] = useState(true);
  const socketRef = useRef<Socket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isWindowFocusedRef = useRef(true);
  const connectionStatsRef = useRef({
    connectCount: 0,
    disconnectCount: 0,
    errorCount: 0,
    lastConnectTime: null as Date | null,
    lastDisconnectTime: null as Date | null,
  });

  useEffect(() => {
    isWindowFocusedRef.current = isWindowFocused;
  }, [isWindowFocused]);

  const hasActiveSession = useCallback(() => {
    try {
      const state: RootState = store.getState();
      const { sessionActive, expiresAt } = state.userSession;
      if (!sessionActive) {
        return false;
      }
      if (typeof expiresAt === "number" && expiresAt <= Date.now()) {
        return false;
      }
      return true;
    } catch (e) {
      console.warn("[Socket] Failed to inspect session state", e);
      return false;
    }
  }, []);

  const connectSocket = useCallback(() => {
    if (!socketRef.current) {
      socketRef.current = socketInstance;
    }

    if (!hasActiveSession()) {
      (socketRef.current as Socket).auth = {};
      if (
        import.meta.env.DEV &&
        (import.meta.env.VITE_SOCKET_DEBUG ?? "true") !== "false"
      ) {
        console.debug(
          "[Socket] No active session at connect time (skipping connect)"
        );
      }
      if (socketRef.current.connected) {
        socketRef.current.disconnect();
      }
      return;
    }

    if (
      import.meta.env.DEV &&
      (import.meta.env.VITE_SOCKET_DEBUG ?? "true") !== "false"
    ) {
      console.debug("[Socket] attempting connect with session");
    }

    (socketRef.current as Socket).auth = { session: true };

    if (!(socketRef.current as Socket).connected) {
      (socketRef.current as Socket).connect();
    }
  }, [hasActiveSession]);

  useEffect(() => {
    if (hasActiveSession()) {
      connectSocket();
    } else if (
      import.meta.env.DEV &&
      (import.meta.env.VITE_SOCKET_DEBUG ?? "true") !== "false"
    ) {
      console.debug(
        "[Socket] Initial mount without session - socket idle until login"
      );
    }

    const handleConnect = () => {
      setIsConnected(true);
      connectionStatsRef.current.connectCount++;
      connectionStatsRef.current.lastConnectTime = new Date();
      
      if (
        import.meta.env.DEV &&
        (import.meta.env.VITE_SOCKET_DEBUG ?? "true") !== "false"
      ) {
        console.debug(
          "[Socket] connected",
          `(total connects: ${connectionStatsRef.current.connectCount})`
        );
      }
    };

    const handleDisconnect = (reason: string) => {
      setIsConnected(false);
      connectionStatsRef.current.disconnectCount++;
      connectionStatsRef.current.lastDisconnectTime = new Date();
      
      if (
        import.meta.env.DEV &&
        (import.meta.env.VITE_SOCKET_DEBUG ?? "true") !== "false"
      ) {
        const uptime = connectionStatsRef.current.lastConnectTime
          ? Math.round(
              (Date.now() - connectionStatsRef.current.lastConnectTime.getTime()) / 1000
            )
          : 0;
        console.debug(
          "[Socket] disconnected:",
          reason,
          `(uptime: ${uptime}s, total disconnects: ${connectionStatsRef.current.disconnectCount})`
        );
      }
      
      // Only schedule reconnect if window is focused and we have a session
      // Socket.io will handle automatic reconnection based on config
      if (isWindowFocusedRef.current && hasActiveSession()) {
        // Don't interfere with socket.io's built-in reconnection
        // Only schedule manual reconnect for specific disconnect reasons
        if (reason === "io server disconnect" || reason === "io client disconnect") {
          scheduleReconnect();
        }
      }
    };

    const handleConnectError = (error: Error) => {
      connectionStatsRef.current.errorCount++;
      
      if (
        import.meta.env.DEV &&
        (import.meta.env.VITE_SOCKET_DEBUG ?? "true") !== "false"
      ) {
        console.debug(
          "[Socket] connect_error:",
          error.message,
          `(total errors: ${connectionStatsRef.current.errorCount})`
        );
      }
    };

    const handleAuthError = (payload: { reason: string; message: string }) => {
      if (
        import.meta.env.DEV &&
        (import.meta.env.VITE_SOCKET_DEBUG ?? "true") !== "false"
      ) {
        console.debug("[Socket] auth:error:", payload.reason, payload.message);
      }
      
      // Handle token expiration
      if (payload.reason === "TOKEN_EXPIRED") {
        // Disconnect the socket and let the user session handler deal with re-auth
        socketRef.current?.disconnect();
        // The session middleware should detect this and redirect to login if needed
      }
    };

    const scheduleReconnect = () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      if (!hasActiveSession()) {
        if (
          import.meta.env.DEV &&
          (import.meta.env.VITE_SOCKET_DEBUG ?? "true") !== "false"
        ) {
          console.debug("[Socket] reconnect skipped - no active session");
        }
        return;
      }

      reconnectTimeoutRef.current = setTimeout(() => {
        if (
          import.meta.env.DEV &&
          (import.meta.env.VITE_SOCKET_DEBUG ?? "true") !== "false"
        ) {
          console.debug("[Socket] attempting reconnect...");
        }
        connectSocket();
      }, 5000);
    };

    const handleWindowFocus = () => {
      setIsWindowFocused(true);
      if (!hasActiveSession()) {
        if (
          import.meta.env.DEV &&
          (import.meta.env.VITE_SOCKET_DEBUG ?? "true") !== "false"
        ) {
          console.debug(
            "[Socket] window focus but no active session - skipping connect"
          );
        }
        return;
      }
      if (!socketRef.current?.connected) {
        if (
          import.meta.env.DEV &&
          (import.meta.env.VITE_SOCKET_DEBUG ?? "true") !== "false"
        ) {
          console.debug("[Socket] window focused -> reconnect");
        }
        connectSocket();
      }
    };

    const handleWindowBlur = () => {
      setIsWindowFocused(false);
      if (
        import.meta.env.DEV &&
        (import.meta.env.VITE_SOCKET_DEBUG ?? "true") !== "false"
      ) {
        console.debug("[Socket] window blurred");
      }
    };

    socketRef.current?.on("connect", handleConnect);
    socketRef.current?.on("disconnect", handleDisconnect);
    socketRef.current?.on("connect_error", handleConnectError);
    socketRef.current?.on("auth:error", handleAuthError);

    window.addEventListener("focus", handleWindowFocus);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      socketRef.current?.off("connect", handleConnect);
      socketRef.current?.off("disconnect", handleDisconnect);
      socketRef.current?.off("connect_error", handleConnectError);
      socketRef.current?.off("auth:error", handleAuthError);
      // Only disconnect on unmount (this effect runs once due to empty deps)
      socketRef.current?.disconnect();
      socketRef.current = null;

      window.removeEventListener("focus", handleWindowFocus);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [connectSocket, hasActiveSession]);

  // Maintain socket connection as session state changes
  useEffect(() => {
    const unsubscribe = store.subscribe(() => {
      const sessionActive = hasActiveSession();
      if (!socketRef.current) {
        if (sessionActive) {
          connectSocket();
        }
        return;
      }

      if (sessionActive) {
        if (!socketRef.current.connected) {
          connectSocket();
        }
      } else if (socketRef.current.connected) {
        if (
          import.meta.env.DEV &&
          (import.meta.env.VITE_SOCKET_DEBUG ?? "true") !== "false"
        ) {
          console.debug("[Socket] Session cleared – disconnecting socket");
        }
        (socketRef.current as Socket).auth = {};
        socketRef.current.disconnect();
      }
    });
    return () => unsubscribe();
  }, [connectSocket, hasActiveSession]);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
};

// Activate global booking cancellation listener when socket is ready
export function SocketEffectsActivator() {
  useBookingCancellationEvents();
  return null;
}

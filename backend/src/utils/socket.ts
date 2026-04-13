import { Server as HTTPServer } from "http";
import { Server as SocketServer, Socket } from "socket.io";
import jwt, {
  JsonWebTokenError,
  NotBeforeError,
  TokenExpiredError,
} from "jsonwebtoken";
import prisma from "../config/db";
import { verifyTotp } from "./../utils/otp";
import { issueTwoFASession } from "./twofaSession";
import { ACCESS_COOKIE_NAME } from "../controllers/auth.controller";

interface TokenPayload {
  userId: string;
  role: string;
}

// ANSI color codes for WebSocket logging
const wsColors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
  gray: "\x1b[90m",
};

function formatWsTimestamp(): string {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");

  return `${day}/${month}/${year} at ${hours}:${minutes}`;
}

export class WebSocketManager {
  private io: SocketServer;
  private connectedClients: Map<string, Socket> = new Map();
  private allowedOrigins: string[];

  constructor(httpServer: HTTPServer) {
    // Build allowed origins list from environment variables
    this.allowedOrigins = this.buildAllowedOrigins();

    this.io = new SocketServer(httpServer, {
      cors: {
        origin: (origin, callback) => {
          // Allow requests with no origin (mobile apps, curl, etc.)
          if (!origin) {
            return callback(null, true);
          }

          // Check if origin is in allowed list
          if (this.allowedOrigins.includes(origin)) {
            callback(null, true);
          } else {
            console.warn(
              `[WS] Rejected connection from unauthorized origin: ${origin}`
            );
            callback(new Error("Unauthorized origin"), false);
          }
        },
        credentials: true,
      },
      // Configure ping/pong to keep connections alive
      pingTimeout: 60000, // 60 seconds - how long to wait for pong before considering connection dead
      pingInterval: 25000, // 25 seconds - how often to send ping packets
      // Increase max HTTP buffer size for large payloads
      maxHttpBufferSize: 1e6, // 1 MB
      // Allow more time for initial connection
      connectTimeout: 45000, // 45 seconds
    });

    this.setupMiddleware();
    this.setupEventHandlers();
  }

  private buildAllowedOrigins(): string[] {
    const origins: string[] = [];

    // Primary app URL
    const appBaseUrl = process.env.APP_BASE_URL;
    if (appBaseUrl) {
      origins.push(appBaseUrl);
    }

    // Additional allowed origins from comma-separated env var
    const additionalOrigins = process.env.ALLOWED_ORIGINS;
    if (additionalOrigins) {
      const parsed = additionalOrigins
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean);
      origins.push(...parsed);
    }

    // Development fallbacks
    if (process.env.NODE_ENV !== "production") {
      const devOrigins = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
      ];
      for (const devOrigin of devOrigins) {
        if (!origins.includes(devOrigin)) {
          origins.push(devOrigin);
        }
      }
    }

    console.log(`[WS] Allowed origins:`, origins);
    return origins;
  }

  private setupMiddleware() {
    this.io.use(async (socket, next) => {
      try {
        // Validate origin first
        const origin = socket.handshake.headers.origin;
        if (origin && !this.allowedOrigins.includes(origin)) {
          console.warn(
            `[WS] Rejected handshake from unauthorized origin: ${origin}`
          );
          return next(new Error("Unauthorized origin"));
        }

        let token = socket.handshake.auth?.token as string | undefined;
        if (!token) {
          const cookieHeader = socket.handshake.headers.cookie;
          if (typeof cookieHeader === "string") {
            const cookies = cookieHeader.split(";");
            for (const raw of cookies) {
              const [name, ...rest] = raw.trim().split("=");
              if (name === ACCESS_COOKIE_NAME) {
                token = decodeURIComponent(rest.join("="));
                break;
              }
            }
          }
        }
        if (!token) {
          console.debug(
            "[WS] No token in handshake auth for socket",
            socket.id
          );
          socket.data.isAnonymous = true;
          return next();
        }

        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
          console.error(
            "[WS] JWT_SECRET is not configured; allowing anonymous socket",
            socket.id
          );
          socket.data.isAnonymous = true;
          socket.data.authError = "SERVER_MISCONFIG";
          return next();
        }

        const decoded: any = jwt.verify(token, jwtSecret);
        const resolvedUserId = decoded.userId || decoded.sub || decoded.id;
        socket.data.userId = resolvedUserId;
        socket.data.role = decoded.role;
        socket.data.isAnonymous = false;
        if (!resolvedUserId) {
          console.warn(
            "[WS] Decoded token missing user identifier keys",
            Object.keys(decoded)
          );
        }
        next();
      } catch (error) {
        if (error instanceof TokenExpiredError) {
          console.info(
            `[WS] Expired token for socket ${socket.id}`,
            error.expiredAt ? `expiredAt=${error.expiredAt.toISOString()}` : ""
          );
          socket.data.isAnonymous = true;
          socket.data.authError = "TOKEN_EXPIRED";
          return next();
        }

        if (error instanceof NotBeforeError) {
          console.warn(
            `[WS] Token not active yet for socket ${socket.id}: ${error.date}`
          );
          return next(new Error("Authentication failed"));
        }

        if (error instanceof JsonWebTokenError) {
          console.warn(
            `[WS] Invalid token for socket ${socket.id}: ${error.message}`
          );
          return next(new Error("Authentication failed"));
        }

        console.error("Socket authentication unexpected error:", error);
        next(new Error("Authentication failed"));
      }
    });
  }

  private setupEventHandlers() {
    this.io.on("connection", async (socket) => {
      const timestamp = formatWsTimestamp();

      // Fetch user email if authenticated
      let userEmail = "anonymous";
      let userRole = "";

      if (socket.data.userId && !socket.data.isAnonymous) {
        try {
          const user = await prisma.user.findUnique({
            where: { id: socket.data.userId },
            select: { email: true, role: true },
          });
          if (user) {
            userEmail = user.email;
            userRole = user.role;
          }
        } catch (e) {
          console.error("Failed to fetch user for WS logging:", e);
        }
      }

      const userColor =
        userEmail === "anonymous" ? wsColors.gray : wsColors.magenta;
      const roleInfo = userRole ? ` (${userRole})` : "";

      console.log(
        `${wsColors.blue}[${timestamp}]${wsColors.reset} ` +
          `${wsColors.green}[WS]${wsColors.reset} ` +
          `${wsColors.cyan}CONNECTED${wsColors.reset} ` +
          `${wsColors.dim}${socket.id}${wsColors.reset} ` +
          `${userColor}[${userEmail}${roleInfo}]${wsColors.reset}`
      );

      if (socket.data.userId) {
        this.connectedClients.set(socket.data.userId, socket);
        // Join a personal room for targeted emits
        try {
          socket.join(`user:${socket.data.userId}`);
        } catch (e) {
          console.warn("Failed to join user room:", e);
        }
      }

      if (socket.data.authError === "TOKEN_EXPIRED") {
        console.log(
          `${wsColors.blue}[${timestamp}]${wsColors.reset} ` +
            `${wsColors.yellow}[WS]${wsColors.reset} ` +
            `${wsColors.red}AUTH_ERROR${wsColors.reset} ` +
            `${wsColors.dim}${socket.id} - TOKEN_EXPIRED${wsColors.reset}`
        );
        socket.emit("auth:error", {
          reason: "TOKEN_EXPIRED",
          message: "Your session expired. Please sign in again.",
        });
      } else if (socket.data.authError === "SERVER_MISCONFIG") {
        console.log(
          `${wsColors.blue}[${timestamp}]${wsColors.reset} ` +
            `${wsColors.yellow}[WS]${wsColors.reset} ` +
            `${wsColors.red}AUTH_ERROR${wsColors.reset} ` +
            `${wsColors.dim}${socket.id} - SERVER_MISCONFIG${wsColors.reset}`
        );
        socket.emit("auth:error", {
          reason: "SERVER_MISCONFIG",
          message:
            "Socket authentication is temporarily unavailable. Please try again later.",
        });
      }

      // Removed deprecated kitchen room logic

      socket.on("disconnect", () => {
        const timestamp = formatWsTimestamp();
        const userColor =
          userEmail === "anonymous" ? wsColors.gray : wsColors.magenta;

        console.log(
          `${wsColors.blue}[${timestamp}]${wsColors.reset} ` +
            `${wsColors.yellow}[WS]${wsColors.reset} ` +
            `${wsColors.red}DISCONNECTED${wsColors.reset} ` +
            `${wsColors.dim}${socket.id}${wsColors.reset} ` +
            `${userColor}[${userEmail}${roleInfo}]${wsColors.reset}`
        );

        if (socket.data.userId) {
          this.connectedClients.delete(socket.data.userId);
        }
      });

      // Two-factor verification via websocket
      socket.on(
        "twofa:verify",
        async (payload: { code?: string }, cb?: (resp: any) => void) => {
          try {
            if (!socket.data.userId) {
              return cb?.({ ok: false, error: "UNAUTHENTICATED" });
            }
            const code = payload?.code?.trim();
            if (!code) return cb?.({ ok: false, error: "CODE_REQUIRED" });
            const user = await prisma.user.findUnique({
              where: { id: socket.data.userId },
            });
            if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
              return cb?.({ ok: false, error: "TWO_FACTOR_NOT_ENABLED" });
            }
            const valid = verifyTotp(user.twoFactorSecret, code, 1); // allow slight drift
            if (!valid) return cb?.({ ok: false, error: "INVALID_CODE" });
            const { token, exp, slice } = issueTwoFASession(user.id);
            cb?.({ ok: true, sessionToken: token, exp, slice });
          } catch (e) {
            console.error("twofa:verify error", e);
            cb?.({ ok: false, error: "SERVER_ERROR" });
          }
        }
      );
    });
  }

  public getIO(): SocketServer {
    return this.io;
  }
}

// src/index.ts
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createServer } from "http";
import app from "./app";

import { PrismaClient } from "@prisma/client";
import { WebSocketManager } from "./utils/socket";
import { setIO } from "./utils/ws-bus";
import { ensureEmailReady } from "./utils/mailer";

const prisma = new PrismaClient();
const httpServer = createServer(app);

// Initialize WebSocket
export const wsManager = new WebSocketManager(httpServer);
setIO(wsManager.getIO());

const PORT = process.env.PORT || 8090;
const HOST = process.env.BACKEND_URL_HOST || "localhost";

async function startServer() {
  try {
    // Test database connection
    await prisma.$connect();
    console.log("✅ Database connected successfully");

    // --- M-Pesa environment readiness summary ---
    const stkReady = [
      "MPESA_CONSUMER_KEY",
      "MPESA_CONSUMER_SECRET",
      "MPESA_SHORTCODE",
      "MPESA_PASSKEY",
      "MPESA_CALLBACK_URL_BASE",
    ].every((k) => !!process.env[k]);
    const b2cInitiator = !!process.env.MPESA_B2C_INITIATOR;
    const b2cCredential = !!process.env.MPESA_B2C_CREDENTIAL;
    const b2cReady = b2cInitiator && b2cCredential;
    console.log(
      "[startup] MPESA_STK_READY=",
      stkReady,
      "MPESA_B2C_READY=",
      b2cReady,
    );
    if (!stkReady) {
      console.warn(
        "[startup][warn] STK not fully configured – missing one of required vars",
      );
    }
    if (!b2cReady) {
      console.warn(
        "[startup][warn] B2C refunds disabled (set MPESA_B2C_INITIATOR & MPESA_B2C_CREDENTIAL)",
      );
    }

    // Warm/verify email (non-fatal)
    ensureEmailReady().catch((e) =>
      console.warn("[startup] Email readiness check failed", e),
    );

    httpServer.listen(PORT, () => {
      console.log(`🚀 Server running at http://${HOST}:${PORT}/`);
      console.log("🔌 WebSocket server is ready");
    });

    // Graceful shutdown
    process.on("SIGTERM", async () => {
      console.log("SIGTERM received, shutting down gracefully");
      httpServer.close(() => {
        console.log("Server closed");
      });
      await prisma.$disconnect();
      process.exit(0);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

startServer();

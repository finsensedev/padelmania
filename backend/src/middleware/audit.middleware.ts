import { NextFunction, Request, Response } from "express";
import prisma from "../config/db";

function sanitize(obj: any) {
  try {
    if (!obj || typeof obj !== "object") return obj;
    const unsafeKeys = [
      "password",
      "passwordHash",
      "token",
      "accessToken",
      "refreshToken",
      "resetToken",
      "verificationToken",
      "twoFactorSecret",
      "secret",
      "cardNumber",
      "providerRef",
    ];
    const clone: any = Array.isArray(obj) ? [] : {};
    for (const [k, v] of Object.entries(obj)) {
      if (unsafeKeys.some((uk) => uk.toLowerCase() === k.toLowerCase())) {
        clone[k] = "[REDACTED]";
      } else if (v && typeof v === "object") {
        clone[k] = sanitize(v);
      } else {
        clone[k] = v;
      }
    }
    return clone;
  } catch {
    return undefined;
  }
}

function deriveEntityAndId(req: Request) {
  // When mounted under /api, req.path starts after /api
  const parts = req.path.split("/").filter(Boolean);
  const entity = (parts[0] || "SYSTEM").replace(/-/g, "_").toUpperCase();
  let entityId: string | undefined = undefined;
  // Prefer explicit params
  entityId = (req.params as any).id || (req.params as any)[`${parts[0]}Id`];
  if (!entityId && parts.length > 1) {
    const candidate = parts[1];
    if (candidate && candidate.length >= 8) entityId = candidate;
  }
  return { entity, entityId };
}

export function auditLogger(req: Request, res: Response, next: NextFunction) {
  // Skip health and static and audit endpoints to avoid noise/loops
  const originalUrl = req.originalUrl || "";
  if (
    originalUrl.startsWith("/health") ||
    originalUrl.startsWith("/files/") ||
    originalUrl.startsWith("/api/audit-logs")
  ) {
    return next();
  }

  const method = req.method.toUpperCase();
  if (method === "OPTIONS") return next();

  const start = Date.now();
  const reqBody = sanitize(req.body);
  const reqQuery = sanitize(req.query);

  res.on("finish", async () => {
    try {
      const durationMs = Date.now() - start;
      const { entity, entityId } = deriveEntityAndId(req);
      const action = `${req.method} ${originalUrl}`;

      await prisma.auditLog.create({
        data: {
          userId: req.user?.id,
          action,
          entity,
          entityId: entityId || "-",
          oldData: undefined,
          newData: {
            request: { body: reqBody, query: reqQuery },
            responseMeta: {
              statusCode: res.statusCode,
              durationMs,
              method: req.method,
              path: originalUrl,
            },
          } as any,
          ipAddress: req.ip,
          userAgent: (req.headers["user-agent"] as string) || undefined,
        },
      });
    } catch (e) {
      // Do not disrupt the response flow
      // eslint-disable-next-line no-console
      console.error("Audit middleware error", e);
    }
  });

  next();
}

export default auditLogger;

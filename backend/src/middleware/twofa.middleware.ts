import { NextFunction, Request, Response } from "express";
import prisma from "../config/db";
import { verifyTwoFASession } from "../utils/twofaSession";
import { verifyTotp } from "../utils/otp";

/**
 * Generic factory to build a 2FA middleware with a configurable TOTP window.
 * window=0 means only the current 30s slice is accepted (strict mode).
 * A larger window (e.g. 1) allows previous/next time-slices to accommodate clock drift.
 */
function buildTwoFactorMiddleware(window: number) {
  return async function requireTwoFactorInternal(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const actorId = req.user?.id;
      if (!actorId) return res.status(401).json({ message: "Unauthorized" });

      const actor = await prisma.user.findUnique({ where: { id: actorId } });
      if (!actor) return res.status(401).json({ message: "Unauthorized" });

      if (!actor.twoFactorEnabled || !actor.twoFactorSecret) {
        return res.status(403).json({
          message:
            "2FA is required for this action. Enable 2FA in your profile.",
        });
      }

      // 1. Ephemeral 2FA session token path
      const sessionToken = req.headers["x-2fa-session"] as string | undefined;
      if (sessionToken) {
        const check = verifyTwoFASession(sessionToken, actor.id, window);
        if (!check.valid) {
          return res.status(400).json({
            error: "TWO_FACTOR_INVALID",
            reason: check.reason,
            message: "Invalid or expired 2FA session",
          });
        }
        return next();
      }

      // 2. Direct TOTP code (fallback) via header or body
      const codeHeader = req.headers["x-2fa-code"] as string | undefined;
      const bodyCode = (req.body &&
        (req.body.twoFactorCode || req.body.code)) as string | undefined;
      const candidate = (codeHeader || bodyCode || "").trim();
      if (candidate.length === 6) {
        const valid = verifyTotp(actor.twoFactorSecret, candidate, window);
        if (valid) return next();
        return res.status(400).json({
          error: "TWO_FACTOR_CODE_INVALID",
          message: "Invalid 2FA code",
        });
      }

      return res.status(400).json({
        error: "TWO_FACTOR_REQUIRED",
        message:
          "Two-factor session or valid 6-digit code is required (header X-2FA-Session or X-2FA-Code)",
      });
    } catch (e) {
      console.error("2FA middleware error", e);
      return res.status(500).json({ message: "2FA verification failed" });
    }
  };
}

// Lenient middleware (allows slight clock drift: previous/current/next window)
export const requireTwoFactor = buildTwoFactorMiddleware(1);

// Strict middleware: ONLY current 30s TOTP slice accepted (no past/future)
export const requireTwoFactorStrict = buildTwoFactorMiddleware(0);

export default requireTwoFactor;

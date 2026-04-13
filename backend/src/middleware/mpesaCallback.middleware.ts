import { Request, Response, NextFunction } from "express";

function clientIp(req: Request): string {
  const xf = (req.headers["x-forwarded-for"] as string) || "";
  const first = xf.split(",")[0].trim();
  const raw = first || req.socket.remoteAddress || "";
  return raw.replace("::ffff:", "");
}

export function verifyMpesaCallback(req: Request, res: Response, next: NextFunction) {
  try {
    const secret = process.env.MPESA_CALLBACK_SECRET;
    const enforce = process.env.MPESA_CALLBACK_IP_ENFORCE === "true";
    const whitelistRaw = process.env.MPESA_CALLBACK_IP_WHITELIST || "";
    const whitelist = whitelistRaw.split(",").map(s => s.trim()).filter(Boolean);
    const ip = clientIp(req);
    const softFail = process.env.MPESA_CALLBACK_SOFT_FAIL === 'true';

    const provided = (req.headers["x-mpesa-callback-secret"] as string) || (req.headers["x-mpesa-secret"] as string);

    const ipAllowed = whitelist.length ? whitelist.includes(ip) : false;

    // Secret precedence: if provided & matches -> allow immediately
    if (secret && provided === secret) {
      return next();
    }

    // If secret configured but missing/mismatch, allow if IP is explicitly allowed
    if (secret && (!provided || provided !== secret)) {
      if (ipAllowed) {
        if (process.env.NODE_ENV !== 'production') {
          (req as any)._mpesaCallbackByIpOnly = true;
        }
      } else if (softFail) {
        (req as any)._mpesaCallbackAuthBypassed = true; // log only
      } else {
        return res.status(401).json({ message: "Invalid callback secret" });
      }
    }

    // If enforcement enabled, block non-whitelisted IPs (even if no secret defined)
    if (enforce) {
      if (whitelist.length && !ipAllowed) {
        if (softFail) {
          (req as any)._mpesaCallbackIpBypassed = ip;
        } else {
          return res.status(403).json({ message: "IP not allowed" });
        }
      }
    }

    // Learning / observation mode or soft-fail logging
    if (!enforce || softFail) {
      if (process.env.NODE_ENV !== 'production') {
        (req as any)._mpesaCallbackObservedIp = ip;
      }
    }

    return next();
  } catch (e) {
    return res.status(500).json({ message: "Callback verification error" });
  }
}

export default verifyMpesaCallback;
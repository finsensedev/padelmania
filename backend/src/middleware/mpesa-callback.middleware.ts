import type { RequestHandler } from "express";
import prisma from "../config/db";
import { collectClientIps, isIpAllowed } from "../utils/ip.util";

const DEFAULT_PRODUCTION_RANGES = [
  "196.201.214.200",
  "196.201.214.206",
  "196.201.213.114",
  "196.201.214.207",
  "196.201.214.208",
  "196.201.213.44",
  "196.201.212.127",
  "196.201.212.138",
  "196.201.212.129",
  "196.201.212.136",
  "196.201.212.74",
  "196.201.212.69",
];

const DEFAULT_SANDBOX_RANGES = DEFAULT_PRODUCTION_RANGES;

function buildAllowedList(): string[] {
  const envList = (process.env.MPESA_CALLBACK_IP_WHITELIST || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  const environment = (process.env.MPESA_ENV || "sandbox").toLowerCase();
  const defaults =
    environment === "production"
      ? DEFAULT_PRODUCTION_RANGES
      : DEFAULT_SANDBOX_RANGES;

  const combined = defaults;

  if (process.env.NODE_ENV !== "production") {
    return [...combined, "127.0.0.1", "::1"];
  }

  return combined;
}

async function auditReject(params: {
  reason: string;
  ipCandidates: string[];
  userAgent?: string;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        action: "MPESA_CALLBACK_REJECTED",
        entity: "Payment",
        entityId: "MPESA_CALLBACK",
        newData: {
          reason: params.reason,
          ipCandidates: params.ipCandidates,
        },
        ipAddress: params.ipCandidates[0] || null,
        userAgent: params.userAgent?.slice(0, 255) || null,
      },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("Failed to audit rejected M-Pesa callback", error);
  }
}

function hasValidSecret(req: Parameters<RequestHandler>[0]) {
  const secret = process.env.MPESA_CALLBACK_SECRET?.trim();
  if (!secret) return true;

  const headerSecret =
    (req.headers["x-mpesa-secret"] as string | undefined) ||
    (req.headers["x-callback-token"] as string | undefined) ||
    (req.headers["x-hook-secret"] as string | undefined);
  const querySecret =
    (typeof req.query.token === "string" && req.query.token) ||
    (typeof req.query.secret === "string" && req.query.secret);

  const provided = headerSecret || querySecret;
  return !!provided && provided === secret;
}

export const verifyMpesaCallback: RequestHandler = async (req, res, next) => {
  const ipCandidates = collectClientIps(req);
  const allowedIps = buildAllowedList();

  const matched = ipCandidates.some((ip) => isIpAllowed(ip, allowedIps));

  if (!matched) {
    const userAgent = req.get("user-agent") || undefined;
    console.warn("Blocked M-Pesa callback from unauthorized IP", {
      ipCandidates,
      allowedIps,
      userAgent,
    });
    await auditReject({
      reason: "IP_NOT_ALLOWED",
      ipCandidates,
      userAgent,
    });

    return res.status(403).json({
      message: "Unauthorized callback origin",
    });
  }

  if (!hasValidSecret(req)) {
    const userAgent = req.get("user-agent") || undefined;
    console.warn("Blocked M-Pesa callback due to secret mismatch", {
      ipCandidates,
      userAgent,
    });
    await auditReject({
      reason: "SECRET_MISMATCH",
      ipCandidates,
      userAgent,
    });
    return res.status(403).json({ message: "Invalid callback credentials" });
  }

  if (!req.is("application/json")) {
    console.warn("Rejected M-Pesa callback with invalid content type", {
      ipCandidates,
      contentType: req.headers["content-type"],
    });
    await auditReject({
      reason: "INVALID_CONTENT_TYPE",
      ipCandidates,
      userAgent: req.get("user-agent") || undefined,
    });
    return res.status(415).json({ message: "Unsupported content type" });
  }

  const hasExpectedPayload =
    req.body &&
    typeof req.body === "object" &&
    (req.body.Body || req.body.Result);

  if (!hasExpectedPayload) {
    console.warn("Rejected M-Pesa callback with malformed payload", {
      ipCandidates,
    });
    await auditReject({
      reason: "INVALID_PAYLOAD",
      ipCandidates,
      userAgent: req.get("user-agent") || undefined,
    });
    return res.status(400).json({ message: "Invalid callback payload" });
  }

  return next();
};

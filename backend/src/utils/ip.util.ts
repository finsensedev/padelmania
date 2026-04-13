import type { Request } from "express";

/**
 * Normalize IPv4/IPv6 string forms so comparisons are stable.
 * - strips IPv6 mapped IPv4 prefix (::ffff:)
 * - trims whitespace
 */
export function normalizeIp(ip?: string | null): string {
  if (!ip) return "";
  return ip.replace(/^::ffff:/i, "").trim();
}

function ipToLong(ip: string): number | null {
  const normalized = normalizeIp(ip);
  const parts = normalized.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((part) => {
    const n = Number(part);
    return Number.isInteger(n) && n >= 0 && n <= 255 ? n : NaN;
  });
  if (nums.some((n) => Number.isNaN(n))) {
    return null;
  }
  return ((nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3]) >>> 0;
}

function ipInCidr(ip: string, cidr: string): boolean {
  const [base, maskBitsRaw] = cidr.split("/");
  const maskBits = Number(maskBitsRaw);
  if (!base || !Number.isInteger(maskBits) || maskBits < 0 || maskBits > 32) {
    return false;
  }

  const ipLong = ipToLong(ip);
  const baseLong = ipToLong(base);
  if (ipLong === null || baseLong === null) {
    return false;
  }

  const mask = maskBits === 0 ? 0 : ~((1 << (32 - maskBits)) - 1) >>> 0;
  // eslint-disable-next-line no-bitwise
  return (ipLong & mask) === (baseLong & mask);
}

export function isIpAllowed(ip: string, allowedList: string[]): boolean {
  const candidates = allowedList.map(normalizeIp).filter(Boolean);
  const normalizedIp = normalizeIp(ip);
  if (!normalizedIp) return false;

  return candidates.some((entry) => {
    if (entry.includes("/")) {
      return ipInCidr(normalizedIp, entry);
    }
    return entry === normalizedIp;
  });
}

export function collectClientIps(req: Request): string[] {
  const rawForwarded = req.headers["x-forwarded-for"] as
    | string
    | string[]
    | undefined;
  const forwardedList: string[] = Array.isArray(rawForwarded)
    ? rawForwarded
    : rawForwarded
    ? rawForwarded.split(",")
    : [];

  const legacyRemoteAddress = (req as any).connection?.remoteAddress as
    | string
    | undefined;

  const ips = [
    ...forwardedList,
    req.socket?.remoteAddress || legacyRemoteAddress,
    req.ip,
  ];

  return ips.map((value) => normalizeIp(value || "")).filter(Boolean);
}

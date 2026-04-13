import { Request, Response } from "express";
import prisma from "../../config/db";
import type { Prisma } from "@prisma/client";

type VoucherType = "PERCENTAGE" | "AMOUNT";
type VoucherStatus =
  | "ACTIVE"
  | "SCHEDULED"
  | "EXPIRED"
  | "DISABLED"
  | "EXHAUSTED";

interface VoucherRedemption {
  userId: string;
  userName?: string; // Full name of the user
  userEmail?: string; // Email of the user
  bookingId?: string | null;
  amountDiscounted: number;
  at: string;
}

interface Voucher {
  id: string;
  code: string; // UPPERCASE
  type: VoucherType;
  value: number; // percent (0-100) or amount in KES
  isActive: boolean;
  startsAt?: string | null;
  expiresAt?: string | null;
  usageLimit?: number | null; // Maximum number of redemptions allowed
  usedByUsers?: string[]; // Array of user IDs who have used this voucher
  redemptions?: VoucherRedemption[]; // History of all redemptions
  createdAt: string;
  updatedAt: string;
  disabledAt?: string | null;
  status?: VoucherStatus;
}

export async function loadVouchers(): Promise<Voucher[]> {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: "VOUCHERS" },
  });
  if (!setting) return [];
  try {
    const arr = (setting.value as unknown as Voucher[]) || [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function saveVouchers(vouchers: Voucher[]) {
  const payload = vouchers as unknown as Prisma.InputJsonValue;
  const existing = await prisma.systemSetting.findUnique({
    where: { key: "VOUCHERS" },
  });
  if (existing) {
    await prisma.systemSetting.update({
      where: { key: "VOUCHERS" },
      data: { value: payload, type: "json", category: "PROMO" },
    });
  } else {
    await prisma.systemSetting.create({
      data: {
        key: "VOUCHERS",
        value: payload,
        type: "json",
        category: "PROMO",
        description: "Manager vouchers & promo codes",
      },
    });
  }
}

function cuid() {
  return (
    (global as any).crypto?.randomUUID?.() ||
    `vc_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
  );
}

export function computeDiscount(amount: number, v: Voucher): number {
  const baseAmount = Math.max(0, Math.floor(Number(amount)));
  if (!v.isActive) return 0;
  const nowIso = new Date().toISOString();
  if (v.startsAt && nowIso < v.startsAt) return 0;
  if (v.expiresAt && nowIso > v.expiresAt) return 0;
  let discount = 0;
  if (v.type === "PERCENTAGE") {
    discount = Math.max(0, Math.min(100, v.value)) * baseAmount * 0.01;
  } else {
    discount = v.value;
  }
  discount = Math.min(discount, baseAmount);
  return Math.floor(discount); // whole KES
}

function resolveVoucherStatus(v: Voucher): VoucherStatus {
  if (!v.isActive) return "DISABLED";
  const now = new Date();
  if (v.startsAt && new Date(v.startsAt) > now) return "SCHEDULED";
  if (v.expiresAt && new Date(v.expiresAt) < now) return "EXPIRED";
  // Check if usage limit has been reached
  if (
    v.usageLimit != null &&
    v.redemptions &&
    v.redemptions.length >= v.usageLimit
  ) {
    return "EXHAUSTED";
  }
  return "ACTIVE";
}

function parseOptionalNumber(input: unknown) {
  if (input === null || input === undefined || input === "") return null;
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0) return 0;
  return Math.floor(parsed);
}

function toIsoOrNull(input: unknown) {
  if (input === null || input === undefined || input === "") return null;
  const date = new Date(input as any);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function serializeVoucher(v: Voucher) {
  return {
    ...v,
    status: resolveVoucherStatus(v),
  };
}

async function enrichVouchersWithUserInfo(
  vouchers: Voucher[]
): Promise<Voucher[]> {
  // Collect all unique user IDs from redemptions
  const userIds = new Set<string>();
  vouchers.forEach((v) => {
    if (v.redemptions && v.redemptions.length > 0) {
      v.redemptions.forEach((r) => userIds.add(r.userId));
    }
  });

  if (userIds.size === 0) {
    return vouchers; // No users to fetch
  }

  // Fetch all users in one query
  const users = await prisma.user.findMany({
    where: { id: { in: Array.from(userIds) } },
    select: { id: true, firstName: true, lastName: true, email: true },
  });

  // Create a lookup map
  const userMap = new Map(
    users.map((u) => [
      u.id,
      {
        name: `${u.firstName} ${u.lastName}`.trim(),
        email: u.email,
      },
    ])
  );

  // Enrich redemptions with user info
  return vouchers.map((v) => {
    if (!v.redemptions || v.redemptions.length === 0) {
      return v;
    }

    return {
      ...v,
      redemptions: v.redemptions.map((r) => {
        const userInfo = userMap.get(r.userId);
        return {
          ...r,
          userName: userInfo?.name || "Unknown User",
          userEmail: userInfo?.email || "",
        };
      }),
    };
  });
}

export class VoucherController {
  static async list(req: Request, res: Response) {
    const vouchers = await loadVouchers();
    const enriched = await enrichVouchersWithUserInfo(vouchers);
    const data = enriched.map(serializeVoucher);
    res.json({ data });
  }

  static async create(req: Request, res: Response) {
    const { code, type, value, startsAt, expiresAt, usageLimit } =
      req.body || {};
    if (!code || !type || value == null)
      return res
        .status(400)
        .json({ message: "code, type, value are required" });
    const vType = String(type).toUpperCase() as VoucherType;
    if (!["PERCENTAGE", "AMOUNT"].includes(vType))
      return res
        .status(400)
        .json({ message: "type must be PERCENTAGE or AMOUNT" });
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0)
      return res.status(400).json({ message: "value must be greater than 0" });
    const vouchers = await loadVouchers();
    const codeNorm = String(code).trim().toUpperCase();
    if (vouchers.some((x) => x.code === codeNorm))
      return res.status(409).json({ message: "Code already exists" });
    const now = new Date().toISOString();
    const v: Voucher = {
      id: cuid(),
      code: codeNorm,
      type: vType,
      value:
        vType === "PERCENTAGE"
          ? Math.min(100, Math.max(1, Math.floor(numericValue)))
          : Math.floor(numericValue),
      isActive: true,
      startsAt: toIsoOrNull(startsAt),
      expiresAt: toIsoOrNull(expiresAt),
      usageLimit: parseOptionalNumber(usageLimit),
      usedByUsers: [],
      redemptions: [],
      createdAt: now,
      updatedAt: now,
      disabledAt: null,
    };
    vouchers.unshift(v);
    await saveVouchers(vouchers);
    res.status(201).json({ data: serializeVoucher(v) });
  }

  static async update(req: Request, res: Response) {
    const { id } = req.params as any;
    const patch = req.body || {};
    const vouchers = await loadVouchers();
    const idx = vouchers.findIndex((x) => x.id === id);
    if (idx === -1)
      return res.status(404).json({ message: "Voucher not found" });
    const current = vouchers[idx];
    if (patch.code) {
      const codeNorm = String(patch.code).trim().toUpperCase();
      if (vouchers.some((x, i) => i !== idx && x.code === codeNorm))
        return res.status(409).json({ message: "Code already exists" });
      current.code = codeNorm;
    }
    if (patch.type) {
      const nextType = String(patch.type).toUpperCase() as VoucherType;
      if (!["PERCENTAGE", "AMOUNT"].includes(nextType))
        return res
          .status(400)
          .json({ message: "type must be PERCENTAGE or AMOUNT" });
      current.type = nextType;
    }
    if (patch.value != null) {
      const numericValue = Number(patch.value);
      if (!Number.isFinite(numericValue) || numericValue <= 0)
        return res
          .status(400)
          .json({ message: "value must be greater than 0" });
      current.value =
        current.type === "PERCENTAGE"
          ? Math.min(100, Math.max(1, Math.floor(numericValue)))
          : Math.floor(numericValue);
    }
    if (patch.startsAt !== undefined)
      current.startsAt = patch.startsAt ? toIsoOrNull(patch.startsAt) : null;
    if (patch.expiresAt !== undefined)
      current.expiresAt = patch.expiresAt ? toIsoOrNull(patch.expiresAt) : null;
    if (patch.usageLimit !== undefined)
      current.usageLimit = parseOptionalNumber(patch.usageLimit);
    if (patch.isActive !== undefined) {
      const nextActive = !!patch.isActive;
      if (nextActive && !current.isActive) {
        current.isActive = true;
        current.disabledAt = null;
      } else if (!nextActive && current.isActive) {
        current.isActive = false;
        current.disabledAt = new Date().toISOString();
      }
    }
    current.updatedAt = new Date().toISOString();
    vouchers[idx] = current;
    await saveVouchers(vouchers);
    res.json({ data: serializeVoucher(current) });
  }

  static async disable(req: Request, res: Response) {
    const { id } = req.params as any;
    const vouchers = await loadVouchers();
    const idx = vouchers.findIndex((x) => x.id === id);
    if (idx === -1)
      return res.status(404).json({ message: "Voucher not found" });
    vouchers[idx].isActive = false;
    vouchers[idx].disabledAt = new Date().toISOString();
    vouchers[idx].updatedAt = vouchers[idx].disabledAt!;
    await saveVouchers(vouchers);
    res.json({ data: serializeVoucher(vouchers[idx]) });
  }

  // Public: validate a voucher for an amount
  static async validate(req: Request, res: Response) {
    const { code, amount } = req.body || {};
    if (!code || amount == null)
      return res.status(400).json({ message: "code and amount are required" });

    const userId = (req as any).user?.id;
    const vouchers = await loadVouchers();
    const v = vouchers.find(
      (x) => x.code === String(code).trim().toUpperCase()
    );
    if (!v || !v.isActive)
      return res.status(404).json({ message: "Voucher not found or inactive" });

    // Check if this user has already used this voucher
    if (userId && v.usedByUsers?.includes(userId))
      return res
        .status(400)
        .json({ message: "You have already used this voucher" });

    // Check if usage limit has been reached
    if (
      v.usageLimit != null &&
      v.redemptions &&
      v.redemptions.length >= v.usageLimit
    )
      return res
        .status(400)
        .json({ message: "Voucher usage limit has been reached" });

    // Check time window
    const nowIso = new Date().toISOString();
    if (v.startsAt && nowIso < v.startsAt)
      return res.status(400).json({ message: "Voucher not yet active" });
    if (v.expiresAt && nowIso > v.expiresAt)
      return res.status(400).json({ message: "Voucher expired" });

    const quotedAmount = Math.max(0, Math.floor(Number(amount)));
    const discount = computeDiscount(quotedAmount, v);
    const finalAmount = Math.max(0, quotedAmount - discount);
    const valid = discount > 0;
    const message = valid
      ? undefined
      : (() => {
          if (quotedAmount <= 0)
            return "Booking amount must be greater than 0.";
          return "Voucher not applicable for this booking.";
        })();
    return res.json({
      data: {
        valid,
        discount,
        finalAmount,
        quotedAmount,
        code: v.code,
        type: v.type,
        value: v.value,
        status: resolveVoucherStatus(v),
        message,
      },
    });
  }

  // Internal utility used by payment callback: record redemption
  static async recordRedemption(
    code: string,
    userId: string | null,
    bookingId: string | null,
    amountDiscounted: number
  ) {
    const vouchers = await loadVouchers();
    const vIdx = vouchers.findIndex(
      (x) => x.code === code.trim().toUpperCase()
    );
    if (vIdx === -1) return;
    const v = vouchers[vIdx];

    const now = new Date().toISOString();

    // Add user to the list of users who have used this voucher
    if (userId) {
      if (!v.usedByUsers) v.usedByUsers = [];
      if (!v.usedByUsers.includes(userId)) {
        v.usedByUsers.push(userId);
      }
    }

    // Fetch user information for the redemption record
    let userName = "Unknown User";
    let userEmail = "";
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true, email: true },
      });
      if (user) {
        userName = `${user.firstName} ${user.lastName}`.trim();
        userEmail = user.email;
      }
    }

    // Add redemption record
    if (!v.redemptions) v.redemptions = [];
    v.redemptions.push({
      userId: userId || "anonymous",
      userName,
      userEmail,
      bookingId: bookingId || null,
      amountDiscounted: Math.floor(amountDiscounted || 0),
      at: now,
    });

    v.updatedAt = now;
    vouchers[vIdx] = v;
    await saveVouchers(vouchers);
  }
}

export default VoucherController;

import { Prisma } from "@prisma/client";
import { Request, Response } from "express";
import prisma from "../config/db";
import MpesaService from "../services/mpesa.service";

const MAX_CODE_GENERATION_ATTEMPTS = 5;

const normalizeGiftCard = (card: any) => ({
  id: card.id,
  code: card.code,
  amount: Number(card.amount || 0),
  balance: Number(card.balance || 0),
  currency: card.currency,
  status: card.status,
  isActive: card.isActive,
  purchasedByUserId: card.purchasedByUserId,
  redeemedByUserId: card.redeemedByUserId,
  redeemedAt: card.redeemedAt ? card.redeemedAt.toISOString() : null,
  recipientEmail: card.recipientEmail,
  message: card.message,
  expiresAt: card.expiresAt ? card.expiresAt.toISOString() : null,
  createdAt: card.createdAt.toISOString(),
  updatedAt: card.updatedAt.toISOString(),
});

const genCode = () =>
  `GC-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Date.now()
    .toString(36)
    .slice(-4)
    .toUpperCase()}`;

// Prisma delegates for the new gift card tables are accessed via `as any`
// until `prisma generate` is executed with the updated schema.
const recordLedgerEntry = async (
  tx: any,
  params: {
    giftCardId: string;
    type: "CREDIT" | "DEBIT" | "ADJUSTMENT";
    amount: number;
    balanceAfter: number;
    performedByUserId?: string | null;
    note?: string;
    metadata?: Record<string, unknown>;
  }
) => {
  const {
    giftCardId,
    type,
    amount,
    balanceAfter,
    performedByUserId,
    note,
    metadata,
  } = params;
  await (tx as any).giftCardLedger.create({
    data: {
      giftCardId,
      type,
      amount,
      balanceAfter,
      performedByUserId: performedByUserId || null,
      note,
      metadata: (metadata ?? null) as any,
    },
  });
};

const findRedeemedCardForUser = async (tx: any, userId: string) => {
  const now = new Date();
  return (tx as any).giftCard.findFirst({
    where: {
      redeemedByUserId: userId,
      isActive: true,
      balance: { gt: 0 },
      status: { in: ["REDEEMED", "ISSUED"] },
      // Exclude expired cards (OR expiresAt is null for legacy cards OR expiresAt is in the future)
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: [{ redeemedAt: "asc" }, { createdAt: "asc" }],
  });
};

const normalizeAmount = (value: unknown) =>
  Math.max(0, Math.floor(Number(value || 0)));

const MIN_GIFTCARD_AMOUNT = 2000; // Minimum gift card purchase amount in KES

export class GiftCardController {
  static async purchase(req: Request, res: Response) {
    const userId = (req as any).user?.id;
    const { amount, recipientEmail, message, phoneNumber } = req.body || {};
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const amt = normalizeAmount(amount);
    if (!amt) return res.status(400).json({ message: "Invalid amount" });
    if (amt < MIN_GIFTCARD_AMOUNT) {
      return res.status(400).json({
        message: `Minimum gift card amount is KES ${MIN_GIFTCARD_AMOUNT}`,
      });
    }
    if (!phoneNumber)
      return res.status(400).json({ message: "Phone number is required" });

    let normalizedPhone: string;
    try {
      normalizedPhone = MpesaService.normalizePhone(String(phoneNumber));
    } catch (error: any) {
      const message =
        error?.message || "Please provide a valid Kenyan M-Pesa phone number";
      return res.status(400).json({ message });
    }

    const accountRef = `GIFTCARD`;
    const description = `Gift card purchase KES ${amt}`;
    const sanitizedEmail =
      recipientEmail && typeof recipientEmail === "string"
        ? recipientEmail.trim()
        : "";
    const sanitizedMessage =
      message && typeof message === "string" ? message.trim() : "";
    const paymentMetadata = {
      giftcardPurchase: {
        amount: amt,
        recipientEmail: sanitizedEmail || null,
        message: sanitizedMessage || null,
        purchasedByUserId: userId,
        phoneNumber: normalizedPhone,
      },
    };

    try {
      const result = await MpesaService.initiateStkPush({
        phoneNumber: normalizedPhone,
        amount: amt,
        userId,
        accountReference: accountRef,
        description,
        context: "GIFTCARD_PURCHASE",
        paymentMetadata,
      });

      return res.status(202).json({
        message:
          "M-Pesa STK push initiated. Complete the payment to issue the gift card.",
        data: {
          paymentId: result?.paymentId || null,
          checkoutRequestId: (result as any)?.CheckoutRequestID || null,
          merchantRequestId: (result as any)?.MerchantRequestID || null,
          customerMessage: (result as any)?.CustomerMessage || null,
          amount: amt,
        },
      });
    } catch (error) {
      console.error("Gift card purchase initiation failed", error);
      const message =
        (error as any)?.message ||
        "Failed to initiate M-Pesa payment. Please try again.";
      return res.status(502).json({ message });
    }
  }

  static async issueGiftCardAfterPayment(params: {
    amount: number;
    purchasedByUserId: string | null;
    recipientEmail?: string | null;
    message?: string | null;
    performedByUserId?: string | null;
    paymentId: string;
    metadata?: Record<string, unknown> | null;
  }) {
    const {
      amount,
      purchasedByUserId,
      recipientEmail,
      message,
      performedByUserId,
      paymentId,
      metadata,
    } = params;

    const amt = normalizeAmount(amount);
    if (!amt) {
      throw new Error("Cannot issue gift card for zero amount payment");
    }

    const safeEmail =
      recipientEmail && typeof recipientEmail === "string"
        ? recipientEmail.trim()
        : "";
    const safeMessage =
      message && typeof message === "string" ? message.trim() : "";

    let createdCard: any | null = null;
    let attempts = 0;
    while (!createdCard && attempts < MAX_CODE_GENERATION_ATTEMPTS) {
      const code = genCode();
      try {
        createdCard = await prisma.$transaction(async (tx) => {
          const card = await (tx as any).giftCard.create({
            data: {
              code,
              amount: amt,
              balance: amt,
              purchasedByUserId: purchasedByUserId || null,
              recipientEmail: safeEmail || null,
              message: safeMessage || null,
              status: "ISSUED",
            },
          });
          await recordLedgerEntry(tx, {
            giftCardId: card.id,
            type: "CREDIT",
            amount: amt,
            balanceAfter: amt,
            performedByUserId: performedByUserId || purchasedByUserId || null,
            note: "Gift card issued after confirmed payment",
            metadata: {
              paymentId,
              ...(safeEmail ? { recipientEmail: safeEmail } : {}),
              ...(metadata || {}),
            },
          });
          return card;
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          attempts += 1;
          continue;
        }
        throw error;
      }
    }

    if (!createdCard) {
      throw new Error("Unable to generate unique gift card code");
    }

    // Send beautiful gift card email asynchronously
    (async () => {
      try {
        if (safeEmail) {
          const { sendMail, buildGiftCardEmail } = await import(
            "../utils/mailer"
          );

          // Fetch purchaser's info for personalized email
          let senderName = "Someone special";
          if (purchasedByUserId) {
            try {
              const purchaser = await prisma.user.findUnique({
                where: { id: purchasedByUserId },
                select: { firstName: true, lastName: true },
              });
              if (purchaser) {
                senderName = purchaser.firstName
                  ? `${purchaser.firstName}${
                      purchaser.lastName ? ` ${purchaser.lastName}` : ""
                    }`
                  : "Someone special";
              }
            } catch (err) {
              console.error("Failed to fetch purchaser info", err);
            }
          }

          const emailContent = buildGiftCardEmail({
            recipientEmail: safeEmail,
            code: createdCard.code,
            amount: amt,
            message: safeMessage || null,
            senderName,
            expiresAt: createdCard.expiresAt || null,
          });

          await sendMail({
            to: safeEmail,
            subject: emailContent.subject,
            html: emailContent.html,
          });

          console.log(
            `✅ Gift card email sent to ${safeEmail} (code: ${createdCard.code})`
          );
        }
      } catch (e) {
        console.error("Failed to send gift card email", e);
      }
    })();

    return normalizeGiftCard(createdCard);
  }

  static async redeem(req: Request, res: Response) {
    const userId = (req as any).user?.id;
    const { code } = req.body || {};
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!code) return res.status(400).json({ message: "Code required" });
    const normalizedCode = String(code).trim().toUpperCase();
    try {
      const card = await prisma.$transaction(async (tx) => {
        const existing = await (tx as any).giftCard.findUnique({
          where: { code: normalizedCode },
        });
        if (!existing)
          throw Object.assign(new Error("NotFound"), {
            status: 404,
            payload: { message: "Gift card not found" },
          });

        if (!existing.isActive || Number(existing.balance) <= 0)
          throw Object.assign(new Error("Inactive"), {
            status: 400,
            payload: { message: "Gift card not active or already used" },
          });

        if (existing.redeemedByUserId) {
          if (existing.redeemedByUserId === userId) {
            throw Object.assign(new Error("AlreadyRedeemed"), {
              status: 409,
              payload: { message: "Gift card already redeemed." },
            });
          }
          throw Object.assign(new Error("Forbidden"), {
            status: 403,
            payload: { message: "Gift card already redeemed by another user" },
          });
        }

        {
          const now = new Date();
          // Set expiration to 12 months from redemption date
          const expiresAt = new Date(now);
          expiresAt.setMonth(expiresAt.getMonth() + 12);

          const updateResult = await (tx as any).giftCard.updateMany({
            where: {
              id: existing.id,
              redeemedByUserId: null,
              isActive: true,
              status: { in: ["ISSUED"] },
            },
            data: {
              redeemedByUserId: userId,
              redeemedAt: now,
              expiresAt: expiresAt,
              status: "REDEEMED",
            },
          });

          if (!updateResult.count) {
            throw Object.assign(new Error("AlreadyRedeemed"), {
              status: 409,
              payload: {
                message: "Gift card was just redeemed. Try another code.",
              },
            });
          }

          const updated = await (tx as any).giftCard.findUnique({
            where: { id: existing.id },
          });
          await recordLedgerEntry(tx, {
            giftCardId: updated.id,
            type: "ADJUSTMENT",
            amount: 0,
            balanceAfter: Number(updated.balance),
            performedByUserId: userId,
            note: "Gift card redeemed",
          });
          return updated;
        }
      });
      return res.json({ data: normalizeGiftCard(card) });
    } catch (error: any) {
      if (error?.payload && error?.status) {
        return res.status(error.status).json(error.payload);
      }
      console.error("Gift card redeem failed", error);
      return res.status(500).json({ message: "Failed to redeem gift card" });
    }
  }

  // Internal usage: apply credit to amount due. Returns {applied, remaining, code}
  static async applyCredit(
    userId: string,
    amountDue: number
  ): Promise<{
    applied: number;
    remaining: number;
    code?: string;
    balance: number;
  }> {
    const normalized = normalizeAmount(amountDue);
    if (!normalized) return { applied: 0, remaining: 0, balance: 0 };

    const result = await prisma.$transaction(async (tx) => {
      const card = await findRedeemedCardForUser(tx, userId);
      if (!card) {
        return {
          applied: 0,
          remaining: normalized,
          code: undefined,
          balance: 0,
        };
      }

      const available = Number(card.balance) || 0;
      const apply = Math.min(available, normalized);
      if (apply <= 0) {
        return {
          applied: 0,
          remaining: normalized,
          code: card.code,
          balance: available,
        };
      }

      const newBalance = available - apply;
      await (tx as any).giftCard.update({
        where: { id: card.id },
        data: {
          balance: { decrement: apply },
          isActive: newBalance > 0,
          status: newBalance > 0 ? "REDEEMED" : "EXHAUSTED",
        },
      });
      await recordLedgerEntry(tx, {
        giftCardId: card.id,
        type: "DEBIT",
        amount: apply,
        balanceAfter: newBalance,
        performedByUserId: userId,
        note: "Gift card applied to reservation",
        metadata: { kind: "APPLY_CREDIT" },
      });
      return {
        applied: apply,
        remaining: Math.max(0, normalized - apply),
        code: card.code,
        balance: newBalance,
      };
    });

    return result;
  }

  // Non-mutating quote of available credit towards amount due
  static async quoteCredit(
    userId: string,
    amountDue: number
  ): Promise<{
    applied: number;
    remaining: number;
    code?: string;
    balance: number;
  }> {
    const normalized = normalizeAmount(amountDue);
    if (!normalized) return { applied: 0, remaining: 0, balance: 0 };

    const now = new Date();
    const card = await (prisma as any).giftCard.findFirst({
      where: {
        redeemedByUserId: userId,
        isActive: true,
        balance: { gt: 0 },
        status: { in: ["REDEEMED", "ISSUED"] },
        // Exclude expired cards (OR expiresAt is null for legacy cards OR expiresAt is in the future)
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: [{ redeemedAt: "asc" }, { createdAt: "asc" }],
    });

    if (!card)
      return {
        applied: 0,
        remaining: normalized,
        balance: 0,
      };

    const available = Number(card.balance) || 0;
    const applied = Math.min(available, normalized);
    return {
      applied,
      remaining: Math.max(0, normalized - applied),
      code: card.code,
      balance: available,
    };
  }

  // Consume credit after a successful payment/booking; mutates balance
  static async consumeCredit(
    userId: string,
    code: string,
    amountToConsume: number
  ): Promise<{ consumed: number; remainingBalance: number }> {
    const normalizedCode = String(code || "")
      .trim()
      .toUpperCase();
    const toConsume = normalizeAmount(amountToConsume);
    if (!normalizedCode) return { consumed: 0, remainingBalance: 0 };

    const result = await prisma.$transaction(async (tx) => {
      const card = await (tx as any).giftCard.findUnique({
        where: { code: normalizedCode },
      });
      if (!card)
        return {
          consumed: 0,
          remainingBalance: 0,
        };

      const available = Number(card.balance) || 0;
      if (
        !card.isActive ||
        card.redeemedByUserId !== userId ||
        available <= 0
      ) {
        return {
          consumed: 0,
          remainingBalance: available,
        };
      }

      const consume = Math.min(available, toConsume);
      if (consume <= 0)
        return {
          consumed: 0,
          remainingBalance: available,
        };

      const newBalance = available - consume;
      await (tx as any).giftCard.update({
        where: { id: card.id },
        data: {
          balance: { decrement: consume },
          isActive: newBalance > 0,
          status: newBalance > 0 ? "REDEEMED" : "EXHAUSTED",
        },
      });
      await recordLedgerEntry(tx, {
        giftCardId: card.id,
        type: "DEBIT",
        amount: consume,
        balanceAfter: newBalance,
        performedByUserId: userId,
        note: "Gift card consumed after payment",
        metadata: { code: normalizedCode },
      });
      return {
        consumed: consume,
        remainingBalance: newBalance,
      };
    });

    return result;
  }

  static async listMine(req: Request, res: Response) {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const cards = await (prisma as any).giftCard.findMany({
      where: {
        OR: [{ redeemedByUserId: userId }, { purchasedByUserId: userId }],
      },
      orderBy: { createdAt: "desc" },
    });
    return res.json({ data: cards.map(normalizeGiftCard) });
  }

  static async quote(req: Request, res: Response) {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const amountRaw = req.body?.amount;
    const amount = normalizeAmount(amountRaw);
    const quote = await GiftCardController.quoteCredit(userId, amount);
    return res.json({ data: quote });
  }
}

export default GiftCardController;

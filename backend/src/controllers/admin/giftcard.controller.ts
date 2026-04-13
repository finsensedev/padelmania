import { Request, Response } from "express";
import prisma from "../../config/db";

type GiftCardStatusValue = "ISSUED" | "REDEEMED" | "EXHAUSTED" | "CANCELLED";
type LedgerTypeValue = "CREDIT" | "DEBIT" | "ADJUSTMENT";

const MAX_CODE_ATTEMPTS = 10;

const giftCardClient = () => (prisma as any).giftCard;
const ledgerClient = () => (prisma as any).giftCardLedger;

const pickUser = (user: any) =>
  user
    ? {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      }
    : null;

const normalizeGiftCard = (card: any) => ({
  id: card.id,
  code: card.code,
  amount: Number(card.amount ?? 0),
  balance: Number(card.balance ?? 0),
  currency: card.currency,
  status: card.status as GiftCardStatusValue,
  isActive: Boolean(card.isActive),
  purchasedByUserId: card.purchasedByUserId,
  redeemedByUserId: card.redeemedByUserId,
  redeemedAt: card.redeemedAt ? new Date(card.redeemedAt).toISOString() : null,
  recipientEmail: card.recipientEmail,
  message: card.message,
  expiresAt: card.expiresAt ? new Date(card.expiresAt).toISOString() : null,
  createdAt: new Date(card.createdAt).toISOString(),
  updatedAt: new Date(card.updatedAt).toISOString(),
  purchasedBy: pickUser(card.purchasedBy),
  redeemedBy: pickUser(card.redeemedBy),
});

const normalizeLedgerEntry = (entry: any) => ({
  id: entry.id,
  giftCardId: entry.giftCardId,
  type: entry.type as LedgerTypeValue,
  amount: Number(entry.amount ?? 0),
  balanceAfter: Number(entry.balanceAfter ?? 0),
  note: entry.note,
  metadata: entry.metadata ?? null,
  createdAt: new Date(entry.createdAt).toISOString(),
  performedByUserId: entry.performedByUserId,
  performedBy: pickUser(entry.performedBy),
});

const generateCode = () =>
  `GC-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Date.now()
    .toString(36)
    .slice(-4)
    .toUpperCase()}`;

const parsePositiveAmount = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.floor(numeric);
};

const parseStatusFilter = (value: unknown): GiftCardStatusValue | undefined => {
  if (!value) return undefined;
  const upper = String(value).trim().toUpperCase();
  if (["ISSUED", "REDEEMED", "EXHAUSTED", "CANCELLED"].includes(upper)) {
    return upper as GiftCardStatusValue;
  }
  return undefined;
};

const parseDate = (value: unknown) => {
  if (!value) return undefined;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const ensureGiftCard = async (giftCardId: string) => {
  const card = await giftCardClient().findUnique({
    where: { id: giftCardId },
    include: {
      purchasedBy: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
      redeemedBy: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
  });
  if (!card) {
    const error = new Error("Gift card not found");
    (error as any).status = 404;
    throw error;
  }
  return card;
};

export class AdminGiftCardController {
  static async list(req: Request, res: Response) {
    try {
      const page = Math.max(parseInt(String(req.query.page ?? "1"), 10), 1);
      const limit = Math.min(
        100,
        Math.max(parseInt(String(req.query.limit ?? "20"), 10), 1)
      );
      const search = String(req.query.search ?? "").trim();
      const status = parseStatusFilter(req.query.status);
      const purchasedByUserId = req.query.purchasedByUserId
        ? String(req.query.purchasedByUserId)
        : undefined;
      const redeemedByUserId = req.query.redeemedByUserId
        ? String(req.query.redeemedByUserId)
        : undefined;
      const isActive =
        req.query.isActive === undefined
          ? undefined
          : String(req.query.isActive).toLowerCase() === "true";
      const createdFrom = parseDate(req.query.from);
      const createdTo = parseDate(req.query.to);

      const where: any = {};
      if (status) where.status = status;
      if (isActive !== undefined) where.isActive = isActive;
      if (purchasedByUserId) where.purchasedByUserId = purchasedByUserId;
      if (redeemedByUserId) where.redeemedByUserId = redeemedByUserId;
      if (createdFrom || createdTo) {
        where.createdAt = {};
        if (createdFrom) where.createdAt.gte = createdFrom;
        if (createdTo) where.createdAt.lte = createdTo;
      }
      if (search) {
        const like = { contains: search, mode: "insensitive" };
        where.OR = [
          { code: like },
          { recipientEmail: like },
          { message: like },
          { purchasedBy: { email: like } },
          { redeemedBy: { email: like } },
        ];
      }

      const [total, cards] = await Promise.all([
        giftCardClient().count({ where }),
        giftCardClient().findMany({
          where,
          include: {
            purchasedBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            redeemedBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
      ]);

      return res.json({
        data: cards.map(normalizeGiftCard),
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error("List gift cards failed", error);
      return res
        .status(500)
        .json({ message: "Failed to load gift cards for admin" });
    }
  }

  static async issue(req: Request, res: Response) {
    try {
      const requesterId = (req as any).user?.id ?? null;
      const {
        amount,
        currency = "KES",
        recipientEmail,
        message,
        expiresAt,
        assignToUserId,
        purchasedByUserId,
        code: customCode,
      } = req.body || {};

      const normalizedAmount = parsePositiveAmount(amount);
      if (!normalizedAmount) {
        return res
          .status(400)
          .json({ message: "Amount must be greater than 0" });
      }

      const parsedExpiresAt = parseDate(expiresAt) ?? null;
      const issuerId = purchasedByUserId || requesterId;
      const autoRedeemUserId = assignToUserId ? String(assignToUserId) : null;

      const createWithCode = async (code: string) => {
        return prisma.$transaction(async (tx) => {
          const delegate = (tx as any).giftCard;
          const ledger = (tx as any).giftCardLedger;
          const now = new Date();
          const card = await delegate.create({
            data: {
              code,
              amount: normalizedAmount,
              balance: normalizedAmount,
              currency,
              status: autoRedeemUserId ? "REDEEMED" : "ISSUED",
              isActive: true,
              purchasedByUserId: issuerId || null,
              redeemedByUserId: autoRedeemUserId,
              redeemedAt: autoRedeemUserId ? now : null,
              recipientEmail: recipientEmail ? String(recipientEmail) : null,
              message: message ? String(message) : null,
              expiresAt: parsedExpiresAt,
            },
          });

          await ledger.create({
            data: {
              giftCardId: card.id,
              type: "CREDIT",
              amount: normalizedAmount,
              balanceAfter: normalizedAmount,
              performedByUserId: issuerId,
              note: "Gift card issued by admin",
            },
          });

          if (autoRedeemUserId) {
            await ledger.create({
              data: {
                giftCardId: card.id,
                type: "ADJUSTMENT",
                amount: 0,
                balanceAfter: normalizedAmount,
                performedByUserId: autoRedeemUserId,
                note: "Gift card assigned to user",
              },
            });
          }

          return delegate.findUnique({
            where: { id: card.id },
            include: {
              purchasedBy: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
              redeemedBy: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          });
        });
      };

      if (customCode) {
        const trimmed = String(customCode).trim().toUpperCase();
        if (!trimmed) {
          return res
            .status(400)
            .json({ message: "Custom code cannot be empty" });
        }
        const existing = await giftCardClient().findUnique({
          where: { code: trimmed },
        });
        if (existing) {
          return res
            .status(409)
            .json({ message: "Gift card code already exists" });
        }
        const created = await createWithCode(trimmed);
        return res.status(201).json({ data: normalizeGiftCard(created) });
      }

      let attempts = 0;
      while (attempts < MAX_CODE_ATTEMPTS) {
        const code = generateCode();
        try {
          const created = await createWithCode(code);
          return res.status(201).json({ data: normalizeGiftCard(created) });
        } catch (error: any) {
          if (error?.code === "P2002") {
            attempts += 1;
            continue;
          }
          console.error("Admin gift card issue failed", error);
          return res.status(500).json({ message: "Failed to issue gift card" });
        }
      }

      return res
        .status(500)
        .json({ message: "Unable to generate unique gift card code" });
    } catch (error) {
      console.error("Admin issue gift card failed", error);
      return res.status(500).json({ message: "Failed to issue gift card" });
    }
  }

  static async adjust(req: Request, res: Response) {
    const { id } = req.params;
    try {
      const direction = String(req.body?.direction ?? "").toUpperCase();
      if (!direction || !["CREDIT", "DEBIT"].includes(direction)) {
        return res
          .status(400)
          .json({ message: "Direction must be CREDIT or DEBIT" });
      }

      const amount = parsePositiveAmount(req.body?.amount);
      if (!amount) {
        return res
          .status(400)
          .json({ message: "Adjustment amount is invalid" });
      }

      const note = req.body?.note ? String(req.body.note) : null;
      const actorId = (req as any).user?.id ?? null;

      const updated = await prisma.$transaction(async (tx) => {
        const delegate = (tx as any).giftCard;
        const ledger = (tx as any).giftCardLedger;

        const existing = await delegate.findUnique({
          where: { id },
        });
        if (!existing) {
          const error = new Error("Gift card not found");
          (error as any).status = 404;
          throw error;
        }
        if (existing.status === "CANCELLED") {
          const error = new Error("Cancelled gift cards cannot be adjusted");
          (error as any).status = 400;
          throw error;
        }

        const currentBalance = Number(existing.balance ?? 0);
        const currentAmount = Number(existing.amount ?? 0);

        const balanceAfter =
          direction === "CREDIT"
            ? currentBalance + amount
            : currentBalance - amount;
        if (balanceAfter < 0) {
          const error = new Error(
            "Adjustment would overdraw gift card balance"
          );
          (error as any).status = 400;
          throw error;
        }

        let nextStatus = existing.status as GiftCardStatusValue;
        if (balanceAfter === 0) nextStatus = "EXHAUSTED";
        else if (nextStatus === "EXHAUSTED") nextStatus = "REDEEMED";

        const card = await delegate.update({
          where: { id },
          data: {
            balance: balanceAfter,
            amount:
              direction === "CREDIT" ? currentAmount + amount : currentAmount,
            status: nextStatus,
            isActive: nextStatus !== "CANCELLED" && balanceAfter > 0,
          },
          include: {
            purchasedBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            redeemedBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        });

        await ledger.create({
          data: {
            giftCardId: id,
            type: direction as LedgerTypeValue,
            amount,
            balanceAfter,
            performedByUserId: actorId,
            note:
              note ||
              (direction === "CREDIT"
                ? "Manual credit adjustment"
                : "Manual debit adjustment"),
          },
        });

        return card;
      });

      return res.json({ data: normalizeGiftCard(updated) });
    } catch (error: any) {
      if (error?.status) {
        return res.status(error.status).json({ message: error.message });
      }
      console.error("Admin adjust gift card failed", error);
      return res.status(500).json({ message: "Failed to adjust gift card" });
    }
  }

  static async revoke(req: Request, res: Response) {
    const { id } = req.params;
    try {
      const actorId = (req as any).user?.id ?? null;
      const note = req.body?.note ? String(req.body.note) : "Gift card revoked";

      const updated = await prisma.$transaction(async (tx) => {
        const delegate = (tx as any).giftCard;
        const ledger = (tx as any).giftCardLedger;

        const existing = await delegate.findUnique({
          where: { id },
        });
        if (!existing) {
          const error = new Error("Gift card not found");
          (error as any).status = 404;
          throw error;
        }
        if (existing.status === "CANCELLED") {
          const error = new Error("Gift card already revoked");
          (error as any).status = 400;
          throw error;
        }

        const currentBalance = Number(existing.balance ?? 0);

        const card = await delegate.update({
          where: { id },
          data: {
            status: "CANCELLED",
            isActive: false,
            balance: 0,
          },
          include: {
            purchasedBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            redeemedBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        });

        if (currentBalance > 0) {
          await ledger.create({
            data: {
              giftCardId: id,
              type: "DEBIT",
              amount: currentBalance,
              balanceAfter: 0,
              performedByUserId: actorId,
              note,
            },
          });
        } else {
          await ledger.create({
            data: {
              giftCardId: id,
              type: "ADJUSTMENT",
              amount: 0,
              balanceAfter: 0,
              performedByUserId: actorId,
              note,
            },
          });
        }

        return card;
      });

      return res.json({ data: normalizeGiftCard(updated) });
    } catch (error: any) {
      if (error?.status) {
        return res.status(error.status).json({ message: error.message });
      }
      console.error("Admin revoke gift card failed", error);
      return res.status(500).json({ message: "Failed to revoke gift card" });
    }
  }

  static async ledger(req: Request, res: Response) {
    const { id } = req.params;
    try {
      await ensureGiftCard(id);

      const page = Math.max(parseInt(String(req.query.page ?? "1"), 10), 1);
      const limit = Math.min(
        100,
        Math.max(parseInt(String(req.query.limit ?? "25"), 10), 1)
      );

      const [total, entries] = await Promise.all([
        ledgerClient().count({ where: { giftCardId: id } }),
        ledgerClient().findMany({
          where: { giftCardId: id },
          include: {
            performedBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
      ]);

      return res.json({
        data: entries.map(normalizeLedgerEntry),
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error: any) {
      if (error?.status) {
        return res.status(error.status).json({ message: error.message });
      }
      console.error("Admin fetch gift card ledger failed", error);
      return res
        .status(500)
        .json({ message: "Failed to load gift card ledger" });
    }
  }
}

export default AdminGiftCardController;

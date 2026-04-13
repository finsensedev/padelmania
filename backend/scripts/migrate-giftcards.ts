import prisma from "../src/config/db";

interface LegacyGiftCard {
  id: string;
  code: string;
  amount: number;
  balance: number;
  purchasedByUserId: string | null;
  recipientEmail?: string | null;
  message?: string | null;
  isActive: boolean;
  createdAt: string;
  redeemedByUserId?: string | null;
  redeemedAt?: string | null;
}

type GiftCardStatusValue = "ISSUED" | "REDEEMED" | "EXHAUSTED" | "CANCELLED";

const parseLegacyCards = (value: unknown): LegacyGiftCard[] => {
  if (!Array.isArray(value)) return [];
  const results: LegacyGiftCard[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    const code = String(item.code || "").trim();
    if (!code) continue;
    results.push({
      id: String(item.id || code),
      code,
      amount: Math.max(0, Math.floor(Number(item.amount || 0))),
      balance: Math.max(0, Math.floor(Number(item.balance || 0))),
      purchasedByUserId: item.purchasedByUserId
        ? String(item.purchasedByUserId)
        : null,
      recipientEmail: item.recipientEmail ? String(item.recipientEmail) : null,
      message: item.message ? String(item.message) : null,
      isActive: Boolean(item.isActive !== false),
      createdAt: String(item.createdAt || new Date().toISOString()),
      redeemedByUserId: item.redeemedByUserId
        ? String(item.redeemedByUserId)
        : null,
      redeemedAt: item.redeemedAt ? String(item.redeemedAt) : null,
    });
  }
  return results;
};

const toDate = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const resolveStatus = (
  card: LegacyGiftCard
): {
  status: GiftCardStatusValue;
  isActive: boolean;
} => {
  const hasBalance = card.balance > 0;
  if (!card.isActive || !hasBalance) {
    return { status: "EXHAUSTED", isActive: false };
  }
  if (card.redeemedByUserId) {
    return { status: "REDEEMED", isActive: true };
  }
  return { status: "ISSUED", isActive: true };
};

const migrateCard = async (legacy: LegacyGiftCard) => {
  const createdAt = toDate(legacy.createdAt) || new Date();
  const redeemedAt = toDate(legacy.redeemedAt);
  const { status, isActive } = resolveStatus(legacy);

  return prisma.$transaction(async (tx) => {
    const delegate = (tx as any).giftCard;
    const ledger = (tx as any).giftCardLedger;

    const record = await delegate.upsert({
      where: { code: legacy.code },
      update: {
        amount: legacy.amount,
        balance: legacy.balance,
        currency: "KES",
        status,
        isActive,
        purchasedByUserId: legacy.purchasedByUserId,
        redeemedByUserId: legacy.redeemedByUserId,
        redeemedAt,
        recipientEmail: legacy.recipientEmail,
        message: legacy.message,
      },
      create: {
        code: legacy.code,
        amount: legacy.amount,
        balance: legacy.balance,
        currency: "KES",
        status,
        isActive,
        purchasedByUserId: legacy.purchasedByUserId,
        redeemedByUserId: legacy.redeemedByUserId,
        redeemedAt,
        recipientEmail: legacy.recipientEmail,
        message: legacy.message,
        createdAt,
      },
    });

    const existingEntries = await ledger.count({
      where: { giftCardId: record.id },
    });

    if (existingEntries === 0) {
      await ledger.create({
        data: {
          giftCardId: record.id,
          type: "CREDIT",
          amount: legacy.amount,
          balanceAfter: legacy.amount,
          performedByUserId: legacy.purchasedByUserId,
          note: "Migrated issuance",
          createdAt,
        },
      });
      const consumed = Math.max(0, legacy.amount - legacy.balance);
      if (consumed > 0) {
        await ledger.create({
          data: {
            giftCardId: record.id,
            type: "DEBIT",
            amount: consumed,
            balanceAfter: legacy.balance,
            performedByUserId: legacy.redeemedByUserId,
            note: "Migrated consumption",
            createdAt: redeemedAt ?? new Date(),
          },
        });
      }
    }

    return record.code;
  });
};

async function main() {
  const legacySetting = await prisma.systemSetting.findUnique({
    where: { key: "GIFTCARDS" },
  });

  if (!legacySetting?.value) {
    console.log("No legacy gift cards found in system settings.");
    return;
  }

  const cards = parseLegacyCards(legacySetting.value);

  if (cards.length === 0) {
    console.log("Legacy gift card store is empty.");
    return;
  }

  let migrated = 0;
  for (const card of cards) {
    try {
      await migrateCard(card);
      migrated += 1;
    } catch (error) {
      console.error(`Failed to migrate gift card ${card.code}`, error);
    }
  }

  console.log(`Migrated ${migrated} gift card(s) into the dedicated tables.`);
}

main()
  .catch((error) => {
    console.error("Gift card migration script failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import prisma from "../src/config/db";

const EPSILON = 0.009;

const normalize = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
};

const deriveExpectedStatus = (
  card: any,
  balance: number
): "ISSUED" | "REDEEMED" | "EXHAUSTED" => {
  if (balance <= EPSILON) return "EXHAUSTED";
  return card.redeemedByUserId ? "REDEEMED" : "ISSUED";
};

async function main() {
  const delegate = (prisma as any).giftCard;
  if (!delegate) {
    console.error("Gift card delegate unavailable on Prisma client.");
    return;
  }

  const cards = await delegate.findMany({
    orderBy: { createdAt: "asc" },
  });

  if (!cards.length) {
    console.log("No gift cards found. Nothing to backfill.");
    return;
  }

  let touched = 0;
  const summaries: { code: string; notes: string[] }[] = [];

  for (const card of cards) {
    const notes: string[] = [];
    const updates: Record<string, unknown> = {};

    let amount = normalize(card.amount);
    let balance = normalize(card.balance);

    if (amount < 0) {
      notes.push(`Amount ${amount} was negative. Clamped to 0.`);
      amount = 0;
      updates.amount = amount;
    }

    if (balance < -EPSILON) {
      notes.push(`Balance ${balance} was negative. Reset to 0.`);
      balance = 0;
      updates.balance = balance;
    }

    if (balance - amount > EPSILON) {
      notes.push(
        `Balance ${balance} exceeds amount ${amount}. Clamped balance to amount.`
      );
      balance = amount;
      updates.balance = balance;
    }

    const expectedStatus = deriveExpectedStatus(card, balance);
    const normalizedStatus = (card.status || "").toUpperCase();
    const expectedActive = balance > EPSILON;

    if (normalizedStatus !== expectedStatus) {
      notes.push(`Status ${card.status ?? "null"} -> ${expectedStatus}`);
      updates.status = expectedStatus;
    }

    if (card.isActive !== expectedActive) {
      notes.push(`isActive ${card.isActive} -> ${expectedActive}`);
      updates.isActive = expectedActive;
    }

    if (!card.redeemedByUserId && card.redeemedAt) {
      notes.push("Clearing redeemedAt because the card is unclaimed.");
      updates.redeemedAt = null;
    }

    if (Object.keys(updates).length === 0) continue;

    await delegate.update({
      where: { id: card.id },
      data: updates,
    });

    touched += 1;
    summaries.push({ code: card.code, notes });
  }

  console.log(`Backfill finished. Updated ${touched} gift card(s).`);
  if (summaries.length) {
    console.table(
      summaries.map((entry) => ({
        code: entry.code,
        notes: entry.notes.join("; "),
      }))
    );
  }
}

main()
  .catch((error) => {
    console.error("Gift card backfill failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

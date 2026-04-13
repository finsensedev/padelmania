import prisma from "../src/config/db";
import { calculatePointsFromAmount } from "../src/utils/loyalty";
import { addDays } from "date-fns";

/**
 * Backfill script to award loyalty points for gift card payments
 * that didn't receive loyalty points when processed.
 */
async function backfillGiftCardLoyaltyPoints() {
  console.log("🔍 Finding gift card payments without loyalty points...\n");

  // Find all completed gift card payments
  const giftCardPayments = await prisma.payment.findMany({
    where: {
      provider: "INTERNAL",
      status: "COMPLETED",
    },
    include: {
      booking: {
        select: {
          id: true,
          bookingCode: true,
          totalAmount: true,
          status: true,
        },
      },
    },
  });

  console.log(`Found ${giftCardPayments.length} gift card payments\n`);

  let processed = 0;
  let skipped = 0;
  let awarded = 0;

  for (const payment of giftCardPayments) {
    processed++;

    // Check if loyalty points already exist for this payment
    const existingLoyalty = await prisma.loyaltyPoint.findFirst({
      where: {
        userId: payment.userId!,
        referenceId: payment.id,
        type: "EARNED",
      },
    });

    if (existingLoyalty) {
      console.log(
        `✓ Payment ${payment.transactionId} already has loyalty points (${existingLoyalty.points} pts)`
      );
      skipped++;
      continue;
    }

    // Calculate points from payment amount
    const amount = Number(payment.amount);
    const points = await calculatePointsFromAmount(amount);

    if (points === 0) {
      console.log(
        `⊘ Payment ${payment.transactionId} amount too small for points (${amount} KES)`
      );
      skipped++;
      continue;
    }

    // Award loyalty points
    try {
      await prisma.$transaction([
        prisma.user.update({
          where: { id: payment.userId! },
          data: { loyaltyPoints: { increment: points } },
        }),
        prisma.loyaltyPoint.create({
          data: {
            userId: payment.userId!,
            points: points,
            type: "EARNED",
            description: "Court booking reward (backfilled)",
            referenceId: payment.id,
            expiresAt: addDays(new Date(), 365),
          },
        }),
      ]);

      console.log(
        `✅ Awarded ${points} points for payment ${payment.transactionId} (${amount} KES)`
      );
      if (payment.booking) {
        console.log(`   Booking: ${payment.booking.bookingCode}`);
      }
      awarded++;
    } catch (error) {
      console.error(
        `❌ Failed to award points for payment ${payment.transactionId}:`,
        error
      );
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`✨ Backfill complete!`);
  console.log(`   Processed: ${processed}`);
  console.log(`   Awarded: ${awarded}`);
  console.log(`   Skipped: ${skipped}`);
  console.log("=".repeat(60));

  await prisma.$disconnect();
}

backfillGiftCardLoyaltyPoints().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

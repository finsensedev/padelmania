/**
 * Script to fix loyalty points inconsistencies:
 * 1. Create missing loyalty point records for bookings that were paid but don't have points
 * 2. Ensure all gift card bookings have loyalty points
 * 3. Calculate and display discrepancies
 */

import prisma from "../src/config/db";
import { calculatePointsFromAmount } from "../src/utils/loyalty";
import { addDays } from "date-fns";

async function fixLoyaltyPoints() {
  console.log("🔍 Checking for loyalty point inconsistencies...\n");

  // Find all CONFIRMED or COMPLETED bookings
  const bookings = await prisma.booking.findMany({
    where: {
      status: { in: ["CONFIRMED", "COMPLETED"] },
    },
    include: {
      payment: true,
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          loyaltyPoints: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`📊 Found ${bookings.length} confirmed/completed bookings\n`);

  let fixed = 0;
  let skipped = 0;

  for (const booking of bookings) {
    if (!booking.userId || !booking.payment) {
      skipped++;
      continue;
    }

    // Check if loyalty points already exist for this payment
    const existingPoints = await prisma.loyaltyPoint.findFirst({
      where: {
        userId: booking.userId,
        referenceId: booking.payment.id,
        type: "EARNED",
      },
    });

    if (existingPoints) {
      skipped++;
      continue;
    }

    // Calculate points that should have been awarded
    const amount = Number(booking.totalAmount || 0);
    const pointsEarned = await calculatePointsFromAmount(amount);

    if (pointsEarned <= 0) {
      skipped++;
      continue;
    }

    console.log(
      `✅ Fixing: ${booking.user.firstName} ${booking.user.lastName} - Booking ${booking.bookingCode}`
    );
    console.log(`   Amount: KES ${amount} → ${pointsEarned} points`);

    try {
      // Award the missing points
      await prisma.$transaction([
        prisma.user.update({
          where: { id: booking.userId },
          data: { loyaltyPoints: { increment: pointsEarned } },
        }),
        prisma.loyaltyPoint.create({
          data: {
            userId: booking.userId,
            points: pointsEarned,
            type: "EARNED",
            description: `Court booking reward (retroactive fix) - ${booking.bookingCode}`,
            referenceId: booking.payment.id,
            expiresAt: addDays(new Date(), 365),
          },
        }),
      ]);

      fixed++;
      console.log(`   ✓ Points awarded\n`);
    } catch (error) {
      console.error(`   ✗ Error:`, error);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`📈 Summary:`);
  console.log(`   Fixed: ${fixed} bookings`);
  console.log(`   Skipped: ${skipped} bookings (already had points)`);
  console.log("=".repeat(60) + "\n");

  // Now check for user totals
  console.log("🔍 Verifying user loyalty point totals...\n");

  const users = await prisma.user.findMany({
    where: {
      isDeleted: false,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      loyaltyPoints: true,
      loyaltyPointsLog: {
        select: {
          points: true,
          type: true,
        },
      },
    },
  });

  let discrepancies = 0;

  for (const user of users) {
    const calculatedTotal = user.loyaltyPointsLog.reduce(
      (sum: number, record: any) => sum + (record.points || 0),
      0
    );
    const storedTotal = user.loyaltyPoints || 0;

    if (calculatedTotal !== storedTotal) {
      console.log(
        `⚠️  Discrepancy: ${user.firstName} ${user.lastName} (${user.email})`
      );
      console.log(`   Stored: ${storedTotal} points`);
      console.log(`   Calculated: ${calculatedTotal} points`);
      console.log(`   Difference: ${calculatedTotal - storedTotal} points`);

      // Fix the discrepancy
      await prisma.user.update({
        where: { id: user.id },
        data: { loyaltyPoints: calculatedTotal },
      });

      console.log(`   ✓ Fixed\n`);
      discrepancies++;
    }
  }

  if (discrepancies === 0) {
    console.log("✅ All user loyalty point totals are correct!\n");
  } else {
    console.log(`\n✅ Fixed ${discrepancies} user total discrepancies\n`);
  }

  await prisma.$disconnect();
  console.log("✅ Done!");
}

fixLoyaltyPoints().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});

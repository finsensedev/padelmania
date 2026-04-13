import prisma from "../src/config/db";
import { awardReferralPoints } from "../src/services/referral.service";

/**
 * Backfill script to award referral points for users who already completed bookings
 * but didn't get referral points because the logic wasn't in place
 */
async function backfillReferralPoints() {
  console.log("🔄 Starting referral points backfill...\n");

  try {
    // Find all PENDING referrals where the referred user has a CONFIRMED or COMPLETED booking
    const pendingReferrals = await prisma.referral.findMany({
      where: {
        status: "PENDING",
      },
      include: {
        referrer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        referredUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    console.log(`Found ${pendingReferrals.length} pending referrals to check.\n`);

    let processedCount = 0;
    let awardedCount = 0;

    for (const referral of pendingReferrals) {
      if (!referral.referredUserId) {
        console.log(`⚠️  Skipping referral ${referral.id} - no referred user`);
        continue;
      }

      console.log(
        `Checking referral: ${referral.referrer.firstName} ${referral.referrer.lastName} → ${referral.referredUser?.firstName} ${referral.referredUser?.lastName}`
      );

      // Check if referred user has any confirmed or completed bookings
      const hasBooking = await prisma.booking.findFirst({
        where: {
          userId: referral.referredUserId,
          status: {
            in: ["CONFIRMED", "COMPLETED"],
          },
        },
      });

      if (hasBooking) {
        console.log(`  ✅ Found booking for ${referral.referredUser?.email}`);
        console.log(`  💰 Awarding 100 points to ${referral.referrer.email}...`);

        try {
          const awarded = await awardReferralPoints(referral.referredUserId);
          
          if (awarded) {
            awardedCount++;
            console.log(`  ✅ Successfully awarded 100 points!\n`);
          } else {
            console.log(`  ⚠️  No points awarded (may already be completed)\n`);
          }
        } catch (error: any) {
          console.error(`  ❌ Error awarding points: ${error.message}\n`);
        }
      } else {
        console.log(`  ⏳ No booking found yet - staying PENDING\n`);
      }

      processedCount++;
    }

    console.log("\n" + "=".repeat(50));
    console.log(`✅ Backfill complete!`);
    console.log(`   - Checked: ${processedCount} referrals`);
    console.log(`   - Awarded: ${awardedCount} referrals (100 points each)`);
    console.log("=".repeat(50) + "\n");
  } catch (error) {
    console.error("❌ Backfill failed:", error);
    throw error;
  }
}

// Run the backfill
backfillReferralPoints()
  .then(() => {
    console.log("🎉 Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Fatal error:", error);
    process.exit(1);
  });

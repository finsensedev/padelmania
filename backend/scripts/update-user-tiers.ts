import { PrismaClient, PointType } from "@prisma/client";
import { calculateTierFromPoints } from "../src/utils/loyalty";

const prisma = new PrismaClient();

// Parse command line arguments
const args = process.argv.slice(2);
const isExecuteMode = args.includes("--execute");
const isDryRun = !isExecuteMode;

async function updateAllUserTiers() {
  console.log("🔄 Starting tier update script...\n");

  if (isDryRun) {
    console.log(
      "🧪 DRY MODE ACTIVE: No changes will be saved to the database.",
    );
    console.log("   (Run with '--execute' to apply changes)\n");
  } else {
    console.log(
      "🚀 EXECUTE MODE: Changes WILL be persisted to the database.\n",
    );
  }

  const users = await prisma.user.findMany({
    where: {
      membershipCard: {
        isNot: null,
      },
    },
    include: {
      membershipCard: true,
    },
  });

  console.log(`📊 Found ${users.length} users with membership cards\n`);

  let actionCount = 0;
  let unchangedCount = 0;

  for (const user of users) {
    // Calculate lifetime points
    const loyaltyEarningTypes: PointType[] = [
      PointType.EARNED,
      PointType.BONUS,
    ];

    const [totalEarned, totalAdjustments] = await Promise.all([
      prisma.loyaltyPoint.aggregate({
        where: { userId: user.id, type: { in: loyaltyEarningTypes } },
        _sum: { points: true },
      }),
      prisma.loyaltyPoint.aggregate({
        where: { userId: user.id, type: PointType.ADJUSTMENT },
        _sum: { points: true },
      }),
    ]);

    const lifetimePoints =
      (totalEarned._sum?.points ?? 0) + (totalAdjustments._sum?.points ?? 0);
    const calculatedTier = calculateTierFromPoints(lifetimePoints);
    const currentTier = user.membershipCard!.tier;

    console.log(`👤 ${user.firstName} ${user.lastName} (${user.email})`);
    console.log(`   Lifetime Points: ${lifetimePoints.toLocaleString()}`);
    console.log(`   Current Tier: ${currentTier}`);
    console.log(`   Calculated Tier: ${calculatedTier}`);

    if (currentTier !== calculatedTier) {
      if (isExecuteMode) {
        // ACTUAL UPDATE
        await prisma.membershipCard.update({
          where: { userId: user.id },
          data: { tier: calculatedTier },
        });
        console.log(`   ✅ Updated: ${currentTier} → ${calculatedTier}\n`);
      } else {
        // DRY RUN LOG ONLY
        console.log(
          `   📝 [Dry Run] Would update: ${currentTier} → ${calculatedTier}\n`,
        );
      }
      actionCount++;
    } else {
      console.log(`   ⏭️  No change needed\n`);
      unchangedCount++;
    }
  }

  console.log("\n📈 Summary:");
  console.log(`   Total users: ${users.length}`);
  console.log(
    `   ${isExecuteMode ? "Updated" : "Updates Found"}: ${actionCount}`,
  );
  console.log(`   Unchanged: ${unchangedCount}`);

  if (isDryRun && actionCount > 0) {
    console.log(
      `\n⚠️  ${actionCount} updates pending. Run with '--execute' to apply.`,
    );
  } else {
    console.log("\n✅ Tier update process completed!");
  }
}

updateAllUserTiers()
  .catch((error) => {
    console.error("❌ Error updating tiers:", error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });

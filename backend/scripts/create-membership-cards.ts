import { PrismaClient, MembershipTier, PointType } from "@prisma/client";
import { calculateTierFromPoints } from "../src/utils/loyalty";
import { addYears } from "date-fns";

const prisma = new PrismaClient();

// Parse command line arguments
const args = process.argv.slice(2);
const isExecuteMode = args.includes("--execute");
const isDryRun = !isExecuteMode;

async function createMissingMembershipCards() {
  console.log("🔄 Starting missing membership card check...\n");

  if (isDryRun) {
    console.log("🧪 DRY MODE ACTIVE: No cards will be created.");
    console.log("   (Run with '--execute' to commit changes)\n");
  } else {
    console.log("🚀 EXECUTE MODE: Membership cards WILL be created.\n");
  }

  const usersWithoutCards = await prisma.user.findMany({
    where: {
      membershipCard: null,
      emailVerified: true, // Only create for verified users
    },
  });

  console.log(
    `📊 Found ${usersWithoutCards.length} verified users without membership cards\n`,
  );

  if (usersWithoutCards.length === 0) {
    console.log("✅ All verified users already have membership cards!");
    return;
  }

  let createdCount = 0;

  for (const user of usersWithoutCards) {
    // Calculate lifetime points to determine initial tier
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
    const tier = calculateTierFromPoints(lifetimePoints);

    // Generate unique card number
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, "0");
    const cardNumber = `TP${timestamp}${random}`;

    if (isExecuteMode) {
      // ACTUAL CREATION
      await prisma.membershipCard.create({
        data: {
          userId: user.id,
          cardNumber,
          tier,
          validFrom: new Date(),
          validUntil: addYears(new Date(), 1),
          isActive: true,
        },
      });

      console.log(
        `✅ Created membership card for ${user.firstName} ${user.lastName}`,
      );
      console.log(`   Email: ${user.email}`);
      console.log(`   Card Number: ${cardNumber}`);
      console.log(`   Tier: ${tier} (${lifetimePoints} lifetime points)\n`);
    } else {
      // DRY RUN LOG ONLY
      console.log(
        `📝 [Dry Run] Would create card for: ${user.firstName} ${user.lastName}`,
      );
      console.log(`   Email: ${user.email}`);
      console.log(`   Proposed Card #: ${cardNumber}`);
      console.log(
        `   Calculated Tier: ${tier} (${lifetimePoints} lifetime points)\n`,
      );
    }

    createdCount++;
  }

  console.log("\n📈 Summary:");
  console.log(`   Total candidates: ${usersWithoutCards.length}`);

  if (isExecuteMode) {
    console.log(`   ✅ Successfully created: ${createdCount} cards`);
  } else {
    console.log(
      `   ⚠️  Pending creation: ${createdCount} cards (Run with --execute to apply)`,
    );
  }
}

createMissingMembershipCards()
  .catch((error) => {
    console.error("❌ Error creating membership cards:", error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });

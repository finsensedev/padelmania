import { PrismaClient } from "@prisma/client";
import { addMonths } from "date-fns";

const prisma = new PrismaClient();

async function updatePointsExpiry() {
  try {
    console.log("Starting to update points expiry from 12 months to 6 months...\n");

    // Get all active loyalty points (not expired, not redeemed)
    const points = await prisma.loyaltyPoint.findMany({
      where: {
        points: { gt: 0 },
        type: { in: ["EARNED", "BONUS"] },
      },
      orderBy: { createdAt: "asc" },
    });

    console.log(`Found ${points.length} active loyalty points to update.\n`);

    let updated = 0;
    let skipped = 0;

    for (const point of points) {
      // Calculate new expiry date: 6 months from creation date
      const newExpiryDate = addMonths(point.createdAt, 6);
      
      // Only update if the expiry date is different
      if (!point.expiresAt || point.expiresAt.getTime() !== newExpiryDate.getTime()) {
        await prisma.loyaltyPoint.update({
          where: { id: point.id },
          data: { expiresAt: newExpiryDate },
        });
        
        console.log(
          `✓ Updated point ${point.id} - Created: ${point.createdAt.toISOString().split('T')[0]}, ` +
          `Old Expiry: ${point.expiresAt?.toISOString().split('T')[0] || 'none'}, ` +
          `New Expiry: ${newExpiryDate.toISOString().split('T')[0]} (${point.points} pts)`
        );
        updated++;
      } else {
        skipped++;
      }
    }

    console.log(`\n✓ Migration completed successfully!`);
    console.log(`  - Updated: ${updated} points`);
    console.log(`  - Skipped: ${skipped} points (already correct)`);
    console.log(`  - Total processed: ${points.length} points\n`);

    // Show summary of earliest expiring points
    const earliestExpiring = await prisma.loyaltyPoint.findMany({
      where: {
        points: { gt: 0 },
        type: { in: ["EARNED", "BONUS"] },
        expiresAt: { gte: new Date() },
      },
      orderBy: { expiresAt: "asc" },
      take: 5,
      include: {
        user: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    console.log("Next 5 points expiring:");
    earliestExpiring.forEach((point, idx) => {
      console.log(
        `${idx + 1}. ${point.user.firstName} ${point.user.lastName} - ` +
        `${point.points} pts expiring on ${point.expiresAt?.toISOString().split('T')[0]}`
      );
    });

  } catch (error) {
    console.error("Error updating points expiry:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

updatePointsExpiry()
  .then(() => {
    console.log("\n✓ Script completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n✗ Script failed:", error);
    process.exit(1);
  });

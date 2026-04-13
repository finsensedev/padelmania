import prisma from "../src/config/db";
import { calculatePriceBreakdown } from "../src/utils/price-breakdown";
import { Prisma } from "@prisma/client";

/**
 * Backfill script to add price breakdown to existing bookings
 * Run this script after deploying the priceBreakdown column
 *
 * Usage: npx tsx scripts/backfill-price-breakdown.ts
 */
async function backfillPriceBreakdown() {
  console.log("🔄 Starting price breakdown backfill...");

  try {
    // Find all bookings without a price breakdown
    const bookings = await prisma.booking.findMany({
      where: {
        OR: [
          { priceBreakdown: { equals: Prisma.DbNull } },
          { priceBreakdown: { equals: Prisma.JsonNull } },
        ],
      },
      include: {
        court: true,
        equipmentRentals: {
          include: {
            equipment: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    console.log(`📊 Found ${bookings.length} bookings without price breakdown`);

    let successCount = 0;
    let errorCount = 0;

    for (const booking of bookings) {
      try {
        // Calculate the price breakdown
        const equipmentRentals = booking.equipmentRentals.map(
          (rental: any) => ({
            type: rental.equipment?.type || "UNKNOWN",
            name: rental.equipment?.name || "Unknown Equipment",
            quantity: rental.quantity,
            pricePerUnit: Number(rental.price),
          })
        );

        const priceBreakdown = await calculatePriceBreakdown({
          courtId: booking.courtId,
          startTime: booking.startTime,
          endTime: booking.endTime,
          durationMinutes: booking.duration,
          equipmentRentals,
          baseHourlyRate: Number((booking.court as any)?.baseHourlyRate || 0),
        });

        // Update the booking with the calculated breakdown
        await prisma.booking.update({
          where: { id: booking.id },
          data: {
            priceBreakdown: priceBreakdown as any,
          },
        });

        successCount++;

        if (successCount % 100 === 0) {
          console.log(`✅ Processed ${successCount} bookings...`);
        }
      } catch (error) {
        errorCount++;
        console.error(
          `❌ Error processing booking ${booking.bookingCode}:`,
          error
        );
      }
    }

    console.log("\n📈 Backfill Summary:");
    console.log(`   ✅ Successfully updated: ${successCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log(`   📊 Total processed: ${bookings.length}`);
    console.log("\n✨ Backfill complete!");
  } catch (error) {
    console.error("💥 Fatal error during backfill:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
backfillPriceBreakdown().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});

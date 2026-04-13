import prisma from "../src/config/db";
import { BookingStatus } from "@prisma/client";

/**
 * Script to reschedule a booking from 10:00 AM to 10:00 PM (22:00)
 *
 * Booking Details:
 * - Booking Code: BKMHP71H990
 * - Customer: Ali Sherman
 * - Current Time: 10:00 AM - 11:00 AM (2 players, 60 minutes)
 * - New Time: 10:00 PM (22:00) - 11:00 PM (23:00)
 * - Date: Saturday, November 8, 2025
 * - Total: KES 2,400 (Court: KES 1,000/hr + Equipment: KES 1,400)
 */ async function rescheduleBooking() {
  const bookingCode = "BKMHP71H990";

  console.log("=".repeat(60));
  console.log("Starting Booking Reschedule Process");
  console.log("=".repeat(60));
  console.log(`Booking Code: ${bookingCode}`);
  console.log(`Action: Move from 10:00 AM to 10:00 PM (22:00)\n`);

  try {
    // Step 1: Find the booking
    console.log("Step 1: Locating booking...");
    const booking = await prisma.booking.findUnique({
      where: { bookingCode },
      include: {
        court: {
          select: {
            id: true,
            name: true,
          },
        },
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        equipmentRentals: true,
        payment: {
          select: {
            id: true,
            amount: true,
            status: true,
            transactionId: true,
          },
        },
      },
    });

    if (!booking) {
      console.error(`❌ Booking with code ${bookingCode} not found!`);
      return;
    }

    console.log(
      `✓ Found booking for ${booking.user.firstName} ${booking.user.lastName}`
    );
    console.log(`  Court: ${booking.court.name}`);
    console.log(`  Current Start: ${booking.startTime.toLocaleString()}`);
    console.log(`  Current End: ${booking.endTime.toLocaleString()}`);
    console.log(`  Duration: ${booking.duration} minutes`);
    console.log(`  Status: ${booking.status}`);
    console.log(`  Total Amount: KES ${booking.totalAmount}`);
    console.log(`  Number of Players: ${booking.numberOfPlayers}`);
    console.log(
      `  Price Breakdown:`,
      JSON.stringify(booking.priceBreakdown, null, 2)
    );
    console.log();

    // Step 2: Calculate new times (keeping the same date, but changing to 22:00)
    console.log("Step 2: Calculating new times...");
    const originalStart = new Date(booking.startTime);
    const originalEnd = new Date(booking.endTime);
    const durationMs = originalEnd.getTime() - originalStart.getTime();

    // Create new start time at 22:00 (10:00 PM) on the same date
    const newStartTime = new Date(originalStart);
    newStartTime.setHours(22, 0, 0, 0);

    // Calculate new end time based on original duration
    const newEndTime = new Date(newStartTime.getTime() + durationMs);

    console.log(`  New Start: ${newStartTime.toLocaleString()}`);
    console.log(`  New End: ${newEndTime.toLocaleString()}`);
    console.log(`  Duration unchanged: ${booking.duration} minutes\n`);

    // Step 3: Check if new slot is available
    console.log("Step 3: Checking slot availability...");
    const conflictingBookings = await prisma.booking.findMany({
      where: {
        courtId: booking.courtId,
        id: { not: booking.id }, // Exclude current booking
        status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
        OR: [
          // New booking starts during existing booking
          {
            AND: [
              { startTime: { lte: newStartTime } },
              { endTime: { gt: newStartTime } },
            ],
          },
          // New booking ends during existing booking
          {
            AND: [
              { startTime: { lt: newEndTime } },
              { endTime: { gte: newEndTime } },
            ],
          },
          // New booking completely contains existing booking
          {
            AND: [
              { startTime: { gte: newStartTime } },
              { endTime: { lte: newEndTime } },
            ],
          },
        ],
      },
      select: {
        bookingCode: true,
        startTime: true,
        endTime: true,
      },
    });

    if (conflictingBookings.length > 0) {
      console.error("❌ Cannot reschedule - time slot conflicts detected:");
      conflictingBookings.forEach((conflict) => {
        console.error(
          `  - ${
            conflict.bookingCode
          }: ${conflict.startTime.toLocaleString()} - ${conflict.endTime.toLocaleString()}`
        );
      });
      return;
    }

    console.log("✓ New time slot is available\n");

    // Step 4: Calculate new pricing for the 22:00 slot
    console.log("Step 4: Calculating new pricing...");

    // Parse the existing price breakdown
    let oldCourtSubtotal = 0;
    let equipmentSubtotal = 0;
    let voucherDiscount = 0;
    let giftCardApplied = 0;
    let oldPricePerHour = 0;
    let oldAppliedRules: any[] = [];

    if (booking.priceBreakdown && typeof booking.priceBreakdown === "object") {
      const breakdown = booking.priceBreakdown as any;
      oldCourtSubtotal = breakdown.courtSubtotal || 0;
      equipmentSubtotal = breakdown.equipmentSubtotal || 0;
      voucherDiscount = breakdown.voucherDiscount || 0;
      giftCardApplied = breakdown.giftCardApplied || 0;
      oldAppliedRules = breakdown.appliedRules || [];

      // Extract old price per hour from applied rules or hourly breakdown
      if (oldAppliedRules.length > 0) {
        oldPricePerHour = oldAppliedRules[0].value || 0;
      } else if (
        breakdown.hourlyBreakdown &&
        breakdown.hourlyBreakdown.length > 0
      ) {
        oldPricePerHour = breakdown.hourlyBreakdown[0].finalRate || 0;
      }
    }

    // At 22:00, both slots have the same rate (KES 1,000/hour Off Peak vs KES 1,000/hour Peak Night)
    // However, the old booking shows KES 2,000 for 60 minutes, which suggests it was booked for 2 slots or has special pricing
    // Let's keep the EXACT same court subtotal since the rates are the same
    const newCourtSubtotal = oldCourtSubtotal; // Keep the same court pricing

    // Keep the EXACT same total amount since pricing rates are identical
    // This preserves any additional charges (like the KES 400 difference between breakdown and total)
    const oldTotalAmount = Number(booking.totalAmount);
    const newTotalAmount = oldTotalAmount; // Keep exactly the same
    const amountDifference: number = 0; // No change in pricing

    console.log(`  Old Court Subtotal: KES ${oldCourtSubtotal.toFixed(2)}`);
    console.log(
      `  New Court Subtotal: KES ${newCourtSubtotal.toFixed(
        2
      )} (unchanged - same rate)`
    );
    console.log(
      `  Equipment Subtotal: KES ${equipmentSubtotal.toFixed(2)} (unchanged)`
    );
    if (voucherDiscount > 0) {
      console.log(
        `  Voucher Discount: KES ${voucherDiscount.toFixed(2)} (unchanged)`
      );
    }
    if (giftCardApplied > 0) {
      console.log(
        `  Gift Card Applied: KES ${giftCardApplied.toFixed(2)} (unchanged)`
      );
    }
    console.log(`  Old Total (from DB): KES ${oldTotalAmount.toFixed(2)}`);
    console.log(
      `  Old Total (from breakdown): KES ${(
        oldCourtSubtotal + equipmentSubtotal
      ).toFixed(2)}`
    );
    console.log(`  New Total: KES ${newTotalAmount.toFixed(2)}`);

    if (oldTotalAmount !== oldCourtSubtotal + equipmentSubtotal) {
      const extraCharges =
        oldTotalAmount - (oldCourtSubtotal + equipmentSubtotal);
      console.log(
        `  ⚠️  Note: Extra charges detected (possibly fees): KES ${extraCharges.toFixed(
          2
        )}`
      );
      console.log(`  These charges will be preserved in the totalAmount field`);
    }

    console.log(
      `  Difference: KES ${amountDifference.toFixed(2)} ${
        amountDifference >= 0 ? "(customer owes)" : "(refund due)"
      }\n`
    );

    // Step 5: Prepare updated price breakdown
    // Keep the original price breakdown structure and just update the timestamps
    const updatedPriceBreakdown = {
      ...(typeof booking.priceBreakdown === "object"
        ? booking.priceBreakdown
        : {}),
      courtSubtotal: newCourtSubtotal,
      equipmentSubtotal: equipmentSubtotal,
      voucherDiscount: voucherDiscount,
      giftCardApplied: giftCardApplied,
      totalAmount: newTotalAmount,
      rescheduledFrom: {
        startTime: booking.startTime.toISOString(),
        endTime: booking.endTime.toISOString(),
        totalAmount: oldTotalAmount,
        courtSubtotal: oldCourtSubtotal,
      },
    };

    // Step 6: Perform the update
    console.log("Step 5: Updating booking in database...");
    console.log(
      "⚠️  This is a DRY RUN. Set DRY_RUN=false to actually update.\n"
    );

    const DRY_RUN = process.env.DRY_RUN !== "false";

    if (DRY_RUN) {
      console.log("📋 PREVIEW - Changes that would be made:");
      console.log("  - Update startTime to:", newStartTime.toISOString());
      console.log("  - Update endTime to:", newEndTime.toISOString());
      console.log("  - Update totalAmount to:", newTotalAmount);
      console.log("  - Update priceBreakdown with new rates");
      console.log("  - Add notes about reschedule");

      if (amountDifference !== 0) {
        console.log("\n⚠️  IMPORTANT: Price difference detected!");
        if (amountDifference > 0) {
          console.log(
            `   Customer needs to pay additional: KES ${amountDifference.toFixed(
              2
            )}`
          );
          console.log("   Action required: Process additional payment");
        } else {
          console.log(
            `   Refund due to customer: KES ${Math.abs(
              amountDifference
            ).toFixed(2)}`
          );
          console.log("   Action required: Process refund or issue gift card");
        }
      }

      console.log(
        "\n✓ Preview complete. Run with DRY_RUN=false to apply changes."
      );
    } else {
      const updatedBooking = await prisma.booking.update({
        where: { id: booking.id },
        data: {
          startTime: newStartTime,
          endTime: newEndTime,
          totalAmount: newTotalAmount,
          priceBreakdown: updatedPriceBreakdown as any,
          notes: booking.notes
            ? `${
                booking.notes
              }\n\n[Rescheduled from ${originalStart.toLocaleString()} to ${newStartTime.toLocaleString()}]`
            : `Rescheduled from ${originalStart.toLocaleString()} to ${newStartTime.toLocaleString()}`,
        },
      });

      console.log("✅ Booking successfully updated!");
      console.log(`   New Start: ${updatedBooking.startTime.toLocaleString()}`);
      console.log(`   New End: ${updatedBooking.endTime.toLocaleString()}`);
      console.log(`   New Total: KES ${updatedBooking.totalAmount}\n`);

      if (amountDifference !== 0) {
        console.log("⚠️  POST-UPDATE ACTION REQUIRED:");
        if (amountDifference > 0) {
          console.log(`   1. Contact customer: ${booking.user.email}`);
          console.log(
            `   2. Request additional payment of KES ${amountDifference.toFixed(
              2
            )}`
          );
          console.log(`   3. Update payment record when received`);
        } else {
          console.log(`   1. Contact customer: ${booking.user.email}`);
          console.log(
            `   2. Process refund of KES ${Math.abs(amountDifference).toFixed(
              2
            )}`
          );
          console.log(`   3. OR issue gift card for the amount`);
        }
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("Reschedule Process Complete");
    console.log("=".repeat(60));
  } catch (error) {
    console.error("\n❌ Error during reschedule process:");
    console.error(error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
rescheduleBooking()
  .then(() => {
    console.log("\n✓ Script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Script failed:", error);
    process.exit(1);
  });

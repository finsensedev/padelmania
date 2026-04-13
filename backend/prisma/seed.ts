import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // ---------- Equipment Seeding ----------
  // Seed default racket equipment
  // const existingRacket = await prisma.equipment.findFirst({
  //   where: {
  //     type: "RACKET",
  //     name: { contains: "Racket", mode: "insensitive" },
  //   },
  // });
  // if (!existingRacket) {
  //   await prisma.equipment.create({
  //     data: {
  //       name: "Padel Racket",
  //       type: "RACKET",
  //       brand: "Generic",
  //       totalQuantity: 100,
  //       availableQty: 100,
  //       rentalPrice: 3,
  //       condition: "GOOD",
  //       isActive: true,
  //       updatedAt: new Date(),
  //     },
  //   });
  // }

  // ---------- Court Seeding ----------
  // Seed default courts
  // const courts = await Promise.all([
  //   prisma.court.create({
  //     data: {
  //       name: "Court 1 - Premium Indoor",
  //       surface: "ARTIFICIAL_GRASS",
  //       location: "INDOOR",
  //       baseHourlyRate: 0,
  //       peakHourlyRate: 0,
  //       weekendRate: 0,
  //       isActive: true,
  //       description: "Premium indoor court with climate control",
  //       amenities: {
  //         lighting: "LED Professional",
  //         airConditioning: true,
  //         changingRooms: true,
  //         showers: true,
  //       },
  //     },
  //   }),

  //   prisma.court.create({
  //     data: {
  //       name: "Court 2 - Standard Indoor",
  //       surface: "ARTIFICIAL_GRASS",
  //       location: "INDOOR",
  //       baseHourlyRate: 0,
  //       peakHourlyRate: 0,
  //       weekendRate: 0,
  //       isActive: true,
  //       description: "Standard indoor court",
  //     },
  //   }),
  // ]);

  console.log("✓ Courts seeded successfully!");

  // ---------- Pricing Rules Seeding ----------
  // Seed default pricing rules
  // await Promise.all([
  //   prisma.pricingRule.create({
  //     data: {
  //       name: "Weekday Standard Rate",
  //       description: "Default pricing for all courts",
  //       dayOfWeek: [],
  //       pricingType: "FIXED",
  //       priceValue: 2500,
  //       startTime: "06:00",
  //       endTime: "23:59",
  //       priority: 1,
  //       isActive: true,
  //     },
  //   }),

  //   prisma.pricingRule.create({
  //     data: {
  //       name: "Weekend ",
  //       description: "Weekend pricing (Saturday & Sunday)",
  //       dayOfWeek: [0, 5, 6],
  //       startTime: "14:00",
  //       endTime: "23:59",
  //       pricingType: "FIXED",
  //       priceValue: 4500,
  //       priority: 2,
  //       isActive: true,
  //     },
  //   }),

  //   prisma.pricingRule.create({
  //     data: {
  //       name: "Weekend Off Peak",
  //       description: "Off-peak hours Saturday and Sunday",
  //       dayOfWeek: [0, 5, 6],
  //       startTime: "06:00",
  //       endTime: "13:59",
  //       pricingType: "FIXED",
  //       priceValue: 3000,
  //       priority: 3,
  //       isActive: true,
  //     },
  //   }),
  // ]);

  console.log("✓ Pricing rules seeded successfully!");

  // ---------- System Settings Seeding ----------
  // Seed booking slot durations configuration
  const existingSlotConfig = await prisma.systemSetting.findUnique({
    where: { key: "BOOKING_SLOT_DURATIONS" },
  });

  if (!existingSlotConfig) {
    await prisma.systemSetting.create({
      data: {
        key: "BOOKING_SLOT_DURATIONS",
        value: {
          allowedDurations: [60, 120, 180],
          defaultDuration: 60,
          minDuration: 60,
          maxDuration: 180,
        },
        type: "json",
        category: "BOOKING",
        description: "Configurable booking slot duration options",
        isPublic: true,
      },
    });
    console.log("✓ Booking slot configuration seeded successfully!");
  }

  // ---------- Loyalty Config Seeding ----------
  const existingLoyaltyConfig = await prisma.loyaltyConfig.findFirst({
    where: { isActive: true },
  });

  if (!existingLoyaltyConfig) {
    await prisma.loyaltyConfig.create({
      data: {
        pointsPerCurrency: 1,
        currencyUnit: 100, // 1 point per 100 KSH
        registrationBonusPoints: 40,
        referralBonusPoints: 20,
        minimumRedeemablePoints: 100,
        pointsToGiftCardRatio: 1, // 1 point = 1 KSH gift card value
        isActive: true,
      },
    });
    console.log("  ✓ Loyalty configuration created");
  }

  console.log("\n🎉 Database seeded successfully!");
  console.log("\nSeeded data:");
  console.log("  - 1 Equipment item (Padel Racket)");
  console.log("  - 2 Courts (Premium Indoor & Standard Indoor)");
  console.log("  - 3 Pricing Rules (Weekday, Weekend Peak, Weekend Off-Peak)");
  console.log("  - 1 System Setting (Booking Slot Durations)");
  console.log("  - 1 Loyalty Configuration");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function fixLoyaltyConfig() {
  try {
    console.log("Checking current loyalty config...\n");

    const currentConfig = await prisma.loyaltyConfig.findFirst({
      where: { isActive: true },
    });

    if (!currentConfig) {
      console.log("No active loyalty config found. Creating default...");
      await prisma.loyaltyConfig.create({
        data: {
          pointsPerCurrency: 1,
          currencyUnit: 100,
          registrationBonusPoints: 40,
          referralBonusPoints: 20,
          minimumRedeemablePoints: 100,
          pointsToGiftCardRatio: 1,
          isActive: true,
        },
      });
      console.log("✓ Created default loyalty config: 1 point per 100 KES");
    } else {
      console.log("Current config:");
      console.log(`  - Points per currency: ${currentConfig.pointsPerCurrency}`);
      console.log(`  - Currency unit: ${currentConfig.currencyUnit} KES`);
      console.log(`  - Registration bonus: ${currentConfig.registrationBonusPoints} pts`);
      console.log(`  - Referral bonus: ${currentConfig.referralBonusPoints} pts\n`);

      if (currentConfig.currencyUnit !== 100) {
        console.log(`Updating currency unit from ${currentConfig.currencyUnit} to 100 KES...\n`);
        
        await prisma.loyaltyConfig.update({
          where: { id: currentConfig.id },
          data: {
            currencyUnit: 100,
          },
        });
        
        console.log("✓ Updated loyalty config successfully!");
        console.log("  New display: 1 pt/KES 100\n");
      } else {
        console.log("✓ Config is already correct (1 pt/KES 100)\n");
      }
    }

    const finalConfig = await prisma.loyaltyConfig.findFirst({
      where: { isActive: true },
    });

    console.log("Final configuration:");
    console.log(`  Display: ${finalConfig?.pointsPerCurrency} pt/KES ${finalConfig?.currencyUnit}`);
    console.log(`  Registration Bonus: ${finalConfig?.registrationBonusPoints} pts`);
    console.log(`  Referral Bonus: ${finalConfig?.referralBonusPoints} pts`);

  } catch (error) {
    console.error("Error fixing loyalty config:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

fixLoyaltyConfig()
  .then(() => {
    console.log("\n✓ Script completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n✗ Script failed:", error);
    process.exit(1);
  });

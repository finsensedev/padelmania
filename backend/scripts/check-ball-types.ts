import prisma from "../src/config/db";

async function checkBallTypes() {
  console.log("🎾 Checking ball types in database...\n");

  try {
    const ballTypes = await prisma.equipment.findMany({
      where: { type: "BALLS" },
      orderBy: { rentalPrice: "asc" },
    });

    if (ballTypes.length === 0) {
      console.log("❌ No ball types found in database!");
      return;
    }

    console.log(`Found ${ballTypes.length} ball type(s):\n`);

    ballTypes.forEach((ball, index) => {
      console.log(`${index + 1}. ${ball.name}`);
      console.log(`   ID: ${ball.id}`);
      console.log(`   Brand: ${ball.brand}`);
      console.log(`   Price: ${ball.rentalPrice} KES`);
      console.log(`   Stock: ${ball.availableQty}/${ball.totalQuantity}`);
      console.log(`   Active: ${ball.isActive}`);
      console.log(`   Created: ${ball.createdAt}`);
      console.log("");
    });
  } catch (error) {
    console.error("❌ Error checking ball types:", error);
    throw error;
  }
}

// Run if executed directly
if (require.main === module) {
  checkBallTypes()
    .then(() => {
      console.log("✅ Check complete!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Check failed:", error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export default checkBallTypes;

import prisma from "../src/config/db";

async function main() {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const result = await prisma.user.updateMany({
    where: {
      isActive: true,
      OR: [
        { lastLogin: { lt: sixMonthsAgo } },
        { lastLogin: null, createdAt: { lt: sixMonthsAgo } },
      ],
    },
    data: { isActive: false },
  });

  console.log(`Deactivated ${result.count} inactive users`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

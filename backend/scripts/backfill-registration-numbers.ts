import prisma from "../src/config/db";
import { generateRegistrationNumber } from "../src/utils/helpers";

async function main() {
  // Find users without a registration number or with a non-numeric legacy format
  const users = await prisma.user.findMany({
    where: {
      OR: [{ registrationNumber: null }, { registrationNumber: { not: null } }],
    },
    select: { id: true, registrationNumber: true },
  });

  const needsUpdate = users.filter((u) => {
    const rn = u.registrationNumber;
    if (!rn) return true;
    // Accept only TP-<7 digits>
    return !/^TP-\d{6,7}$/u.test(rn);
  });

  console.log(
    `Found ${needsUpdate.length} users to normalize registration numbers`
  );

  let updated = 0;
  for (const u of needsUpdate) {
    let attempts = 0;
    while (attempts < 5) {
      const reg = generateRegistrationNumber("TP");
      try {
        await prisma.user.update({
          where: { id: u.id },
          data: { registrationNumber: reg as any },
        });
        updated++;
        break;
      } catch (e: any) {
        if (e?.code === "P2002") {
          attempts++;
          continue; // try again with a new number
        }
        console.error(`Failed to update user ${u.id}:`, e);
        break;
      }
    }
  }

  console.log(`Backfill complete. Updated ${updated} users.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

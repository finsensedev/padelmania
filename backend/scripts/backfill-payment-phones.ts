/**
 * Backfill phone numbers in payment metadata for existing payments
 * that don't have the phone captured.
 * 
 * Also updates user profiles if they don't have a phone number.
 * 
 * Run with: npx ts-node scripts/backfill-payment-phones.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function backfillPaymentPhones() {
  console.log("🔍 Finding payments missing phone in metadata...");

  // Find all MPESA payments that are COMPLETED and have a user
  const payments = await prisma.payment.findMany({
    where: {
      provider: "MPESA",
      status: { in: ["COMPLETED", "PARTIALLY_REFUNDED"] },
      userId: { not: null },
    },
    include: {
      user: {
        select: { id: true, phone: true, email: true },
      },
    },
  });

  console.log(`📊 Found ${payments.length} M-Pesa payments to check`);

  let paymentUpdated = 0;
  let paymentSkipped = 0;
  let userUpdated = 0;
  let noPhone = 0;

  for (const payment of payments) {
    const meta = (payment.metadata as any) || {};
    const metaPhone = meta.phone;
    const userPhone = payment.user?.phone;
    
    // Determine the best phone to use
    const bestPhone = metaPhone || userPhone;

    // If we have a phone in metadata but user doesn't have one, update the user
    if (metaPhone && payment.user && !userPhone) {
      try {
        await prisma.user.update({
          where: { id: payment.user.id },
          data: { phone: metaPhone },
        });
        userUpdated++;
        console.log(`👤 Updated user ${payment.user.email} with phone ${metaPhone.slice(0, 6)}****`);
      } catch (e) {
        console.error(`Failed to update user ${payment.user.id}:`, e);
      }
    }
    
    // Skip if phone already exists in metadata
    if (meta.phone) {
      paymentSkipped++;
      continue;
    }

    // If no phone anywhere, skip
    if (!bestPhone) {
      noPhone++;
      console.log(`⚠️ Payment ${payment.id} (${payment.user?.email}) - no phone available anywhere`);
      continue;
    }

    // Update the payment metadata with the phone
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        metadata: {
          ...meta,
          phone: bestPhone,
        },
      },
    });

    paymentUpdated++;
    console.log(`✅ Updated payment ${payment.id} with phone ${bestPhone.slice(0, 6)}****`);
  }

  console.log("\n📈 Summary:");
  console.log(`   Payments updated: ${paymentUpdated}`);
  console.log(`   Payments skipped (already has phone): ${paymentSkipped}`);
  console.log(`   Users updated with phone from metadata: ${userUpdated}`);
  console.log(`   No phone available: ${noPhone}`);
  console.log("✅ Done!");
}

backfillPaymentPhones()
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

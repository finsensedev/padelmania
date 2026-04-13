/**
 * One-time script to update customer phone number and their existing payments
 * 
 * Run with: npx ts-node scripts/fix-customer-phone.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function updateCustomerPhone() {
  const customerEmail = "customer@gmail.com";
  const phoneNumber = "254707049885"; // Normalized Kenyan format
  
  console.log(`🔍 Looking for customer: ${customerEmail}`);
  
  // Find the customer
  const user = await prisma.user.findFirst({
    where: { email: customerEmail },
  });
  
  if (!user) {
    console.log("❌ User not found");
    return;
  }
  
  console.log(`👤 Found user: ${user.id}`);
  console.log(`   Email: ${user.email}`);
  console.log(`   Current phone: ${user.phone || "(none)"}`);
  
  // Update user with the phone number
  await prisma.user.update({
    where: { id: user.id },
    data: { phone: phoneNumber },
  });
  console.log(`✅ Updated user phone to: ${phoneNumber}`);
  
  // Update all their completed payments to have the phone in metadata
  const payments = await prisma.payment.findMany({
    where: { 
      userId: user.id, 
      provider: "MPESA",
      status: { in: ["COMPLETED", "PARTIALLY_REFUNDED"] } 
    },
  });
  
  console.log(`\n📊 Found ${payments.length} M-Pesa payments to update`);
  
  let updated = 0;
  for (const p of payments) {
    const meta = (p.metadata as any) || {};
    if (!meta.phone) {
      await prisma.payment.update({
        where: { id: p.id },
        data: { metadata: { ...meta, phone: phoneNumber } },
      });
      console.log(`   ✅ Updated payment: ${p.transactionId || p.id}`);
      updated++;
    } else {
      console.log(`   ⏭️ Skipped payment: ${p.transactionId || p.id} (already has phone)`);
    }
  }
  
  console.log(`\n✅ Done! Updated ${updated} payments.`);
}

updateCustomerPhone()
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

import prisma from "../src/config/db";

async function checkPoints() {
  const bookings = await prisma.booking.findMany({
    where: {
      OR: [
        { bookingCode: "TPB-MHADO7QD-86C4" },
        { bookingCode: "TPB-MHACU078-D0E3" },
      ],
    },
    include: {
      payment: true,
    },
  });

  console.log("Bookings found:", bookings.length);

  if (bookings.length === 0) {
    console.log("No bookings found");
    await prisma.$disconnect();
    return;
  }

  const userId = bookings[0].userId;
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    console.log("User not found");
    await prisma.$disconnect();
    return;
  }

  console.log(`\nUser: ${user.firstName} ${user.lastName}`);
  console.log(`User loyalty points (DB field): ${user.loyaltyPoints}`);

  console.log("\n--- Bookings ---");
  for (const b of bookings) {
    console.log(`\nBooking: ${b.bookingCode}`);
    console.log(`  Amount: ${b.totalAmount}, Status: ${b.status}`);
    if (b.payment) {
      console.log(`  Payment ID: ${b.payment.id}`);
      console.log(`  Payment Status: ${b.payment.status}`);
      console.log(`  Payment Amount: ${b.payment.amount}`);
      console.log(`  Payment Provider: ${b.payment.provider}`);
    }
  }

  const loyaltyRecords = await prisma.loyaltyPoint.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });

  console.log(`\n--- Loyalty Point Records (${loyaltyRecords.length}) ---`);
  let running = 0;
  for (const lp of loyaltyRecords) {
    running += lp.points;
    console.log(
      `${lp.points.toString().padStart(4)} pts | ${lp.type.padEnd(10)} | ${
        lp.description
      } | Running: ${running}`
    );
    console.log(`     Ref: ${lp.referenceId}`);
  }

  const total = loyaltyRecords.reduce((sum, lp) => sum + lp.points, 0);
  console.log(`\n=== SUMMARY ===`);
  console.log(`Calculated from records: ${total}`);
  console.log(`User DB field: ${user.loyaltyPoints}`);
  console.log(`Difference: ${user.loyaltyPoints - total}`);

  // Check if payments have loyalty points
  const paymentIds = bookings
    .map((b) => b.payment?.id)
    .filter((id): id is string => !!id);

  if (paymentIds.length > 0) {
    const pointsForPayments = await prisma.loyaltyPoint.findMany({
      where: { referenceId: { in: paymentIds } },
    });
    console.log(
      `\nLoyalty points for these ${paymentIds.length} payments: ${pointsForPayments.length} records found`
    );
    if (pointsForPayments.length === 0) {
      console.log("❌ NO LOYALTY POINTS FOUND FOR THESE PAYMENTS!");
      console.log(
        "This is the problem - gift card payments didn't award loyalty points."
      );
    }
  }

  await prisma.$disconnect();
}

checkPoints().catch(console.error);

import prisma from "../src/config/db";

async function checkAllUserBookings() {
  const user = await prisma.user.findFirst({
    where: {
      firstName: "adan",
      lastName: "abdi",
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      loyaltyPoints: true,
    },
  });

  if (!user) {
    console.log("User not found");
    return;
  }

  console.log(`User: ${user.firstName} ${user.lastName}`);
  console.log(`Email: ${user.email}`);
  console.log(`Loyalty Points: ${user.loyaltyPoints}\n`);

  const bookings = await prisma.booking.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      bookingCode: true,
      totalAmount: true,
      status: true,
      createdAt: true,
      payment: {
        select: {
          transactionId: true,
          amount: true,
          provider: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`All Bookings (${bookings.length}):`);
  bookings.forEach((b, idx) => {
    console.log(
      `${idx + 1}. ${b.bookingCode} - ${b.totalAmount} KES - ${b.status}`
    );
    console.log(
      `   Created: ${b.createdAt.toISOString().split("T")[0]}, Payment: ${
        b.payment?.transactionId || "N/A"
      }`
    );
  });

  await prisma.$disconnect();
}

checkAllUserBookings().catch(console.error);

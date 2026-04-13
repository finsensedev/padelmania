/**
 * Query a specific user to check their loyalty points
 */

import prisma from "../src/config/db";

async function checkUser(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      bookings: {
        select: {
          id: true,
          bookingCode: true,
          totalAmount: true,
          status: true,
          createdAt: true,
          payment: {
            select: {
              id: true,
              amount: true,
              provider: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      loyaltyPointsLog: {
        select: {
          id: true,
          points: true,
          type: true,
          description: true,
          referenceId: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      },
      referralsMade: {
        select: {
          id: true,
          referralCode: true,
          status: true,
          pointsAwarded: true,
          referredUser: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      },
      referralsReceived: {
        select: {
          id: true,
          status: true,
          referrer: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      },
    },
  });

  if (!user) {
    console.log("❌ User not found");
    await prisma.$disconnect();
    return;
  }

  console.log("=" .repeat(80));
  console.log("USER INFORMATION");
  console.log("=".repeat(80));
  console.log(`Name: ${user.firstName} ${user.lastName}`);
  console.log(`Email: ${user.email}`);
  console.log(`User ID: ${user.id}`);
  console.log(`Registered: ${user.createdAt.toISOString().split("T")[0]}`);
  console.log(`Current Loyalty Points: ${user.loyaltyPoints}`);
  console.log();

  console.log("=" .repeat(80));
  console.log("BOOKINGS");
  console.log("=".repeat(80));
  if (user.bookings.length === 0) {
    console.log("No bookings found");
  } else {
    user.bookings.forEach((booking, idx) => {
      console.log(`\n${idx + 1}. ${booking.bookingCode}`);
      console.log(`   Status: ${booking.status}`);
      console.log(`   Amount: KES ${booking.totalAmount}`);
      console.log(`   Date: ${booking.createdAt.toISOString().split("T")[0]}`);
      if (booking.payment) {
        console.log(`   Payment: ${booking.payment.provider} - ${booking.payment.status}`);
        console.log(`   Payment ID: ${booking.payment.id}`);
      } else {
        console.log(`   Payment: None`);
      }
    });
  }
  console.log();

  console.log("=".repeat(80));
  console.log("LOYALTY POINTS LOG");
  console.log("=".repeat(80));
  if (user.loyaltyPointsLog.length === 0) {
    console.log("No loyalty point records found");
  } else {
    let runningTotal = 0;
    user.loyaltyPointsLog.forEach((log, idx) => {
      runningTotal += log.points;
      console.log(`\n${idx + 1}. ${log.type} - ${log.points > 0 ? "+" : ""}${log.points} points`);
      console.log(`   ${log.description}`);
      console.log(`   Date: ${log.createdAt.toISOString().split("T")[0]}`);
      console.log(`   Reference ID: ${log.referenceId || "N/A"}`);
      console.log(`   Running Total: ${runningTotal}`);
    });
    console.log(`\n   Final Total: ${runningTotal}`);
    console.log(`   User Balance: ${user.loyaltyPoints}`);
    if (runningTotal !== user.loyaltyPoints) {
      console.log(`   ⚠️  MISMATCH! Difference: ${runningTotal - user.loyaltyPoints}`);
    } else {
      console.log(`   ✅ Balance matches!`);
    }
  }
  console.log();

  console.log("=".repeat(80));
  console.log("REFERRALS");
  console.log("=".repeat(80));
  
  if (user.referralsReceived && user.referralsReceived.length > 0) {
    console.log("\n📥 Was Referred By:");
    const ref = user.referralsReceived[0];
    console.log(`   ${ref.referrer.firstName} ${ref.referrer.lastName}`);
    console.log(`   Email: ${ref.referrer.email}`);
    console.log(`   Status: ${ref.status}`);
  }
  
  if (user.referralsMade.length > 0) {
    console.log("\n📤 Referred Users:");
    user.referralsMade.forEach((ref: any, idx: number) => {
      console.log(`\n${idx + 1}. Code: ${ref.referralCode}`);
      console.log(`   Status: ${ref.status}`);
      console.log(`   Points Awarded: ${ref.pointsAwarded}`);
      if (ref.referredUser) {
        console.log(`   User: ${ref.referredUser.firstName} ${ref.referredUser.lastName}`);
        console.log(`   Email: ${ref.referredUser.email}`);
      }
    });
  }
  
  if (user.referralsReceived.length === 0 && user.referralsMade.length === 0) {
    console.log("No referral activity");
  }
  console.log();

  console.log("=".repeat(80));

  await prisma.$disconnect();
}

const email = process.argv[2];
if (!email) {
  console.error("Usage: npx ts-node scripts/check-user-details.ts <email>");
  process.exit(1);
}

checkUser(email).catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});

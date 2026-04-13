/**
 * Production Database Reset Script
 *
 * This script resets all tables EXCEPT users.
 * Use this before going live to clean up test data while preserving all user signups.
 *
 * ⚠️ WARNING: This will delete all data except users!
 *
 * Usage:
 *   npx ts-node scripts/reset-for-production.ts
 *
 * With confirmation bypass (dangerous):
 *   npx ts-node scripts/reset-for-production.ts --yes
 */

import { PrismaClient } from "@prisma/client";
import * as readline from "readline";

const prisma = new PrismaClient();

// Configuration
const DRY_RUN = process.argv.includes("--dry-run");
const AUTO_CONFIRM = process.argv.includes("--yes");

interface ResetStats {
  usersPreserved: number;
  recordsDeleted: Record<string, number>;
}

async function getUserInput(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function confirmReset(): Promise<boolean> {
  if (AUTO_CONFIRM) {
    console.log(
      "⚠️  Auto-confirm enabled. Proceeding without confirmation...\n"
    );
    return true;
  }

  console.log("\n⚠️  WARNING: This will delete all data except users!");
  console.log("📋 The following will happen:");
  console.log("   ✅ PRESERVE: All users (both verified and unverified)");
  console.log("   ❌ DELETE: All bookings, payments, courts, equipment, etc.");
  console.log("   ❌ DELETE: All audit logs, notifications, reviews, etc.");
  console.log(
    "   🔄 RESET: User activity data (loyalty points, login history)\n"
  );

  const answer = await getUserInput(
    'Type "DELETE ALL TEST DATA" (in caps) to confirm: '
  );

  return answer === "DELETE ALL TEST DATA";
}

async function getTableCounts() {
  console.log("📊 Current database state:\n");

  const counts = {
    users: await prisma.user.count(),
    bookings: await prisma.booking.count(),
    payments: await prisma.payment.count(),
    courts: await prisma.court.count(),
    equipment: await prisma.equipment.count(),
    giftCards: await prisma.giftCard.count(),
    reviews: await prisma.review.count(),
    notifications: await prisma.notification.count(),
    auditLogs: await prisma.auditLog.count(),
    refreshTokens: await prisma.refreshToken.count(),
    passwordResets: await prisma.passwordReset.count(),
  };

  console.log(`  Total Users: ${counts.users}`);
  console.log(`  Bookings: ${counts.bookings}`);
  console.log(`  Payments: ${counts.payments}`);
  console.log(`  Courts: ${counts.courts}`);
  console.log(`  Equipment: ${counts.equipment}`);
  console.log(`  Gift Cards: ${counts.giftCards}`);
  console.log(`  Reviews: ${counts.reviews}`);
  console.log(`  Notifications: ${counts.notifications}`);
  console.log(`  Audit Logs: ${counts.auditLogs}`);
  console.log(`  Refresh Tokens: ${counts.refreshTokens}`);
  console.log(`  Password Resets: ${counts.passwordResets}\n`);

  return counts;
}

async function resetDatabase(): Promise<ResetStats> {
  const stats: ResetStats = {
    usersPreserved: 0,
    recordsDeleted: {},
  };

  console.log("🚀 Starting database reset...\n");

  // Step 1: Get all user IDs to preserve
  console.log("1️⃣  Identifying users to preserve...");
  const allUsers = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      emailVerified: true,
    },
  });

  stats.usersPreserved = allUsers.length;
  console.log(`   ✅ Found ${stats.usersPreserved} users to preserve`);

  if (stats.usersPreserved > 0) {
    console.log("\n   Users that will be preserved:");
    allUsers.forEach((user) => {
      const status = user.emailVerified ? "✓ verified" : "○ unverified";
      console.log(
        `      - ${user.email} (${user.firstName} ${user.lastName}) [${status}]`
      );
    });
  }

  const userIds = allUsers.map((u) => u.id);

  if (DRY_RUN) {
    console.log("\n🔍 DRY RUN MODE - No data will be deleted\n");
    return stats;
  }

  // Step 2: Delete records in the correct order (respecting foreign key constraints)

  console.log("\n2️⃣  Deleting dependent records...");

  // Delete audit logs
  console.log("   Deleting audit logs...");
  const auditLogs = await prisma.auditLog.deleteMany({});
  stats.recordsDeleted.auditLogs = auditLogs.count;
  console.log(`   ✅ Deleted ${auditLogs.count} audit logs`);

  // Delete notifications
  console.log("   Deleting notifications...");
  const notifications = await prisma.notification.deleteMany({});
  stats.recordsDeleted.notifications = notifications.count;
  console.log(`   ✅ Deleted ${notifications.count} notifications`);

  // Delete activity reads
  console.log("   Deleting activity reads...");
  const activityReads = await prisma.activityRead.deleteMany({});
  stats.recordsDeleted.activityReads = activityReads.count;
  console.log(`   ✅ Deleted ${activityReads.count} activity reads`);

  // Delete reviews
  console.log("   Deleting reviews...");
  const reviews = await prisma.review.deleteMany({});
  stats.recordsDeleted.reviews = reviews.count;
  console.log(`   ✅ Deleted ${reviews.count} reviews`);

  // Delete gift card ledgers first (foreign key to gift cards)
  console.log("   Deleting gift card ledgers...");
  const giftCardLedgers = await prisma.giftCardLedger.deleteMany({});
  stats.recordsDeleted.giftCardLedgers = giftCardLedgers.count;
  console.log(`   ✅ Deleted ${giftCardLedgers.count} gift card ledgers`);

  // Delete gift cards
  console.log("   Deleting gift cards...");
  const giftCards = await prisma.giftCard.deleteMany({});
  stats.recordsDeleted.giftCards = giftCards.count;
  console.log(`   ✅ Deleted ${giftCards.count} gift cards`);

  // Delete loyalty points
  console.log("   Deleting loyalty points...");
  const loyaltyPoints = await prisma.loyaltyPoint.deleteMany({});
  stats.recordsDeleted.loyaltyPoints = loyaltyPoints.count;
  console.log(`   ✅ Deleted ${loyaltyPoints.count} loyalty points`);

  // Delete equipment rentals
  console.log("   Deleting equipment rentals...");
  const equipmentRentals = await prisma.equipmentRental.deleteMany({});
  stats.recordsDeleted.equipmentRentals = equipmentRentals.count;
  console.log(`   ✅ Deleted ${equipmentRentals.count} equipment rentals`);

  // Delete payments
  console.log("   Deleting payments...");
  const payments = await prisma.payment.deleteMany({});
  stats.recordsDeleted.payments = payments.count;
  console.log(`   ✅ Deleted ${payments.count} payments`);

  // Delete bookings
  console.log("   Deleting bookings...");
  const bookings = await prisma.booking.deleteMany({});
  stats.recordsDeleted.bookings = bookings.count;
  console.log(`   ✅ Deleted ${bookings.count} bookings`);

  // Delete maintenance records
  console.log("   Deleting maintenance records...");
  const maintenances = await prisma.maintenance.deleteMany({});
  stats.recordsDeleted.maintenances = maintenances.count;
  console.log(`   ✅ Deleted ${maintenances.count} maintenance records`);

  // Delete maintenance logs
  console.log("   Deleting maintenance logs...");
  const maintenanceLogs = await prisma.maintenanceLog.deleteMany({});
  stats.recordsDeleted.maintenanceLogs = maintenanceLogs.count;
  console.log(`   ✅ Deleted ${maintenanceLogs.count} maintenance logs`);

  // Delete pricing rules
  console.log("   Deleting pricing rules...");
  const pricingRules = await prisma.pricingRule.deleteMany({});
  stats.recordsDeleted.pricingRules = pricingRules.count;
  console.log(`   ✅ Deleted ${pricingRules.count} pricing rules`);

  // Delete court schedules
  console.log("   Deleting court schedules...");
  const courtSchedules = await prisma.courtSchedule.deleteMany({});
  stats.recordsDeleted.courtSchedules = courtSchedules.count;
  console.log(`   ✅ Deleted ${courtSchedules.count} court schedules`);

  // Delete courts
  console.log("   Deleting courts...");
  const courts = await prisma.court.deleteMany({});
  stats.recordsDeleted.courts = courts.count;
  console.log(`   ✅ Deleted ${courts.count} courts`);

  // Delete equipment
  console.log("   Deleting equipment...");
  const equipment = await prisma.equipment.deleteMany({});
  stats.recordsDeleted.equipment = equipment.count;
  console.log(`   ✅ Deleted ${equipment.count} equipment items`);

  // Step 3: Clean up user-related data
  console.log("\n3️⃣  Cleaning up user data...");

  // Delete membership cards for all users (they'll need to purchase new ones)
  console.log("   Deleting all membership cards...");
  const membershipCards = await prisma.membershipCard.deleteMany({});
  stats.recordsDeleted.membershipCards = membershipCards.count;
  console.log(`   ✅ Deleted ${membershipCards.count} membership cards`);

  // Delete all refresh tokens (users will need to login again)
  console.log("   Deleting all refresh tokens...");
  const refreshTokens = await prisma.refreshToken.deleteMany({});
  stats.recordsDeleted.refreshTokens = refreshTokens.count;
  console.log(`   ✅ Deleted ${refreshTokens.count} refresh tokens`);

  // Delete all password resets
  console.log("   Deleting all password resets...");
  const passwordResets = await prisma.passwordReset.deleteMany({});
  stats.recordsDeleted.passwordResets = passwordResets.count;
  console.log(`   ✅ Deleted ${passwordResets.count} password resets`);

  // Step 4: Reset user activity data
  console.log("\n4️⃣  Resetting user activity data...");

  const usersUpdated = await prisma.user.updateMany({
    data: {
      loyaltyPoints: 0,
      failedLoginAttempts: 0,
      accountLockedUntil: null,
      lastLogin: null,
    },
  });
  console.log(`   ✅ Reset activity data for ${usersUpdated.count} users`);

  return stats;
}

async function main() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║       PRODUCTION DATABASE RESET SCRIPT                    ║");
  console.log("║       Preserve All Users                                  ║");
  console.log(
    "╚════════════════════════════════════════════════════════════╝\n"
  );

  if (DRY_RUN) {
    console.log("🔍 Running in DRY RUN mode - no data will be deleted\n");
  }

  try {
    // Show current state
    await getTableCounts();

    // Get confirmation
    const confirmed = await confirmReset();

    if (!confirmed) {
      console.log("\n❌ Reset cancelled by user.\n");
      process.exit(0);
    }

    console.log("\n✅ Confirmation received. Starting reset...\n");

    // Perform reset
    const stats = await resetDatabase();

    // Show results
    console.log(
      "\n╔════════════════════════════════════════════════════════════╗"
    );
    console.log(
      "║                    RESET COMPLETE                         ║"
    );
    console.log(
      "╚════════════════════════════════════════════════════════════╝\n"
    );

    console.log("📊 Summary:\n");
    console.log(`  Users:`);
    console.log(
      `    ✅ Preserved: ${stats.usersPreserved} users (all users kept)\n`
    );

    console.log(`  Records deleted:`);
    Object.entries(stats.recordsDeleted).forEach(([table, count]) => {
      console.log(`    - ${table}: ${count}`);
    });

    console.log("\n✅ Database is now ready for production launch!");
    console.log("💡 Next steps:");
    console.log("   1. Set up production courts and pricing");
    console.log("   2. Configure equipment inventory");
    console.log("   3. Set up system settings");
    console.log("   4. Test booking flow with a test user");
    console.log("   5. Announce the launch! 🚀\n");
  } catch (error) {
    console.error("\n❌ Error during reset:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

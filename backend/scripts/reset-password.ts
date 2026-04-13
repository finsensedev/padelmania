import bcrypt from "bcryptjs";
import prisma from "../src/config/db";
import { createInterface } from "readline/promises";
import { stdin as input, stdout as output } from "node:process";

/**
 * Script to reset a user's password
 * Usage: yarn ts-node scripts/reset-password.ts [email] [newPassword]
 *
 * If email and password are not provided as arguments, the script will prompt for them.
 *
 * Examples:
 *   yarn ts-node scripts/reset-password.ts
 *   yarn ts-node scripts/reset-password.ts user@example.com newPassword123
 */

async function main() {
  const args = process.argv.slice(2);
  let email = args[0];
  let newPassword = args[1];

  // If arguments are not provided, prompt for them
  if (!email || !newPassword) {
    const rl = createInterface({ input, output });

    try {
      if (!email) {
        email = await rl.question("Enter user email: ");
        email = email.trim();
      }

      if (!newPassword) {
        newPassword = await rl.question("Enter new password: ");
        newPassword = newPassword.trim();
      }
    } finally {
      rl.close();
    }
  }

  // Validate inputs
  if (!email || !newPassword) {
    console.error("❌ Error: Email and password are required");
    console.log("\nUsage:");
    console.log(
      "  yarn ts-node scripts/reset-password.ts [email] [newPassword]"
    );
    console.log("\nExamples:");
    console.log("  yarn ts-node scripts/reset-password.ts");
    console.log(
      "  yarn ts-node scripts/reset-password.ts user@example.com newPassword123"
    );
    process.exit(1);
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    console.error("❌ Error: Invalid email format");
    process.exit(1);
  }

  // Password strength validation
  if (newPassword.length < 8) {
    console.error("❌ Error: Password must be at least 8 characters long");
    process.exit(1);
  }

  try {
    console.log(`\n🔍 Looking up user: ${email}...`);

    // Find the user
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        isDeleted: true,
      },
    });

    if (!user) {
      console.error(`❌ Error: User with email ${email} not found`);
      process.exit(1);
    }

    if (user.isDeleted) {
      console.error(`❌ Error: User account is deleted and cannot be modified`);
      process.exit(1);
    }

    if (!user.isActive) {
      console.warn(`⚠️  Warning: User account is inactive`);
    }

    console.log(`\n👤 User found:`);
    console.log(`   Name: ${user.firstName} ${user.lastName}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Status: ${user.isActive ? "Active" : "Inactive"}`);

    // Hash the new password
    console.log(`\n🔐 Hashing new password...`);
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update password and invalidate all refresh tokens
    console.log(`💾 Updating password and invalidating all sessions...`);

    await prisma.$transaction([
      // Update the password
      prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          resetToken: null,
          resetTokenExpiry: null,
          // Reset failed login attempts
          failedLoginAttempts: 0,
          accountLockedUntil: null,
        },
      }),
      // Invalidate all password reset tokens
      prisma.passwordReset.updateMany({
        where: {
          userId: user.id,
          used: false,
        },
        data: {
          used: true,
          usedAt: new Date(),
        },
      }),
      // Delete all refresh tokens (logout from all devices)
      prisma.refreshToken.deleteMany({
        where: { userId: user.id },
      }),
    ]);

    console.log(`\n✅ Password reset successfully!`);
    console.log(`   • Password has been updated`);
    console.log(`   • All active sessions have been terminated`);
    console.log(`   • All password reset tokens have been invalidated`);
    console.log(`   • Account lockout has been cleared`);
    console.log(`\n👉 The user can now login with the new password`);
  } catch (error) {
    console.error("\n❌ Failed to reset password:", error);
    process.exit(1);
  }
}

main()
  .catch((error) => {
    console.error("❌ Unexpected error:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

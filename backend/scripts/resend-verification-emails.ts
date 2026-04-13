/**
 * Resend Verification Emails Script
 *
 * This script sends verification emails to all users who have not yet verified their email.
 * It's designed for users who couldn't receive verification emails due to email delivery issues.
 *
 * Usage:
 *   npx ts-node -r dotenv/config scripts/resend-verification-emails.ts           (DRY RUN - default)
 *   npx ts-node -r dotenv/config scripts/resend-verification-emails.ts --execute (ACTUALLY SEND)
 *   npx ts-node -r dotenv/config scripts/resend-verification-emails.ts --sample  (GENERATE SAMPLE HTML)
 *
 * Optional flags:
 *   --execute    Actually send emails (without this, runs in dry-run mode)
 *   --limit=N    Only process N users (useful for testing)
 *   --sample     Generate a sample verification email HTML file for testing
 */

import dotenv from "dotenv";
import path from "path";
import crypto from "crypto";
import fs from "fs";

// Load environment variables BEFORE importing dependencies
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// Import after env vars are loaded
import { PrismaClient } from "@prisma/client";
import { sendMail, buildVerificationEmail } from "../src/utils/mailer";

const prisma = new PrismaClient();

// Parse command line arguments
const args = process.argv.slice(2);
const shouldExecute = args.includes("--execute");
const shouldGenerateSample = args.includes("--sample");
const isDryRun = !shouldExecute; // Dry run by default unless --execute is passed
const limitArg = args.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined;

const APP_URL = process.env.APP_URL || "https://tudorpadel.com";
const VERIFICATION_TOKEN_EXPIRY_MINUTES = 30; // 30 minutes

interface EmailResult {
  email: string;
  firstName: string;
  success: boolean;
  error?: string;
}

/**
 * Generate a sample verification email HTML file for testing/preview
 */
async function generateSampleEmail(): Promise<void> {
  console.log("\n" + "=".repeat(70));
  console.log("📧 GENERATING SAMPLE VERIFICATION EMAIL");
  console.log("=".repeat(70) + "\n");

  const sampleToken = "sample_verification_token_12345";
  const sampleVerifyUrl = `${APP_URL}/verify-email?token=${sampleToken}`;
  const sampleFirstName = "John";

  const { subject, html } = buildVerificationEmail(
    sampleVerifyUrl,
    sampleFirstName
  );

  // Save to file
  const outputPath = path.resolve(
    __dirname,
    "../sample-verification-email.html"
  );
  fs.writeFileSync(outputPath, html, "utf-8");

  console.log(`✅ Sample email generated successfully!`);
  console.log(`📄 Subject: ${subject}`);
  console.log(`📁 File saved to: ${outputPath}`);
  console.log(
    `\n💡 Open the HTML file in your browser to preview the email.\n`
  );
}

async function main() {
  // Handle sample generation mode
  if (shouldGenerateSample) {
    await generateSampleEmail();
    return;
  }
  console.log("\n" + "=".repeat(70));
  console.log("📧 RESEND VERIFICATION EMAILS SCRIPT");
  console.log("=".repeat(70));
  console.log(
    `Mode: ${
      isDryRun ? "🔍 DRY RUN (no emails will be sent)" : "🚀 LIVE EXECUTION"
    }`
  );
  if (limit) {
    console.log(`Limit: Processing only ${limit} users`);
  }
  if (isDryRun) {
    console.log("\n⚠️  To actually send emails, add --execute flag");
  }
  console.log("=".repeat(70) + "\n");

  try {
    // Fetch all users who haven't verified their email
    const unverifiedUsers = await prisma.user.findMany({
      where: {
        emailVerified: false,
        isActive: true,
        isDeleted: false,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        verificationToken: true,
        verificationTokenExpiresAt: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc", // Most recent first
      },
      take: limit,
    });

    if (unverifiedUsers.length === 0) {
      console.log("✅ No unverified users found. All users are verified!");
      return;
    }

    console.log(`📊 Found ${unverifiedUsers.length} unverified user(s)\n`);

    const results: EmailResult[] = [];
    let sentCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const [index, user] of unverifiedUsers.entries()) {
      const userNum = `[${index + 1}/${unverifiedUsers.length}]`;
      console.log(
        `${userNum} Processing: ${user.firstName} ${user.lastName} (${user.email})`
      );

      try {
        if (isDryRun) {
          console.log(
            `  ↳ [DRY RUN] Would send verification email to ${user.email}`
          );
          results.push({
            email: user.email,
            firstName: user.firstName,
            success: true,
          });
          skippedCount++;
          continue;
        }

        // Generate new verification token
        const verificationToken = crypto.randomBytes(32).toString("hex");
        const verificationTokenExpiresAt = new Date(
          Date.now() + VERIFICATION_TOKEN_EXPIRY_MINUTES * 60 * 1000
        );

        // Update user with new token
        await prisma.user.update({
          where: { id: user.id },
          data: {
            verificationToken,
            verificationTokenExpiresAt,
          },
        });

        // Build verification URL
        const verifyUrl = `${APP_URL}/verify-email?token=${verificationToken}`;

        // Build and send email
        const { subject, html } = buildVerificationEmail(
          verifyUrl,
          user.firstName
        );

        await sendMail({
          to: user.email,
          subject,
          html,
          fromName: "Tudor Padel",
        });

        console.log(`  ↳ ✅ Verification email sent successfully`);
        results.push({
          email: user.email,
          firstName: user.firstName,
          success: true,
        });
        sentCount++;

        // Small delay to avoid rate limiting (100ms between emails)
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.log(`  ↳ ❌ Failed to send email: ${errorMessage}`);
        results.push({
          email: user.email,
          firstName: user.firstName,
          success: false,
          error: errorMessage,
        });
        errorCount++;
      }

      console.log(""); // Empty line for readability
    }

    // Print summary
    console.log("\n" + "=".repeat(70));
    console.log("📊 SUMMARY");
    console.log("=".repeat(70));
    console.log(`Total users processed: ${unverifiedUsers.length}`);

    if (isDryRun) {
      console.log(`Would send emails: ${skippedCount}`);
    } else {
      console.log(`✅ Successfully sent: ${sentCount}`);
      console.log(`❌ Failed: ${errorCount}`);
    }

    console.log("=".repeat(70));

    // Print failed emails if any
    if (errorCount > 0 && !isDryRun) {
      console.log("\n❌ FAILED EMAILS:");
      console.log("-".repeat(70));
      results
        .filter((r) => !r.success)
        .forEach((r) => {
          console.log(`• ${r.email} (${r.firstName})`);
          console.log(`  Error: ${r.error}`);
        });
      console.log("-".repeat(70));
    }

    // Success report
    if (sentCount > 0 && !isDryRun) {
      console.log("\n✅ SUCCESSFULLY SENT:");
      console.log("-".repeat(70));
      results
        .filter((r) => r.success)
        .forEach((r) => {
          console.log(`• ${r.email} (${r.firstName})`);
        });
      console.log("-".repeat(70));
    }

    console.log("\n✨ Script completed successfully!\n");

    if (isDryRun) {
      console.log("💡 To actually send the emails, run with --execute flag:\n");
      console.log(
        "   npx ts-node -r dotenv/config scripts/resend-verification-emails.ts --execute\n"
      );
    }
  } catch (error) {
    console.error("\n❌ Script failed with error:", error);
    throw error;
  }
}

main()
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

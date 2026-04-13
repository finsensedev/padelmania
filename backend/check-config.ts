// Configuration Check Script
// Run with: ts-node check-config.ts

require("dotenv").config();
import { PrismaClient } from "@prisma/client";

const requiredEnvVars = [
  "DATABASE_URL",
  "JWT_SECRET",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "MAIL_FROM",
  "APP_URL",
];

const optionalEnvVars = [
  "MPESA_CONSUMER_KEY",
  "MPESA_CONSUMER_SECRET",
  "MPESA_SHORTCODE",
  "MPESA_PASSKEY",
  "MPESA_CALLBACK_URL_BASE",
  "MPESA_B2C_INITIATOR",
  "MPESA_B2C_CREDENTIAL",
];

async function checkConfiguration() {
  console.log("🔍 Tudor Padel Backend Configuration Check\n");
  console.log("=" .repeat(60));

  // 1. Check Required Environment Variables
  console.log("\n1️⃣  REQUIRED ENVIRONMENT VARIABLES:");
  let missingRequired = 0;
  requiredEnvVars.forEach((varName) => {
    const value = process.env[varName];
    if (!value) {
      console.log(`   ❌ ${varName}: MISSING`);
      missingRequired++;
    } else {
      // Mask sensitive values
      const displayValue = varName.includes("SECRET") || varName.includes("PASS")
        ? "***" + value.slice(-4)
        : varName === "DATABASE_URL"
        ? value.split("@")[1] || "configured"
        : value.slice(0, 30);
      console.log(`   ✅ ${varName}: ${displayValue}`);
    }
  });

  // 2. Check Optional Environment Variables
  console.log("\n2️⃣  OPTIONAL ENVIRONMENT VARIABLES (M-Pesa):");
  optionalEnvVars.forEach((varName) => {
    const value = process.env[varName];
    if (!value) {
      console.log(`   ⚠️  ${varName}: Not configured`);
    } else {
      const displayValue = varName.includes("SECRET") || varName.includes("CREDENTIAL")
        ? "***" + value.slice(-4)
        : value.slice(0, 30);
      console.log(`   ✅ ${varName}: ${displayValue}`);
    }
  });

  // 3. Test Database Connection
  console.log("\n3️⃣  DATABASE CONNECTION:");
  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    console.log("   ✅ Database connection successful");

    // Get basic stats
    const userCount = await prisma.user.count();
    const courtCount = await prisma.court.count();
    const bookingCount = await prisma.booking.count();

    console.log(`   📊 Users: ${userCount}`);
    console.log(`   📊 Courts: ${courtCount}`);
    console.log(`   📊 Bookings: ${bookingCount}`);
  } catch (error: any) {
    console.log("   ❌ Database connection failed:");
    console.log(`      Error: ${error.message}`);
  } finally {
    await prisma.$disconnect();
  }

  // 4. Check TypeScript Compilation
  console.log("\n4️⃣  TYPESCRIPT CONFIGURATION:");
  try {
    const tsconfig = require("./tsconfig.json");
    console.log("   ✅ tsconfig.json is valid");
    console.log(`   📝 Target: ${tsconfig.compilerOptions.target}`);
    console.log(`   📝 Module: ${tsconfig.compilerOptions.module}`);
    console.log(`   📝 Output: ${tsconfig.compilerOptions.outDir}`);
  } catch (error: any) {
    console.log("   ❌ tsconfig.json error:", error.message);
  }

  // 5. Check Package Dependencies
  console.log("\n5️⃣  KEY DEPENDENCIES:");
  try {
    const pkg = require("./package.json");
    const keyDeps = [
      "express",
      "@prisma/client",
      "jsonwebtoken",
      "socket.io",
      "node-cache",
      "axios",
    ];

    keyDeps.forEach((dep) => {
      const version = pkg.dependencies[dep];
      if (version) {
        console.log(`   ✅ ${dep}: ${version}`);
      } else {
        console.log(`   ❌ ${dep}: NOT INSTALLED`);
      }
    });
  } catch (error: any) {
    console.log("   ❌ package.json error:", error.message);
  }

  // 6. Check Port Configuration
  console.log("\n6️⃣  SERVER CONFIGURATION:");
  const port = process.env.PORT || 8070;
  const host = process.env.BACKEND_URL_HOST || "localhost";
  console.log(`   🌐 Server will run at: http://${host}:${port}`);

  // Summary
  console.log("\n" + "=".repeat(60));
  if (missingRequired > 0) {
    console.log(`\n❌ CONFIGURATION INCOMPLETE`);
    console.log(`   Missing ${missingRequired} required environment variable(s)`);
    console.log(`   Please check your .env file\n`);
    process.exit(1);
  } else {
    console.log(`\n✅ CONFIGURATION VALID`);
    console.log(`   All required settings are configured`);
    console.log(`   Ready to start the server!\n`);
  }
}

checkConfiguration().catch((error) => {
  console.error("\n❌ Configuration check failed:", error);
  process.exit(1);
});

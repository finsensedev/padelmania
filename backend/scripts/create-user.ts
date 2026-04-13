import bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";
import prisma from "../src/config/db";
import { createInterface } from "readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Writable } from "node:stream";

class MutableStdout extends Writable {
  private muted = false;

  setMuted(value: boolean) {
    this.muted = value;
  }

  _write(
    chunk: Buffer | string,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ) {
    if (!this.muted) {
      output.write(chunk, encoding);
    }
    callback();
  }
}

async function main() {
  const mutableStdout = new MutableStdout();
  const rl = createInterface({ input, output: mutableStdout });

  const ask = async (
    question: string,
    {
      required = false,
      hidden = false,
      defaultValue,
    }: {
      required?: boolean;
      hidden?: boolean;
      defaultValue?: string;
    } = {}
  ): Promise<string> => {
    const prompt = defaultValue
      ? `${question} (${defaultValue}): `
      : `${question}: `;

    if (hidden) {
      mutableStdout.setMuted(true);
    }

    const answer = (await rl.question(prompt)).trim();

    if (hidden) {
      mutableStdout.setMuted(false);
      output.write("\n");
    }

    if (!answer && defaultValue) {
      return defaultValue;
    }

    if (required && !answer) {
      console.log("This field is required. Please provide a value.");
      return ask(question, { required, hidden, defaultValue });
    }

    return answer;
  };

  try {
    console.log("[User Creation] Provide details to create a new user.");
    const email = await ask("Email", { required: true });
    const password = await ask("Password", { required: true, hidden: true });
    const firstName = await ask("First name", { required: true });
    const lastName = await ask("Last name", { required: true });
    const phone = await ask("Phone (optional)");

    // Role selection
    console.log("\nAvailable roles:");
    console.log("1. CUSTOMER");
    console.log("2. BOOKING_OFFICER");
    console.log("3. FINANCE_OFFICER");
    console.log("4. MANAGER");
    console.log("5. ADMIN");
    console.log("6. SUPER_ADMIN");
    
    const roleChoice = await ask("Select role (1-6)", { 
      required: true,
      defaultValue: "6" 
    });
    
    const roleMap: Record<string, UserRole> = {
      "1": UserRole.CUSTOMER,
      "2": UserRole.BOOKING_OFFICER,
      "3": UserRole.FINANCE_OFFICER,
      "4": UserRole.MANAGER,
      "5": UserRole.ADMIN,
      "6": UserRole.SUPER_ADMIN,
    };
    
    const selectedRole = roleMap[roleChoice];
    
    if (!selectedRole) {
      console.log("Invalid role selection. Defaulting to SUPER_ADMIN.");
    }
    
    const role = selectedRole || UserRole.SUPER_ADMIN;
    
    const totpIssuer = await ask("TOTP issuer", {
      defaultValue: "Padel Mania",
    });
    const totpSecretRaw = await ask("2FA secret (Base32, optional)");
    const totpSecret = totpSecretRaw ? totpSecretRaw : undefined;

    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (existingUser) {
      console.log(
        `[User Creation] A user with email ${email} already exists (role: ${existingUser.role}). Skipping creation.`
      );
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const createdUser = await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
        role,
        emailVerified: true,
        phoneVerified: Boolean(phone),
        loyaltyPoints: 0,
        twoFactorEnabled: Boolean(totpSecret),
        twoFactorSecret: totpSecret ?? null,
        ...(phone ? { phone } : {}),
      },
    });

    console.log(
      `[User Creation] User ${createdUser.email} created successfully with role: ${createdUser.role}`
    );

    if (totpSecret) {
      const label = encodeURIComponent(`${totpIssuer}:${createdUser.email}`);
      const issuer = encodeURIComponent(totpIssuer);
      const otpauth = `otpauth://totp/${label}?secret=${totpSecret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
      console.log(
        "[User Creation] 2FA has been pre-enabled using the provided secret."
      );
      console.log("[User Creation] Add this to your authenticator app:", otpauth);
    } else {
      console.log(
        "[User Creation] 2FA is not pre-enabled. Re-run the script with a 2FA secret if you want to enforce it."
      );
    }
  } finally {
    rl.close();
  }
}

main()
  .catch((error) => {
    console.error("[User Creation] Failed to create user:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

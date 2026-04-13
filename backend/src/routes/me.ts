import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware";
import prisma from "../config/db";
import { generateBase32Secret } from "../utils/otp";
import { verifyTotp } from "../utils/otp";
import { logAudit } from "../utils/audit";
import { sendMail, buildTwoFactorSetupEmail } from "../utils/mailer";

const router = Router();

// GET /api/user/profile - return current authenticated user's profile
router.get("/profile", authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        isActive: true,
        twoFactorEnabled: true,
        emailVerified: true,
        phoneVerified: true,
        loyaltyPoints: true,
        membershipCard: {
          select: {
            id: true,
            tier: true,
            cardNumber: true,
            isActive: true,
            validFrom: true,
            validUntil: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json(user);
  } catch (error) {
    console.error("Error fetching profile:", error);
    return res.status(500).json({ message: "Failed to fetch profile" });
  }
});

// 2FA: begin setup (returns base32 secret)
router.post("/2fa/setup", authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const secret = generateBase32Secret();
    const user = await prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret as any },
      select: { id: true, email: true, firstName: true },
    });
    // Email the secret to the user instead of returning it
    try {
      const { subject, html } = buildTwoFactorSetupEmail(secret, {
        email: user.email,
        firstName: user.firstName || undefined,
      });
      await sendMail({ to: user.email, subject, html });
    } catch (mailErr) {
      console.error("2FA setup email error", mailErr);
      // If email fails, still keep the secret stored but inform client
      return res.status(200).json({
        message: "2FA setup started. Please check your email for instructions.",
      });
    }
    return res.status(200).json({
      message: "2FA setup started. Please check your email for instructions.",
    });
  } catch (e) {
    console.error("2FA setup error", e);
    return res.status(500).json({ message: "Failed to start 2FA setup" });
  }
});

// 2FA: confirm and enable
router.post("/2fa/enable", authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { code } = req.body as { code: string };
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.twoFactorSecret)
      return res.status(400).json({ message: "2FA setup not started" });
    const ok = verifyTotp(user.twoFactorSecret as any, code, 1);
    if (!ok) return res.status(400).json({ message: "Invalid code" });
    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true as any },
    });
    await logAudit(req as any, "2FA_ENABLE", "User", userId);
    return res.status(200).json({ enabled: true });
  } catch (e) {
    console.error("2FA enable error", e);
    return res.status(500).json({ message: "Failed to enable 2FA" });
  }
});

// 2FA: disable
router.post("/2fa/disable", authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { code } = req.body as { code?: string };

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!user.twoFactorEnabled)
      return res.status(400).json({ message: "2FA not enabled" });
    if (!user.twoFactorSecret)
      return res
        .status(400)
        .json({ message: "2FA secret missing; cannot verify code" });
    if (!code || code.trim().length < 6)
      return res.status(400).json({ message: "Current 2FA code required" });

    const valid = verifyTotp(user.twoFactorSecret as any, code.trim(), 1);
    if (!valid) return res.status(400).json({ message: "Invalid 2FA code" });

    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false as any, twoFactorSecret: null as any },
    });
    await logAudit(req as any, "2FA_DISABLE", "User", userId);
    return res.status(200).json({ enabled: false });
  } catch (e) {
    console.error("2FA disable error", e);
    return res.status(500).json({ message: "Failed to disable 2FA" });
  }
});

export default router;

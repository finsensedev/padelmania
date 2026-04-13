import { Request, Response } from "express";
import type { CookieOptions } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Secret, SignOptions } from "jsonwebtoken";
import crypto from "crypto";
import { Prisma } from "@prisma/client";
import prisma from "../config/db";
import { generateRegistrationNumber } from "../utils/helpers";
import { addMonths, addYears } from "date-fns";

import {
  buildVerificationEmail,
  buildWelcomeEmail,
  buildPasswordResetEmail,
  sendMail,
} from "../utils/mailer";
import { createPendingReferral } from "../services/referral.service";
import { verifyTotp } from "../utils/otp";
import { issueTwoFASession } from "../utils/twofaSession";

const parsePositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isNaN(parsed) || parsed <= 0 ? fallback : parsed;
};

const MAX_FAILED_LOGIN_ATTEMPTS = parsePositiveInt(
  process.env.MAX_FAILED_LOGIN_ATTEMPTS,
  5,
);

const ACCOUNT_LOCK_DURATION_MINUTES = parsePositiveInt(
  process.env.ACCOUNT_LOCK_DURATION_MINUTES,
  15,
);

const buildLockoutMessage = (minutes: number) =>
  `Account locked due to multiple failed attempts. Try again in ${minutes} minute${
    minutes === 1 ? "" : "s"
  }.`;

const isProduction = process.env.NODE_ENV === "production";
const secureCookies =
  isProduction || process.env.FORCE_SECURE_COOKIES === "true";
export const ACCESS_COOKIE_NAME =
  process.env.ACCESS_TOKEN_COOKIE_NAME ||
  (isProduction ? "__Host-session" : "accessToken");
const ACCESS_COOKIE_PATH = process.env.ACCESS_TOKEN_COOKIE_PATH || "/";
const REFRESH_COOKIE_NAME =
  process.env.REFRESH_TOKEN_COOKIE_NAME || "refreshToken";
const REFRESH_COOKIE_PATH =
  process.env.REFRESH_TOKEN_COOKIE_PATH || "/api/auth/refresh";
const REFRESH_TOKEN_TTL_DAYS = parsePositiveInt(
  process.env.REFRESH_TOKEN_TTL_DAYS,
  7,
);
const REFRESH_TOKEN_TTL_DAYS_MOBILE = parsePositiveInt(
  process.env.REFRESH_TOKEN_TTL_DAYS_MOBILE,
  365, // 1 year for mobile clients
);
const REFRESH_TOKEN_MAX_AGE_MS = REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
const REFRESH_TOKEN_MAX_AGE_MS_MOBILE =
  REFRESH_TOKEN_TTL_DAYS_MOBILE * 24 * 60 * 60 * 1000;
const REFRESH_TOKEN_EXPIRY: SignOptions["expiresIn"] = `${REFRESH_TOKEN_TTL_DAYS}d`;
const REFRESH_TOKEN_EXPIRY_MOBILE: SignOptions["expiresIn"] = `${REFRESH_TOKEN_TTL_DAYS_MOBILE}d`;

// Helper to detect mobile clients
const isMobileClient = (req: Request): boolean => {
  return req.headers["x-client-type"] === "mobile";
};
const ACCESS_TOKEN_EXPIRY: SignOptions["expiresIn"] =
  (process.env.ACCESS_TOKEN_EXPIRY as SignOptions["expiresIn"]) || "15m";
const ACCESS_TOKEN_TTL_MINUTES = parsePositiveInt(
  process.env.ACCESS_TOKEN_TTL_MINUTES,
  15,
);
const ACCESS_TOKEN_MAX_AGE_MS = ACCESS_TOKEN_TTL_MINUTES * 60 * 1000;

const buildCookieOptions = (
  maxAge?: number,
  overrides: Partial<CookieOptions> = {},
  includeDomain: boolean = true,
): CookieOptions => {
  const options: CookieOptions = {
    httpOnly: true,
    secure: secureCookies,
    sameSite: isProduction ? "strict" : "lax",
    path: "/",
    ...overrides,
  };

  if (typeof maxAge === "number") {
    options.maxAge = maxAge;
  }

  const cookieDomain = process.env.COOKIE_DOMAIN;
  if (includeDomain && cookieDomain) {
    options.domain = cookieDomain;
  }

  return options;
};

const hashToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

type UserWithSecurityFields = Prisma.UserGetPayload<{
  include: {
    staff: true;
    membershipCard: true;
  };
}> & {
  accountLockedUntil: Date | null;
  failedLoginAttempts: number;
};

class ResetTokenError extends Error {
  constructor(message = "Invalid or expired reset token") {
    super(message);
    this.name = "ResetTokenError";
  }
}

const projectSessionUser = (user: UserWithSecurityFields) => ({
  id: user.id,
  firstName: user.firstName,
  lastName: user.lastName,
  role: user.role,
  emailVerified: user.emailVerified,
  phoneVerified: user.phoneVerified,
  twoFactorEnabled: user.twoFactorEnabled,
  lastLogin: user.lastLogin,
});

const projectSessionDetailsUser = (user: UserWithSecurityFields) => ({
  ...projectSessionUser(user),
  email: user.email,
  phone: user.phone,
  avatar: user.avatar,
  isActive: user.isActive,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
  loyaltyPoints: user.loyaltyPoints,
  membershipCard: user.membershipCard
    ? {
        id: user.membershipCard.id,
        tier: user.membershipCard.tier,
        cardNumber: user.membershipCard.cardNumber,
        isActive: user.membershipCard.isActive,
        validFrom: user.membershipCard.validFrom,
        validUntil: user.membershipCard.validUntil,
      }
    : null,
});

export class AuthController {
  static verifyTwoFA = async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Unauthenticated" });
      }

      const { code } = req.body;
      if (!code) {
        return res.status(400).json({ error: "Code required" });
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
        return res.status(400).json({ error: "2FA not enabled" });
      }

      const trimmed = code.trim();
      const valid = verifyTotp(user.twoFactorSecret, trimmed, 1);
      if (!valid) {
        return res.status(400).json({ error: "Invalid code" });
      }

      const { token, exp, slice } = issueTwoFASession(user.id);
      return res.json({ ok: true, sessionToken: token, exp, slice });
    } catch (error) {
      console.error("verifyTwoFA error:", error);
      return res.status(500).json({ error: "Server error" });
    }
  };

  private static setAccessTokenCookie(
    res: Response,
    token: string,
    ttlSeconds?: number,
  ) {
    const includeDomain = !ACCESS_COOKIE_NAME.startsWith("__Host-");
    const maxAge =
      typeof ttlSeconds === "number"
        ? Math.max(ttlSeconds * 1000, 0)
        : ACCESS_TOKEN_MAX_AGE_MS;
    const options = buildCookieOptions(
      maxAge,
      { path: ACCESS_COOKIE_PATH },
      includeDomain,
    );

    res.cookie(ACCESS_COOKIE_NAME, token, options);
  }

  private static clearAccessTokenCookie(res: Response) {
    const includeDomain = !ACCESS_COOKIE_NAME.startsWith("__Host-");
    const options = buildCookieOptions(
      undefined,
      { path: ACCESS_COOKIE_PATH },
      includeDomain,
    );
    options.maxAge = 0;
    res.clearCookie(ACCESS_COOKIE_NAME, options);
  }

  private static setRefreshTokenCookie(res: Response, token: string) {
    const options = buildCookieOptions(
      REFRESH_TOKEN_MAX_AGE_MS,
      { path: REFRESH_COOKIE_PATH, sameSite: "strict" },
      true,
    );

    res.cookie(REFRESH_COOKIE_NAME, token, options);

    // Expire any legacy refresh token cookies with different paths
    AuthController.expireLegacyRefreshCookies(res);
  }

  private static clearRefreshTokenCookie(res: Response) {
    const options = buildCookieOptions(
      undefined,
      { path: REFRESH_COOKIE_PATH, sameSite: "strict" },
      true,
    );
    options.maxAge = 0;
    res.clearCookie(REFRESH_COOKIE_NAME, options);

    // Also clear any legacy cookies
    AuthController.expireLegacyRefreshCookies(res);
  }

  private static expireLegacyRefreshCookies(res: Response) {
    // Clear legacy refresh token cookies that may have been set with different paths
    const legacyPaths = ["/", "/api", "/api/auth"];
    for (const legacyPath of legacyPaths) {
      if (legacyPath !== REFRESH_COOKIE_PATH) {
        try {
          const options = buildCookieOptions(
            undefined,
            { path: legacyPath, sameSite: "strict" },
            true,
          );
          options.maxAge = 0;
          res.clearCookie(REFRESH_COOKIE_NAME, options);
        } catch (e) {
          // Silently fail if cookie clearing fails
        }
      }
    }
  }

  private static applyNoStoreHeaders(res: Response) {
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }

  private static extractRefreshToken(req: Request): string | null {
    // First, try cookie (web clients)
    const tokenFromCookie = req.cookies?.[REFRESH_COOKIE_NAME];
    if (typeof tokenFromCookie === "string" && tokenFromCookie.length > 0) {
      return tokenFromCookie;
    }

    // For mobile clients, accept token from request body
    const tokenFromBody = req.body?.refreshToken;
    if (typeof tokenFromBody === "string" && tokenFromBody.length > 0) {
      return tokenFromBody;
    }

    return null;
  }

  static async login(req: Request, res: Response) {
    try {
      AuthController.applyNoStoreHeaders(res);
      const { email, password } = req.body;
      const now = new Date();

      const user = (await prisma.user.findUnique({
        where: { email },
        include: {
          membershipCard: true,
        },
      })) as UserWithSecurityFields | null;

      if (!user) {
        return res.sendError("Invalid email or password", 401);
      }

      if (user.accountLockedUntil && user.accountLockedUntil > now) {
        const remainingMs = user.accountLockedUntil.getTime() - now.getTime();
        const remainingMinutes = Math.max(
          1,
          Math.ceil(remainingMs / (60 * 1000)),
        );
        return res.sendError(buildLockoutMessage(remainingMinutes), 423);
      }

      if (
        user.accountLockedUntil &&
        user.accountLockedUntil <= now &&
        (user.failedLoginAttempts ?? 0) > 0
      ) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            accountLockedUntil: null,
            failedLoginAttempts: 0,
          },
        });
        user.accountLockedUntil = null;
        user.failedLoginAttempts = 0;
      }

      // Block soft-deleted accounts
      if (user.isDeleted || user.deletedAt) {
        return res.sendError("Account has been deleted", 403);
      }

      // Block deactivated/inactive accounts
      if (!user.isActive || user.deactivatedAt) {
        return res.sendError("Account is inactive", 403);
      }

      const isValidPassword = await bcrypt.compare(password, user.passwordHash);
      if (!isValidPassword) {
        const failedAttempts = (user.failedLoginAttempts ?? 0) + 1;
        const shouldLock = failedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS;
        const lockUntil = shouldLock
          ? new Date(now.getTime() + ACCOUNT_LOCK_DURATION_MINUTES * 60 * 1000)
          : null;

        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: failedAttempts,
            accountLockedUntil: lockUntil,
          },
        });

        if (shouldLock) {
          return res.sendError(
            buildLockoutMessage(ACCOUNT_LOCK_DURATION_MINUTES),
            423,
          );
        }

        return res.sendError("Invalid email or password", 401);
      }

      // Enforce email verification prior to login
      if (!user.emailVerified) {
        return res.sendError("Your email is not verified", 403);
      }

      // Generate tokens
      const JWT_SECRET = process.env.JWT_SECRET as Secret;
      if (!JWT_SECRET) {
        throw new Error("JWT_SECRET is not configured");
      }
      const accessToken = jwt.sign(
        { sub: user.id, role: user.role, email: user.email },
        JWT_SECRET,
        { expiresIn: ACCESS_TOKEN_EXPIRY },
      );

      const isMobile = isMobileClient(req);
      const refreshTokenExpiry = isMobile
        ? REFRESH_TOKEN_EXPIRY_MOBILE
        : REFRESH_TOKEN_EXPIRY;
      const refreshTokenMaxAge = isMobile
        ? REFRESH_TOKEN_MAX_AGE_MS_MOBILE
        : REFRESH_TOKEN_MAX_AGE_MS;

      const refreshToken = jwt.sign(
        {
          sub: user.id,
          type: "refresh",
          jti: crypto.randomBytes(16).toString("hex"), // Add unique identifier
        },
        JWT_SECRET,
        { expiresIn: refreshTokenExpiry },
      );

      const hashedRefreshToken = hashToken(refreshToken);

      await prisma.refreshToken.create({
        data: {
          token: hashedRefreshToken,
          userId: user.id,
          expiresAt: new Date(Date.now() + refreshTokenMaxAge),
        },
      });

      // Update last login
      await prisma.user.update({
        where: { id: user.id },
        data: {
          lastLogin: new Date(),
          failedLoginAttempts: 0,
          accountLockedUntil: null,
        },
      });

      // Fallback: if user is verified but welcome email wasn't sent (timestamp null), send it now (fire & forget)
      if (user.emailVerified && !user.welcomeEmailSentAt) {
        (async () => {
          try {
            const { subject, html } = buildWelcomeEmail(user.firstName || "");
            await sendMail({ to: user.email, subject, html });
            await prisma.user.update({
              where: { id: user.id },
              data: { welcomeEmailSentAt: new Date() },
            });
          } catch (err) {
            console.error("Deferred welcome email send failed", err);
          }
        })();
      }

      const accessPayload = jwt.decode(accessToken) as jwt.JwtPayload | null;
      const accessTokenExpiresIn = accessPayload?.exp
        ? Math.max(0, accessPayload.exp - Math.floor(Date.now() / 1000))
        : undefined;

      AuthController.setAccessTokenCookie(
        res,
        accessToken,
        accessTokenExpiresIn,
      );
      AuthController.setRefreshTokenCookie(res, refreshToken);

      // For mobile clients, include tokens in response body (cookies don't work well in RN)
      const responseData: Record<string, unknown> = {
        user: projectSessionUser(user),
        expiresIn: accessTokenExpiresIn,
      };

      if (isMobileClient(req)) {
        responseData.accessToken = accessToken;
        responseData.refreshToken = refreshToken;
      }

      return res.sendSuccess(responseData);
    } catch (error) {
      console.error("Login error:", error);
      return res.sendError("Login failed", 500, error);
    }
  }

  static async session(req: Request, res: Response) {
    try {
      AuthController.applyNoStoreHeaders(res);

      if (!req.user?.id) {
        return res.sendError("Unauthorized", 401);
      }

      const user = (await prisma.user.findUnique({
        where: { id: req.user.id },
        include: {
          membershipCard: true,
        },
      })) as UserWithSecurityFields | null;

      if (!user) {
        return res.sendError("User not found", 404);
      }

      return res.sendSuccess({
        user: projectSessionDetailsUser(user),
      });
    } catch (error) {
      console.error("Session fetch error:", error);
      return res.sendError("Failed to load session details", 500, error);
    }
  }

  static async register(req: Request, res: Response) {
    try {
      const { email, password, firstName, lastName, phone, referralCode } =
        req.body;

      // Check if user exists
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [{ email }, { phone: phone || undefined }],
        },
      });

      if (existingUser) {
        return res.sendError("Email or phone number already exists", 400);
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);

      // Create user
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          firstName,
          lastName,
          phone,
          role: "CUSTOMER",
          registrationNumber: generateRegistrationNumber("TP"),
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          createdAt: true,
          registrationNumber: true,
        },
      });

      // Note: Registration bonus points will be awarded upon email verification

      // Handle referral code if provided
      if (
        referralCode &&
        typeof referralCode === "string" &&
        referralCode.trim()
      ) {
        try {
          await createPendingReferral(referralCode.trim(), user.id);
        } catch (referralError) {
          // Log referral error but don't fail registration
          console.error("Referral creation failed:", referralError);
        }
      }

      // Generate verification token and send email
      const verificationToken = crypto.randomBytes(32).toString("hex");
      const verificationTokenExpiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
      await prisma.user.update({
        where: { id: user.id },
        data: { verificationToken, verificationTokenExpiresAt },
      });

      const appBase = process.env.APP_BASE_URL || "http://localhost:5173";
      const verifyUrl = `${appBase}/verify-email?token=${verificationToken}`;
      const emailTpl = buildVerificationEmail(verifyUrl, firstName);
      try {
        await sendMail({
          to: email,
          subject: emailTpl.subject,
          html: emailTpl.html,
        });
      } catch (e) {
        // Don't block registration on email failure
        const emailDomain = email.split("@")[1]?.toLowerCase() || "unknown";
        console.error(
          `[auth/register] Failed to send verification email to ${email} (domain=${emailDomain})`,
          e instanceof Error ? e.message : e,
        );
      }

      return res.sendSuccess(
        { user },
        "Registration successful. Please check your email to verify your account.",
        201,
      );
    } catch (error) {
      console.error("Registration error:", error);
      return res.sendError("Registration failed", 500, error);
    }
  }

  static async verifyEmail(req: Request, res: Response) {
    try {
      const { token } = req.query as { token?: string };
      if (!token) return res.sendError("Token is required", 400);

      const user = await prisma.user.findFirst({
        where: { verificationToken: token },
      });
      if (!user) return res.sendError("Invalid verification token", 400);
      if (
        !user.verificationToken ||
        !user.verificationTokenExpiresAt ||
        user.verificationTokenExpiresAt < new Date()
      ) {
        return res.sendError("Verification token expired", 400);
      }

      // Award registration bonus points
      const { getActiveLoyaltyConfig } =
        await import("../services/loyalty-config.service");
      const loyaltyConfig = await getActiveLoyaltyConfig();
      const registrationPoints = loyaltyConfig.registrationBonusPoints;

      await prisma.$transaction([
        prisma.user.update({
          where: { id: user.id },
          data: {
            emailVerified: true as any,
            verificationToken: null as any,
            verificationTokenExpiresAt: null as any,
            loyaltyPoints: { increment: registrationPoints },
          },
        }),
        prisma.loyaltyPoint.create({
          data: {
            userId: user.id,
            points: registrationPoints,
            type: "BONUS",
            description: "Registration bonus - Welcome to Tudor Padel",
            expiresAt: addMonths(new Date(), 6),
          },
        }),
      ]);

      // Create membership card for verified user
      try {
        const existingCard = await prisma.membershipCard.findUnique({
          where: { userId: user.id },
        });
        if (!existingCard) {
          const timestamp = Date.now().toString().slice(-8);
          const random = Math.floor(Math.random() * 10000)
            .toString()
            .padStart(4, "0");
          const cardNumber = `TP${timestamp}${random}`;

          await prisma.membershipCard.create({
            data: {
              userId: user.id,
              cardNumber,
              tier: "BRONZE", // New users start at BRONZE
              validFrom: new Date(),
              validUntil: addYears(new Date(), 1),
              isActive: true,
            },
          });
        }
      } catch (cardError) {
        // Don't fail verification if card creation fails
        console.error("Failed to create membership card:", cardError);
      }

      // Emit websocket event for managers/admin dashboards
      try {
        const { emitUserVerified } = await import("../utils/ws-bus");
        emitUserVerified({
          userId: user.id,
          email: user.email,
          at: new Date().toISOString(),
        });
      } catch (e) {
        console.warn("emitUserVerified failed", e);
      }
      // Fire & forget welcome email if not already sent
      (async () => {
        try {
          if (!user.welcomeEmailSentAt) {
            const { subject, html } = buildWelcomeEmail(user.firstName || "");
            await sendMail({ to: user.email, subject, html });
            await prisma.user.update({
              where: { id: user.id },
              data: { welcomeEmailSentAt: new Date() },
            });
          }
        } catch (err) {
          console.error("Failed to send welcome email", err);
        }
      })();

      return res.sendSuccess(null, "Email verified successfully");
    } catch (error) {
      console.error("Verify email error:", error);
      return res.sendError("Failed to verify email", 500, error);
    }
  }

  static async resendVerification(req: Request, res: Response) {
    try {
      const { email } = req.body as { email: string };
      const user = await prisma.user.findUnique({ where: { email } });

      // Generic response for non-existent users (security: don't leak user existence)
      if (!user) {
        return res.sendSuccess(
          null,
          "If this email is registered and not verified, a verification link has been sent.",
        );
      }

      // Already verified
      if (user.emailVerified) {
        return res.sendSuccess(
          null,
          "This email is already verified. You can log in now.",
        );
      }

      // Check if a verification email was recently sent (prevent spam within 2 minutes)
      if (user.verificationTokenExpiresAt) {
        // Calculate when the token was created (expires_at - 2 hours)
        const tokenCreatedAt =
          new Date(user.verificationTokenExpiresAt).getTime() - 120 * 60 * 1000;
        const tokenAge = Date.now() - tokenCreatedAt;
        const twoMinutesInMs = 2 * 60 * 1000;

        if (tokenAge < twoMinutesInMs) {
          const secondsRemaining = Math.ceil(
            (twoMinutesInMs - tokenAge) / 1000,
          );
          return res.status(429).json({
            status: "error",
            message: `A verification email was just sent. Please wait ${secondsRemaining} seconds before requesting another.`,
            retryAfter: secondsRemaining,
          });
        }
      }

      // Generate new token
      const verificationToken = crypto.randomBytes(32).toString("hex");
      const verificationTokenExpiresAt = new Date(Date.now() + 30 * 60 * 1000);

      await prisma.user.update({
        where: { id: user.id },
        data: { verificationToken, verificationTokenExpiresAt },
      });

      const appBase = process.env.APP_BASE_URL || "http://localhost:5173";
      const verifyUrl = `${appBase}/verify-email?token=${verificationToken}`;
      const emailTpl = buildVerificationEmail(verifyUrl, user.firstName);

      try {
        await sendMail({
          to: email,
          subject: emailTpl.subject,
          html: emailTpl.html,
        });
      } catch (e) {
        console.error("Failed to send verification email", e);
        return res.sendError(
          "Failed to send verification email. Please try again later.",
          500,
        );
      }

      return res.sendSuccess(
        null,
        "Verification email sent! Please check your inbox and spam folder. The link will expire in 2 hours.",
      );
    } catch (error) {
      console.error("Resend verification error:", error);
      return res.sendError("Failed to resend verification", 500, error);
    }
  }

  static async refreshToken(req: Request, res: Response) {
    try {
      AuthController.applyNoStoreHeaders(res);
      const incomingToken = AuthController.extractRefreshToken(req);

      if (!incomingToken) {
        AuthController.clearRefreshTokenCookie(res);
        AuthController.clearAccessTokenCookie(res);
        return res.sendError("Refresh token required", 401);
      }

      const JWT_SECRET = process.env.JWT_SECRET as Secret;
      if (!JWT_SECRET) {
        throw new Error("JWT_SECRET is not configured");
      }

      let decoded: jwt.JwtPayload;
      try {
        decoded = jwt.verify(incomingToken, JWT_SECRET) as jwt.JwtPayload;
      } catch (error) {
        AuthController.clearRefreshTokenCookie(res);
        AuthController.clearAccessTokenCookie(res);
        return res.sendError("Invalid refresh token", 401, error);
      }

      const hashedIncomingToken = hashToken(incomingToken);
      const userId = decoded.sub as string;

      // Fetch token and user in parallel for better performance
      const [storedToken, user] = await Promise.all([
        prisma.refreshToken.findFirst({
          where: {
            userId,
            expiresAt: { gt: new Date() },
            token: hashedIncomingToken,
          },
        }),
        prisma.user.findUnique({
          where: { id: userId },
          include: {
            membershipCard: true,
          },
        }) as Promise<UserWithSecurityFields | null>,
      ]);

      // Timing-safe validation: check all conditions before returning
      const isValidToken = !!storedToken;
      const isValidUser =
        !!user &&
        !user.isDeleted &&
        !user.deletedAt &&
        user.isActive &&
        !user.deactivatedAt;

      if (!isValidToken || !isValidUser) {
        AuthController.clearRefreshTokenCookie(res);
        AuthController.clearAccessTokenCookie(res);

        // Log the specific reason internally for debugging
        console.debug(`Token refresh failed for user ${userId}:`, {
          validToken: isValidToken,
          validUser: isValidUser,
          userExists: !!user,
        });

        // Generic error to prevent enumeration
        return res.sendError("Invalid or expired refresh token", 401);
      }

      // Safe to assert types after validation
      const validUser = user as UserWithSecurityFields;
      const validToken = storedToken as NonNullable<typeof storedToken>;

      const isMobile = isMobileClient(req);
      const refreshTokenExpiry = isMobile
        ? REFRESH_TOKEN_EXPIRY_MOBILE
        : REFRESH_TOKEN_EXPIRY;
      const refreshTokenMaxAge = isMobile
        ? REFRESH_TOKEN_MAX_AGE_MS_MOBILE
        : REFRESH_TOKEN_MAX_AGE_MS;

      const accessToken = jwt.sign(
        {
          sub: validUser.id,
          role: validUser.role,
          email: validUser.email,
        },
        JWT_SECRET,
        { expiresIn: ACCESS_TOKEN_EXPIRY },
      );

      const newRefreshToken = jwt.sign(
        {
          sub: validUser.id,
          type: "refresh",
          jti: crypto.randomBytes(16).toString("hex"),
        },
        JWT_SECRET,
        { expiresIn: refreshTokenExpiry },
      );

      const hashedNewRefreshToken = hashToken(newRefreshToken);

      // Atomic token rotation using updateMany with optimistic locking
      // This prevents race conditions by ensuring the token hasn't been rotated yet
      const rotationResult = await prisma.refreshToken.updateMany({
        where: {
          id: validToken.id,
          token: hashedIncomingToken, // Verify token hasn't changed (optimistic lock)
        },
        data: {
          token: hashedNewRefreshToken,
          expiresAt: new Date(Date.now() + refreshTokenMaxAge),
        },
      });

      // If count is 0, the token was already rotated by a concurrent request
      if (rotationResult.count === 0) {
        // 🚨 SECURITY: Token was already rotated - possible token reuse attack
        console.warn(
          `[SECURITY] Potential token reuse detected for user ${userId}`,
          {
            userId,
            timestamp: new Date().toISOString(),
            ip: req.ip,
            userAgent: req.headers["user-agent"]?.substring(0, 200), // Truncate
          },
        );

        // TODO: Consider implementing token family revocation for enhanced security
        // If you want to revoke all tokens on reuse (aggressive security):
        // await prisma.refreshToken.deleteMany({ where: { userId } });

        AuthController.clearRefreshTokenCookie(res);
        AuthController.clearAccessTokenCookie(res);
        return res.sendError(
          "Token already used or invalid. Please login again.",
          401,
        );
      }

      const accessPayload = jwt.decode(accessToken) as jwt.JwtPayload | null;
      const accessTokenExpiresIn = accessPayload?.exp
        ? Math.max(0, accessPayload.exp - Math.floor(Date.now() / 1000))
        : undefined;

      AuthController.setAccessTokenCookie(
        res,
        accessToken,
        accessTokenExpiresIn,
      );
      AuthController.setRefreshTokenCookie(res, newRefreshToken);

      // For mobile clients, include tokens in response body
      const responseData: Record<string, unknown> = {
        user: projectSessionUser(validUser),
        expiresIn: accessTokenExpiresIn,
      };

      if (isMobileClient(req)) {
        responseData.accessToken = accessToken;
        responseData.refreshToken = newRefreshToken;
      }

      return res.sendSuccess(responseData);
    } catch (error) {
      console.error("Token refresh error:", error);
      AuthController.clearRefreshTokenCookie(res);
      AuthController.clearAccessTokenCookie(res);
      return res.sendError("Token refresh failed", 401, error);
    }
  }

  static async logout(req: Request, res: Response) {
    try {
      AuthController.applyNoStoreHeaders(res);
      const incomingToken = AuthController.extractRefreshToken(req);
      let userId = req.user?.id;

      const JWT_SECRET = process.env.JWT_SECRET as Secret;
      if (!JWT_SECRET) {
        throw new Error("JWT_SECRET is not configured");
      }

      if (!userId && incomingToken) {
        try {
          const decoded = jwt.verify(
            incomingToken,
            JWT_SECRET,
          ) as jwt.JwtPayload;
          userId = typeof decoded.sub === "string" ? decoded.sub : userId;
        } catch (error) {
          console.warn("Failed to decode refresh token during logout", error);
        }
      }

      if (incomingToken) {
        const hashed = hashToken(incomingToken);
        // Only delete hashed tokens (no plaintext fallback)
        await prisma.refreshToken.deleteMany({
          where: { token: hashed },
        });
      } else if (userId) {
        await prisma.refreshToken.deleteMany({
          where: { userId },
        });
      }

      AuthController.clearRefreshTokenCookie(res);
      AuthController.clearAccessTokenCookie(res);

      return res.sendSuccess(null, "Logged out successfully");
    } catch (error) {
      console.error("Logout error:", error);
      return res.sendError("Logout failed", 500, error);
    }
  }

  static async forgotPassword(req: Request, res: Response) {
    try {
      const { email } = req.body;

      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        // Don't reveal if user exists
        return res.sendSuccess(
          null,
          "If the email exists, a reset link has been sent",
        );
      }

      const now = new Date();
      const invalidatePayload = {
        used: true,
        usedAt: now,
      } as Prisma.PasswordResetUpdateManyMutationInput;

      // Invalidate any previous pending tokens
      await prisma.passwordReset.updateMany({
        where: { userId: user.id, used: false },
        data: invalidatePayload,
      });

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString("hex");
      const hashedToken = crypto
        .createHash("sha256")
        .update(resetToken)
        .digest("hex");

      // Store reset token
      const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);

      await prisma.passwordReset.create({
        data: {
          token: hashedToken,
          userId: user.id,
          expiresAt,
        },
      });

      const appBase = (
        process.env.APP_BASE_URL || "http://localhost:5173"
      ).replace(/\/?$/u, "");
      const resetUrl = `${appBase}/reset-password?token=${resetToken}`;

      try {
        const email = buildPasswordResetEmail(
          resetUrl,
          user.firstName || undefined,
        );
        await sendMail({
          to: user.email,
          subject: email.subject,
          html: email.html,
        });
      } catch (mailError) {
        console.error("Failed to send password reset email", mailError);
      }

      const payload =
        process.env.NODE_ENV === "development" ? { resetToken } : null;

      return res.sendSuccess(
        payload,
        "If the email exists, a reset link has been sent",
      );
    } catch (error) {
      console.error("Forgot password error:", error);
      return res.sendError("Failed to process request", 500, error);
    }
  }

  static async resetPassword(req: Request, res: Response) {
    try {
      const { token, newPassword } = req.body;

      const hashedToken = crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");
      const passwordHash = await bcrypt.hash(newPassword, 10);
      const now = new Date();

      const tokenUpdateData = {
        used: true,
        usedAt: now,
      } as Prisma.PasswordResetUpdateManyMutationInput;

      await prisma.$transaction(
        async (tx) => {
          const resetRecord = await tx.passwordReset.findFirst({
            where: {
              token: hashedToken,
              used: false,
              expiresAt: { gt: now },
            },
          });

          if (!resetRecord) {
            throw new ResetTokenError();
          }

          const updateResult = await tx.passwordReset.updateMany({
            where: { id: resetRecord.id, used: false },
            data: tokenUpdateData,
          });

          if (updateResult.count === 0) {
            throw new ResetTokenError();
          }

          await tx.user.update({
            where: { id: resetRecord.userId },
            data: {
              passwordHash,
              resetToken: null,
              resetTokenExpiry: null,
            },
          });

          await tx.passwordReset.updateMany({
            where: {
              userId: resetRecord.userId,
              used: false,
              id: { not: resetRecord.id },
            },
            data: tokenUpdateData,
          });

          await tx.refreshToken.deleteMany({
            where: { userId: resetRecord.userId },
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );

      return res.sendSuccess(null, "Password reset successfully");
    } catch (error) {
      if (
        error instanceof ResetTokenError ||
        (error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2025")
      ) {
        return res.sendError("Invalid or expired reset token", 400);
      }

      console.error("Reset password error:", error);
      return res.sendError("Failed to reset password", 500, error);
    }
  }
}

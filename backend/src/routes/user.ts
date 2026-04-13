import { Router } from "express";
import rateLimit from "express-rate-limit";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  authenticate as authenticateToken,
  authorize,
} from "../middleware/auth.middleware";
import {
  paginate,
  generateRegistrationNumber,
  maskEmail,
  maskPhone,
} from "../utils/helpers";
import requireTwoFactor from "../middleware/twofa.middleware";
import prisma from "../config/db";
import { logAudit } from "../utils/audit";
import { addMonths } from "date-fns";

const router = Router();

const exportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 429,
    error: "Too many export requests, please try again later.",
  },
});

function buildUserWhere(query: any): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {};

  const { search, role, status, verified, membershipTier } = query as {
    search?: string;
    role?: string;
    status?: string;
    verified?: string;
    membershipTier?: string;
  };

  if (search) {
    where.OR = [
      { email: { contains: search, mode: "insensitive" } },
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { phone: { contains: search, mode: "insensitive" } },
      { registrationNumber: { contains: search, mode: "insensitive" } },
    ];
  }

  if (role && role !== "ALL") {
    const legacy = String(role).toUpperCase();
    if (legacy === "STAFF") {
      (where as any).role = {
        in: ["ADMIN", "MANAGER", "FINANCE_OFFICER", "BOOKING_OFFICER"],
      } as any;
    } else {
      (where as any).role = legacy as any;
    }
  }

  // Unified status semantics extension:
  // ACTIVE  -> isActive = true & emailVerified = true (when frontend wants strictly verified actives it should combine with verified=VERIFIED)
  // INACTIVE -> isActive = false
  // VERIFIED (alias via verified param) handled below
  // PENDING -> emailVerified = false & isActive = true (user registered but not verified yet)
  if (status && status !== "ALL") {
    const normalized = String(status).toUpperCase();
    if (normalized === "ACTIVE") {
      // Do not force emailVerified here to allow combining with separate verified filter
      where.isActive = true;
    } else if (normalized === "INACTIVE") {
      where.isActive = false;
    } else if (normalized === "PENDING") {
      where.isActive = true;
      (where as any).emailVerified = false;
    } else if (normalized === "true") where.isActive = true;
    else if (normalized === "false") where.isActive = false;
  }

  if (verified && verified !== "ALL") {
    if (verified === "VERIFIED" || verified === "true")
      where.emailVerified = true;
    else if (verified === "UNVERIFIED" || verified === "false")
      where.emailVerified = false;
  }

  if (membershipTier && membershipTier !== "ALL") {
    if (membershipTier === "NONE") {
      where.membershipCard = { is: null };
    } else {
      where.membershipCard = { is: { tier: membershipTier as any } };
    }
  }

  (where as any).isDeleted = false;
  return where;
}

async function getUserStats(where?: Prisma.UserWhereInput) {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const baseWhere = where || {};

  const [total, active, verified, newThisMonth] = await Promise.all([
    prisma.user.count({ where: baseWhere }),
    prisma.user.count({ where: { ...baseWhere, isActive: true } }),
    prisma.user.count({ where: { ...baseWhere, emailVerified: true } }),
    prisma.user.count({
      where: { ...baseWhere, createdAt: { gte: startOfMonth } },
    }),
  ]);

  return { total, active, verified, newThisMonth };
}

async function getCustomerStats(where?: Prisma.UserWhereInput) {
  const baseStats = await getUserStats(where);

  const customers = await prisma.user.findMany({
    where: where || {},
    select: { id: true },
  });

  const customerIds = customers.map((c) => c.id);

  if (customerIds.length === 0) {
    return {
      ...baseStats,
      totalSpent: 0,
      averageSpent: 0,
      totalBookings: 0,
      totalLoyaltyPoints: 0,
      premiumMembers: 0,
    };
  }

  const [paymentsData, bookingsCount, loyaltyData, premiumCount] =
    await Promise.all([
      prisma.payment.aggregate({
        where: {
          userId: { in: customerIds },
          status: "COMPLETED",
        },
        _sum: {
          amount: true,
        },
      }),

      prisma.booking.count({
        where: {
          userId: { in: customerIds },
        },
      }),

      prisma.user.aggregate({
        where: where || {},
        _sum: {
          loyaltyPoints: true,
        },
      }),

      prisma.membershipCard.count({
        where: {
          userId: { in: customerIds },
          tier: { not: "BRONZE" },
          isActive: true,
        },
      }),
    ]);

  const totalSpent = Number(paymentsData._sum.amount || 0);
  const averageSpent =
    customerIds.length > 0 ? totalSpent / customerIds.length : 0;

  return {
    ...baseStats,
    totalSpent,
    averageSpent,
    totalBookings: bookingsCount,
    totalLoyaltyPoints: loyaltyData._sum.loyaltyPoints || 0,
    premiumMembers: premiumCount,
  };
}

router.get(
  "/",
  authenticateToken,
  authorize("ADMIN", "SUPER_ADMIN", "MANAGER"),
  async (req, res) => {
    try {
      const page = parseInt((req.query.page as string) || "1", 10);
      const limit = parseInt((req.query.limit as string) || "10", 10);
      const { skip, take } = paginate(page, limit);

      const where = buildUserWhere(req.query);
      const requesterRole = req.user?.role ?? "";

      // Filter out admin roles based on requester's permissions
      if (requesterRole === "MANAGER") {
        // Managers cannot see ADMIN or SUPER_ADMIN users
        const existingNot = Array.isArray((where as any).NOT)
          ? (where as any).NOT
          : (where as any).NOT
          ? [(where as any).NOT]
          : [];
        (where as any).NOT = [
          ...existingNot,
          { role: { in: ["ADMIN", "SUPER_ADMIN"] } },
        ];
      } else if (requesterRole !== "SUPER_ADMIN") {
        // Non-SUPER_ADMIN users (like ADMIN) cannot see SUPER_ADMIN
        const existingNot = Array.isArray((where as any).NOT)
          ? (where as any).NOT
          : (where as any).NOT
          ? [(where as any).NOT]
          : [];
        (where as any).NOT = [...existingNot, { role: "SUPER_ADMIN" }];
      }

      const isCustomerQuery = (where as any).role === "CUSTOMER";

      const [users, total, stats] = await Promise.all([
        prisma.user.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take,
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            role: true,
            isActive: true,
            emailVerified: true,
            phoneVerified: true,
            registrationNumber: true,
            deactivatedAt: true,
            lastLogin: true,
            createdAt: true,
            updatedAt: true,
            loyaltyPoints: isCustomerQuery,
            membershipCard: {
              select: {
                id: true,
                tier: true,
                cardNumber: true,
                isActive: true,
              },
            },
            _count: {
              select: {
                bookings: true,
              },
            },
          },
        }),
        prisma.user.count({ where }),
        isCustomerQuery ? getCustomerStats(where) : getUserStats(where),
      ]);

      const userIds = users.map((u) => u.id);
      const paymentsData = await prisma.payment.groupBy({
        by: ["userId"],
        where: {
          userId: { in: userIds },
          status: "COMPLETED",
        },
        _sum: {
          amount: true,
        },
      });

      const paymentsMap = new Map(
        paymentsData.map((p) => [p.userId, p._sum.amount || 0])
      );

      const usersWithMetrics = users.map((user) => ({
        ...user,
        totalBookings: user._count.bookings,
        totalSpent: paymentsMap.get(user.id) || 0,
      }));

      const totalPages = Math.ceil(total / limit) || 1;

      return res.status(200).json({
        users: usersWithMetrics,
        page,
        limit,
        pageSize: limit,
        total,
        totalPages,
        pagination: {
          pages: totalPages,
          currentPage: page,
          hasNext: page < totalPages,
          hasPrevious: page > 1,
        },
        stats,
      });
    } catch (error) {
      console.error("Error listing users:", error);
      return res.status(500).json({ message: "Failed to fetch users" });
    }
  }
);

router.get(
  "/stats",
  authenticateToken,
  authorize("ADMIN", "SUPER_ADMIN", "MANAGER"),
  async (_req, res) => {
    try {
      const stats = await getUserStats();
      return res.status(200).json(stats);
    } catch (error) {
      console.error("Error fetching user stats:", error);
      return res.status(500).json({ message: "Failed to fetch user stats" });
    }
  }
);

router.post(
  "/",
  authenticateToken,
  authorize("ADMIN", "SUPER_ADMIN"),
  requireTwoFactor,
  async (req, res) => {
    try {
      const {
        email,
        password,
        firstName,
        lastName,
        phone,
        role,
        isActive,
        isVIP,
        tags,
      } = req.body || {};
      if (!email || !password || !firstName || !lastName) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        return res.status(409).json({ message: "Email already exists" });
      }

      const bcrypt = require("bcryptjs");
      const passwordHash = await bcrypt.hash(password, 10);

      const created = await prisma.user.create({
        data: {
          email,
          passwordHash,
          firstName,
          lastName,
          phone,
          role: (role as any) || "CUSTOMER",
          isActive: typeof isActive === "boolean" ? isActive : true,
          emailVerified: true, // Admin-created users are auto-verified
          registrationNumber: generateRegistrationNumber("TP"),
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          isActive: true,
          emailVerified: true,
          phoneVerified: true,
          createdAt: true,
          updatedAt: true,
          registrationNumber: true,
        },
      });

      // Award registration bonus points for new customers
      const { getActiveLoyaltyConfig } = await import(
        "../services/loyalty-config.service"
      );
      const loyaltyConfig = await getActiveLoyaltyConfig();
      const registrationPoints = loyaltyConfig.registrationBonusPoints;

      if (registrationPoints > 0) {
        await prisma.$transaction([
          prisma.user.update({
            where: { id: created.id },
            data: { loyaltyPoints: { increment: registrationPoints } },
          }),
          prisma.loyaltyPoint.create({
            data: {
              userId: created.id,
              points: registrationPoints,
              type: "BONUS",
              description: "Registration bonus - Account created",
              expiresAt: addMonths(new Date(), 6),
            },
          }),
        ]);
      }

      await prisma.auditLog.create({
        data: {
          userId: req.user?.id,
          action: "CREATE",
          entity: "User",
          entityId: created.id,
          newData: created as any,
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"] as string,
        },
      });

      return res.status(201).json(created);
    } catch (error: any) {
      if (error?.code === "P2002") {
        return res
          .status(409)
          .json({ message: "Email or phone already exists" });
      }
      console.error("Error creating user:", error);
      return res.status(500).json({ message: "Failed to create user" });
    }
  }
);

router.patch(
  "/:id",
  authenticateToken,
  authorize("ADMIN", "SUPER_ADMIN", "MANAGER"),
  async (req, res) => {
    try {
      const {
        firstName,
        lastName,
        phone,
        role,
        isActive,
        emailVerified,
        phoneVerified,
      } = req.body || {};

      const before = await prisma.user.findUnique({
        where: { id: req.params.id },
      });
      const updated = await prisma.user.update({
        where: { id: req.params.id },
        data: {
          ...(firstName !== undefined && { firstName }),
          ...(lastName !== undefined && { lastName }),
          ...(phone !== undefined && { phone }),
          ...(role !== undefined && { role }),
          ...(isActive !== undefined && { isActive }),
          ...(emailVerified !== undefined && { emailVerified }),
          ...(phoneVerified !== undefined && { phoneVerified }),
          ...(req.body?.isVIP !== undefined && { isVIP: !!req.body.isVIP }),
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          isActive: true,
          emailVerified: true,
          phoneVerified: true,
          updatedAt: true,
          registrationNumber: true,
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: req.user?.id,
          action: "UPDATE",
          entity: "User",
          entityId: updated.id,
          oldData: before as any,
          newData: updated as any,
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"] as string,
        },
      });

      return res.status(200).json(updated);
    } catch (error) {
      console.error("Error updating user:", error);
      return res.status(500).json({ message: "Failed to update user" });
    }
  }
);

router.delete(
  "/:id",
  authenticateToken,
  authorize("ADMIN", "SUPER_ADMIN", "MANAGER"),
  requireTwoFactor,
  async (req, res) => {
    try {
      const id = req.params.id;
      const before = await prisma.user.findUnique({ where: { id } });
      await prisma.user.update({
        where: { id },
        data: {
          isDeleted: true as any,
          deletedAt: new Date() as any,
          deletedBy: req.user?.id,
        },
      });
      await prisma.auditLog.create({
        data: {
          userId: req.user?.id,
          action: "SOFT_DELETE",
          entity: "User",
          entityId: id,
          oldData: before as any,
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"] as string,
        },
      });
      return res.status(204).send();
    } catch (error) {
      console.error("Error deleting user:", error);
      return res.status(500).json({ message: "Failed to delete user" });
    }
  }
);

router.post(
  "/:id/deactivate",
  authenticateToken,
  authorize("ADMIN", "SUPER_ADMIN", "MANAGER"),
  requireTwoFactor,
  async (req, res) => {
    try {
      const id = req.params.id;
      const { active } = req.body as { active: boolean };
      const before = await prisma.user.findUnique({ where: { id } });
      const updated = await prisma.user.update({
        where: { id },
        data: active
          ? {
              isActive: true,
              deactivatedAt: null as any,
              deactivatedBy: null as any,
            }
          : {
              isActive: false,
              deactivatedAt: new Date() as any,
              deactivatedBy: req.user?.id,
            },
        select: { id: true, isActive: true, deactivatedAt: true },
      });
      await prisma.auditLog.create({
        data: {
          userId: req.user?.id,
          action: active ? "REACTIVATE" : "DEACTIVATE",
          entity: "User",
          entityId: id,
          oldData: before as any,
          newData: updated as any,
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"] as string,
        },
      });
      return res.status(200).json(updated);
    } catch (error) {
      console.error("Error deactivating user:", error);
      return res.status(500).json({ message: "Failed to update user status" });
    }
  }
);

router.post(
  "/bulk-update",
  authenticateToken,
  authorize("ADMIN", "SUPER_ADMIN", "MANAGER"),
  async (req, res) => {
    try {
      const { userIds, action, value } = req.body as {
        userIds: string[];
        action:
          | "activate"
          | "deactivate"
          | "setRole"
          | "verifyEmail"
          | "verifyPhone"
          | "setMembershipTier"
          | "removeMembership"
          | "softDelete";
        value?: any;
      };

      if (!Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ message: "userIds is required" });
      }

      let updatedCount = 0;

      if (action === "activate" || action === "deactivate") {
        const result = await prisma.user.updateMany({
          where: { id: { in: userIds } },
          data: { isActive: action === "activate" ? true : false },
        });
        updatedCount = result.count;
      } else if (action === "softDelete") {
        await prisma.user.updateMany({
          where: { id: { in: userIds } },
          data: {
            isDeleted: true as any,
            deletedAt: new Date() as any,
            deletedBy: req.user?.id,
          },
        });
        updatedCount = userIds.length;
      } else if (action === "setRole") {
        if (!value)
          return res.status(400).json({ message: "role value is required" });
        const result = await prisma.user.updateMany({
          where: { id: { in: userIds } },
          data: { role: value as any },
        });
        updatedCount = result.count;
      } else if (action === "verifyEmail") {
        const result = await prisma.user.updateMany({
          where: { id: { in: userIds } },
          data: { emailVerified: !!value },
        });
        updatedCount = result.count;
      } else if (action === "verifyPhone") {
        const result = await prisma.user.updateMany({
          where: { id: { in: userIds } },
          data: { phoneVerified: !!value },
        });
        updatedCount = result.count;
      } else if (action === "setMembershipTier") {
        if (!value)
          return res
            .status(400)
            .json({ message: "membership tier is required" });

        await prisma.$transaction(
          userIds.map((id) =>
            prisma.membershipCard.upsert({
              where: { userId: id },
              create: {
                userId: id,
                cardNumber: `CARD-${Date.now()}-${Math.random()
                  .toString(36)
                  .slice(2, 8)
                  .toUpperCase()}`,
                tier: value as any,
                validFrom: new Date(),
                validUntil: new Date(
                  new Date().setFullYear(new Date().getFullYear() + 1)
                ),
                isActive: true,
                updatedAt: new Date(),
              },
              update: { tier: value as any, isActive: true },
            })
          )
        );
        updatedCount = userIds.length;
      } else if (action === "removeMembership") {
        await prisma.membershipCard.deleteMany({
          where: { userId: { in: userIds } },
        });
        updatedCount = userIds.length;
      } else {
        return res.status(400).json({ message: "Unsupported bulk action" });
      }

      return res.status(200).json({ updatedCount });
    } catch (error) {
      console.error("Error in bulk update:", error);
      return res.status(500).json({ message: "Bulk update failed" });
    }
  }
);

router.get(
  "/export",
  authenticateToken,
  authorize("ADMIN", "SUPER_ADMIN", "MANAGER"),
  requireTwoFactor,
  exportLimiter,
  async (req, res) => {
    try {
      const where = buildUserWhere(req.query);
      const requesterRole = req.user?.role ?? "";

      // Filter out admin roles based on requester's permissions
      if (requesterRole === "MANAGER") {
        // Managers cannot export ADMIN or SUPER_ADMIN users
        const existingNot = Array.isArray((where as any).NOT)
          ? (where as any).NOT
          : (where as any).NOT
          ? [(where as any).NOT]
          : [];
        (where as any).NOT = [
          ...existingNot,
          { role: { in: ["ADMIN", "SUPER_ADMIN"] } },
        ];
      } else if (requesterRole !== "SUPER_ADMIN") {
        // Non-SUPER_ADMIN users (like ADMIN) cannot export SUPER_ADMIN
        const existingNot = Array.isArray((where as any).NOT)
          ? (where as any).NOT
          : (where as any).NOT
          ? [(where as any).NOT]
          : [];
        (where as any).NOT = [...existingNot, { role: "SUPER_ADMIN" }];
      }

      const users = await prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          isActive: true,
          emailVerified: true,
          registrationNumber: true,
          createdAt: true,
          membershipCard: { select: { tier: true, cardNumber: true } },
        },
      });

      const header = [
        "ID",
        "First Name",
        "Last Name",
        "Email",
        "Phone",
        "Role",
        "Active",
        "Email Verified",
        "Created At",
      ];

      const rows = users.map((u) => [
        u.id,
        u.firstName,
        u.lastName,
        u.email,
        u.phone ? `="${u.phone}"` : "",
        u.role,
        u.isActive ? "Yes" : "No",
        u.emailVerified ? "Yes" : "No",
        new Date(u.createdAt).toISOString(),
      ]);

      const csv = [header, ...rows]
        .map((cols) =>
          cols
            .map((c) => {
              const s = String(c ?? "");
              if (s.includes(",") || s.includes("\n") || s.includes('"')) {
                return '"' + s.replace(/"/g, '""') + '"';
              }
              return s;
            })
            .join(",")
        )
        .join("\n");

      await logAudit(req as any, "EXPORT", "User", "BULK", undefined, {
        count: users.length,
        filters: req.query,
      });

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=users-${Date.now()}.csv`
      );
      return res.status(200).send(csv);
    } catch (error) {
      console.error("Error exporting users:", error);
      return res.status(500).json({ message: "Failed to export users" });
    }
  }
);

router.get("/me", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        status: "error",
        message: "Unauthorized",
      });
    }

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
        loyaltyPoints: true,
        avatar: true,
        createdAt: true,
        updatedAt: true,
        membershipCard: {
          select: {
            id: true,
            cardNumber: true,
            tier: true,
            validFrom: true,
            validUntil: true,
            isActive: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({
        status: "error",
        message: "User not found",
      });
    }

    return res.json({
      status: "success",
      data: user,
    });
  } catch (error) {
    console.error("Error fetching user profile:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to fetch user profile",
    });
  }
});

router.put("/me", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { firstName, lastName, phone, email } = req.body;

    if (!userId) {
      return res.status(401).json({
        status: "error",
        message: "Unauthorized",
      });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(firstName && { firstName }),
        ...(lastName && { lastName }),
        ...(phone && { phone }),
        ...(email && { email }),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        isActive: true,
        loyaltyPoints: true,
        avatar: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.json({
      status: "success",
      message: "Profile updated successfully",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Error updating user profile:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to update profile",
    });
  }
});

router.get("/me/bookings", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    if (!userId) {
      return res.status(401).json({
        status: "error",
        message: "Unauthorized",
      });
    }

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where: { userId },
        include: {
          court: true,
          payment: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.booking.count({ where: { userId } }),
    ]);

    return res.json({
      status: "success",
      data: bookings,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching user bookings:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to fetch bookings",
    });
  }
});

router.post(
  "/:id/reset-password",
  authenticateToken,
  authorize("ADMIN", "SUPER_ADMIN"),
  async (req, res) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.params.id },
        select: { email: true, firstName: true },
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const resetToken = require("crypto").randomBytes(32).toString("hex");
      const resetExpiry = new Date(Date.now() + 3600000);

      await prisma.user.update({
        where: { id: req.params.id },
        data: {
          resetToken,
          resetTokenExpiry: resetExpiry,
        },
      });

      return res.status(200).json({
        message: "Password reset email sent",

        resetToken:
          process.env.NODE_ENV === "development" ? resetToken : undefined,
      });
    } catch (error) {
      console.error("Error resetting password:", error);
      return res.status(500).json({ message: "Failed to reset password" });
    }
  }
);

router.post(
  "/:id/send-verification",
  authenticateToken,
  authorize("ADMIN", "SUPER_ADMIN"),
  async (req, res) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.params.id },
        select: { email: true, emailVerified: true },
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (user.emailVerified) {
        return res.status(400).json({ message: "Email already verified" });
      }

      const verificationToken = require("crypto")
        .randomBytes(32)
        .toString("hex");

      await prisma.user.update({
        where: { id: req.params.id },
        data: { verificationToken },
      });

      return res.status(200).json({
        message: "Verification email sent",

        verificationToken:
          process.env.NODE_ENV === "development"
            ? verificationToken
            : undefined,
      });
    } catch (error) {
      console.error("Error sending verification:", error);
      return res
        .status(500)
        .json({ message: "Failed to send verification email" });
    }
  }
);

router.get(
  "/:id/details",
  authenticateToken,
  authorize("ADMIN", "SUPER_ADMIN"),
  async (req, res) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.params.id },
        include: {
          membershipCard: true,
          _count: {
            select: {
              bookings: true,
            },
          },
        },
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const [bookings, totalSpent] = await Promise.all([
        prisma.booking.findMany({
          where: { userId: req.params.id },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            bookingCode: true,
            startTime: true,
            endTime: true,
            status: true,
            totalAmount: true,
            court: {
              select: { name: true },
            },
          },
        }),
        prisma.payment.aggregate({
          where: {
            userId: req.params.id,
            status: "COMPLETED",
          },
          _sum: {
            amount: true,
          },
        }),
      ]);

      const response = {
        user: {
          ...user,
          totalBookings: user._count.bookings,
          totalSpent: totalSpent._sum.amount || 0,
        },
        bookings,
        activities: [],
        pointsHistory: [],
      };

      return res.status(200).json(response);
    } catch (error) {
      console.error("Error getting user details:", error);
      return res.status(500).json({ message: "Failed to fetch user details" });
    }
  }
);

router.get(
  "/:id",
  authenticateToken,
  authorize("ADMIN", "SUPER_ADMIN"),
  async (req, res) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.params.id },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          isActive: true,
          emailVerified: true,
          phoneVerified: true,
          createdAt: true,
          updatedAt: true,
          loyaltyPoints: true,
          registrationNumber: true,
          membershipCard: {
            select: { id: true, tier: true, cardNumber: true, isActive: true },
          },
        },
      });

      if (!user) return res.status(404).json({ message: "User not found" });
      return res.status(200).json(user);
    } catch (error) {
      console.error("Error getting user:", error);
      return res.status(500).json({ message: "Failed to fetch user" });
    }
  }
);

export default router;

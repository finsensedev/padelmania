import { Request, Response } from "express";
import prisma from "../config/db";
import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subDays,
  subMonths,
} from "date-fns";

// Use shared Prisma client

class FinanceOfficerController {
  // --- CSV helpers ---
  private static toCsv(
    rows: Array<Record<string, any>>,
    columns: Array<{ key: string; title: string }>
  ): string {
    const header = columns.map((c) => c.title).join(",");
    const escape = (val: any) => {
      if (val == null) return "";
      const s = String(val);
      // Escape quotes and wrap in quotes if contains comma, quote, or newline
      const needsQuotes = /[",\n\r]/.test(s);
      const escaped = s.replace(/"/g, '""');
      return needsQuotes ? `"${escaped}"` : escaped;
    };
    const body = rows
      .map((r) => columns.map((c) => escape(r[c.key])).join(","))
      .join("\n");
    return `${header}\n${body}`;
  }

  private static sendCsv(res: Response, csv: string, filename: string) {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send(csv);
  }
  // Dashboard Statistics
  static async getDashboardStats(req: Request, res: Response) {
    try {
      const now = new Date();
      const { startDate, endDate } = req.query;
      const periodStart = startDate
        ? new Date(startDate as string)
        : startOfMonth(now);
      const periodEnd = endDate ? new Date(endDate as string) : endOfMonth(now);
      const todayStart = startOfDay(now);
      const todayEnd = endOfDay(now);
      // Previous period is same duration ending right before current periodStart
      const durationMs = Math.max(
        0,
        periodEnd.getTime() - periodStart.getTime()
      );
      const prevEnd = new Date(periodStart.getTime() - 1);
      const prevStart = new Date(prevEnd.getTime() - durationMs);

      const [
        todayRevenue,
        periodRevenue,
        prevPeriodRevenue,
        pendingReconciliation,
        pendingRefunds,
        totalTransactions,
        recentTransactions,
        activeCustomers,
      ] = await Promise.all([
        // Today's revenue (M-Pesa only)
        prisma.payment.aggregate({
          where: {
            status: "COMPLETED",
            method: "MPESA",
            provider: "MPESA",
            createdAt: { gte: todayStart, lte: todayEnd },
          },
          _sum: { amount: true },
        }),
        // Current period's revenue (M-Pesa only)
        prisma.payment.aggregate({
          where: {
            status: "COMPLETED",
            method: "MPESA",
            provider: "MPESA",
            createdAt: { gte: periodStart, lte: periodEnd },
          },
          _sum: { amount: true },
        }),
        // Previous period's revenue (M-Pesa only)
        prisma.payment.aggregate({
          where: {
            status: "COMPLETED",
            method: "MPESA",
            provider: "MPESA",
            createdAt: { gte: prevStart, lte: prevEnd },
          },
          _sum: { amount: true },
        }),
        // Pending reconciliation count in period: completed payments where metadata.reconciled !== true
        prisma.payment.count({
          where: {
            status: "COMPLETED",
            createdAt: { gte: periodStart, lte: periodEnd },
            NOT: { metadata: { path: ["reconciled"], equals: true } },
          },
        }),
        // Pending refunds in period: flagged pending and updated in period
        prisma.payment.count({
          where: {
            metadata: { path: ["refundPending"], equals: true },
            updatedAt: { gte: periodStart, lte: periodEnd },
          },
        }),
        // Total transactions in period
        prisma.payment.count({
          where: {
            createdAt: { gte: periodStart, lte: periodEnd },
          },
        }),
        // Recent transactions in period
        prisma.payment.findMany({
          take: 10,
          orderBy: { createdAt: "desc" },
          where: { createdAt: { gte: periodStart, lte: periodEnd } },
          include: {
            booking: {
              include: {
                user: {
                  select: { firstName: true, lastName: true },
                },
              },
            },
          },
        }),
        // Active customers: registered, not deleted, active, and verified (email or phone)
        prisma.user.count({
          where: {
            role: "CUSTOMER",
            isActive: true,
            isDeleted: false,
            OR: [{ emailVerified: true }, { phoneVerified: true }],
          },
        }),
      ]);

      const revenueGrowth = prevPeriodRevenue._sum.amount
        ? ((Number(periodRevenue._sum.amount || 0) -
            Number(prevPeriodRevenue._sum.amount)) /
            Number(prevPeriodRevenue._sum.amount)) *
          100
        : 0;

      const stats = {
        revenue: {
          today: Number(todayRevenue._sum.amount || 0),
          thisMonth: Number(periodRevenue._sum.amount || 0),
          lastMonth: Number(prevPeriodRevenue._sum.amount || 0),
          growth: Number(revenueGrowth.toFixed(1)),
        },
        reconciliation: {
          pending: pendingReconciliation,
          completed: await prisma.payment.count({
            where: {
              status: "COMPLETED",
              createdAt: { gte: periodStart, lte: periodEnd },
              metadata: { path: ["reconciled"], equals: true },
            },
          }),
        },
        refunds: {
          pending: pendingRefunds,
          processed: await prisma.payment.count({
            where: {
              OR: [
                { status: { in: ["REFUNDED", "PARTIALLY_REFUNDED"] } },
                { refundedAt: { not: null } },
              ],
              updatedAt: { gte: periodStart, lte: periodEnd },
            },
          }),
        },
        transactions: {
          total: totalTransactions,
          successful: await prisma.payment.count({
            where: {
              status: "COMPLETED",
              createdAt: { gte: periodStart, lte: periodEnd },
            },
          }),
          failed: await prisma.payment.count({
            where: {
              status: "FAILED",
              createdAt: { gte: periodStart, lte: periodEnd },
            },
          }),
        },
        activeCustomers,
        recentTransactions: recentTransactions.map((payment) => ({
          id: payment.id,
          amount: Number(payment.amount),
          status: payment.status,
          method: payment.method,
          createdAt: payment.createdAt,
          customerName: payment.booking?.user
            ? `${payment.booking.user.firstName} ${payment.booking.user.lastName}`
            : "Unknown",
        })),
      };

      res.json(stats);
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ message: "Failed to fetch dashboard statistics" });
    }
  }

  // User Management
  static async getUsers(req: Request, res: Response) {
    try {
      const { page = 1, limit = 20, search, role, status } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = {};

      if (search) {
        where.OR = [
          { firstName: { contains: search as string, mode: "insensitive" } },
          { lastName: { contains: search as string, mode: "insensitive" } },
          { email: { contains: search as string, mode: "insensitive" } },
        ];
      }

      if (role) {
        where.role = role;
      }

      if (status) {
        where.isActive = status === "active";
      }

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip,
          take: Number(limit),
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            role: true,
            isActive: true,
            createdAt: true,
            lastLogin: true,
            _count: {
              select: {
                bookings: true,
                payments: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        }),
        prisma.user.count({ where }),
      ]);

      res.json({
        users,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  }

  static async getUserById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const user = await prisma.user.findUnique({
        where: { id },
        include: {
          bookings: {
            take: 10,
            orderBy: { createdAt: "desc" },
            include: {
              court: { select: { name: true } },
              payment: { select: { amount: true, status: true } },
            },
          },
          payments: {
            take: 10,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              amount: true,
              status: true,
              method: true,
              createdAt: true,
            },
          },
        },
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  }

  static async exportUsers(req: Request, res: Response) {
    try {
      const { role, status, startDate, endDate } = req.body;

      const where: any = {};

      if (role) where.role = role;
      if (status) where.isActive = status === "active";
      if (startDate && endDate) {
        where.createdAt = {
          gte: new Date(startDate),
          lte: new Date(endDate),
        };
      }

      const users = await prisma.user.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          role: true,
          isActive: true,
          createdAt: true,
          lastLogin: true,
        },
        orderBy: { createdAt: "desc" },
      });

      // In a real implementation, you would generate CSV/Excel here
      res.json({
        message: "Export prepared",
        count: users.length,
        data: users,
      });
    } catch (error) {
      console.error("Error exporting users:", error);
      res.status(500).json({ message: "Failed to export users" });
    }
  }

  // Bookings Management
  static async getBookings(req: Request, res: Response) {
    try {
      const {
        page = 1,
        limit = 20,
        date,
        status,
        paymentStatus,
        startDate,
        endDate,
        courtId,
        courtName,
        search,
      } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = {};

      if (date) {
        const selectedDate = new Date(date as string);
        where.startTime = {
          gte: startOfDay(selectedDate),
          lte: endOfDay(selectedDate),
        };
      } else if (startDate && endDate) {
        where.startTime = {
          gte: new Date(startDate as string),
          lte: new Date(endDate as string),
        };
      }

      if (status) {
        where.status = status;
      }

      if (paymentStatus) {
        where.payment = {
          status: paymentStatus,
        };
      }

      if (courtId) {
        where.courtId = String(courtId);
      }
      if (courtName) {
        where.court = {
          name: { contains: String(courtName), mode: "insensitive" },
        };
      }
      if (search) {
        where.OR = [
          { bookingCode: { contains: String(search), mode: "insensitive" } },
          {
            user: {
              OR: [
                {
                  firstName: { contains: String(search), mode: "insensitive" },
                },
                { lastName: { contains: String(search), mode: "insensitive" } },
                { email: { contains: String(search), mode: "insensitive" } },
              ],
            },
          },
        ];
      }

      const [bookings, total] = await Promise.all([
        prisma.booking.findMany({
          where,
          skip,
          take: Number(limit),
          include: {
            user: {
              select: { firstName: true, lastName: true, email: true },
            },
            court: {
              select: { name: true },
            },
            payment: {
              select: {
                id: true,
                amount: true,
                status: true,
                method: true,
                createdAt: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        }),
        prisma.booking.count({ where }),
      ]);

      res.json({
        bookings,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error) {
      console.error("Error fetching bookings:", error);
      res.status(500).json({ message: "Failed to fetch bookings" });
    }
  }

  static async getBookingsByDate(req: Request, res: Response) {
    try {
      const { date } = req.params;
      const { courtId, courtName } = req.query;
      const selectedDate = new Date(date);

      const bookingWhere: any = {
        startTime: {
          gte: startOfDay(selectedDate),
          lte: endOfDay(selectedDate),
        },
      };
      if (courtId) bookingWhere.courtId = String(courtId);
      if (courtName) {
        bookingWhere.court = {
          name: { contains: String(courtName), mode: "insensitive" },
        };
      }

      const bookings = await prisma.booking.findMany({
        where: bookingWhere,
        include: {
          user: {
            select: { firstName: true, lastName: true, email: true },
          },
          court: {
            select: { name: true },
          },
          payment: {
            select: {
              id: true,
              amount: true,
              status: true,
              method: true,
              provider: true,
              createdAt: true,
            },
          },
        },
        orderBy: { startTime: "asc" },
      });

      // Fetch active courts & schedules to compute availability ("free slots")
      // A "slot" is defined as the court's minBookingHours block within its open/close schedule.
      // We aggregate across all active courts for the selected day.
      const dayOfWeek = selectedDate.getDay(); // 0 (Sun) - 6 (Sat)
      const courtWhere: any = { isActive: true };
      if (courtId) courtWhere.id = String(courtId);
      if (courtName) {
        courtWhere.name = { contains: String(courtName), mode: "insensitive" };
      }
      const courts = await prisma.court.findMany({
        where: courtWhere,
        include: { schedules: true },
      });

      interface CourtUtilAgg {
        totalMinutes: number;
        bookedMinutes: number;
        totalSlots: number;
        bookedSlots: number;
      }
      const agg: CourtUtilAgg = {
        totalMinutes: 0,
        bookedMinutes: 0,
        totalSlots: 0,
        bookedSlots: 0,
      };

      // Pre-index bookings by court for efficiency
      const bookingsByCourt = bookings.reduce<Record<string, typeof bookings>>(
        (acc, b) => {
          acc[b.courtId] = acc[b.courtId] || ([] as any);
          acc[b.courtId].push(b);
          return acc;
        },
        {} as any
      );

      for (const court of courts) {
        const schedule = court.schedules.find((s) => s.dayOfWeek === dayOfWeek);
        // Fallback: if no explicit schedule, infer open/close from earliest/latest booking for that court that day
        let openM: number | null = null;
        let closeM: number | null = null;
        if (schedule) {
          const parseTime = (t: string) => {
            const [h, m] = t.split(":").map(Number);
            return h * 60 + (m || 0);
          };
          openM = parseTime(schedule.openTime);
          closeM = parseTime(schedule.closeTime);
        } else {
          const courtBookings = bookingsByCourt[court.id] || [];
          if (courtBookings.length) {
            openM = Math.min(
              ...courtBookings.map(
                (b) => b.startTime.getHours() * 60 + b.startTime.getMinutes()
              )
            );
            closeM = Math.max(
              ...courtBookings.map(
                (b) => b.endTime.getHours() * 60 + b.endTime.getMinutes()
              )
            );
          }
        }
        if (openM == null || closeM == null || closeM <= openM) continue; // no capacity
        const courtMinutes = closeM - openM;
        const slotMinutes = Math.max(1, court.minBookingHours) * 60;
        const totalSlots = Math.max(0, Math.floor(courtMinutes / slotMinutes));
        const courtBookings = bookingsByCourt[court.id] || [];
        let bookedMinutes = 0;
        for (const b of courtBookings) {
          const bStart = Math.max(
            openM,
            b.startTime.getHours() * 60 + b.startTime.getMinutes()
          );
          const bEnd = Math.min(
            closeM,
            b.endTime.getHours() * 60 + b.endTime.getMinutes()
          );
          if (bEnd > bStart) bookedMinutes += bEnd - bStart;
        }
        const bookedSlots = bookedMinutes / slotMinutes; // fractional allowed internally
        agg.totalMinutes += courtMinutes;
        agg.bookedMinutes += bookedMinutes;
        agg.totalSlots += totalSlots;
        agg.bookedSlots += bookedSlots;
      }

      const bookedWholeSlots = Math.min(
        agg.totalSlots,
        Math.ceil(agg.bookedSlots)
      );
      const freeSlots = Math.max(0, agg.totalSlots - bookedWholeSlots);
      const utilizationRate =
        agg.totalMinutes > 0 ? (agg.bookedMinutes / agg.totalMinutes) * 100 : 0;

      // CRITICAL FIX: Only count M-Pesa payments as revenue
      const totalRevenue = bookings
        .filter(
          (b) =>
            b.payment?.status === "COMPLETED" &&
            b.payment?.method === "MPESA" &&
            b.payment?.provider === "MPESA"
        )
        .reduce((sum, b) => sum + Number(b.payment?.amount || 0), 0);
      const averageBookingValue = bookings.length
        ? totalRevenue / bookings.length
        : 0;

      // Final stats exposed to FO UI
      const stats = {
        totalBookings: bookings.length,
        totalRevenue,
        freeSlots,
        utilizationRate: Number(utilizationRate.toFixed(2)),
        averageBookingValue: Number(averageBookingValue.toFixed(2)),
        capacity: {
          totalSlots: agg.totalSlots,
          bookedSlots: bookedWholeSlots,
        },
      };

      res.json({
        date: selectedDate,
        filters: { courtId: courtId || null, courtName: courtName || null },
        bookings,
        stats,
      });
    } catch (error) {
      console.error("Error fetching bookings by date:", error);
      res.status(500).json({ message: "Failed to fetch bookings" });
    }
  }

  // Transactions Management
  static async getTransactions(req: Request, res: Response) {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        method,
        startDate,
        endDate,
        minAmount,
        maxAmount,
      } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = {};

      if (status) where.status = status;
      if (method) where.method = method;

      if (startDate && endDate) {
        where.createdAt = {
          gte: new Date(startDate as string),
          lte: new Date(endDate as string),
        };
      }

      if (minAmount || maxAmount) {
        where.amount = {};
        if (minAmount) where.amount.gte = Number(minAmount);
        if (maxAmount) where.amount.lte = Number(maxAmount);
      }

      const [transactions, total] = await Promise.all([
        prisma.payment.findMany({
          where,
          skip,
          take: Number(limit),
          include: {
            booking: {
              include: {
                user: {
                  select: { firstName: true, lastName: true, email: true },
                },
                court: {
                  select: { name: true },
                },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        }),
        prisma.payment.count({ where }),
      ]);

      res.json({
        transactions,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error) {
      console.error("Error fetching transactions:", error);
      res.status(500).json({ message: "Failed to fetch transactions" });
    }
  }

  static async getTransactionById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const transaction = await prisma.payment.findUnique({
        where: { id },
        include: {
          booking: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  phone: true,
                },
              },
              court: {
                select: { name: true },
              },
            },
          },
        },
      });

      if (!transaction) {
        return res.status(404).json({ message: "Transaction not found" });
      }

      res.json(transaction);
    } catch (error) {
      console.error("Error fetching transaction:", error);
      res.status(500).json({ message: "Failed to fetch transaction" });
    }
  }

  static async exportTransactions(req: Request, res: Response) {
    try {
      const {
        status,
        method,
        startDate,
        endDate,
        minAmount,
        maxAmount,
        search,
      } = req.body || {};

      const where: any = {};

      if (status) where.status = status;
      if (method) where.method = method;

      if (startDate && endDate) {
        where.createdAt = {
          gte: new Date(startDate),
          lte: new Date(endDate),
        };
      }

      if (minAmount || maxAmount) {
        where.amount = {};
        if (minAmount) where.amount.gte = Number(minAmount);
        if (maxAmount) where.amount.lte = Number(maxAmount);
      }

      if (search) {
        where.OR = [
          { transactionId: { contains: String(search), mode: "insensitive" } },
          { providerRef: { contains: String(search), mode: "insensitive" } },
          {
            booking: {
              user: {
                OR: [
                  {
                    firstName: {
                      contains: String(search),
                      mode: "insensitive",
                    },
                  },
                  {
                    lastName: { contains: String(search), mode: "insensitive" },
                  },
                  { email: { contains: String(search), mode: "insensitive" } },
                ],
              },
            },
          },
        ];
      }

      const transactions = await prisma.payment.findMany({
        where,
        include: {
          booking: {
            include: {
              user: {
                select: { firstName: true, lastName: true, email: true },
              },
              court: {
                select: { name: true },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      const rows = transactions.map((t) => ({
        date: t.createdAt.toISOString(),
        // Use official M-Pesa reference for COMPLETED transactions, internal ID for others
        reference:
          t.status === "COMPLETED" && t.providerRef
            ? t.providerRef
            : t.transactionId || t.id,
        amount: Number(t.amount),
        method: t.method,
        status: t.status,
        customerName: t.booking?.user
          ? `${t.booking.user.firstName || ""} ${
              t.booking.user.lastName || ""
            }`.trim()
          : "",
        customerEmail: t.booking?.user?.email || "",
        description: t.booking?.court?.name
          ? `Booking ${t.booking.court.name}`
          : "Payment",
      }));
      const csv = FinanceOfficerController.toCsv(rows, [
        { key: "date", title: "Date" },
        { key: "reference", title: "Reference" },
        { key: "mpesaRef", title: "M-Pesa Reference" },
        { key: "amount", title: "Amount" },
        { key: "method", title: "Method" },
        { key: "status", title: "Status" },
        { key: "customerName", title: "Customer Name" },
        { key: "customerEmail", title: "Customer Email" },
        { key: "description", title: "Description" },
      ]);
      return FinanceOfficerController.sendCsv(
        res,
        csv,
        `transactions-${Date.now()}.csv`
      );
    } catch (error) {
      console.error("Error exporting transactions:", error);
      res.status(500).json({ message: "Failed to export transactions" });
    }
  }

  static async exportBookings(req: Request, res: Response) {
    try {
      const {
        date,
        startDate,
        endDate,
        status,
        paymentStatus,
        search,
        courtId,
        courtName,
      } = req.body || {};
      const where: any = {};
      if (date) {
        const d = new Date(date);
        where.startTime = { gte: startOfDay(d), lte: endOfDay(d) };
      } else if (startDate && endDate) {
        where.startTime = { gte: new Date(startDate), lte: new Date(endDate) };
      }
      if (status) where.status = status;
      if (paymentStatus) where.payment = { status: paymentStatus };
      if (courtId) where.courtId = String(courtId);
      if (courtName)
        where.court = {
          name: { contains: String(courtName), mode: "insensitive" },
        };
      if (search) {
        where.OR = [
          { bookingCode: { contains: String(search), mode: "insensitive" } },
          {
            user: {
              OR: [
                {
                  firstName: { contains: String(search), mode: "insensitive" },
                },
                { lastName: { contains: String(search), mode: "insensitive" } },
                { email: { contains: String(search), mode: "insensitive" } },
              ],
            },
          },
        ];
      }
      const bookings = await prisma.booking.findMany({
        where,
        include: {
          user: { select: { firstName: true, lastName: true, email: true } },
          court: { select: { name: true } },
          payment: { select: { amount: true, status: true, method: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      const rows = bookings.map((b) => ({
        date: b.createdAt.toISOString(),
        booking: (b as any).bookingCode || b.id,
        customerName: `${b.user?.firstName || ""} ${
          b.user?.lastName || ""
        }`.trim(),
        customerEmail: b.user?.email || "",
        court: b.court?.name || "",
        status: b.status,
        amount: Number(b.payment?.amount || 0),
        paymentStatus: b.payment?.status || "",
        paymentMethod: b.payment?.method || "",
      }));
      const csv = FinanceOfficerController.toCsv(rows, [
        { key: "date", title: "Date" },
        { key: "booking", title: "Booking" },
        { key: "customerName", title: "Customer Name" },
        { key: "customerEmail", title: "Customer Email" },
        { key: "court", title: "Court" },
        { key: "status", title: "Status" },
        { key: "amount", title: "Amount" },
        { key: "paymentStatus", title: "Payment Status" },
        { key: "paymentMethod", title: "Payment Method" },
      ]);
      return FinanceOfficerController.sendCsv(
        res,
        csv,
        `bookings-${Date.now()}.csv`
      );
    } catch (error) {
      console.error("Error exporting bookings:", error);
      res.status(500).json({ message: "Failed to export bookings" });
    }
  }

  static async exportRefunds(req: Request, res: Response) {
    try {
      const { status, startDate, endDate } = req.body || {};
      const where: any = {
        OR: [
          { metadata: { path: ["refundPending"], equals: true } },
          { refundedAt: { not: null } },
          { status: { in: ["REFUNDED", "PARTIALLY_REFUNDED"] } },
        ],
      };
      if (status === "PROCESSING") {
        where.AND = [{ metadata: { path: ["refundPending"], equals: true } }];
      } else if (status === "COMPLETED") {
        where.AND = [
          {
            OR: [
              { refundedAt: { not: null } },
              { status: { in: ["REFUNDED", "PARTIALLY_REFUNDED"] } },
            ],
          },
        ];
      }
      if (startDate && endDate) {
        where.updatedAt = { gte: new Date(startDate), lte: new Date(endDate) };
      }
      const refunds = await prisma.payment.findMany({
        where,
        include: {
          booking: {
            include: {
              user: {
                select: { firstName: true, lastName: true, email: true },
              },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
      });
      const rows = refunds.map((p) => {
        const meta: any = (p as any).metadata || {};
        const simplifiedStatus = p.refundedAt
          ? "COMPLETED"
          : meta.refundPending
          ? "PROCESSING"
          : p.status === "REFUNDED" || p.status === "PARTIALLY_REFUNDED"
          ? "COMPLETED"
          : "PROCESSING";
        return {
          date: (p.updatedAt || p.createdAt).toISOString(),
          reference: p.transactionId || p.providerRef || p.id,
          originalAmount: Number(p.amount || 0),
          refundAmount: Number(
            p.refundAmount || meta.refundRequestedAmount || 0
          ),
          status: simplifiedStatus,
          method: p.method,
          customerName: p.booking?.user
            ? `${p.booking.user.firstName || ""} ${
                p.booking.user.lastName || ""
              }`.trim()
            : "",
          customerEmail: p.booking?.user?.email || "",
        };
      });
      const csv = FinanceOfficerController.toCsv(rows, [
        { key: "date", title: "Date" },
        { key: "reference", title: "Reference" },
        { key: "originalAmount", title: "Original Amount" },
        { key: "refundAmount", title: "Refund Amount" },
        { key: "status", title: "Status" },
        { key: "method", title: "Method" },
        { key: "customerName", title: "Customer Name" },
        { key: "customerEmail", title: "Customer Email" },
      ]);
      return FinanceOfficerController.sendCsv(
        res,
        csv,
        `refunds-${Date.now()}.csv`
      );
    } catch (error) {
      console.error("Error exporting refunds:", error);
      res.status(500).json({ message: "Failed to export refunds" });
    }
  }

  // Refunds Management
  static async getPendingRefunds(req: Request, res: Response) {
    try {
      const { page = 1, limit = 20 } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const [refunds, total] = await Promise.all([
        prisma.payment.findMany({
          where: { metadata: { path: ["refundPending"], equals: true } },
          skip,
          take: Number(limit),
          include: {
            booking: {
              include: {
                user: {
                  select: { firstName: true, lastName: true, email: true },
                },
                court: { select: { name: true } },
              },
            },
          },
          orderBy: { updatedAt: "desc" },
        }),
        prisma.payment.count({
          where: { metadata: { path: ["refundPending"], equals: true } },
        }),
      ]);

      res.json({
        refunds,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error) {
      console.error("Error fetching pending refunds:", error);
      res.status(500).json({ message: "Failed to fetch pending refunds" });
    }
  }

  static async getRefunds(req: Request, res: Response) {
    try {
      const { page = 1, limit = 20, status, startDate, endDate } = req.query;
      const skip = (Number(page) - 1) * Number(limit);
      const where: any = {
        OR: [
          { metadata: { path: ["refundPending"], equals: true } },
          { refundedAt: { not: null } },
          { status: { in: ["REFUNDED", "PARTIALLY_REFUNDED"] } },
        ],
      };
      if (status === "PROCESSING") {
        where.AND = [{ metadata: { path: ["refundPending"], equals: true } }];
      } else if (status === "COMPLETED") {
        where.AND = [
          {
            OR: [
              { refundedAt: { not: null } },
              { status: { in: ["REFUNDED", "PARTIALLY_REFUNDED"] } },
            ],
          },
        ];
      }
      if (startDate && endDate) {
        where.updatedAt = {
          gte: new Date(startDate as string),
          lte: new Date(endDate as string),
        };
      }
      const [refunds, total] = await Promise.all([
        prisma.payment.findMany({
          where,
          skip,
          take: Number(limit),
          include: {
            booking: {
              include: {
                user: {
                  select: { firstName: true, lastName: true, email: true },
                },
                court: { select: { name: true } },
              },
            },
          },
          orderBy: { updatedAt: "desc" },
        }),
        prisma.payment.count({ where }),
      ]);
      res.json({
        refunds,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error) {
      console.error("Error fetching refunds:", error);
      res.status(500).json({ message: "Failed to fetch refunds" });
    }
  }

  static async approveRefund(req: Request, res: Response) {
    try {
      const { refundId } = req.params;
      const { approvalNotes } = req.body;
      const userId = (req as any).user?.id;

      const payment = await prisma.payment.findUnique({
        where: { id: refundId },
      });

      if (!payment) {
        return res.status(404).json({ message: "Refund not found" });
      }

      const isPending =
        Boolean((payment as any).metadata?.refundPending === true) &&
        !payment.refundedAt;
      if (!isPending) {
        return res.status(400).json({
          message: "Refund is not pending approval or already processed",
        });
      }

      const updatedPayment = await prisma.payment.update({
        where: { id: refundId },
        data: {
          metadata: {
            ...(payment.metadata as any),
            refundApproved: true,
            refundApprovedBy: userId,
            refundApprovedAt: new Date().toISOString(),
            refundApprovalNotes: approvalNotes,
          } as any,
        },
      });

      res.json({
        message: "Refund approved successfully",
        refund: updatedPayment,
      });
    } catch (error) {
      console.error("Error approving refund:", error);
      res.status(500).json({ message: "Failed to approve refund" });
    }
  }

  static async rejectRefund(req: Request, res: Response) {
    try {
      const { refundId } = req.params;
      const { rejectionReason } = req.body;
      const userId = (req as any).user?.id;

      const payment = await prisma.payment.findUnique({
        where: { id: refundId },
      });

      if (!payment) {
        return res.status(404).json({ message: "Refund not found" });
      }

      const isPending =
        Boolean((payment as any).metadata?.refundPending === true) &&
        !payment.refundedAt;
      if (!isPending) {
        return res.status(400).json({
          message: "Refund is not pending approval or already processed",
        });
      }

      const updatedPayment = await prisma.payment.update({
        where: { id: refundId },
        data: {
          metadata: {
            ...(payment.metadata as any),
            refundRejected: true,
            refundRejectedBy: userId,
            refundRejectedAt: new Date().toISOString(),
            refundRejectionReason: rejectionReason,
            refundPending: false,
          } as any,
        },
      });

      res.json({
        message: "Refund rejected successfully",
        refund: updatedPayment,
      });
    } catch (error) {
      console.error("Error rejecting refund:", error);
      res.status(500).json({ message: "Failed to reject refund" });
    }
  }

  static async processRefund(req: Request, res: Response) {
    try {
      const { refundId } = req.params;
      const { processingNotes, amount, reason } = req.body || {};
      const userId = (req as any).user?.id;

      const payment = await prisma.payment.findUnique({
        where: { id: refundId },
        include: { booking: true },
      });

      if (!payment) {
        return res.status(404).json({ message: "Refund not found" });
      }

      // Check if the game has already been played (slot end time has passed)
      // Prevent refunds for games that have already been played
      if (payment.booking?.endTime) {
        const endTime = new Date(payment.booking.endTime);
        const graceMinutes =
          parseInt(process.env.REFUND_SLOT_GRACE_MINUTES || "0", 10) || 0;
        const bufferMs = Math.max(0, graceMinutes) * 60_000;
        const now = Date.now();

        if (now > endTime.getTime() + bufferMs) {
          return res.status(400).json({
            code: "REFUND_WINDOW_CLOSED",
            message: `Refund not allowed - the game has already been played${
              graceMinutes ? ` (grace period: ${graceMinutes} minutes)` : ""
            }.`,
          });
        }
      }

      // Determine amount to refund (default to remaining amount)
      const numericPaid = Number(payment.amount);
      const alreadyRefunded = Number(payment.refundAmount || 0);
      const remaining = numericPaid - alreadyRefunded;
      const toRefund = amount != null ? Number(amount) : remaining;
      if (!toRefund || toRefund <= 0) {
        return res.status(400).json({ message: "Invalid refund amount" });
      }

      // Mark as processing and set pending flag
      await prisma.payment.update({
        where: { id: refundId },
        data: {
          status: "PENDING",
          metadata: {
            ...(payment.metadata as any),
            refundPending: true,
            refundProcessedBy: userId,
            refundProcessingNotes: processingNotes,
            refundReasonPending:
              reason ||
              (payment as any).metadata?.refundReasonPending ||
              "FO_REFUND",
            refundPreviousStatus: payment.status,
          } as any,
        },
      });

      // Reversal path removed; finance-officer initiated refunds now handled via primary refund endpoint (B2C only).

      res.status(202).json({
        message: "Refund processing started",
        data: { paymentId: refundId, requestedAmount: toRefund },
      });
    } catch (error) {
      console.error("Error processing refund:", error);
      res.status(500).json({ message: "Failed to process refund" });
    }
  }

  // Reports Management
  static async getReportMetrics(req: Request, res: Response) {
    try {
      const { startDate, endDate } = req.query;
      const start = startDate
        ? new Date(startDate as string)
        : startOfMonth(new Date());
      const end = endDate
        ? new Date(endDate as string)
        : endOfMonth(new Date());

      // Current period aggregates
      const [
        sumCompleted,
        txCount,
        completedTxCount,
        bookingCount,
        refundsAgg,
      ] = await Promise.all([
        // CRITICAL FIX: Only count M-Pesa transactions as revenue
        prisma.payment.aggregate({
          where: {
            status: "COMPLETED",
            method: "MPESA",
            provider: "MPESA",
            createdAt: { gte: start, lte: end },
          },
          _sum: { amount: true },
        }),
        prisma.payment.count({
          where: { createdAt: { gte: start, lte: end } },
        }),
        prisma.payment.count({
          where: {
            status: "COMPLETED",
            method: "MPESA",
            provider: "MPESA",
            createdAt: { gte: start, lte: end },
          },
        }),
        // Bookings created in the period (not their scheduled start time)
        prisma.booking.count({
          where: { createdAt: { gte: start, lte: end } },
        }),
        // Sum refunds actually completed within the period by refundedAt (M-Pesa only)
        prisma.payment.aggregate({
          where: {
            method: "MPESA",
            provider: "MPESA",
            refundedAt: { gte: start, lte: end },
          },
          _sum: { refundAmount: true },
        }),
      ]);

      const totalRevenue = Number(sumCompleted._sum.amount || 0);
      const totalTransactions = txCount;
      const totalBookings = bookingCount;
      const totalRefunds = Number(refundsAgg._sum.refundAmount || 0);
      const averageTransactionValue =
        completedTxCount > 0 ? totalRevenue / completedTxCount : 0;

      // Previous period (same duration immediately preceding start)
      const durationMs = Math.max(0, end.getTime() - start.getTime());
      const prevEnd = new Date(start.getTime() - 1);
      const prevStart = new Date(prevEnd.getTime() - durationMs);
      // Previous period comparison (M-Pesa only)
      const [prevSumCompleted, prevTxCount, prevBookingCount] =
        await Promise.all([
          prisma.payment.aggregate({
            where: {
              status: "COMPLETED",
              method: "MPESA",
              provider: "MPESA",
              createdAt: { gte: prevStart, lte: prevEnd },
            },
            _sum: { amount: true },
          }),
          prisma.payment.count({
            where: { createdAt: { gte: prevStart, lte: prevEnd } },
          }),
          prisma.booking.count({
            where: { createdAt: { gte: prevStart, lte: prevEnd } },
          }),
        ]);
      const prevRevenue = Number(prevSumCompleted._sum.amount || 0);
      const prevTransactions = prevTxCount;
      const prevBookings = prevBookingCount;

      const pct = (curr: number, prev: number) => {
        if (!prev) return curr ? 100 : 0;
        return ((curr - prev) / prev) * 100;
      };
      const revenueChange = Number(pct(totalRevenue, prevRevenue).toFixed(2));
      const transactionChange = Number(
        pct(totalTransactions, prevTransactions).toFixed(2)
      );
      const bookingChange = Number(pct(totalBookings, prevBookings).toFixed(2));

      return res.json({
        period: { start, end },
        metrics: {
          totalRevenue,
          totalTransactions,
          totalBookings,
          totalRefunds,
          averageTransactionValue,
          revenueChange,
          transactionChange,
          bookingChange,
        },
      });
    } catch (error) {
      console.error("Error fetching report metrics:", error);
      res.status(500).json({ message: "Failed to fetch report metrics" });
    }
  }
  static async getReportTemplates(req: Request, res: Response) {
    try {
      const templates = [
        {
          id: "revenue-summary",
          name: "Revenue Summary",
          description: "Comprehensive revenue analysis with trends",
          category: "Financial",
          parameters: ["dateRange", "groupBy"],
        },
        {
          id: "transaction-report",
          name: "Transaction Report",
          description: "Detailed transaction analysis",
          category: "Financial",
          parameters: ["dateRange", "paymentMethod", "status"],
        },
        {
          id: "reconciliation-report",
          name: "Reconciliation Report",
          description: "Payment reconciliation status and discrepancies",
          category: "Financial",
          parameters: ["dateRange", "status"],
        },
        {
          id: "refund-analysis",
          name: "Refund Analysis",
          description: "Refund trends and reasons analysis",
          category: "Financial",
          parameters: ["dateRange", "refundReason"],
        },
        {
          id: "customer-financial-report",
          name: "Customer Financial Report",
          description: "Customer spending patterns and lifetime value",
          category: "Customer",
          parameters: ["dateRange", "customerSegment"],
        },
      ];

      res.json(templates);
    } catch (error) {
      console.error("Error fetching report templates:", error);
      res.status(500).json({ message: "Failed to fetch report templates" });
    }
  }

  static async generateReport(req: Request, res: Response) {
    try {
      const { templateId, parameters, name } = req.body;
      const userId = (req as any).user?.id;

      // In a real implementation, you would generate the actual report here
      // based on the template and parameters

      const reportId = `report_${Date.now()}`;
      const reportData = {
        id: reportId,
        templateId,
        name: name || `Report ${new Date().toLocaleDateString()}`,
        status: "GENERATING",
        generatedBy: userId,
        generatedAt: new Date(),
        parameters,
        downloadUrl: null,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      };

      // Simulate report generation delay
      setTimeout(async () => {
        // Update report status to completed
        // In real implementation, this would be handled by a background job
      }, 3000);

      res.json({
        message: "Report generation started",
        report: reportData,
      });
    } catch (error) {
      console.error("Error generating report:", error);
      res.status(500).json({ message: "Failed to generate report" });
    }
  }

  static async getReport(req: Request, res: Response) {
    try {
      const { reportId } = req.params;

      // In a real implementation, you would fetch the actual report from database
      const report = {
        id: reportId,
        name: "Sample Report",
        status: "COMPLETED",
        generatedAt: new Date(),
        downloadUrl: `/api/finance-officer/reports/${reportId}/download`,
        data: {
          summary: {
            totalRevenue: 150000,
            totalTransactions: 1250,
            averageTransaction: 120,
            refundRate: 2.5,
          },
        },
      };

      res.json(report);
    } catch (error) {
      console.error("Error fetching report:", error);
      res.status(500).json({ message: "Failed to fetch report" });
    }
  }

  static async downloadReport(req: Request, res: Response) {
    try {
      const { reportId } = req.params;

      // Determine report type and generate appropriate CSV
      if (reportId === "report_1") {
        // Monthly Revenue Report
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const monthEnd = new Date(
          now.getFullYear(),
          now.getMonth(),
          0,
          23,
          59,
          59,
          999
        );

        const payments = await prisma.payment.findMany({
          where: {
            status: "COMPLETED",
            method: "MPESA",
            provider: "MPESA",
            createdAt: { gte: monthStart, lte: monthEnd },
          },
          include: {
            booking: {
              include: {
                user: {
                  select: { firstName: true, lastName: true, email: true },
                },
                court: { select: { name: true } },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        });

        const rows = payments.map((p) => ({
          date: p.createdAt.toISOString(),
          mpesaRef: p.providerRef || "",
          transactionId: p.transactionId || p.id,
          amount: Number(p.amount),
          customerName: p.booking?.user
            ? `${p.booking.user.firstName || ""} ${
                p.booking.user.lastName || ""
              }`.trim()
            : "",
          customerEmail: p.booking?.user?.email || "",
          court: p.booking?.court?.name || "",
          description: "Court booking revenue",
        }));

        const csv = FinanceOfficerController.toCsv(rows, [
          { key: "date", title: "Date" },
          { key: "mpesaRef", title: "M-Pesa Reference" },
          { key: "transactionId", title: "Transaction ID" },
          { key: "amount", title: "Amount (KSh)" },
          { key: "customerName", title: "Customer" },
          { key: "customerEmail", title: "Email" },
          { key: "court", title: "Court" },
          { key: "description", title: "Description" },
        ]);

        return FinanceOfficerController.sendCsv(
          res,
          csv,
          `monthly-revenue-${monthStart.toISOString().slice(0, 7)}.csv`
        );
      } else if (reportId === "report_2") {
        // Transaction Analysis Q4 2024
        const q4Start = new Date(2024, 9, 1);
        const q4End = new Date(2024, 11, 31, 23, 59, 59, 999);

        const transactions = await prisma.payment.findMany({
          where: {
            createdAt: { gte: q4Start, lte: q4End },
          },
          include: {
            booking: {
              include: {
                user: {
                  select: { firstName: true, lastName: true, email: true },
                },
                court: { select: { name: true } },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        });

        const rows = transactions.map((t) => ({
          date: t.createdAt.toISOString(),
          mpesaRef: t.providerRef || "",
          transactionId: t.transactionId || t.id,
          amount: Number(t.amount),
          status: t.status,
          method: t.method,
          customerName: t.booking?.user
            ? `${t.booking.user.firstName || ""} ${
                t.booking.user.lastName || ""
              }`.trim()
            : "",
          customerEmail: t.booking?.user?.email || "",
          court: t.booking?.court?.name || "",
          bookingRef: (t.booking as any)?.bookingCode || "",
        }));

        const csv = FinanceOfficerController.toCsv(rows, [
          { key: "date", title: "Date" },
          { key: "mpesaRef", title: "M-Pesa Reference" },
          { key: "transactionId", title: "Transaction ID" },
          { key: "amount", title: "Amount (KSh)" },
          { key: "status", title: "Status" },
          { key: "method", title: "Method" },
          { key: "customerName", title: "Customer" },
          { key: "customerEmail", title: "Email" },
          { key: "court", title: "Court" },
          { key: "bookingRef", title: "Booking Code" },
        ]);

        return FinanceOfficerController.sendCsv(
          res,
          csv,
          `transaction-analysis-q4-2024.csv`
        );
      }

      // Fallback for unknown reports
      res.status(404).json({ message: "Report not found" });
    } catch (error) {
      console.error("Error downloading report:", error);
      res.status(500).json({ message: "Failed to download report" });
    }
  }

  static async getReports(req: Request, res: Response) {
    try {
      const { page = 1, limit = 20, status, templateId } = req.query;
      const userId = (req as any).user?.id;

      // Calculate realistic file sizes based on actual data
      const report1Date = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      const report2Date = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

      // Get transaction count for report 1 (last 2 days)
      const report1Transactions = await prisma.payment.findMany({
        where: {
          status: "COMPLETED",
          createdAt: {
            gte: new Date(report1Date.getFullYear(), report1Date.getMonth(), 1),
            lte: new Date(
              report1Date.getFullYear(),
              report1Date.getMonth() + 1,
              0
            ),
          },
        },
        select: { id: true },
      });

      // Get transaction count for report 2 (last 5 days)
      const report2Transactions = await prisma.payment.findMany({
        where: {
          status: "COMPLETED",
          createdAt: {
            gte: new Date(report2Date.getFullYear(), report2Date.getMonth(), 1),
            lte: new Date(
              report2Date.getFullYear(),
              report2Date.getMonth() + 1,
              0
            ),
          },
        },
        select: { id: true },
      });

      // Estimate CSV file size:
      // Header: ~200 bytes
      // Each row: ~150-200 bytes (ID, date, amount, status, method, user, etc.)
      const estimateCSVSize = (rowCount: number) => {
        const headerSize = 200;
        const avgRowSize = 175;
        return headerSize + rowCount * avgRowSize;
      };

      const report1Size = estimateCSVSize(report1Transactions.length);
      const report2Size = estimateCSVSize(report2Transactions.length);

      // Define date ranges for mock reports
      const monthStart = new Date(
        report1Date.getFullYear(),
        report1Date.getMonth(),
        1
      );
      const monthEnd = new Date(
        report1Date.getFullYear(),
        report1Date.getMonth() + 1,
        0
      );
      const q4Start = new Date(report2Date.getFullYear(), 9, 1); // October 1st
      const q4End = new Date(report2Date.getFullYear(), 11, 31); // December 31st

      // Mock reports data with realistic calculated sizes
      const mockReports = [
        {
          id: "report_1",
          name: "Monthly Revenue Report - December 2024",
          templateId: "revenue-summary",
          status: "COMPLETED",
          generatedAt: report1Date,
          fileSize: report1Size,
          downloadUrl: "/api/finance-officer/reports/report_1/download",
          dateRange: {
            from: monthStart.toISOString(),
            to: monthEnd.toISOString(),
          },
          type: "MONTHLY",
        },
        {
          id: "report_2",
          name: "Transaction Analysis Q4 2024",
          templateId: "transaction-report",
          status: "COMPLETED",
          generatedAt: report2Date,
          fileSize: report2Size,
          downloadUrl: "/api/finance-officer/reports/report_2/download",
          dateRange: {
            from: q4Start.toISOString(),
            to: q4End.toISOString(),
          },
          type: "QUARTERLY",
        },
      ];

      res.json({
        reports: mockReports,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: mockReports.length,
          pages: 1,
        },
      });
    } catch (error) {
      console.error("Error fetching reports:", error);
      res.status(500).json({ message: "Failed to fetch reports" });
    }
  }

  // Analytics
  static async getRevenueAnalytics(req: Request, res: Response) {
    try {
      const { startDate, endDate, groupBy = "day" } = req.query;

      const start = startDate
        ? new Date(startDate as string)
        : startOfMonth(new Date());
      const end = endDate
        ? new Date(endDate as string)
        : endOfMonth(new Date());

      // CRITICAL FIX: Only count M-Pesa transactions as revenue
      const payments = await prisma.payment.findMany({
        where: {
          status: "COMPLETED",
          method: "MPESA",
          provider: "MPESA",
          createdAt: { gte: start, lte: end },
        },
        select: {
          amount: true,
          createdAt: true,
          method: true,
        },
      });

      // Group by period
      const analytics = payments.reduce((acc, payment) => {
        let period;
        if (groupBy === "day") {
          period = payment.createdAt.toISOString().split("T")[0];
        } else if (groupBy === "week") {
          const weekStart = startOfWeek(payment.createdAt);
          period = weekStart.toISOString().split("T")[0];
        } else {
          period = payment.createdAt.toISOString().substring(0, 7); // YYYY-MM
        }

        if (!acc[period]) {
          acc[period] = {
            period,
            revenue: 0,
            transactions: 0,
            methods: {},
          };
        }

        acc[period].revenue += Number(payment.amount);
        acc[period].transactions += 1;
        acc[period].methods[payment.method] =
          (acc[period].methods[payment.method] || 0) + 1;

        return acc;
      }, {} as any);

      const result = Object.values(analytics).sort((a: any, b: any) =>
        a.period.localeCompare(b.period)
      );

      res.json({
        period: { start, end },
        groupBy,
        data: result,
      });
    } catch (error) {
      console.error("Error fetching revenue analytics:", error);
      res.status(500).json({ message: "Failed to fetch revenue analytics" });
    }
  }

  static async getTransactionAnalytics(req: Request, res: Response) {
    try {
      const { startDate, endDate } = req.query;

      const start = startDate
        ? new Date(startDate as string)
        : startOfMonth(new Date());
      const end = endDate
        ? new Date(endDate as string)
        : endOfMonth(new Date());

      const [transactions, summary] = await Promise.all([
        prisma.payment.findMany({
          where: {
            createdAt: { gte: start, lte: end },
          },
          select: {
            status: true,
            method: true,
            amount: true,
          },
        }),
        prisma.payment.aggregate({
          where: {
            createdAt: { gte: start, lte: end },
          },
          _sum: { amount: true },
          _avg: { amount: true },
          _count: true,
        }),
      ]);

      const statusBreakdown = transactions.reduce((acc, t) => {
        acc[t.status] = (acc[t.status] || 0) + 1;
        return acc;
      }, {} as any);

      const methodBreakdown = transactions.reduce((acc, t) => {
        acc[t.method] = (acc[t.method] || 0) + Number(t.amount);
        return acc;
      }, {} as any);

      res.json({
        period: { start, end },
        summary: {
          totalAmount: Number(summary._sum.amount || 0),
          averageAmount: Number(summary._avg.amount || 0),
          totalTransactions: summary._count,
        },
        breakdowns: {
          byStatus: statusBreakdown,
          byMethod: methodBreakdown,
        },
      });
    } catch (error) {
      console.error("Error fetching transaction analytics:", error);
      res
        .status(500)
        .json({ message: "Failed to fetch transaction analytics" });
    }
  }
}

export default FinanceOfficerController;

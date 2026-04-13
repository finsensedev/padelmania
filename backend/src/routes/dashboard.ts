import { Router } from "express";
import { PrismaClient, PointType } from "@prisma/client";
import { TIER_THRESHOLDS } from "../utils/loyalty";
import {
  resolveRange,
  pct,
  sum,
  bucketize,
  median,
} from "../utils/analytics.util";
import {
  authenticate as authenticateToken,
  authorize,
} from "../middleware/auth.middleware";
import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  subDays,
  subMonths,
  differenceInCalendarDays,
} from "date-fns";

const router = Router();
const prisma = new PrismaClient();

router.get(
  "/stats",
  authenticateToken,
  authorize("ADMIN", "SUPER_ADMIN", "FINANCE_OFFICER", "MANAGER"),
  async (req, res) => {
    try {
      const { courtId, period, date, startDate, endDate } = req.query as {
        courtId?: string;
        period?: string;
        date?: string;
        startDate?: string;
        endDate?: string;
      };
      const now = new Date();
      const todayStart = startOfDay(now);
      const todayEnd = endOfDay(now);
      const yesterdayStart = startOfDay(subDays(now, 1));
      const yesterdayEnd = endOfDay(subDays(now, 1));
      const weekStart = startOfWeek(now, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
      const lastWeekStart = startOfWeek(subDays(now, 7), { weekStartsOn: 1 });
      const lastWeekEnd = endOfWeek(subDays(now, 7), { weekStartsOn: 1 });
      const monthStart = startOfMonth(now);
      const monthEnd = endOfMonth(now);
      const lastMonthStart = startOfMonth(subMonths(now, 1));
      const lastMonthEnd = endOfMonth(subMonths(now, 1));

      // Build court filter for bookings
      const courtFilter =
        courtId && courtId !== "all"
          ? { court: { name: { contains: `Court ${courtId}` } } }
          : {};

      // Revenue calculations (filtered by court if specified)
      // CRITICAL FIX: Only count M-Pesa transactions as revenue
      // Excludes voucher/gift card payments which are not actual revenue
      const revenueBaseWhere = {
        status: "COMPLETED" as const,
        method: "MPESA" as const,
        provider: "MPESA" as const,
        ...(courtId && courtId !== "all"
          ? {
              booking: { court: { name: { contains: `Court ${courtId}` } } },
            }
          : {}),
      };

      const [
        todayRevenue,
        yesterdayRevenue,
        weekRevenue,
        lastWeekRevenue,
        monthRevenue,
        lastMonthRevenue,
      ] = await Promise.all([
        prisma.payment.aggregate({
          where: {
            ...revenueBaseWhere,
            createdAt: { gte: todayStart, lte: todayEnd },
          },
          _sum: { amount: true },
        }),
        prisma.payment.aggregate({
          where: {
            ...revenueBaseWhere,
            createdAt: { gte: yesterdayStart, lte: yesterdayEnd },
          },
          _sum: { amount: true },
        }),
        prisma.payment.aggregate({
          where: {
            ...revenueBaseWhere,
            createdAt: { gte: weekStart, lte: weekEnd },
          },
          _sum: { amount: true },
        }),
        prisma.payment.aggregate({
          where: {
            ...revenueBaseWhere,
            createdAt: { gte: lastWeekStart, lte: lastWeekEnd },
          },
          _sum: { amount: true },
        }),
        prisma.payment.aggregate({
          where: {
            ...revenueBaseWhere,
            createdAt: { gte: monthStart, lte: monthEnd },
          },
          _sum: { amount: true },
        }),
        prisma.payment.aggregate({
          where: {
            ...revenueBaseWhere,
            createdAt: { gte: lastMonthStart, lte: lastMonthEnd },
          },
          _sum: { amount: true },
        }),
      ]);

      // Bookings statistics (filtered by court if specified)
      const [
        todayBookings,
        yesterdayBookings,
        weekBookings,
        pendingBookings,
        confirmedBookings,
        cancelledBookings,
        totalCourts,
        activeBookingsNow,
      ] = await Promise.all([
        prisma.booking.count({
          where: {
            createdAt: { gte: todayStart, lte: todayEnd },
            ...courtFilter,
          },
        }),
        prisma.booking.count({
          where: {
            createdAt: { gte: yesterdayStart, lte: yesterdayEnd },
            ...courtFilter,
          },
        }),
        prisma.booking.count({
          where: {
            createdAt: { gte: weekStart, lte: weekEnd },
            ...courtFilter,
          },
        }),
        prisma.booking.count({
          where: {
            status: "PENDING",
            ...courtFilter,
          },
        }),
        prisma.booking.count({
          where: {
            status: "CONFIRMED",
            startTime: { gte: todayStart, lte: todayEnd },
            ...courtFilter,
          },
        }),
        prisma.booking.count({
          where: {
            status: "CANCELLED",
            createdAt: { gte: todayStart, lte: todayEnd },
            ...courtFilter,
          },
        }),
        courtId && courtId !== "all"
          ? prisma.court.count({
              where: { isActive: true, name: { contains: `Court ${courtId}` } },
            })
          : prisma.court.count({ where: { isActive: true } }),
        prisma.booking.count({
          where: {
            status: "CHECKED_IN",
            startTime: { lte: now },
            endTime: { gte: now },
            ...courtFilter,
          },
        }),
      ]);

      // Customer statistics
      const [
        totalCustomers,
        newCustomersToday,
        activeCustomers,
        premiumMembers,
      ] = await Promise.all([
        prisma.user.count({ where: { role: "CUSTOMER" } }),
        prisma.user.count({
          where: {
            role: "CUSTOMER",
            createdAt: { gte: todayStart, lte: todayEnd },
          },
        }),
        prisma.user.count({
          where: {
            role: "CUSTOMER",
            lastLogin: { gte: subDays(now, 30) },
          },
        }),
        prisma.membershipCard.count({
          where: {
            isActive: true,
            tier: { in: ["SILVER", "GOLD", "PLATINUM"] },
          },
        }),
      ]);

      const revenueGrowth = lastMonthRevenue._sum?.amount
        ? ((Number(monthRevenue._sum?.amount || 0) -
            Number(lastMonthRevenue._sum.amount)) /
            Number(lastMonthRevenue._sum.amount)) *
          100
        : 0;

      const customerGrowthRate = await (async () => {
        const lastMonthNewCustomers = await prisma.user.count({
          where: {
            role: "CUSTOMER",
            createdAt: { gte: lastMonthStart, lte: lastMonthEnd },
          },
        });
        const thisMonthNewCustomers = await prisma.user.count({
          where: {
            role: "CUSTOMER",
            createdAt: { gte: monthStart, lte: monthEnd },
          },
        });
        return lastMonthNewCustomers > 0
          ? ((thisMonthNewCustomers - lastMonthNewCustomers) /
              lastMonthNewCustomers) *
              100
          : 0;
      })();

      // Calculate occupancy rate
      const totalAvailableSlots = totalCourts * 16; // Assuming 16 hours per day
      const occupancyRate =
        totalAvailableSlots > 0
          ? (confirmedBookings / totalAvailableSlots) * 100
          : 0;

      // ---------------- Period Aggregation (DAY/WEEK/MONTH/YEAR) ----------------
      const normalizedPeriod = (period || "").toString().toUpperCase();
      let periodFrom: Date;
      let periodTo: Date;

      if (date) {
        const parsedDate = new Date(date);
        if (!isNaN(parsedDate.getTime())) {
          periodFrom = startOfDay(parsedDate);
          periodTo = endOfDay(parsedDate);
        } else {
          periodFrom = startOfDay(now);
          periodTo = endOfDay(now);
        }
      } else if (normalizedPeriod === "CUSTOM" && startDate && endDate) {
        periodFrom = startOfDay(new Date(startDate));
        periodTo = endOfDay(new Date(endDate));
        // Validate parsed dates
        if (isNaN(periodFrom.getTime()) || isNaN(periodTo.getTime())) {
          periodFrom = startOfDay(now);
          periodTo = endOfDay(now);
        }
      } else {
        switch (normalizedPeriod) {
          case "DAY":
            periodFrom = startOfDay(now);
            periodTo = endOfDay(now);
            break;
          case "WEEK":
            periodFrom = startOfWeek(now, { weekStartsOn: 1 });
            periodTo = endOfWeek(now, { weekStartsOn: 1 });
            break;
          case "MONTH":
            periodFrom = startOfMonth(now);
            periodTo = endOfMonth(now);
            break;
          case "YEAR":
            periodFrom = startOfYear(now);
            periodTo = endOfYear(now);
            break;
          default:
            periodFrom = startOfDay(now);
            periodTo = endOfDay(now);
            break; // default DAY
        }
      }

      // Period revenue (M-Pesa only)
      const periodRevenueAgg = await prisma.payment.aggregate({
        where: {
          ...revenueBaseWhere,
          createdAt: { gte: periodFrom, lte: periodTo },
        },
        _sum: { amount: true },
      });

      // Period bookings & statuses (using createdAt window)
      const [
        periodBookingsTotal,
        periodBookingsConfirmed,
        periodBookingsPending,
        periodBookingsCancelled,
        periodBookingsRecords,
      ] = await Promise.all([
        prisma.booking.count({
          where: {
            createdAt: { gte: periodFrom, lte: periodTo },
            ...courtFilter,
          },
        }),
        prisma.booking.count({
          where: {
            createdAt: { gte: periodFrom, lte: periodTo },
            status: "CONFIRMED",
            ...courtFilter,
          },
        }),
        prisma.booking.count({
          where: {
            createdAt: { gte: periodFrom, lte: periodTo },
            status: "PENDING",
            ...courtFilter,
          },
        }),
        prisma.booking.count({
          where: {
            createdAt: { gte: periodFrom, lte: periodTo },
            status: "CANCELLED",
            ...courtFilter,
          },
        }),
        prisma.booking.findMany({
          where: {
            startTime: { gte: periodFrom, lte: periodTo },
            status: { in: ["CONFIRMED", "CHECKED_IN", "COMPLETED"] },
            ...courtFilter,
          },
          select: { duration: true, userId: true },
        }),
      ]);

      // Distinct active verified customers in period (those with a booking in window & verified email)
      const activeVerifiedCustomerIds = new Set<string>();
      for (const b of periodBookingsRecords)
        activeVerifiedCustomerIds.add(b.userId);
      const activeVerifiedCount = activeVerifiedCustomerIds.size
        ? await prisma.user.count({
            where: {
              id: { in: Array.from(activeVerifiedCustomerIds) },
              role: "CUSTOMER",
              emailVerified: true,
            },
          })
        : 0;
      const verifiedTotal = await prisma.user.count({
        where: { role: "CUSTOMER", emailVerified: true },
      });
      const newVerifiedPeriod = await prisma.user.count({
        where: {
          role: "CUSTOMER",
          emailVerified: true,
          createdAt: { gte: periodFrom, lte: periodTo },
        },
      });

      // Utilization for period (sum booked hours / (active courts * 16 * days))
      const bookedHoursPeriod = periodBookingsRecords.reduce(
        (acc, b) => acc + b.duration / 60,
        0,
      );
      const activeCourtsCount = totalCourts || 1;
      const daysInRange = Math.max(
        1,
        differenceInCalendarDays(periodTo, periodFrom) + 1,
      );
      const utilizationPctPeriod =
        (bookedHoursPeriod / (activeCourtsCount * 16 * daysInRange)) * 100;

      const periodSummary = {
        period: date ? "DAY" : normalizedPeriod || "DAY",
        from: periodFrom.toISOString(),
        to: periodTo.toISOString(),
        revenue: { total: Number(periodRevenueAgg._sum?.amount || 0) },
        bookings: {
          total: periodBookingsTotal,
          confirmed: periodBookingsConfirmed,
          pending: periodBookingsPending,
          cancelled: periodBookingsCancelled,
        },
        courts: { utilizationPct: Number(utilizationPctPeriod.toFixed(1)) },
        customers: {
          verifiedTotal,
          activeVerified: activeVerifiedCount,
          newVerified: newVerifiedPeriod,
        },
      };

      return res.json({
        revenue: {
          today: Number(todayRevenue._sum?.amount || 0),
          yesterday: Number(yesterdayRevenue._sum?.amount || 0),
          thisWeek: Number(weekRevenue._sum?.amount || 0),
          lastWeek: Number(lastWeekRevenue._sum?.amount || 0),
          thisMonth: Number(monthRevenue._sum?.amount || 0),
          lastMonth: Number(lastMonthRevenue._sum?.amount || 0),
          growth: revenueGrowth.toFixed(1),
        },
        bookings: {
          today: todayBookings,
          yesterday: yesterdayBookings,
          thisWeek: weekBookings,
          pending: pendingBookings,
          confirmed: confirmedBookings,
          cancelled: cancelledBookings,
          occupancyRate: Math.round(occupancyRate),
        },
        customers: {
          total: totalCustomers,
          new: newCustomersToday,
          active: activeCustomers,
          premium: premiumMembers,
          growthRate: customerGrowthRate.toFixed(1),
        },
        orders: undefined,
        periodSummary,
      });
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      return res
        .status(500)
        .json({ message: "Failed to fetch dashboard statistics" });
    }
  },
);

// --- Advanced Analytics Endpoints (SUPER_ADMIN) ---

// GET /api/dashboard/kpis
router.get(
  "/kpis",
  authenticateToken,
  authorize("SUPER_ADMIN", "FINANCE_OFFICER"),
  async (req, res) => {
    try {
      const { range, from, to, compare } = req.query as any;
      const {
        from: start,
        to: end,
        previous,
      } = resolveRange({
        range: range as any,
        from,
        to,
        compare,
      });

      const prismaRangeFilter = { gte: start, lte: end } as any;
      // CRITICAL FIX: Only count M-Pesa transactions as revenue
      // Gross revenue excludes fully REFUNDED payments (those are not revenue)
      // But includes PARTIALLY_REFUNDED (since some revenue remains)
      const paymentWhereBase = {
        status: {
          in: ["COMPLETED", "PARTIALLY_REFUNDED", "PROCESSING"],
        },
        method: "MPESA",
        provider: "MPESA",
        createdAt: prismaRangeFilter,
      } as any;

      const [payments, bookings, users, courts] = await Promise.all([
        prisma.payment.findMany({
          where: paymentWhereBase,
          select: { amount: true, refundAmount: true },
        }),
        prisma.booking.findMany({
          where: { createdAt: prismaRangeFilter },
          select: {
            status: true,
            totalAmount: true,
            id: true,
            userId: true,
            createdAt: true,
          },
        }),
        prisma.user.findMany({
          where: { role: "CUSTOMER" },
          select: { id: true, createdAt: true },
        }),
        prisma.court.findMany({
          where: { isActive: true },
          select: { id: true },
        }),
      ]);

      const gross = sum(payments.map((p) => Number(p.amount)));
      // Calculate refunds from the same payments array (partial refunds on active payments)
      const refundsTotal = sum(
        payments.map((p) => Number(p.refundAmount || 0)),
      );
      const net = gross - refundsTotal;
      const bookingAmounts = bookings
        .filter((b) =>
          ["CONFIRMED", "COMPLETED", "CHECKED_IN"].includes(b.status),
        )
        .map((b) => Number(b.totalAmount));
      const avgBookingValue = bookingAmounts.length
        ? sum(bookingAmounts) / bookingAmounts.length
        : 0;

      const pending = bookings.filter((b) => b.status === "PENDING").length;
      const confirmed = bookings.filter((b) => b.status === "CONFIRMED").length;
      const cancelled = bookings.filter((b) => b.status === "CANCELLED").length;
      const completed = bookings.filter((b) => b.status === "COMPLETED").length;
      const funnelTotal = pending + confirmed + cancelled + completed;
      const conversionPct = pct(confirmed + completed, funnelTotal, 0);

      // Customer metrics
      const newCustomers = users.filter(
        (u) => u.createdAt >= start && u.createdAt <= end,
      ).length;

      // Build map of bookings per user in this period
      const bookingByUser: Record<string, number> = {};
      bookings.forEach((b) => {
        bookingByUser[b.userId] = (bookingByUser[b.userId] || 0) + 1;
      });

      // Active users in current period
      const currentActiveUsers = new Set(Object.keys(bookingByUser));

      // Period Retention: % of previous period's customers who remained active
      let retentionPct = 0;
      let returningCustomers = 0;

      if (previous) {
        // Get bookings from previous period
        const prevBookings = await prisma.booking.findMany({
          where: { createdAt: { gte: previous.from, lte: previous.to } },
          select: { userId: true },
        });
        const prevActiveUsers = new Set(prevBookings.map((b) => b.userId));

        // Count how many previous period users are still active in current period
        const retainedUsers = [...prevActiveUsers].filter((userId) =>
          currentActiveUsers.has(userId),
        );
        returningCustomers = retainedUsers.length;

        // Retention = retained users / previous period active users
        retentionPct = pct(returningCustomers, prevActiveUsers.size, 0);
      } else {
        // If no previous period, calculate repeat customer rate as fallback
        const allBookings = await prisma.booking.findMany({
          select: { userId: true },
        });
        const lifetimeBookingsByUser: Record<string, number> = {};
        allBookings.forEach((b) => {
          lifetimeBookingsByUser[b.userId] =
            (lifetimeBookingsByUser[b.userId] || 0) + 1;
        });

        // Returning customers: active users who have >1 booking lifetime
        returningCustomers = [...currentActiveUsers].filter(
          (userId) => (lifetimeBookingsByUser[userId] || 0) > 1,
        ).length;
        retentionPct = pct(returningCustomers, currentActiveUsers.size || 1, 0);
      }

      // Active 30d: users with bookings in last 30 days from period end
      const thirtyAgo = new Date(end.getTime() - 30 * 86400000);
      const active30d = [...currentActiveUsers].filter((userId) => {
        const userBookings = bookings.filter((b) => b.userId === userId);
        return userBookings.some((b) => b.createdAt >= thirtyAgo);
      }).length;

      // Utilization approximation via confirmed+completed durations (need booking durations -> fetch separately if needed)
      const activeCourts = courts.length || 1;
      const days = Math.max(
        1,
        Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1,
      );
      // We only have counts here; for precision should sum durations. Quick proxy: (confirmed+completed)/(activeCourts*days*16) * 100
      const utilizationPct = pct(
        confirmed + completed,
        activeCourts * days * 16,
        0,
      );

      const snapshot = {
        period: { from: start, to: end },
        revenue: {
          gross,
          net,
          refunds: refundsTotal,
          growthPct: 0, // will compute if previous
        },
        bookings: {
          total: bookings.length,
          confirmed,
          cancelled,
          pending,
          completed,
          conversionPct: Number(conversionPct.toFixed(2)),
          avgBookingValue: Number(avgBookingValue.toFixed(2)),
        },
        customers: {
          new: newCustomers,
          returning: returningCustomers,
          active30d,
          churned30d: 0, // would need last booking date per user; placeholder
          retentionPct: Number(retentionPct.toFixed(2)),
        },
        courts: {
          utilizationPct: Number(utilizationPct.toFixed(2)),
          avgHoursPerCourt: 0, // requires duration aggregation
          peakHour: null,
        },
      } as any;

      if (previous) {
        const prevPayments = await prisma.payment.findMany({
          where: {
            status: {
              in: ["COMPLETED", "PARTIALLY_REFUNDED", "PROCESSING"],
            },
            method: "MPESA",
            provider: "MPESA",
            createdAt: { gte: previous.from, lte: previous.to },
          },
          select: { amount: true, refundAmount: true },
        });
        const prevGross = sum(prevPayments.map((p) => Number(p.amount)));
        snapshot.revenue.growthPct = prevGross
          ? Number((((gross - prevGross) / prevGross) * 100).toFixed(2))
          : 0;
        snapshot.previous = { revenue: { gross: prevGross } };
      }

      return res.json(snapshot);
    } catch (error) {
      console.error("KPIs endpoint error", error);
      return res.status(500).json({ message: "Failed to fetch KPIs" });
    }
  },
);

// GET /api/dashboard/revenue-advanced
router.get(
  "/revenue-advanced",
  authenticateToken,
  authorize("SUPER_ADMIN", "FINANCE_OFFICER"),
  async (req, res) => {
    try {
      const { range, from, to, compare } = req.query as any;
      const {
        from: start,
        to: end,
        previous,
      } = resolveRange({ range: range as any, from, to, compare });

      const payments = await prisma.payment.findMany({
        where: {
          status: {
            in: ["COMPLETED", "PARTIALLY_REFUNDED", "PROCESSING"],
          },
          method: "MPESA",
          provider: "MPESA",
          createdAt: { gte: start, lte: end },
        },
        select: {
          amount: true,
          refundAmount: true,
          createdAt: true,
          bookingId: true,
        },
      });
      const gross = sum(payments.map((p) => Number(p.amount)));
      const refunds = sum(payments.map((p) => Number(p.refundAmount || 0)));
      const net = gross - refunds;
      const refundRatePct = gross
        ? Number(((refunds / gross) * 100).toFixed(2))
        : 0;

      // Daily buckets
      const dayMap: Record<
        string,
        { gross: number; refunds: number; bookings: number }
      > = {};
      payments.forEach((p) => {
        const d = p.createdAt.toISOString().slice(0, 10);
        if (!dayMap[d]) dayMap[d] = { gross: 0, refunds: 0, bookings: 0 };
        dayMap[d].gross += Number(p.amount);
        dayMap[d].refunds += Number(p.refundAmount || 0);
      });
      const series = Object.entries(dayMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({
          date,
          gross: v.gross,
          net: v.gross - v.refunds,
          refunds: v.refunds,
          bookings: v.bookings,
          avgBookingValue: v.bookings
            ? Number((v.gross / v.bookings).toFixed(2))
            : 0,
        }));

      const aggregates = {
        gross,
        net,
        refunds,
        refundRatePct,
        revenuePerCourt: 0,
        revenuePerHour: 0,
        peakDay: series.length
          ? series.reduce(
              (a, b) => (b.gross > (a?.gross || 0) ? b : a),
              series[0],
            )
          : null,
        worstDay: series.length
          ? series.reduce(
              (a, b) => (b.gross < (a?.gross || Infinity) ? b : a),
              series[0],
            )
          : null,
      };

      const response: any = {
        period: { from: start, to: end },
        series,
        aggregates,
      };
      if (previous) {
        const prevPayments = await prisma.payment.findMany({
          where: {
            status: {
              in: ["COMPLETED", "PARTIALLY_REFUNDED", "PROCESSING"],
            },
            method: "MPESA",
            provider: "MPESA",
            createdAt: { gte: previous.from, lte: previous.to },
          },
          select: { amount: true, refundAmount: true },
        });
        const prevGross = sum(prevPayments.map((p) => Number(p.amount)));
        const prevRefunds = sum(
          prevPayments.map((p) => Number(p.refundAmount || 0)),
        );
        response.previous = {
          aggregates: {
            gross: prevGross,
            net: prevGross - prevRefunds,
            refunds: prevRefunds,
          },
        };
      }
      return res.json(response);
    } catch (error) {
      console.error("revenue-advanced error", error);
      return res
        .status(500)
        .json({ message: "Failed to fetch revenue analytics" });
    }
  },
);

// GET /api/dashboard/booking-funnel
router.get(
  "/booking-funnel",
  authenticateToken,
  authorize("SUPER_ADMIN", "FINANCE_OFFICER"),
  async (req, res) => {
    try {
      const { range, from, to } = req.query as any;
      const { from: start, to: end } = resolveRange({
        range: range as any,
        from,
        to,
      });
      const bookings = await prisma.booking.findMany({
        where: { createdAt: { gte: start, lte: end } },
        select: { status: true },
      });
      const counts: Record<string, number> = {};
      bookings.forEach((b) => {
        counts[b.status] = (counts[b.status] || 0) + 1;
      });
      const total = bookings.length || 1;
      return res.json({
        period: { from: start, to: end },
        counts,
        rates: {
          confirmRate: pct(
            counts["CONFIRMED"] || 0,
            (counts["PENDING"] || 0) +
              (counts["CONFIRMED"] || 0) +
              (counts["CANCELLED"] || 0),
          ),
          completionRate: pct(counts["COMPLETED"] || 0, total),
          cancellationRate: pct(counts["CANCELLED"] || 0, total),
          refundRate: pct(counts["REFUNDED"] || 0, total),
        },
      });
    } catch (error) {
      console.error("booking-funnel error", error);
      return res
        .status(500)
        .json({ message: "Failed to fetch booking funnel" });
    }
  },
);

// GET /api/dashboard/refunds
router.get(
  "/refunds",
  authenticateToken,
  authorize("SUPER_ADMIN", "FINANCE_OFFICER"),
  async (req, res) => {
    try {
      const { range, from, to } = req.query as any;
      const { from: start, to: end } = resolveRange({
        range: range as any,
        from,
        to,
      });
      const payments = await prisma.payment.findMany({
        where: {
          refundAmount: { gt: 0 },
          refundedAt: { gte: start, lte: end },
          method: "MPESA",
          provider: "MPESA",
        },
        select: {
          id: true,
          refundAmount: true,
          refundedAt: true,
          refundReason: true,
          createdAt: true,
          booking: { select: { bookingCode: true } },
        },
        orderBy: { refundedAt: "desc" },
      });
      const refunds = payments.map((p) => ({
        paymentId: p.id,
        bookingCode: p.booking?.bookingCode || null,
        amount: Number(p.refundAmount),
        refundedAt: p.refundedAt,
        reason: p.refundReason,
        daysFromPayment: p.refundedAt
          ? Math.round(
              (p.refundedAt.getTime() - p.createdAt.getTime()) / 86400000,
            )
          : null,
      }));
      const totalRefunded = sum(refunds.map((r) => r.amount));
      const medianRefundTimeDays = median(
        refunds.map((r) => r.daysFromPayment || 0),
      );
      const count = refunds.length;
      return res.json({
        period: { from: start, to: end },
        refunds,
        aggregates: {
          count,
          totalRefunded,
          avgRefundAmount: count
            ? Number((totalRefunded / count).toFixed(2))
            : 0,
          medianRefundTimeDays,
        },
      });
    } catch (error) {
      console.error("refunds analytics error", error);
      return res.status(500).json({ message: "Failed to fetch refunds" });
    }
  },
);

// GET /api/dashboard/customer-cohorts
router.get(
  "/customer-cohorts",
  authenticateToken,
  authorize("SUPER_ADMIN"),
  async (req, res) => {
    try {
      const { range, from, to } = req.query as any;
      const { from: start, to: end } = resolveRange({
        range: range as any,
        from,
        to,
      });
      const users = await prisma.user.findMany({
        where: { role: "CUSTOMER", createdAt: { lte: end } },
        select: { id: true, createdAt: true },
      });
      const bookings = await prisma.booking.findMany({
        where: { createdAt: { gte: start, lte: end } },
        select: { userId: true },
      });
      const activeSet = new Set(bookings.map((b) => b.userId));
      const cohortMap: Record<
        string,
        { newCustomers: number; activeCustomers: number }
      > = {};
      users.forEach((u) => {
        const key = u.createdAt.toISOString().slice(0, 7); // YYYY-MM
        if (!cohortMap[key])
          cohortMap[key] = { newCustomers: 0, activeCustomers: 0 };
        cohortMap[key].newCustomers += 1;
        if (activeSet.has(u.id)) cohortMap[key].activeCustomers += 1;
      });
      const cohorts = Object.entries(cohortMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([cohortMonth, v]) => ({ cohortMonth, ...v }));

      // Lifetime distributions
      const bookingCounts = await prisma.booking.groupBy({
        by: ["userId"],
        _count: { userId: true },
      });
      const lifetimeMap: Record<string, number> = {};
      bookingCounts.forEach((b) => {
        const bucket = bucketize(b._count.userId);
        lifetimeMap[bucket] = (lifetimeMap[bucket] || 0) + 1;
      });
      const lifetimeBookings = Object.entries(lifetimeMap).map(
        ([bucket, count]) => ({ bucket, count }),
      );

      const payments = await prisma.payment.groupBy({
        by: ["userId"],
        _sum: { amount: true },
        where: {
          status: { in: ["COMPLETED", "PARTIALLY_REFUNDED", "PROCESSING"] },
        },
      });
      const values = payments.map((p) => Number(p._sum.amount || 0));
      values.sort((a, b) => a - b);
      const percentile = (p: number) => {
        if (!values.length) return 0;
        const idx = Math.ceil((p / 100) * values.length) - 1;
        return values[Math.max(0, Math.min(values.length - 1, idx))];
      };
      const lifetimeValue = {
        p50: percentile(50),
        p75: percentile(75),
        p90: percentile(90),
        max: values[values.length - 1] || 0,
      };

      // Top customers by spend
      const topPayments = [...payments]
        .sort((a, b) => Number(b._sum.amount || 0) - Number(a._sum.amount || 0))
        .slice(0, 10);
      const userLookup = await prisma.user.findMany({
        where: {
          id: { in: topPayments.map((p) => p.userId!).filter(Boolean) },
        },
        select: { id: true, firstName: true, lastName: true },
      });
      const nameMap = Object.fromEntries(
        userLookup.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]),
      );
      const topCustomers = topPayments.map((p) => ({
        userId: p.userId,
        name: nameMap[p.userId!] || "Unknown",
        netSpend: Number(p._sum.amount || 0),
      }));

      return res.json({
        period: { from: start, to: end },
        cohorts,
        distribution: { lifetimeBookings, lifetimeValue },
        topCustomers,
      });
    } catch (error) {
      console.error("customer-cohorts error", error);
      return res
        .status(500)
        .json({ message: "Failed to fetch customer cohorts" });
    }
  },
);

// GET /api/dashboard/revenue-chart
router.get(
  "/revenue-chart",
  authenticateToken,
  authorize("ADMIN", "SUPER_ADMIN", "MANAGER", "FINANCE_OFFICER"),
  async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const { courtId } = req.query;
      const data = [];

      // Build court filter
      const courtFilter =
        courtId && courtId !== "all"
          ? { court: { name: { contains: `Court ${courtId}` } } }
          : {};

      // CRITICAL FIX: Only count M-Pesa transactions as revenue
      const revenueFilter = {
        status: "COMPLETED" as const,
        method: "MPESA" as const,
        provider: "MPESA" as const,
        ...(courtId && courtId !== "all"
          ? {
              booking: { court: { name: { contains: `Court ${courtId}` } } },
            }
          : {}),
      };

      for (let i = days - 1; i >= 0; i--) {
        const date = subDays(new Date(), i);
        const dayStart = startOfDay(date);
        const dayEnd = endOfDay(date);

        const [revenue, bookings] = await Promise.all([
          prisma.payment.aggregate({
            where: {
              ...revenueFilter,
              createdAt: { gte: dayStart, lte: dayEnd },
            },
            _sum: { amount: true },
          }),
          prisma.booking.count({
            where: {
              createdAt: { gte: dayStart, lte: dayEnd },
              ...courtFilter,
            },
          }),
        ]);

        data.push({
          date: date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
          revenue: Number(revenue._sum?.amount || 0),
          bookings,
        });
      }

      return res.json(data);
    } catch (error) {
      console.error("Error fetching revenue chart:", error);
      return res
        .status(500)
        .json({ message: "Failed to fetch revenue chart data" });
    }
  },
);

// GET /api/dashboard/hourly-bookings
router.get(
  "/hourly-bookings",
  authenticateToken,
  authorize("ADMIN", "SUPER_ADMIN", "MANAGER"),
  async (req, res) => {
    try {
      const today = new Date();
      const todayStart = startOfDay(today);
      const todayEnd = endOfDay(today);

      const bookings = await prisma.booking.findMany({
        where: {
          startTime: { gte: todayStart, lte: todayEnd },
          status: { in: ["CONFIRMED", "CHECKED_IN", "COMPLETED"] },
        },
        select: {
          startTime: true,
        },
      });

      const hourlyData = [];
      for (let hour = 6; hour <= 22; hour++) {
        const count = bookings.filter((b) => {
          const bookingHour = new Date(b.startTime).getHours();
          return bookingHour === hour;
        }).length;

        hourlyData.push({
          hour: `${hour}:00`,
          bookings: count,
          capacity: 10, // Assuming max 10 bookings per hour
        });
      }

      return res.json(hourlyData);
    } catch (error) {
      console.error("Error fetching hourly bookings:", error);
      return res
        .status(500)
        .json({ message: "Failed to fetch hourly bookings" });
    }
  },
);

// GET /api/dashboard/court-utilization
router.get(
  "/court-utilization",
  authenticateToken,
  authorize("ADMIN", "SUPER_ADMIN", "MANAGER"),
  async (req, res) => {
    try {
      const { courtId } = req.query;
      const today = new Date();
      const todayStart = startOfDay(today);
      const todayEnd = endOfDay(today);

      const courtWhere =
        courtId && courtId !== "all"
          ? { isActive: true, name: { contains: `Court ${courtId}` } }
          : { isActive: true };

      const courts = await prisma.court.findMany({
        where: courtWhere,
        select: {
          id: true,
          name: true,
          bookings: {
            where: {
              startTime: { gte: todayStart, lte: todayEnd },
              status: { in: ["CONFIRMED", "CHECKED_IN", "COMPLETED"] },
            },
            select: {
              duration: true,
            },
          },
        },
      });

      const totalAvailableHours = 16; // 6 AM to 10 PM
      const utilization = courts.map((court) => {
        const bookedHours = court.bookings.reduce(
          (sum, b) => sum + b.duration / 60,
          0,
        );
        const utilizationRate = (bookedHours / totalAvailableHours) * 100;

        return {
          name: court.name.split(" - ")[0], // Get just "Court 1" part
          value: Math.round(utilizationRate),
          color:
            utilizationRate > 80
              ? "#10b981"
              : utilizationRate > 60
                ? "#3b82f6"
                : utilizationRate > 40
                  ? "#8b5cf6"
                  : "#f59e0b",
        };
      });

      return res.json(utilization);
    } catch (error) {
      console.error("Error fetching court utilization:", error);
      return res
        .status(500)
        .json({ message: "Failed to fetch court utilization" });
    }
  },
);

// GET /api/dashboard/recent-activities
router.get(
  "/recent-activities",
  authenticateToken,
  authorize(
    "ADMIN",
    "SUPER_ADMIN",
    "MANAGER",
    "BOOKING_OFFICER",
    "FINANCE_OFFICER",
  ),
  async (req, res) => {
    try {
      const { courtId } = req.query;
      const limit = 10;
      const userId = (req as any).user?.id;

      // Build court filter for bookings
      const courtFilter =
        courtId && courtId !== "all"
          ? { court: { name: { contains: `Court ${courtId}` } } }
          : {};

      // Build court filter for payments (related bookings)
      const paymentCourtFilter =
        courtId && courtId !== "all"
          ? { booking: { court: { name: { contains: `Court ${courtId}` } } } }
          : {};

      const [bookings, payments, users, reads] = await Promise.all([
        prisma.booking.findMany({
          take: limit,
          orderBy: { createdAt: "desc" },
          where: courtFilter,
          select: {
            id: true,
            bookingCode: true,
            createdAt: true,
            user: { select: { firstName: true, lastName: true } },
            court: { select: { name: true } },
          },
        }),
        prisma.payment.findMany({
          where: {
            status: "COMPLETED",
            ...paymentCourtFilter,
          },
          take: limit,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            amount: true,
            method: true,
            metadata: true,
            createdAt: true,
          },
        }),
        prisma.user.findMany({
          where: { role: "CUSTOMER" },
          take: limit,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            createdAt: true,
            membershipCard: { select: { tier: true } },
          },
        }),
        userId
          ? (prisma as any).activityRead.findMany({
              where: { userId },
              select: { entityId: true, activityType: true },
            })
          : Promise.resolve(
              [] as Array<{ entityId: string; activityType: string }>,
            ),
      ]);

      const readMap = new Set<string>(
        (reads as Array<{ entityId: string; activityType: string }>).map(
          (r) => `${r.activityType}:${r.entityId}`,
        ),
      );

      // Combine and sort all activities
      const activities = [
        ...bookings.map((b: (typeof bookings)[number]) => ({
          id: b.id,
          type: "booking" as const,
          title: "New booking created",
          description: `${b.user.firstName} ${b.user.lastName} booked ${b.court.name}`,
          time: b.createdAt,
          user: `${b.user.firstName} ${b.user.lastName}`,
          read: readMap.has(`booking:${b.id}`),
        })),
        ...payments.map((p: (typeof payments)[number]) => {
          // Determine the actual payment method
          // WALLET payments are actually gift card/voucher payments
          const metadata = p.metadata as any;
          const settledVia = metadata?.settledVia;

          const paymentMethodLabel =
            p.method === "WALLET" && settledVia === "GIFTCARD"
              ? "GIFT CARD"
              : p.method === "WALLET" && settledVia === "VOUCHER"
                ? "VOUCHER"
                : p.method === "WALLET" && settledVia === "GIFTCARD_AND_VOUCHER"
                  ? "GIFT CARD & VOUCHER"
                  : p.method === "MPESA"
                    ? "M-PESA"
                    : p.method;

          return {
            id: p.id,
            type: "payment" as const,
            title: "Payment received",
            description: `KES ${Number(
              p.amount,
            ).toLocaleString()} received via ${paymentMethodLabel}`,
            time: p.createdAt,
            amount: Number(p.amount),
            read: readMap.has(`payment:${p.id}`),
          };
        }),
        ...users.map((u: (typeof users)[number]) => ({
          id: u.id,
          type: "customer" as const,
          title: "New customer registered",
          description: `${u.firstName} ${u.lastName} joined${
            u.membershipCard ? ` as ${u.membershipCard.tier} member` : ""
          }`,
          time: u.createdAt,
          user: `${u.firstName} ${u.lastName}`,
          read: readMap.has(`customer:${u.id}`),
        })),
      ]
        .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
        .slice(0, limit);

      return res.json(activities);
    } catch (error) {
      console.error("Error fetching recent activities:", error);
      return res
        .status(500)
        .json({ message: "Failed to fetch recent activities" });
    }
  },
);

// PATCH /api/dashboard/recent-activities/:type/:id/read (mark a single activity as read)
router.patch(
  "/recent-activities/:type/:id/read",
  authenticateToken,
  authorize("SUPER_ADMIN", "MANAGER"),
  async (req, res) => {
    try {
      const { type, id } = req.params;
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      await (prisma as any).activityRead.upsert({
        where: {
          userId_entityId_activityType: {
            userId,
            entityId: id,
            activityType: type,
          },
        },
        update: {},
        create: { userId, entityId: id, activityType: type },
      });

      return res.json({ success: true });
    } catch (error) {
      console.error("Error marking activity read:", error);
      return res
        .status(500)
        .json({ message: "Failed to mark activity as read" });
    }
  },
);

// PATCH /api/dashboard/recent-activities/read-all
router.patch(
  "/recent-activities/read-all",
  authenticateToken,
  authorize("SUPER_ADMIN", "MANAGER"),
  async (req, res) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      // Reconstruct current recent activities (same logic as GET) to know which to mark
      const limit = 10;
      const [bookings, payments, users] = await Promise.all([
        prisma.booking.findMany({
          take: limit,
          orderBy: { createdAt: "desc" },
          select: { id: true, createdAt: true },
        }),
        prisma.payment.findMany({
          where: { status: "COMPLETED" },
          take: limit,
          orderBy: { createdAt: "desc" },
          select: { id: true, createdAt: true },
        }),
        prisma.user.findMany({
          where: { role: "CUSTOMER" },
          take: limit,
          orderBy: { createdAt: "desc" },
          select: { id: true, createdAt: true },
        }),
      ]);

      const all = [
        ...bookings.map((b) => ({ entityId: b.id, activityType: "booking" })),
        ...payments.map((p) => ({ entityId: p.id, activityType: "payment" })),
        ...users.map((u) => ({ entityId: u.id, activityType: "customer" })),
      ]
        .sort((a, b) => 0) // keep order irrelevant
        .slice(0, limit);

      await prisma.$transaction(
        all.map((a) =>
          (prisma as any).activityRead.upsert({
            where: {
              userId_entityId_activityType: {
                userId,
                entityId: a.entityId,
                activityType: a.activityType,
              },
            },
            update: {},
            create: {
              userId,
              entityId: a.entityId,
              activityType: a.activityType,
            },
          }),
        ),
      );

      return res.json({ success: true });
    } catch (error) {
      console.error("Error marking all activities read:", error);
      return res.status(500).json({ message: "Failed to mark all as read" });
    }
  },
);

// GET /api/dashboard/top-customers
router.get(
  "/top-customers",
  authenticateToken,
  authorize("ADMIN", "SUPER_ADMIN", "MANAGER"),
  async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 5;
      const skip = (page - 1) * limit;

      const [total, sortedUsers] = await Promise.all([
        prisma.user.count({
          where: { role: { in: ["CUSTOMER", "BOOKING_OFFICER"] } },
        }),
        prisma.$queryRaw<Array<{ id: string }>>`
          SELECT u.id
          FROM users u
          LEFT JOIN payments p ON u.id = p.user_id AND p.status::text = 'COMPLETED'
          WHERE u.role::text IN ('CUSTOMER', 'BOOKING_OFFICER')
          GROUP BY u.id
          ORDER BY COALESCE(SUM(p.amount), 0) DESC, u.first_name ASC, u.last_name ASC
          LIMIT ${limit} OFFSET ${skip}
        `,
      ]);

      const sortedIds = sortedUsers.map((u) => u.id);

      const customersUnsorted = await prisma.user.findMany({
        where: { id: { in: sortedIds } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          role: true,
          membershipCard: {
            select: { tier: true },
          },
          _count: {
            select: {
              bookings: true,
            },
          },
          payments: {
            where: {
              status: "COMPLETED",
            },
            select: {
              amount: true,
            },
          },
        },
      });

      const customers = sortedIds
        .map((id) => customersUnsorted.find((c) => c.id === id))
        .filter((c): c is NonNullable<typeof c> => c !== undefined);

      const topCustomers = await Promise.all(
        customers.map(async (c) => {
          if (c.role === "BOOKING_OFFICER") {
            return {
              name: `${c.firstName} ${c.lastName}`,
              bookings: c._count.bookings,
              spent: c.payments.reduce((sum, p) => sum + Number(p.amount), 0),
              loyalty: "Staff",
              currentPoints: 0,
              pointsToNextTier: null,
              nextTierName: null,
            };
          }

          // Calculate lifetime points
          const [earned, adjustments] = await Promise.all([
            prisma.loyaltyPoint.aggregate({
              where: {
                userId: c.id,
                type: { in: [PointType.EARNED, PointType.BONUS] },
              },
              _sum: { points: true },
            }),
            prisma.loyaltyPoint.aggregate({
              where: {
                userId: c.id,
                type: PointType.ADJUSTMENT,
              },
              _sum: { points: true },
            }),
          ]);

          const lifetimePoints =
            (earned._sum.points || 0) + (adjustments._sum.points || 0);

          const currentTier = c.membershipCard?.tier || "BRONZE";
          let pointsToNextTier: number | null = null;
          let nextTierName: string | null = null;

          if (currentTier === "BRONZE") {
            pointsToNextTier = Math.max(
              0,
              TIER_THRESHOLDS.SILVER - lifetimePoints,
            );
            nextTierName = "SILVER";
          } else if (currentTier === "SILVER") {
            pointsToNextTier = Math.max(
              0,
              TIER_THRESHOLDS.GOLD - lifetimePoints,
            );
            nextTierName = "GOLD";
          } else if (currentTier === "GOLD") {
            pointsToNextTier = Math.max(
              0,
              TIER_THRESHOLDS.PLATINUM - lifetimePoints,
            );
            nextTierName = "PLATINUM";
          } else if (currentTier === "PLATINUM") {
            pointsToNextTier = Math.max(
              0,
              TIER_THRESHOLDS.VIP - lifetimePoints,
            );
            nextTierName = "VIP";
          } else if (currentTier === "VIP") {
            pointsToNextTier = 0;
            nextTierName = "Max Tier";
          }

          return {
            name: `${c.firstName} ${c.lastName}`,
            bookings: c._count.bookings,
            spent: c.payments.reduce((sum, p) => sum + Number(p.amount), 0),
            loyalty: currentTier,
            currentPoints: lifetimePoints,
            pointsToNextTier,
            nextTierName,
          };
        }),
      );

      return res.json({
        data: topCustomers,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error("Error fetching top customers:", error);
      return res.status(500).json({ message: "Failed to fetch top customers" });
    }
  },
);

export default router;

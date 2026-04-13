import { Request, Response } from "express";
import prisma from "../../config/db";
import { startOfDay, isAfter, addMonths } from "date-fns";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
} from "date-fns";
// exceljs imported dynamically to avoid TS type resolution issues if @types not present
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ExcelJS = require("exceljs");
import {
  emitAdminAnalytics,
  emitBookingUpdate,
  emitBookingCancelled,
} from "../../utils/ws-bus";
import { calculatePriceBreakdown } from "../../utils/price-breakdown";
import { isDurationAllowed } from "../../utils/booking-config";
import {
  getOperatingHoursConfig,
  isWithinOperatingHours,
} from "../../utils/operating-hours";
import { getCourtSubtotal } from "../../types/booking.types";

export class BookingController {
  private static ok(res: Response, data: unknown, message = "OK") {
    return res.json({ success: true, message, data });
  }

  private static fail(res: Response, message = "Bad Request", code = 400) {
    return res.status(code).json({ success: false, message });
  }

  static async getBookings(req: Request, res: Response) {
    try {
      const { courtId, date, status, cancellations, start, end, page, limit } =
        req.query;

      // Pagination parameters
      const pageNum = Math.max(parseInt(String(page ?? "1"), 10), 1);
      const limitNum = Math.max(parseInt(String(limit ?? "20"), 10), 1);
      const skip = (pageNum - 1) * limitNum;

      const where: any = {};
      if (courtId) where.courtId = String(courtId);

      if (start || end) {
        const startDate = start ? new Date(String(start)) : undefined;
        const endDateRaw = end ? new Date(String(end)) : undefined;
        const endDate = endDateRaw
          ? new Date(endDateRaw.getTime() + 24 * 60 * 60 * 1000)
          : undefined;
        where.startTime = {
          ...(startDate ? { gte: startDate } : {}),
          ...(endDate ? { lt: endDate } : {}),
        };
      } else if (date) {
        const dateStr = String(date);
        let startDate: Date;
        if (dateStr.includes("/")) {
          const [day, month, year] = dateStr.split("/");
          startDate = new Date(`${year}-${month}-${day}`);
        } else {
          startDate = new Date(dateStr);
        }
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 1);
        where.startTime = { gte: startDate, lt: endDate };
      }

      if (status) where.status = String(status);
      if (cancellations === "1") {
        where.status = { in: ["CANCELLED", "REFUNDED"] };
      }

      const [bookings, total] = await Promise.all([
        prisma.booking.findMany({
          where,
          skip,
          take: limitNum,
          select: {
            id: true,
            bookingCode: true,
            userId: true,
            courtId: true,
            startTime: true,
            endTime: true,
            duration: true,
            numberOfPlayers: true,
            status: true,
            previousStatus: true,
            totalAmount: true,
            priceBreakdown: true,
            cancellationReason: true,
            cancelledAt: true,
            cancelledByUserId: true,
            cancelledByRole: true,
            maintenanceId: true,
            checkedInAt: true,
            giftCardGenerated: true,
            generatedGiftCardId: true,
            createdAt: true,
            updatedAt: true,
            user: {
              select: { firstName: true, lastName: true, email: true },
            },
            court: {
              select: { name: true },
            },
            payment: {
              select: {
                amount: true,
                status: true,
                failureReason: true,
                providerRef: true,
                refundAmount: true,
                refundedAt: true,
                metadata: true,
              },
            },
            equipmentRentals: {
              select: {
                id: true,
                quantity: true,
                price: true,
                equipment: { select: { type: true, name: true } },
              },
            },
          },
          orderBy: { startTime: "asc" },
        }),
        prisma.booking.count({ where }),
      ]);

      // Fetch all payments for these bookings (original + ADD_EQUIPMENT)
      const bookingIds = bookings.map((b: any) => b.id);
      const allPayments = await prisma.payment.findMany({
        where: {
          OR: [
            { bookingId: { in: bookingIds } },
            { bookingId: null }, // ADD_EQUIPMENT payments
          ],
        },
        select: {
          bookingId: true,
          metadata: true,
        },
      });

      // Group payments by booking
      const paymentsByBooking = new Map<string, any[]>();
      for (const payment of allPayments) {
        const meta = payment.metadata as any;
        const relatedBookingId = payment.bookingId ?? meta?.relatedBookingId;

        // Only include if related to one of our bookings
        if (relatedBookingId && bookingIds.includes(relatedBookingId)) {
          if (!paymentsByBooking.has(relatedBookingId)) {
            paymentsByBooking.set(relatedBookingId, []);
          }
          paymentsByBooking.get(relatedBookingId)!.push(payment);
        }
      }

      const enriched = bookings.map((b: any) => {
        let derivedReason = b.cancellationReason || null;
        if (!derivedReason && b.status === "CANCELLED" && b.payment) {
          if (b.payment.status === "FAILED") {
            if (/insufficient/i.test(b.payment.failureReason || "")) {
              derivedReason = "Payment failed: Insufficient balance";
            } else if (/cancel/i.test(b.payment.failureReason || "")) {
              derivedReason = "User cancelled payment";
            } else {
              derivedReason = b.payment.failureReason || "Payment failed";
            }
          } else if (b.payment.status === "CANCELLED") {
            derivedReason = b.payment.failureReason || "Payment cancelled";
          }
        }
        if (b.status === "REFUNDED") {
          derivedReason = derivedReason || "Booking refunded";
        }

        // Helper to safely convert to finite number
        const toFinite = (value: unknown): number | undefined => {
          const num = Number(value);
          return Number.isFinite(num) ? num : undefined;
        };

        const durationHours = b.duration > 0 ? b.duration / 60 : 0;

        // Calculate equipment breakdown with proper hourly pricing for rackets
        const racketsQty = (b.equipmentRentals || [])
          .filter((r: any) => r.equipment?.type === "RACKET")
          .reduce((sum: number, r: any) => sum + (r.quantity || 0), 0);

        // For rackets: price is per racket per hour, so multiply by duration
        const racketsAmount = (b.equipmentRentals || [])
          .filter((r: any) => r.equipment?.type === "RACKET")
          .reduce(
            (sum: number, r: any) =>
              sum + (Number(r.price) || 0) * (r.quantity || 0) * durationHours,
            0
          );

        // Calculate balls breakdown
        const ballsQty = (b.equipmentRentals || [])
          .filter((r: any) => r.equipment?.type === "BALLS")
          .reduce((sum: number, r: any) => sum + (r.quantity || 0), 0);

        // For balls: price is per pack (not hourly)
        const ballsAmount = (b.equipmentRentals || [])
          .filter((r: any) => r.equipment?.type === "BALLS")
          .reduce(
            (sum: number, r: any) =>
              sum + (Number(r.price) || 0) * (r.quantity || 0),
            0
          );

        const payment = b.payment
          ? {
              ...b.payment,
              amount:
                b.payment.amount != null ? Number(b.payment.amount) : null,
              refundAmount:
                b.payment.refundAmount != null
                  ? Number(b.payment.refundAmount)
                  : null,
            }
          : null;

        // Aggregate discounts from ALL payments for this booking
        const bookingPayments = paymentsByBooking.get(b.id) || [];
        let totalVoucherDiscount = 0;
        let totalGiftCardApplied = 0;
        let reservationMeta: any = null;

        for (const pmt of bookingPayments) {
          const meta = pmt.metadata as any;
          const voucherAmt = toFinite(meta?.voucher?.discount);
          const giftCardAmt = toFinite(meta?.giftcard?.applied);

          // For vouchers, use metadata (they don't affect payment.amount)
          if (voucherAmt) totalVoucherDiscount += voucherAmt;

          // For gift cards, use the actual payment amount if it's a WALLET payment
          // This represents the actual amount charged to the gift card
          if (pmt.provider === "INTERNAL" && pmt.method === "WALLET") {
            const paymentAmt = toFinite(pmt.amount);
            if (paymentAmt) totalGiftCardApplied += paymentAmt;
          } else if (giftCardAmt) {
            // Fallback to metadata for other payment types
            totalGiftCardApplied += giftCardAmt;
          }

          // Use reservation metadata from original payment
          if (meta?.reservation && !reservationMeta) {
            reservationMeta = meta.reservation;
          }
        }

        const voucherDiscount =
          totalVoucherDiscount > 0 ? totalVoucherDiscount : undefined;
        const giftCardApplied =
          totalGiftCardApplied > 0 ? totalGiftCardApplied : undefined;

        // Calculate equipment subtotal (all equipment including balls)
        const equipmentSubtotal = (b.equipmentRentals || []).reduce(
          (sum: number, rental: any) => {
            const price = toFinite(rental.price) ?? 0;
            const qty = toFinite(rental.quantity) ?? 0;
            // For rackets, multiply by duration in hours; for balls, just quantity
            const isHourly = rental.equipment.type === "RACKET";
            const subtotal = isHourly
              ? price * qty * durationHours
              : price * qty;
            return sum + subtotal;
          },
          0
        );

        // Calculate court subtotal (gross amount before discounts)
        const slotAmount = toFinite(reservationMeta?.slotAmount);
        let courtSubtotal: number = slotAmount ?? 0;

        // If slotAmount is not in metadata, try to reconstruct from priceBreakdown
        if (!courtSubtotal && b.priceBreakdown) {
          const breakdown = b.priceBreakdown as any;
          courtSubtotal = toFinite(breakdown?.courtSubtotal) ?? 0;
        }

        // If still no court subtotal, calculate from gross total minus equipment
        // But we need the GROSS total (before discounts), not b.totalAmount
        if (!courtSubtotal) {
          // Calculate gross from equipment + payment amount + discounts
          const netAmount = toFinite(b.totalAmount) ?? 0;
          const voucherAmt = voucherDiscount ?? 0;
          const giftCardAmt = giftCardApplied ?? 0;
          const grossTotal = netAmount + voucherAmt + giftCardAmt;
          courtSubtotal = Math.max(0, grossTotal - equipmentSubtotal);
        }

        const pricePerHour =
          durationHours > 0 ? courtSubtotal / durationHours : courtSubtotal;

        // Build equipment breakdown
        const equipment = (b.equipmentRentals || []).map((rental: any) => {
          const qty = toFinite(rental.quantity) ?? 0;
          const pricePerUnit = toFinite(rental.price) ?? 0;
          const isHourly = rental.equipment.type === "RACKET";
          // For rackets, multiply by duration in hours; for balls, just quantity
          const subtotal = isHourly
            ? pricePerUnit * qty * durationHours
            : pricePerUnit * qty;

          return {
            type: rental.equipment.type,
            name: rental.equipment.name,
            quantity: qty,
            pricePerUnit: pricePerUnit,
            subtotal: subtotal,
          };
        });

        return {
          ...b,
          derivedReason,
          refundInfo: payment?.refundAmount
            ? {
                amount: payment.refundAmount,
                refundedAt: payment.refundedAt,
              }
            : null,
          rackets: {
            quantity: racketsQty,
            amount: racketsAmount,
          },
          balls: {
            quantity: ballsQty,
            amount: ballsAmount,
          },
          payment,
          pricing: {
            totalAmount: toFinite(b.totalAmount) ?? 0,
            courtSubtotal,
            equipmentSubtotal,
            voucherDiscount: voucherDiscount ?? null,
            giftCardApplied: giftCardApplied ?? null,
            pricePerHour,
            equipment,
          },
          priceBreakdown: b.priceBreakdown,
          equipmentRentals: b.equipmentRentals,
        };
      });

      return res.json({
        success: true,
        message: "OK",
        data: enriched,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
        },
      });
    } catch (error) {
      console.error("Error in getBookings:", error);
      return BookingController.fail(res, "Failed to fetch bookings", 500);
    }
  }

  static async getManagerSummary(req: Request, res: Response) {
    try {
      const { period = "DAY", date, start, end } = req.query;
      let rangeStart: Date;
      let rangeEnd: Date;
      const baseDate = date ? new Date(String(date)) : new Date();

      const p = String(period).toUpperCase();
      if (start || end) {
        rangeStart = start ? new Date(String(start)) : new Date();
        rangeEnd = end ? new Date(String(end)) : new Date();
      } else if (p === "DAY") {
        rangeStart = startOfDay(baseDate);
        rangeEnd = new Date(rangeStart.getTime() + 24 * 60 * 60 * 1000);
      } else if (p === "WEEK") {
        rangeStart = startOfWeek(baseDate, { weekStartsOn: 1 }); // Monday
        rangeEnd = new Date(
          endOfWeek(baseDate, { weekStartsOn: 1 }).getTime() + 1
        );
      } else if (p === "MONTH") {
        rangeStart = startOfMonth(baseDate);
        rangeEnd = new Date(endOfMonth(baseDate).getTime() + 1);
      } else {
        // YEAR
        rangeStart = startOfYear(baseDate);
        rangeEnd = new Date(endOfYear(baseDate).getTime() + 1);
      }

      // CRITICAL FIX: Calculate revenue from actual M-Pesa payments, not booking amounts
      const bookings = await prisma.booking.findMany({
        where: { startTime: { gte: rangeStart, lt: rangeEnd } },
        select: {
          id: true,
          totalAmount: true,
          status: true,
          payment: {
            select: {
              amount: true,
              method: true,
              provider: true,
              status: true,
            },
          },
        },
      });

      const totalBookings = bookings.length;
      // Only count M-Pesa payments as revenue
      const totalRevenue = bookings
        .filter(
          (b) =>
            ["CONFIRMED", "CHECKED_IN", "COMPLETED"].includes(b.status) &&
            b.payment?.status === "COMPLETED" &&
            b.payment?.method === "MPESA" &&
            b.payment?.provider === "MPESA"
        )
        .reduce((sum, b) => sum + Number(b.payment?.amount || 0), 0);
      const avgValue = totalBookings ? totalRevenue / totalBookings : 0;

      return BookingController.ok(res, {
        period: p,
        from: rangeStart,
        to: new Date(rangeEnd.getTime() - 1),
        totalBookings,
        revenue: totalRevenue,
        averageBookingValue: avgValue,
      });
    } catch (e) {
      console.error("Manager summary error", e);
      return BookingController.fail(res, "Failed to compute summary", 500);
    }
  }

  static async exportManagerBookings(req: Request, res: Response) {
    try {
      const { period = "DAY", date, start, end } = req.query;
      let rangeStart: Date;
      let rangeEnd: Date;
      const baseDate = date ? new Date(String(date)) : new Date();
      const p = String(period).toUpperCase();
      if (start || end) {
        rangeStart = start ? new Date(String(start)) : new Date();
        rangeEnd = end ? new Date(String(end)) : new Date();
      } else if (p === "DAY") {
        rangeStart = startOfDay(baseDate);
        rangeEnd = new Date(rangeStart.getTime() + 24 * 60 * 60 * 1000);
      } else if (p === "WEEK") {
        rangeStart = startOfWeek(baseDate, { weekStartsOn: 1 });
        rangeEnd = new Date(
          endOfWeek(baseDate, { weekStartsOn: 1 }).getTime() + 1
        );
      } else if (p === "MONTH") {
        rangeStart = startOfMonth(baseDate);
        rangeEnd = new Date(endOfMonth(baseDate).getTime() + 1);
      } else {
        rangeStart = startOfYear(baseDate);
        rangeEnd = new Date(endOfYear(baseDate).getTime() + 1);
      }

      const bookings = await prisma.booking.findMany({
        where: { startTime: { gte: rangeStart, lt: rangeEnd } },
        include: {
          user: { select: { firstName: true, lastName: true, email: true } },
          court: { select: { name: true } },
          payment: { select: { status: true, providerRef: true } },
        },
        orderBy: { startTime: "asc" },
      });

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Bookings");
      sheet.columns = [
        { header: "Booking Code", key: "bookingCode", width: 18 },
        { header: "Date", key: "date", width: 16 },
        { header: "Start Time", key: "start", width: 14 },
        { header: "End Time", key: "end", width: 14 },
        { header: "Court", key: "court", width: 18 },
        { header: "Customer", key: "customer", width: 24 },
        { header: "Email", key: "email", width: 28 },
        { header: "Status", key: "status", width: 14 },
        { header: "Total Amount", key: "total", width: 16 },
        { header: "Payment Status", key: "paymentStatus", width: 16 },
        { header: "Payment Ref", key: "paymentRef", width: 18 },
      ];

      for (const b of bookings) {
        sheet.addRow({
          bookingCode: b.bookingCode,
          date: b.startTime.toISOString().split("T")[0],
          start: b.startTime.toTimeString().substring(0, 5),
          end: b.endTime.toTimeString().substring(0, 5),
          court: b.court?.name,
          customer: `${b.user?.firstName || ""} ${
            b.user?.lastName || ""
          }`.trim(),
          email: b.user?.email,
          status: b.status,
          total: Number(b.totalAmount),
          paymentStatus: b.payment?.status,
          paymentRef: b.payment?.providerRef,
        });
      }

      const fileName = `bookings_${p.toLowerCase()}_${Date.now()}.xlsx`;
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);
      await workbook.xlsx.write(res);
      res.end();
    } catch (e) {
      console.error("Export bookings error", e);
      return BookingController.fail(res, "Failed to export bookings", 500);
    }
  }

  static async getBooking(req: Request, res: Response) {
    const id = String(req.params.id);
    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        court: {
          select: {
            name: true,
            baseHourlyRate: true,
            peakHourlyRate: true,
            weekendRate: true,
          },
        },
      },
    });

    if (!booking) return BookingController.fail(res, "Booking not found", 404);
    return BookingController.ok(res, booking);
  }

  static async createBooking(req: Request, res: Response) {
    try {
      const { courtId, startTime, endTime, numberOfPlayers, totalAmount } =
        req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const startDate = new Date(String(startTime));
      const endDate = new Date(String(endTime));

      if (
        isNaN(startDate.getTime()) ||
        isNaN(endDate.getTime()) ||
        endDate <= startDate
      ) {
        return res.status(400).json({
          message: "Invalid start/end time provided",
        });
      }

      // Validate booking date is within 1 month
      const bookingDate = startDate;
      const today = startOfDay(new Date());
      const maxDate = addMonths(today, 1);

      if (bookingDate < today) {
        return res.status(400).json({
          message: "Cannot book courts in the past",
        });
      }

      if (isAfter(startOfDay(bookingDate), maxDate)) {
        return res.status(400).json({
          message: "Bookings can only be made up to 1 month in advance",
        });
      }

      // Check if court exists and is active
      const court = await prisma.court.findUnique({
        where: { id: courtId },
      });

      if (!court || !court.isActive) {
        return res.status(400).json({ message: "Court not available" });
      }

      // Enforce operating hours
      const operatingHours = await getOperatingHoursConfig();
      const withinHours = isWithinOperatingHours(
        startDate,
        endDate,
        operatingHours
      );
      if (!withinHours.valid) {
        return res.status(400).json({
          message:
            withinHours.reason || "Selected time is outside operating hours",
        });
      }

      // Check for existing bookings in the time slot
      const existingBooking = await prisma.booking.findFirst({
        where: {
          courtId,
          status: {
            in: ["CONFIRMED", "PENDING", "CHECKED_IN"],
          },
          OR: [
            {
              AND: [
                { startTime: { lte: startDate } },
                { endTime: { gt: startDate } },
              ],
            },
            {
              AND: [
                { startTime: { lt: endDate } },
                { endTime: { gt: endDate } },
              ],
            },
            {
              AND: [
                { startTime: { gte: startDate } },
                { endTime: { lte: endDate } },
              ],
            },
          ],
        },
      });

      if (existingBooking) {
        console.log("BOOKING CONFLICT DETECTED:");
        console.log("New booking:", { courtId, startTime, endTime });
        console.log("Conflicting booking:", {
          id: existingBooking.id,
          startTime: existingBooking.startTime.toISOString(),
          endTime: existingBooking.endTime.toISOString(),
          status: existingBooking.status,
        });
        return res.status(400).json({
          message: "This time slot is already booked",
        });
      }

      // Generate booking code
      const bookingCode = `BK${Date.now().toString(36).toUpperCase()}`;

      // Calculate duration in minutes
      const duration = Math.round(
        (endDate.getTime() - startDate.getTime()) / 60000
      );

      // Validate duration against allowed configurations
      const isDurationValid = await isDurationAllowed(duration);
      if (!isDurationValid) {
        return res.status(400).json({
          message: `Duration of ${duration} minutes is not allowed. Please check available slot durations.`,
        });
      }

      // Calculate detailed price breakdown
      const priceBreakdown = await calculatePriceBreakdown({
        courtId,
        startTime: startDate,
        endTime: endDate,
        durationMinutes: duration,
        equipmentRentals: [], // Equipment will be added separately after booking creation
        baseHourlyRate: Number(court.baseHourlyRate),
      });

      // Create the booking
      const booking = await prisma.booking.create({
        data: {
          bookingCode,
          userId,
          courtId,
          startTime: startDate,
          endTime: endDate,
          duration,
          numberOfPlayers,
          totalAmount,
          priceBreakdown: priceBreakdown as any,
          status: "PENDING",
        },
        include: {
          court: {
            select: {
              id: true,
              name: true,
            },
          },
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });

      // Emit real-time analytics & booking update
      try {
        emitBookingUpdate(courtId, {
          type: "BOOKING_CREATED",
          bookingId: booking.id,
          status: booking.status,
          startTime: booking.startTime,
          endTime: booking.endTime,
          amount: Number(totalAmount),
        });
        emitAdminAnalytics("booking", {
          kind: "created",
          amount: Number(totalAmount),
          courtId,
          startTime: booking.startTime,
          status: booking.status,
        });
      } catch (e) {
        console.warn("Booking create analytics emit failed", e);
      }

      return res.status(201).json({
        data: booking,
        message: "Booking created successfully",
      });
    } catch (error) {
      console.error("Error creating booking:", error);
      return res.status(500).json({ message: "Failed to create booking" });
    }
  }

  static async updateBooking(req: Request, res: Response) {
    const id = String(req.params.id);
    const {
      status,
      startTime,
      endTime,
      numberOfPlayers,
      totalAmount,
      courtId,
    } = req.body || {};

    const exists = await prisma.booking.findUnique({ where: { id } });
    if (!exists) return BookingController.fail(res, "Booking not found", 404);

    const requester = req.user;
    const isAdmin =
      !!requester && ["ADMIN", "SUPER_ADMIN"].includes(requester.role);
    const isOwner = requester?.id === exists.userId;

    // Enforce ownership for non-admins
    if (!isAdmin && !isOwner) {
      return BookingController.fail(res, "Forbidden", 403);
    }

    // For customer self-edit, enforce 24-hour rule and restrict fields
    const now = new Date();
    const twentyFourHrsBefore = new Date(
      exists.startTime.getTime() - 24 * 60 * 60 * 1000
    );
    if (!isAdmin && now >= twentyFourHrsBefore) {
      return BookingController.fail(
        res,
        "Bookings can only be edited more than 24 hours before start time",
        400
      );
    }

    const data: any = {};
    // Admins can update status; customers cannot
    if (isAdmin && status) data.status = status;
    // Editable fields (both admin and owner): time, court, players
    if (startTime) data.startTime = new Date(String(startTime));
    if (endTime) data.endTime = new Date(String(endTime));
    if (courtId) data.courtId = String(courtId);
    if (numberOfPlayers !== undefined)
      data.numberOfPlayers = Number(numberOfPlayers);
    // Non-editable by customers: payment/amount; ignore totalAmount from non-admins
    if (isAdmin && totalAmount !== undefined)
      data.totalAmount = Number(totalAmount);

    // Validate new times if provided
    const nextStart = data.startTime || exists.startTime;
    const nextEnd = data.endTime || exists.endTime;
    if (nextEnd <= nextStart) {
      return BookingController.fail(
        res,
        "End time must be after start time",
        400
      );
    }

    // Conflict check on target court/time (exclude this booking)

    const operatingHours = await getOperatingHoursConfig();
    const withinHours = isWithinOperatingHours(
      nextStart,
      nextEnd,
      operatingHours
    );
    if (!withinHours.valid) {
      return BookingController.fail(
        res,
        withinHours.reason || "Selected time is outside operating hours",
        400
      );
    }
    const targetCourtId = data.courtId || exists.courtId;
    const conflict = await prisma.booking.findFirst({
      where: {
        id: { not: id },
        courtId: targetCourtId,
        OR: [
          { status: { in: ["CONFIRMED", "CHECKED_IN"] } },
          {
            AND: [
              { status: "PENDING" },
              { createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) } },
            ],
          },
          { AND: [{ status: "CANCELLED" }, { notes: "MAINTENANCE" }] as any },
        ],
        AND: [{ startTime: { lt: nextEnd } }, { endTime: { gt: nextStart } }],
      },
    });
    if (conflict) {
      return BookingController.fail(
        res,
        "Selected time slot is not available",
        409
      );
    }

    // Recalculate duration if times changed
    if (data.startTime || data.endTime) {
      const start = data.startTime || exists.startTime;
      const end = data.endTime || exists.endTime;
      const newDuration = Math.round(
        (end.getTime() - start.getTime()) / (1000 * 60)
      );

      // Validate duration against allowed configurations
      const isDurationValid = await isDurationAllowed(newDuration);
      if (!isDurationValid) {
        return BookingController.fail(
          res,
          `Duration of ${newDuration} minutes is not allowed. Please check available slot durations.`,
          400
        );
      }

      data.duration = newDuration;
    }

    const prev = exists;
    const booking = await prisma.booking.update({
      where: { id },
      data,
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        court: {
          select: {
            name: true,
          },
        },
      },
    });

    // Audit log edit
    try {
      await prisma.auditLog.create({
        data: {
          userId: requester?.id,
          action: isAdmin ? "BOOKING_ADMIN_EDIT" : "BOOKING_SELF_EDIT",
          entity: "BOOKING",
          entityId: id,
          oldData: prev as any,
          newData: booking as any,
        },
      });
    } catch (e) {
      console.warn("Failed to write audit log for booking edit", e);
    }

    return BookingController.ok(res, booking, "Booking updated");
  }

  static async cancelBooking(req: Request, res: Response) {
    const id = String(req.params.id);
    const exists = await prisma.booking.findUnique({ where: { id } });
    if (!exists) return BookingController.fail(res, "Booking not found", 404);

    // Only admins or the owner of the booking can cancel
    const requester = req.user;
    // Allow MANAGER role to cancel any booking as per new requirement
    if (
      !requester ||
      (!["ADMIN", "SUPER_ADMIN", "MANAGER"].includes(requester.role) &&
        exists.userId !== requester.id)
    ) {
      return BookingController.fail(res, "Forbidden", 403);
    }

    if (exists.status === "CANCELLED") {
      return BookingController.fail(res, "Booking is already cancelled", 400);
    }

    // Prevent canceling past bookings
    const now = new Date();
    if (exists.startTime < now) {
      return BookingController.fail(
        res,
        "Cannot cancel a booking that has already started or passed",
        400
      );
    }

    const booking = await prisma.booking.update({
      where: { id },
      data: { status: "CANCELLED" },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        court: { select: { name: true } },
        payment: { select: { refundAmount: true, refundedAt: true } },
      },
    });

    try {
      const actor = req.user!;
      emitBookingUpdate(exists.courtId, {
        type: "BOOKING_STATUS",
        from: exists.status,
        to: "CANCELLED",
        bookingId: exists.id,
      });
      emitBookingCancelled({
        bookingId: exists.id,
        bookingCode: exists.bookingCode,
        courtId: exists.courtId,
        actorId: actor.id,
        actorRole: actor.role,
        actorEmail: actor.email,
        reason: exists.cancellationReason || undefined,
        at: new Date().toISOString(),
        amount: Number(booking.totalAmount) || 0,
      });
      emitAdminAnalytics("booking", {
        kind: "status_changed",
        from: exists.status,
        to: "CANCELLED",
        bookingId: exists.id,
      });
    } catch (e) {
      console.warn("Booking cancel analytics emit failed", e);
    }

    // Audit log entry
    (async () => {
      try {
        await prisma.auditLog.create({
          data: {
            userId: req.user?.id || null,
            action: "BOOKING_CANCELLED",
            entity: "BOOKING",
            entityId: exists.id,
            oldData: { status: exists.status },
            newData: {
              status: "CANCELLED",
              bookingCode: exists.bookingCode,
              courtId: exists.courtId,
              amount: Number(booking.totalAmount) || 0,
              reason: exists.cancellationReason || null,
            },
            ipAddress: req.ip,
            userAgent: req.headers["user-agent"] || null,
          },
        });
      } catch (auditErr) {
        console.error(
          "Failed to write audit log (booking cancellation)",
          auditErr
        );
      }
    })();

    // Send cancellation email asynchronously
    (async () => {
      try {
        if (!booking.user?.email) return;
        const { buildBookingCancellationEmail, sendMail } = await import(
          "../../utils/mailer"
        );
        const start = exists.startTime;
        const end = exists.endTime;
        const dateFmt = start.toLocaleDateString("en-KE", {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
        });
        const timeRange = `${start.toLocaleTimeString("en-KE", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })} - ${end.toLocaleTimeString("en-KE", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })}`;

        // Convert technical reason to user-friendly message
        const { getUserFriendlyReason } = await import(
          "../../utils/booking-helpers"
        );
        const customerReason = getUserFriendlyReason(
          exists.cancellationReason,
          "Your booking has been cancelled"
        );

        const tpl = buildBookingCancellationEmail({
          firstName: booking.user?.firstName,
          bookingCode: exists.bookingCode,
          courtName: booking.court?.name,
          date: dateFmt,
          timeRange,
          reason: customerReason,
          refundedAmount: booking.payment?.refundAmount
            ? Number(booking.payment.refundAmount)
            : null,
        });
        await sendMail({
          to: booking.user.email,
          subject: tpl.subject,
          html: tpl.html,
        });

        // Manager notification (refund / follow-up)
        try {
          const managerEmail =
            process.env.MAINTENANCE_ALERT_TO || req.user?.email;
          if (managerEmail) {
            const title = `Booking Cancelled (${exists.bookingCode})`;
            const actorName =
              (req.user as any)?.firstName ||
              (req.user as any)?.email ||
              "System";
            const bodyHtml = `<p>The booking <strong>${
              exists.bookingCode
            }</strong> on court <strong>${
              booking.court?.name
            }</strong> for ${dateFmt} ${timeRange} was cancelled by <strong>${actorName}</strong>.</p>
              <p>Status before cancellation: ${exists.status}</p>
              ${
                exists.cancellationReason
                  ? `<p>Reason: ${exists.cancellationReason}</p>`
                  : ""
              }
              <p>Total Amount: KSh ${Number(
                booking.totalAmount || 0
              ).toLocaleString()}</p>
              ${
                booking.payment?.refundAmount
                  ? `<p>Refunded Amount: KSh ${Number(
                      booking.payment.refundAmount
                    ).toLocaleString()}</p>`
                  : "<p>No refund recorded yet.</p>"
              }
              <p>Please review for refund processing if payment was captured.</p>`;
            await sendMail({
              to: managerEmail,
              subject: title,
              html: bodyHtml,
            });
          }
        } catch (mgrErr) {
          console.error(
            "Failed to send manager cancellation notification",
            mgrErr
          );
        }
      } catch (err) {
        console.error("Failed to send cancellation email", err);
      }
    })();

    return BookingController.ok(res, booking, "Booking cancelled");
  }

  /**
   * Generate a gift card for a cancelled/rescheduled booking
   * Instead of refund, issue a gift card to the customer with the booking amount
   * Requires 2FA authentication (MANAGER role)
   */
  static async generateGiftCardForCancellation(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const exists = await prisma.booking.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          court: { select: { name: true } },
        },
      });

      if (!exists) {
        return BookingController.fail(res, "Booking not found", 404);
      }

      // Only MANAGER or ADMIN can generate gift cards
      const requester = req.user;
      if (
        !requester ||
        !["ADMIN", "SUPER_ADMIN", "MANAGER"].includes(requester.role)
      ) {
        return BookingController.fail(res, "Forbidden", 403);
      }

      // Validate booking has a user
      if (!exists.userId || !exists.user) {
        return BookingController.fail(
          res,
          "Cannot generate gift card: booking has no associated user",
          400
        );
      }

      // Check if gift card already generated
      if (exists.giftCardGenerated) {
        return BookingController.fail(
          res,
          "Gift card has already been generated for this booking",
          400
        );
      }

      // Get the amount to issue (use totalAmount from booking)
      const amount = Number(exists.totalAmount);
      if (!amount || amount <= 0) {
        return BookingController.fail(
          res,
          "Cannot generate gift card: booking has no valid amount",
          400
        );
      }

      // Generate unique gift card code
      const generateCode = () =>
        `GC-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Date.now()
          .toString(36)
          .slice(-4)
          .toUpperCase()}`;

      // Create gift card and auto-redeem to user in a transaction
      let giftCard: any = null;
      const MAX_ATTEMPTS = 5;
      let attempts = 0;

      while (!giftCard && attempts < MAX_ATTEMPTS) {
        const code = generateCode();
        try {
          const result = await prisma.$transaction(async (tx) => {
            const now = new Date();
            // Create gift card
            const card = await (tx as any).giftCard.create({
              data: {
                code,
                amount,
                balance: amount,
                currency: "KES",
                status: "REDEEMED",
                isActive: true,
                purchasedByUserId: requester.id,
                redeemedByUserId: exists.userId,
                redeemedAt: now,
                recipientEmail: exists.user?.email || null,
                message: `Gift card for cancelled booking ${exists.bookingCode}`,
                expiresAt: null, // No expiry - customer can use whenever they want
              },
            });

            // Create ledger entries
            await (tx as any).giftCardLedger.create({
              data: {
                giftCardId: card.id,
                type: "CREDIT",
                amount,
                balanceAfter: amount,
                performedByUserId: requester.id,
                note: `Account credit for cancelled booking ${exists.bookingCode} - Full refund as redeemed gift card`,
                metadata: {
                  bookingId: exists.id,
                  bookingCode: exists.bookingCode,
                  reason: "cancellation_compensation",
                  originalAmount: amount,
                },
              },
            });

            await (tx as any).giftCardLedger.create({
              data: {
                giftCardId: card.id,
                type: "ADJUSTMENT",
                amount: 0,
                balanceAfter: amount,
                performedByUserId: exists.userId,
                note: "Credit automatically added to customer account balance",
              },
            });

            // Update booking to mark gift card as generated and cancel if not already
            const updateData: any = {
              giftCardGenerated: true,
              generatedGiftCardId: card.id,
            };

            // If booking is not cancelled yet, cancel it
            if (exists.status !== "CANCELLED") {
              updateData.status = "CANCELLED";
              updateData.cancelledAt = now;
              updateData.cancelledByUserId = requester.id;
              updateData.cancelledByRole = requester.role;
              updateData.cancellationReason = "GIFT_CARD_ISSUED";
            }

            const updatedBooking = await tx.booking.update({
              where: { id },
              data: updateData,
            });

            return { card, updatedBooking };
          });

          giftCard = result.card;
          break;
        } catch (error: any) {
          if (error?.code === "P2002") {
            // Unique constraint violation, try again with new code
            attempts += 1;
            continue;
          }
          throw error;
        }
      }

      if (!giftCard) {
        return BookingController.fail(
          res,
          "Failed to generate unique gift card code after multiple attempts",
          500
        );
      }

      // Deduct loyalty points if they were earned from this booking's payment
      if (exists.userId) {
        try {
          const payment = await prisma.payment.findFirst({
            where: { bookingId: exists.id },
            select: {
              id: true,
              amount: true,
              transactionId: true,
            },
          });

          if (payment) {
            const { calculatePointsFromAmount } = await import(
              "../../utils/loyalty"
            );

            // Check if loyalty points were earned for this payment
            const earnedPoints = await prisma.loyaltyPoint.findFirst({
              where: {
                userId: exists.userId,
                referenceId: payment.id,
                type: "EARNED",
              },
            });

            if (earnedPoints && earnedPoints.points > 0) {
              // Calculate points to deduct
              const pointsToDeduct = Math.abs(earnedPoints.points);

              await prisma.$transaction([
                prisma.user.update({
                  where: { id: exists.userId },
                  data: { loyaltyPoints: { decrement: pointsToDeduct } },
                }),
                prisma.loyaltyPoint.create({
                  data: {
                    userId: exists.userId,
                    points: -pointsToDeduct,
                    type: "ADJUSTMENT",
                    description: `Points deducted for cancelled booking ${exists.bookingCode} (compensated with gift card)`,
                    referenceId: payment.id,
                  },
                }),
              ]);

              console.log(
                `Deducted ${pointsToDeduct} loyalty points from user ${exists.userId} for cancelled booking ${exists.bookingCode}`
              );
            }
          }
        } catch (loyaltyErr) {
          console.error(
            "Failed to adjust loyalty points for gift card generation",
            loyaltyErr
          );
          // Don't fail the whole operation if loyalty adjustment fails
        }
      }

      // Audit log
      (async () => {
        try {
          await prisma.auditLog.create({
            data: {
              userId: requester.id,
              action: "GIFT_CARD_GENERATED_FOR_BOOKING",
              entity: "BOOKING",
              entityId: exists.id,
              oldData: {
                status: exists.status,
                giftCardGenerated: exists.giftCardGenerated,
              },
              newData: {
                giftCardGenerated: true,
                giftCardId: giftCard.id,
                giftCardCode: giftCard.code,
                amount,
                bookingCode: exists.bookingCode,
              },
              ipAddress: req.ip,
              userAgent: req.headers["user-agent"] || null,
            },
          });
        } catch (auditErr) {
          console.error(
            "Failed to write audit log (gift card generation)",
            auditErr
          );
        }
      })();

      // Send email notification to customer
      (async () => {
        try {
          if (!exists.user?.email) return;

          const { sendMail } = await import("../../utils/mailer");

          const start = exists.startTime;
          const end = exists.endTime;
          const dateFmt = start.toLocaleDateString("en-KE", {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric",
          });
          const timeRange = `${start.toLocaleTimeString("en-KE", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })} - ${end.toLocaleTimeString("en-KE", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })}`;

          const subject = `💳 Credit Added to Your Account • ${exists.bookingCode}`;
          const buttonUrl =
            process.env.APP_URL || "https://padelmania.co.ke/account";

          const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Account Credit - Padel Mania</title>
  <style>
    body { margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f3f4f6; }
    .email-container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 32px 24px; text-align: center; }
    .header h1 { margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; }
    .content { padding: 32px 24px; }
    .amount-box { background: #f0fdf4; border: 2px solid #10b981; border-radius: 8px; padding: 24px; text-align: center; margin: 24px 0; }
    .amount { font-size: 36px; font-weight: 700; color: #10b981; margin: 0; }
    .btn { display: inline-block; padding: 14px 28px; background: #10b981; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 24px 0; }
    .footer { background: #f9fafb; padding: 24px; text-align: center; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <h1>💳 Credit Added to Your Account</h1>
    </div>
    <div class="content">
      <p>Hi ${exists.user.firstName || "there"},</p>
      <p>Good news! We've added credit to your Padel Mania account for your booking.</p>
      
      <div style="background: #f9fafb; border-left: 4px solid #10b981; padding: 16px; margin: 20px 0;">
        <p style="margin: 0 0 8px 0; font-weight: 600; color: #111827;">Booking Details:</p>
        <p style="margin: 4px 0; color: #6b7280;"><strong>Booking Code:</strong> ${
          exists.bookingCode
        }</p>
        <p style="margin: 4px 0; color: #6b7280;"><strong>Court:</strong> ${
          exists.court?.name || "N/A"
        }</p>
        <p style="margin: 4px 0; color: #6b7280;"><strong>Date:</strong> ${dateFmt}</p>
        <p style="margin: 4px 0; color: #6b7280;"><strong>Time:</strong> ${timeRange}</p>
      </div>

      <div class="amount-box">
        <p style="margin: 0 0 8px 0; color: #059669; font-size: 14px; font-weight: 600;">CREDIT AMOUNT</p>
        <p class="amount">KSh ${amount.toLocaleString()}</p>
        <p style="margin: 8px 0 0 0; color: #6b7280; font-size: 14px;">Added to your account balance</p>
      </div>

      <p><strong>What this means:</strong></p>
      <ul style="color: #4b5563; line-height: 1.8;">
        <li>Your booking has been cancelled and the slot is now available for others</li>
        <li>The full amount has been credited to your account</li>
        <li>This credit <strong>never expires</strong> - use it whenever you're ready</li>
        <li>It will be automatically applied to your next booking</li>
        <li>No code needed - it's already in your account</li>
      </ul>

      <div style="text-align: center;">
        <a href="${buttonUrl}" class="btn">Book Your Next Court</a>
      </div>

      <p style="margin-top: 24px; color: #6b7280; font-size: 14px;">
        Have questions? Contact us anytime at Padel Mania.
      </p>
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} Padel Mania. All rights reserved.</p>
      <p style="margin: 8px 0;">Powered by <a href="https://www.finsense.co.ke/" style="color: #10b981; text-decoration: none; font-weight: 600;">FinSense Africa ❤️</a></p>
    </div>
  </div>
</body>
</html>`;

          await sendMail({
            to: exists.user.email,
            subject,
            html,
          });
        } catch (emailErr) {
          console.error("Failed to send account credit email", emailErr);
        }
      })();

      // Emit websocket events
      try {
        if (exists.status !== "CANCELLED") {
          emitBookingUpdate(exists.courtId, {
            type: "BOOKING_STATUS",
            from: exists.status,
            to: "CANCELLED",
            bookingId: exists.id,
          });
          emitBookingCancelled({
            bookingId: exists.id,
            bookingCode: exists.bookingCode,
            courtId: exists.courtId,
            actorId: requester.id,
            actorRole: requester.role,
            actorEmail: requester.email,
            reason: "Gift card issued",
            at: new Date().toISOString(),
            amount,
          });
        }
        emitAdminAnalytics("booking", {
          kind: "gift_card_generated",
          bookingId: exists.id,
          giftCardId: giftCard.id,
          amount,
        });
      } catch (e) {
        console.warn("Gift card generation event emission failed", e);
      }

      return BookingController.ok(
        res,
        {
          booking: {
            id: exists.id,
            bookingCode: exists.bookingCode,
            giftCardGenerated: true,
          },
          giftCard: {
            id: giftCard.id,
            amount,
            balance: amount,
            redeemedByUserId: exists.userId,
            redeemedAt: giftCard.redeemedAt,
          },
        },
        "Account credit added to customer successfully"
      );
    } catch (error) {
      console.error("generateGiftCardForCancellation error", error);
      return res
        .status(500)
        .json({ message: "Failed to generate gift card for booking" });
    }
  }

  static async confirmBooking(req: Request, res: Response) {
    const id = String(req.params.id);
    const exists = await prisma.booking.findUnique({ where: { id } });
    if (!exists) return BookingController.fail(res, "Booking not found", 404);

    // Only admins can confirm
    const requester = req.user;
    if (!requester || !["ADMIN", "SUPER_ADMIN"].includes(requester.role)) {
      return BookingController.fail(res, "Forbidden", 403);
    }

    const booking = await prisma.booking.update({
      where: { id },
      data: { status: "CONFIRMED" },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        court: {
          select: {
            name: true,
          },
        },
      },
    });

    try {
      emitBookingUpdate(exists.courtId, {
        type: "BOOKING_STATUS",
        from: exists.status,
        to: "CONFIRMED",
        bookingId: exists.id,
      });
      emitAdminAnalytics("booking", {
        kind: "status_changed",
        from: exists.status,
        to: "CONFIRMED",
        bookingId: exists.id,
      });
    } catch (e) {
      console.warn("Booking confirm analytics emit failed", e);
    }

    return BookingController.ok(res, booking, "Booking confirmed");
  }

  static async deleteBooking(req: Request, res: Response) {
    const id = String(req.params.id);

    const exists = await prisma.booking.findUnique({ where: { id } });
    if (!exists) return BookingController.fail(res, "Booking not found", 404);

    await prisma.booking.delete({ where: { id } });
    return BookingController.ok(res, { id }, "Booking deleted");
  }

  /**
   * Reschedule a booking to a new court/time slot
   * Available to: customers (owner with 24-hour rule) and booking officers
   */
  static async rescheduleBooking(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const { courtId, startTime, endTime } = req.body || {};

      if (!courtId || !startTime || !endTime) {
        return BookingController.fail(
          res,
          "courtId, startTime, and endTime are required",
          400
        );
      }

      const exists = await prisma.booking.findUnique({
        where: { id },
        include: {
          user: true,
          court: true,
          equipmentRentals: { select: { quantity: true, price: true } },
          payment: { select: { metadata: true } },
        },
        // Select priceBreakdown for price validation
      });
      if (!exists) return BookingController.fail(res, "Booking not found", 404);

      const requester = req.user;
      const isBookingOfficer =
        !!requester && requester.role === "BOOKING_OFFICER";
      const isOwner = requester?.id === exists.userId;

      // Enforce ownership for customers (booking officers can reschedule any booking)
      if (!isBookingOfficer && !isOwner) {
        return BookingController.fail(res, "Forbidden", 403);
      }

      // For customer self-reschedule, enforce 24-hour rule
      if (!isBookingOfficer) {
        const now = new Date();
        const twentyFourHrsBefore = new Date(
          exists.startTime.getTime() - 24 * 60 * 60 * 1000
        );
        if (now >= twentyFourHrsBefore) {
          return BookingController.fail(
            res,
            "Bookings can only be rescheduled more than 24 hours before start time",
            400
          );
        }
      }

      const newStart = new Date(String(startTime));
      const newEnd = new Date(String(endTime));

      if (
        isNaN(newStart.getTime()) ||
        isNaN(newEnd.getTime()) ||
        newEnd <= newStart
      ) {
        return BookingController.fail(res, "Invalid date range", 400);
      }

      const operatingHours = await getOperatingHoursConfig();
      const withinHours = isWithinOperatingHours(
        newStart,
        newEnd,
        operatingHours
      );
      if (!withinHours.valid) {
        return BookingController.fail(
          res,
          withinHours.reason || "Selected time is outside operating hours",
          400
        );
      }

      // Check conflicts on target court (exclude this booking)
      const conflict = await prisma.booking.findFirst({
        where: {
          id: { not: id },
          courtId: String(courtId),
          OR: [
            { status: { in: ["CONFIRMED", "CHECKED_IN"] } },
            {
              AND: [
                { status: "PENDING" },
                { createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) } },
              ],
            },
            { AND: [{ status: "CANCELLED" }, { notes: "MAINTENANCE" }] as any },
          ],
          startTime: { lt: newEnd },
          endTime: { gt: newStart },
        },
      });

      if (conflict) {
        return BookingController.fail(
          res,
          "Selected time slot is not available",
          409
        );
      }

      // Calculate new duration and validate it matches the original
      const newDuration = Math.round(
        (newEnd.getTime() - newStart.getTime()) / 60000
      );

      if (newDuration !== exists.duration) {
        return BookingController.fail(
          res,
          `Duration cannot be changed during reschedule. Original booking duration: ${exists.duration} minutes. New duration would be: ${newDuration} minutes. Please select a time slot that matches your original booking duration.`,
          400
        );
      }

      // Validate price consistency using stored price breakdown
      try {
        // Fetch the target court
        const targetCourt = await prisma.court.findUnique({
          where: { id: String(courtId) },
        });

        if (!targetCourt) {
          return BookingController.fail(res, "Target court not found", 404);
        }

        // Get original court subtotal from stored price breakdown (much simpler!)
        const originalCourtSubtotal = getCourtSubtotal(
          exists.priceBreakdown,
          Number(exists.totalAmount) // Fallback for old bookings without breakdown
        );

        // Calculate new price breakdown for the target slot
        const newPriceBreakdown = await calculatePriceBreakdown({
          courtId: String(courtId),
          startTime: newStart,
          endTime: newEnd,
          durationMinutes: newDuration,
          equipmentRentals: [], // Equipment doesn't affect court pricing
          baseHourlyRate: Number(targetCourt.baseHourlyRate),
        });

        // Compare court costs
        const priceDifference = Math.abs(
          newPriceBreakdown.courtSubtotal - originalCourtSubtotal
        );
        const tolerance = 1; // Allow 1 KES difference for rounding

        if (priceDifference > tolerance) {
          const originalDurationHours = exists.duration / 60;
          const newDurationHours = newDuration / 60;
          const originalPricePerHour =
            originalDurationHours > 0
              ? originalCourtSubtotal / originalDurationHours
              : 0;
          const newAveragePricePerHour =
            newDurationHours > 0
              ? newPriceBreakdown.courtSubtotal / newDurationHours
              : 0;

          return BookingController.fail(
            res,
            `Price mismatch: The selected time slots cost an average of ${Math.round(
              newAveragePricePerHour
            )} KES/hour (${Math.round(
              newPriceBreakdown.courtSubtotal
            )} KES total), but your original booking was ${Math.round(
              originalPricePerHour
            )} KES/hour (${Math.round(
              originalCourtSubtotal
            )} KES total). You can only reschedule to slots with the same court price. Please select a different time slot or contact support for assistance.`,
            400
          );
        }
      } catch (priceError) {
        console.error("Price calculation error during reschedule:", priceError);
        // If we can't calculate price, fail safely
        return BookingController.fail(
          res,
          "Unable to validate pricing for the selected time slot. Please try again or contact support.",
          500
        );
      }

      const updated = await prisma.booking.update({
        where: { id },
        data: {
          courtId: String(courtId),
          startTime: newStart,
          endTime: newEnd,
          duration: newDuration,
        },
        include: {
          court: { select: { id: true, name: true } },
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });

      // Send reschedule email asynchronously
      (async () => {
        try {
          const { sendMail, buildRescheduleEmail } = await import(
            "../../utils/mailer"
          );
          if (updated.user?.email) {
            // Format new booking details
            const newDate = updated.startTime.toLocaleDateString("en-KE", {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
            });
            const newTimeRange = `${updated.startTime.toLocaleTimeString(
              "en-KE",
              {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              }
            )} - ${updated.endTime.toLocaleTimeString("en-KE", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })}`;

            // Format old booking details for comparison
            const oldDate = exists.startTime.toLocaleDateString("en-KE", {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
            });
            const oldTimeRange = `${exists.startTime.toLocaleTimeString(
              "en-KE",
              {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              }
            )} - ${exists.endTime.toLocaleTimeString("en-KE", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })}`;

            const tpl = buildRescheduleEmail({
              firstName: updated.user.firstName,
              bookingCode: updated.bookingCode,
              courtName: updated.court?.name || "N/A",
              date: newDate,
              timeRange: newTimeRange,
              oldCourtName:
                exists.courtId !== updated.courtId
                  ? exists.court?.name
                  : undefined,
              oldDate: oldDate !== newDate ? oldDate : undefined,
              oldTimeRange:
                oldTimeRange !== newTimeRange ? oldTimeRange : undefined,
            });

            await sendMail({
              to: updated.user.email,
              subject: tpl.subject,
              html: tpl.html,
            });
          }
        } catch (e) {
          console.error("Failed to send reschedule email", e);
        }
      })();

      // Audit log
      try {
        await prisma.auditLog.create({
          data: {
            userId: requester?.id,
            action: isBookingOfficer
              ? "BOOKING_OFFICER_RESCHEDULE"
              : "BOOKING_SELF_RESCHEDULE",
            entity: "BOOKING",
            entityId: id,
            oldData: exists as any,
            newData: updated as any,
          },
        });
      } catch (e) {
        console.warn("Failed to write audit log for booking reschedule", e);
      }

      // Emit websocket events
      try {
        emitBookingUpdate(exists.courtId, {
          type: "BOOKING_RESCHEDULED",
          bookingId: exists.id,
          from: {
            courtId: exists.courtId,
            startTime: exists.startTime.toISOString(),
            endTime: exists.endTime.toISOString(),
          },
          to: {
            courtId: updated.courtId,
            startTime: updated.startTime.toISOString(),
            endTime: updated.endTime.toISOString(),
          },
        });
        // Also emit to new court if different
        if (updated.courtId !== exists.courtId) {
          emitBookingUpdate(updated.courtId, {
            type: "BOOKING_RESCHEDULED",
            bookingId: exists.id,
          });
        }
      } catch (e) {
        console.warn("Booking reschedule analytics emit failed", e);
      }

      return BookingController.ok(
        res,
        updated,
        "Booking rescheduled successfully"
      );
    } catch (error) {
      console.error("rescheduleBooking error", error);
      return res.status(500).json({ message: "Failed to reschedule booking" });
    }
  }
}

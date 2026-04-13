import { Request, Response } from "express";
import MpesaService from "../services/mpesa.service";
import prisma from "../config/db";
import { startOfDay, subMinutes, addMonths, addDays, format } from "date-fns";

import {
  emitCourtAvailability,
  emitPaymentUpdate,
  emitAdminAnalytics,
  emitBookingUpdate,
} from "../utils/ws-bus";

import { sendMail, buildBookingConfirmationEmail } from "../utils/mailer";
import { calculatePriceBreakdown } from "../utils/price-breakdown";
import { generateBookingCode } from "../utils/helpers";
import { calculatePointsFromAmount } from "../utils/loyalty";
import { awardReferralPoints } from "../services/referral.service";

const canRefundSlot = (
  endTime: Date | string | null | undefined,
  graceMinutes: number
): boolean => {
  if (!endTime) return true;
  const end = endTime instanceof Date ? endTime : new Date(endTime);
  if (Number.isNaN(end.getTime())) return true;
  const bufferMs = Math.max(0, graceMinutes) * 60_000;
  return Date.now() <= end.getTime() + bufferMs;
};

export class PaymentController {
  private static async attachRacketsToBooking(
    bookingId: string,
    reservation: any
  ) {
    try {
      const qty = Number(reservation?.racketQty || 0);
      if (!qty || qty <= 0) return;
      const unit = Number(
        reservation?.racketUnitPrice || reservation?.racketsAmount / qty || 300
      );

      let racket = await prisma.equipment.findFirst({
        where: {
          type: "RACKET",
          name: { contains: "Racket", mode: "insensitive" },
        },
      });
      if (!racket) {
        racket = await prisma.equipment.create({
          data: {
            name: "Padel Racket",
            type: "RACKET",
            brand: "Generic",
            totalQuantity: 100,
            availableQty: 100,
            rentalPrice: unit,
            condition: "GOOD",
            isActive: true,
            updatedAt: new Date(),
          },
        });
      }

      await prisma.equipmentRental.create({
        data: {
          bookingId,
          equipmentId: racket.id,
          quantity: qty,
          price: unit,
        },
      });
    } catch (error) {
      console.warn("Gift card path racket attachment failed", error);
    }
  }

  private static async attachBallsToBooking(
    bookingId: string,
    reservation: any
  ) {
    try {
      const qty = Number(reservation?.ballsQty || 0);
      if (!qty || qty <= 0) return;
      const unit = Number(
        reservation?.ballsUnitPrice || reservation?.ballsAmount / qty || 1000
      );

      let targetEquipment = null;

      if (reservation?.ballTypeId) {
        targetEquipment = await prisma.equipment.findUnique({
          where: { id: reservation.ballTypeId },
        });
      }

      if (!targetEquipment && reservation?.ballTypeName) {
        targetEquipment = await prisma.equipment.findFirst({
          where: {
            type: "BALLS",
            name: {
              equals: reservation.ballTypeName,
              mode: "insensitive",
            },
          },
        });
      }

      if (!targetEquipment) {
        targetEquipment = await prisma.equipment.findFirst({
          where: {
            type: "BALLS",
            name: { contains: "Ball", mode: "insensitive" },
          },
        });
      }

      if (!targetEquipment) {
        targetEquipment = await prisma.equipment.create({
          data: {
            name: reservation?.ballTypeName || "Padel Balls Pack",
            type: "BALLS",
            brand: "Generic",
            totalQuantity: 100,
            availableQty: 100,
            rentalPrice: unit,
            condition: "GOOD",
            isActive: true,
            updatedAt: new Date(),
          },
        });
      }

      await prisma.equipmentRental.create({
        data: {
          bookingId,
          equipmentId: targetEquipment.id,
          quantity: qty,
          price: unit,
        },
      });
    } catch (error) {
      console.warn("Gift card path balls attachment failed", error);
    }
  }

  private static async handleGiftCardOnlySettlement(params: {
    userId: string;
    bookingId?: string | null;
    reservation?: any;
    reservations?: any[];
    meta: any;
  }) {
    const { userId, bookingId, reservation, reservations, meta } = params;

    // Determine settlement type and amounts
    const appliedGift = Math.max(
      0,
      Math.floor(Number(meta?.giftcard?.applied) || 0)
    );
    const voucherDiscount = Math.max(
      0,
      Math.floor(Number(meta?.voucher?.discount) || 0)
    );
    const totalCoverage = appliedGift + voucherDiscount;

    if (totalCoverage <= 0) {
      throw new Error("No voucher or gift card coverage found");
    }

    // Handle gift card consumption if applicable
    if (appliedGift > 0) {
      const giftCardCode = meta?.giftcard?.code;
      if (!giftCardCode) {
        throw new Error("Gift card code missing");
      }
      const { GiftCardController } = await import(
        "../controllers/giftcard.controller"
      );
      const consumeResult = await (GiftCardController as any).consumeCredit?.(
        userId,
        String(giftCardCode),
        appliedGift
      );
      if (!consumeResult || consumeResult.consumed < appliedGift) {
        throw new Error("Insufficient gift card balance");
      }
    }

    // Handle voucher redemption if applicable
    if (voucherDiscount > 0) {
      const voucherCode = meta?.voucher?.code;
      if (!voucherCode) {
        throw new Error("Voucher code missing");
      }
      const { VoucherController } = await import("./admin/voucher.controller");
      await (VoucherController as any).recordRedemption?.(
        String(voucherCode),
        userId,
        bookingId || null,
        voucherDiscount
      );
    }

    // Determine settlement method
    const settledVia =
      appliedGift > 0 && voucherDiscount > 0
        ? "GIFTCARD_AND_VOUCHER"
        : appliedGift > 0
        ? "GIFTCARD"
        : "VOUCHER";

    // For ADD_EQUIPMENT context, set bookingId to null to avoid unique constraint
    // Store the booking reference in metadata instead
    const isAddEquipment = meta?.context === "ADD_EQUIPMENT";

    const payment = await prisma.payment.create({
      data: {
        transactionId: `${settledVia}_${Date.now().toString(36).toUpperCase()}`,
        userId,
        bookingId: isAddEquipment ? null : bookingId || null,
        amount: totalCoverage,
        method: "WALLET",
        provider: "INTERNAL",
        status: "COMPLETED",
        metadata: {
          ...meta,
          settledVia,
          ...(isAddEquipment && bookingId
            ? { relatedBookingId: bookingId }
            : {}),
        } as any,
        processedAt: new Date(),
      },
    });

    let bookingRecords: any[] = [];
    let bookingRecord: any = null;

    if (bookingId) {
      // For ADD_EQUIPMENT, fetch the existing booking and add equipment
      // For new bookings, update status to CONFIRMED
      if (isAddEquipment) {
        bookingRecord = await prisma.booking.findUnique({
          where: { id: bookingId },
          include: {
            court: { select: { id: true, name: true } },
            user: { select: { firstName: true, email: true } },
          },
        });

        if (bookingRecord && meta?.equipment) {
          // Attach equipment from metadata
          const equipment = meta.equipment;
          if (equipment.racketQty > 0) {
            await this.attachRacketsToBooking(bookingId, {
              racketQty: equipment.racketQty,
              racketUnitPrice: equipment.racketUnitPrice,
              racketsAmount: equipment.racketsAmount,
            });
          }
          if (equipment.ballsQty > 0) {
            await this.attachBallsToBooking(bookingId, {
              ballsQty: equipment.ballsQty,
              ballsUnitPrice: equipment.ballsUnitPrice,
              ballsAmount: equipment.ballsAmount,
              ballTypeId: equipment.ballTypeId,
              ballTypeName: equipment.ballTypeName,
            });
          }

          // Update booking total
          const newTotal =
            Number(bookingRecord.totalAmount) +
            Number(equipment.totalAmount || 0);
          await prisma.booking.update({
            where: { id: bookingId },
            data: { totalAmount: newTotal },
          });
        }
      } else {
        // Regular booking creation - update status to CONFIRMED
        bookingRecord = await prisma.booking.update({
          where: { id: bookingId },
          data: {
            status: "CONFIRMED",
            ...(reservation?.totalAmount
              ? { totalAmount: reservation.totalAmount }
              : {}),
          },
          include: {
            court: { select: { id: true, name: true } },
            user: { select: { firstName: true, email: true } },
          },
        });
        if (reservation) {
          await this.attachRacketsToBooking(bookingRecord.id, reservation);
          await this.attachBallsToBooking(bookingRecord.id, reservation);
        }
      }
      bookingRecords = [bookingRecord];
    } else if (reservations && reservations.length > 0) {
      // Handle multiple reservations (multi-court booking)
      for (const res of reservations) {
        const start = new Date(res.startTime);
        const end = new Date(res.endTime);
        const duration = res.duration
          ? res.duration
          : Math.round((end.getTime() - start.getTime()) / 60000);

        // Fetch court details for price breakdown calculation
        const court = await prisma.court.findUnique({
          where: { id: res.courtId },
        });

        // Calculate price breakdown for this booking
        const priceBreakdown = await calculatePriceBreakdown({
          courtId: res.courtId,
          startTime: start,
          endTime: end,
          durationMinutes: duration,
          equipmentRentals: [], // Equipment will be added after booking creation
          baseHourlyRate: Number(court?.baseHourlyRate || 0),
        });

        const booking = await prisma.booking.create({
          data: {
            bookingCode: generateBookingCode(),
            userId,
            courtId: res.courtId,
            startTime: start,
            endTime: end,
            duration,
            numberOfPlayers: res.numberOfPlayers ?? 4,
            totalAmount: res.totalAmount,
            priceBreakdown: priceBreakdown as any,
            status: "CONFIRMED",
          },
          include: {
            court: { select: { id: true, name: true } },
            user: { select: { firstName: true, email: true } },
          },
        });

        bookingRecords.push(booking);
        await this.attachRacketsToBooking(booking.id, res);
        await this.attachBallsToBooking(booking.id, res);
      }

      // Link payment to first booking
      if (bookingRecords.length > 0) {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { bookingId: bookingRecords[0].id },
        });
        bookingRecord = bookingRecords[0];
      }
    } else if (reservation) {
      const start = new Date(reservation.startTime);
      const end = new Date(reservation.endTime);
      const duration = reservation.duration
        ? reservation.duration
        : Math.round((end.getTime() - start.getTime()) / 60000);

      // Fetch court details for price breakdown calculation
      const court = await prisma.court.findUnique({
        where: { id: reservation.courtId },
      });

      // Calculate price breakdown for this booking
      const priceBreakdown = await calculatePriceBreakdown({
        courtId: reservation.courtId,
        startTime: start,
        endTime: end,
        durationMinutes: duration,
        equipmentRentals: [], // Equipment will be added after booking creation
        baseHourlyRate: Number(court?.baseHourlyRate || 0),
      });

      bookingRecord = await prisma.booking.create({
        data: {
          bookingCode: generateBookingCode(),
          userId,
          courtId: reservation.courtId,
          startTime: start,
          endTime: end,
          duration,
          numberOfPlayers: reservation.numberOfPlayers ?? 4,
          totalAmount: reservation.totalAmount,
          priceBreakdown: priceBreakdown as any,
          status: "CONFIRMED",
        },
        include: {
          court: { select: { id: true, name: true } },
          user: { select: { firstName: true, email: true } },
        },
      });
      bookingRecords = [bookingRecord];
      await prisma.payment.update({
        where: { id: payment.id },
        data: { bookingId: bookingRecord.id },
      });
      await this.attachRacketsToBooking(bookingRecord.id, reservation);
      await this.attachBallsToBooking(bookingRecord.id, reservation);
    }

    try {
      emitPaymentUpdate(userId, {
        status: "COMPLETED",
        paymentId: payment.id,
        bookingId: bookingRecord?.id || bookingId || null,
      });

      // Emit updates for all bookings
      for (const booking of bookingRecords) {
        emitCourtAvailability(
          booking.courtId,
          format(new Date(booking.startTime), "yyyy-MM-dd")
        );
        emitBookingUpdate(booking.courtId, {
          bookingId: booking.id,
          status: "CONFIRMED",
        });
      }
    } catch (error) {
      console.warn("Gift card settlement websocket emit failed", error);
    }

    try {
      if (
        bookingRecords.length > 0 &&
        bookingRecords[0]?.user?.email &&
        !params.reservation?.createdByOfficer
      ) {
        const firstBooking = bookingRecords[0];
        const start = firstBooking.startTime;
        const end = firstBooking.endTime;
        const timeRange = `${format(start, "HH:mm")} - ${format(end, "HH:mm")}`;
        const dateStr = format(start, "EEEE, MMM d yyyy");

        // Extract payment breakdown from metadata
        const voucherDiscount = meta?.voucher?.discount
          ? Number(meta.voucher.discount)
          : undefined;
        const voucherCode = meta?.voucher?.code || undefined;
        const giftCardAmount = meta?.giftcard?.applied
          ? Number(meta.giftcard.applied)
          : undefined;
        const giftCardCode = meta?.giftcard?.code || undefined;

        // Calculate total amount across all bookings
        const totalAmount = bookingRecords.reduce(
          (sum, b) => sum + Number(b.totalAmount),
          0
        );
        const subtotal =
          voucherDiscount || giftCardAmount ? totalAmount : undefined;

        // Check if multiple courts
        const isMultipleCourts = bookingRecords.length > 1;
        const courtDetails = isMultipleCourts
          ? bookingRecords.map((b) => {
              const bStart = new Date(b.startTime);
              const bEnd = new Date(b.endTime);
              return {
                name: b.court.name,
                timeRange: `${format(bStart, "HH:mm")} - ${format(
                  bEnd,
                  "HH:mm"
                )}`,
              };
            })
          : undefined;

        const emailTpl = buildBookingConfirmationEmail({
          firstName: firstBooking.user.firstName || undefined,
          bookingCode: firstBooking.bookingCode,
          courtName: firstBooking.court.name,
          date: dateStr,
          timeRange,
          players: firstBooking.numberOfPlayers,
          amount: 0, // M-Pesa amount is 0 since this is gift card only
          subtotal,
          voucherDiscount,
          voucherCode,
          giftCardAmount,
          giftCardCode,
          isMultipleCourts,
          courtDetails,
          manageUrl: `${
            process.env.APP_URL || "https://tudorpadel.com"
          }/customer/bookings/${firstBooking.id}`,
        });
        await sendMail({
          to: firstBooking.user.email,
          subject: emailTpl.subject,
          html: emailTpl.html,
        });
      }
    } catch (error) {
      console.warn("Gift card settlement email failed", error);
    }

    // Award loyalty points for booking (if there's an amount to calculate from)
    if (bookingRecord && bookingRecord.totalAmount) {
      const bookingAmount = Number(bookingRecord.totalAmount || 0);
      const loyaltyPoints = await calculatePointsFromAmount(bookingAmount);

      if (loyaltyPoints > 0) {
        try {
          await prisma.$transaction([
            prisma.user.update({
              where: { id: userId },
              data: { loyaltyPoints: { increment: loyaltyPoints } },
            }),
            prisma.loyaltyPoint.create({
              data: {
                userId: userId,
                points: loyaltyPoints,
                type: "EARNED",
                description: "Court booking reward",
                referenceId: payment.id,
                expiresAt: addMonths(new Date(), 6),
              },
            }),
          ]);
        } catch (loyaltyError) {
          console.warn("Failed to award loyalty points:", loyaltyError);
        }
      }
    }

    // Check and award referral points if this is the user's first booking
    try {
      await awardReferralPoints(userId);
    } catch (referralError) {
      console.warn("Failed to award referral points:", referralError);
    }

    return {
      payment,
      booking: bookingRecord,
      bookings: bookingRecords,
    };
  }

  /**
   * List payments with pagination & filters
   * Query params: page, limit, search (user email/name/receipt/transactionId), status, from, to
   * Requires ADMIN or SUPER_ADMIN (enforced at route layer)
   */
  static async listPayments(req: Request, res: Response) {
    try {
      const page = Math.max(parseInt((req.query.page as string) || "1", 10), 1);
      const limit = Math.min(
        100,
        Math.max(parseInt((req.query.limit as string) || "25", 10), 1)
      );
      const search = (req.query.search as string)?.trim();
      const status = (req.query.status as string)?.trim();
      const from = (req.query.from as string)?.trim();
      const to = (req.query.to as string)?.trim();
      const mergeBookingDate =
        (req.query.mergeBookingDate as string) === "true";

      // Build dynamic filters
      const statusFilter = (() => {
        if (!status) return undefined;
        const up = status.toUpperCase();
        if (up === "COMPLETED")
          return { status: { in: ["COMPLETED", "PROCESSING"] } };
        if (up === "REFUNDED")
          return { status: { in: ["REFUNDED", "PARTIALLY_REFUNDED"] } };
        if (up === "FAILED") return { status: "FAILED" };
        return { status: up };
      })();

      // Date range objects (reused for createdAt & booking.startTime)
      let dateRange: any | undefined;
      if (from || to) {
        dateRange = {};
        if (from) dateRange.gte = new Date(from);
        if (to) dateRange.lte = new Date(to);
      }

      const searchOr = (() => {
        if (!search) return undefined;
        const s = search;
        return {
          OR: [
            { transactionId: { contains: s, mode: "insensitive" } },
            { providerRef: { contains: s, mode: "insensitive" } },
            {
              user: {
                OR: [
                  { email: { contains: s, mode: "insensitive" } },
                  { firstName: { contains: s, mode: "insensitive" } },
                  { lastName: { contains: s, mode: "insensitive" } },
                ],
              },
            },
            { booking: { bookingCode: { contains: s, mode: "insensitive" } } },
          ],
        };
      })();

      // Combine filters with potential OR for date vs booking.startTime
      const andParts: any[] = [];
      if (statusFilter) andParts.push(statusFilter);
      if (searchOr) andParts.push(searchOr);
      if (dateRange) {
        if (mergeBookingDate) {
          andParts.push({
            OR: [
              { createdAt: dateRange },
              { booking: { startTime: dateRange } },
            ],
          });
        } else {
          andParts.push({ createdAt: dateRange });
        }
      }
      const where: any = andParts.length ? { AND: andParts } : {};

      const [total, records] = await Promise.all([
        prisma.payment.count({ where }),
        prisma.payment.findMany({
          where,
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                role: true,
              },
            },
            booking: {
              select: {
                id: true,
                bookingCode: true,
                court: { select: { id: true, name: true } },
                startTime: true,
                endTime: true,
                status: true,
                equipmentRentals: {
                  select: {
                    id: true,
                    quantity: true,
                    price: true,
                    equipment: { select: { type: true, name: true } },
                  },
                },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
      ]);

      return res.status(200).json({
        data: records.map((p) => ({
          id: p.id,
          transactionId: p.transactionId,
          amount: Number(p.amount),
          currency: p.currency,
          // Normalize status for UI (aggregate PROCESSING -> COMPLETED view, PARTIALLY_REFUNDED -> REFUNDED view)
          status: ((): string => {
            if (p.status === "PROCESSING") return "COMPLETED";
            if (p.status === "PARTIALLY_REFUNDED") return "REFUNDED";
            return p.status;
          })(),
          method: p.method,
          provider: p.provider,
          providerRef: p.providerRef,
          booking: p.booking
            ? {
                id: p.booking.id,
                code: p.booking.bookingCode,
                court: p.booking.court,
                startTime: p.booking.startTime,
                endTime: p.booking.endTime,
                status: p.booking.status,
                racketsQty: (p.booking.equipmentRentals || [])
                  .filter((r: any) => r.equipment?.type === "RACKET")
                  .reduce((sum: number, r: any) => sum + (r.quantity || 0), 0),
                racketsAmount: (p.booking.equipmentRentals || [])
                  .filter((r: any) => r.equipment?.type === "RACKET")
                  .reduce(
                    (sum: number, r: any) =>
                      sum + (Number(r.price) || 0) * (r.quantity || 0),
                    0
                  ),
              }
            : null,
          user: p.user
            ? {
                id: p.user.id,
                email: p.user.email,
                name: `${p.user.firstName || ""} ${
                  p.user.lastName || ""
                }`.trim(),
                role: p.user.role,
              }
            : null,
          refundAmount: p.refundAmount ? Number(p.refundAmount) : null,
          refundedAt: p.refundedAt,
          createdAt: p.createdAt,
          metadata: p.metadata,
        })),
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (e) {
      console.error("List payments error", e);
      return res.status(500).json({ message: "Failed to list payments" });
    }
  }

  // Query MPESA transaction status by CheckoutRequestID stored in payment metadata
  static async queryMpesaStatus(req: Request, res: Response) {
    try {
      const { checkoutRequestId } = req.params as any;
      if (!checkoutRequestId) {
        return res.status(400).json({ message: "checkoutRequestId required" });
      }

      const payment = await prisma.payment.findFirst({
        where: {
          metadata: { path: ["CheckoutRequestID"], equals: checkoutRequestId },
        },
      });
      if (!payment) {
        return res
          .status(404)
          .json({ message: "Payment not found for CheckoutRequestID" });
      }

      // Build STK query per Safaricom API
      const shortcode = process.env.MPESA_SHORTCODE as string;
      const passkey = process.env.MPESA_PASSKEY as string;
      const timestamp = format(new Date(), "yyyyMMddHHmmss");
      const password = Buffer.from(
        `${shortcode}${passkey}${timestamp}`
      ).toString("base64");
      const token = await MpesaService.getAccessToken();

      const url = `${
        (MpesaService as any).baseUrl?.() ||
        (process.env.MPESA_ENV === "production"
          ? "https://api.safaricom.co.ke"
          : "https://sandbox.safaricom.co.ke")
      }/mpesa/stkpushquery/v1/query`;
      const payload = {
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId,
      } as any;

      const axios = (await import("axios")).default;
      const { data } = await axios.post(url, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // ✅ SECURITY: Sanitize M-Pesa query response - only return safe status fields
      // Never expose internal IDs, callback URLs, or sensitive metadata
      return res.status(200).json({
        paymentId: payment.id,
        status: {
          ResponseCode: data.ResponseCode,
          ResponseDescription: data.ResponseDescription,
          ResultCode: data.ResultCode,
          ResultDesc: data.ResultDesc,
        },
      });
    } catch (e: any) {
      console.error("MPESA status query error", e);
      return res
        .status(500)
        .json({ message: "Failed to query MPESA status", error: e.message });
    }
  }
  static async initiateStkPush(req: Request, res: Response) {
    try {
      const {
        phoneNumber,
        amount,
        bookingId,
        accountReference,
        description,
        reservation,
        reservations,
        voucherCode,
        useGiftCard,
        context,
        paymentMetadata,
      } = req.body;
      // Apply voucher and gift card if provided (quote only; finalize on callback)
      let amountNum = Math.max(0, Math.floor(Number(amount)));
      const userId = (req as any).user?.id;
      const meta: any = {
        reservation: reservation || undefined,
        reservations: reservations || undefined,
      };

      const sanitizedPaymentMetadata =
        paymentMetadata && typeof paymentMetadata === "object"
          ? (paymentMetadata as Record<string, unknown>)
          : undefined;

      if (context) {
        meta.context = context;
      }

      if (sanitizedPaymentMetadata?.equipment) {
        meta.equipment = sanitizedPaymentMetadata.equipment;
      }
      try {
        if (voucherCode) {
          const { loadVouchers, computeDiscount } = await import(
            "./admin/voucher.controller"
          );
          const vouchers = await loadVouchers();
          const v = vouchers.find(
            (x: any) => x.code === String(voucherCode).trim().toUpperCase()
          );
          if (v && v.isActive) {
            // Check if this user has already used this voucher (per-user single-use)
            if (userId && v.usedByUsers?.includes(userId)) {
              return res.status(400).json({
                message: "You have already used this voucher",
              });
            }
            const discount = computeDiscount(amountNum, v);
            if (discount > 0) {
              amountNum = Math.max(0, amountNum - discount);
              meta.voucher = { code: v.code, discount };
            }
          }
        }
      } catch (e) {
        console.warn("Voucher application failed", e);
      }
      try {
        if (useGiftCard && userId) {
          const { GiftCardController } = await import(
            "../controllers/giftcard.controller"
          );
          const quote = await (GiftCardController as any).quoteCredit?.(
            userId,
            amountNum
          );
          if (quote && typeof quote.applied === "number") {
            const applied = Math.min(quote.applied, amountNum);
            if (applied > 0) {
              amountNum = Math.max(0, amountNum - applied);
              meta.giftcard = { code: quote.code, applied };
            }
          }
        }
      } catch (e) {
        console.warn("Gift card application failed", e);
      }

      if (!phoneNumber || amount == null) {
        return res
          .status(400)
          .json({ message: "phoneNumber and amount are required" });
      }

      const isOfficerBooking =
        reservation?.createdByOfficer ||
        (reservations && reservations[0]?.createdByOfficer);

      if (userId && !isOfficerBooking) {
        try {
          const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { phone: true },
          });
          if (!user?.phone) {
            // Normalize phone using MpesaService helper
            const normalizedPhone = MpesaService.normalizePhone(phoneNumber);
            await prisma.user.update({
              where: { id: userId },
              data: { phone: normalizedPhone },
            });
            console.info(
              `Saved phone ${normalizedPhone.slice(
                0,
                6
              )}**** to user ${userId} profile`
            );
          }
        } catch (e) {
          console.warn("Failed to save phone to user profile", e);
        }
      }

      // Persist voucher/gift card metadata for callback to finalize redemption
      const effectiveAmount = Math.max(0, Math.floor(amountNum));
      if (!bookingId) {
        // Support both single reservation and multiple reservations
        const hasReservations =
          reservations &&
          Array.isArray(reservations) &&
          reservations.length > 0;
        const hasSingleReservation = reservation && reservation.courtId;

        if (!hasReservations && !hasSingleReservation) {
          return res.status(400).json({
            message:
              "Missing reservation details. Provide courtId, startTime, endTime, totalAmount",
          });
        }

        // Validate multiple reservations if provided
        if (hasReservations) {
          const pendingCutoff = subMinutes(new Date(), 1);

          for (let i = 0; i < reservations.length; i++) {
            const r = reservations[i];
            if (!r.courtId || !r.startTime || !r.endTime || !r.totalAmount) {
              return res.status(400).json({
                message: `Reservation ${
                  i + 1
                }: Missing courtId, startTime, endTime, or totalAmount`,
              });
            }

            // Parse and validate times
            const s = new Date(r.startTime);
            const e = new Date(r.endTime);
            if (isNaN(s.getTime()) || isNaN(e.getTime())) {
              return res.status(400).json({
                message: `Reservation ${i + 1}: Invalid startTime or endTime`,
              });
            }
            if (e <= s) {
              return res.status(400).json({
                message: `Reservation ${
                  i + 1
                }: endTime must be after startTime`,
              });
            }

            // Check for conflicts with existing bookings
            const conflictingBooking = await prisma.booking.findFirst({
              where: {
                courtId: r.courtId,
                AND: [
                  {
                    OR: [
                      { status: { in: ["CONFIRMED", "CHECKED_IN"] } },
                      {
                        AND: [
                          { status: "PENDING" },
                          { createdAt: { gte: pendingCutoff } },
                        ],
                      },
                    ],
                  },
                  {
                    OR: [
                      {
                        AND: [
                          { startTime: { lte: s } },
                          { endTime: { gt: s } },
                        ],
                      },
                      {
                        AND: [{ startTime: { lt: e } }, { endTime: { gt: e } }],
                      },
                      {
                        AND: [
                          { startTime: { gte: s } },
                          { endTime: { lte: e } },
                        ],
                      },
                    ],
                  },
                ],
              },
            });

            if (conflictingBooking) {
              console.log(`CONFLICT DETECTED for reservation ${i + 1}:`);
              console.log("Requested slot:", {
                courtId: r.courtId,
                startTime: r.startTime,
                endTime: r.endTime,
              });
              console.log("Conflicting booking:", {
                id: conflictingBooking.id,
                startTime: conflictingBooking.startTime.toISOString(),
                endTime: conflictingBooking.endTime.toISOString(),
                status: conflictingBooking.status,
              });
              // This could be either a confirmed booking OR a pending booking created within last 1 minute
              const isConfirmed =
                conflictingBooking.status === "CONFIRMED" ||
                conflictingBooking.status === "CHECKED_IN";
              return res.status(409).json({
                message: isConfirmed
                  ? reservations.length > 1
                    ? `One of your selected time slots is no longer available. Please refresh and select a different time.`
                    : `This time slot is no longer available. Please refresh and select a different time.`
                  : reservations.length > 1
                  ? `One of your selected time slots is currently being booked. Please wait a moment and try again.`
                  : `This time slot is currently being booked. Please wait a moment and try again.`,
              });
            }

            // Check for conflicts with pending payments
            // Fetch ALL pending payments and filter in-memory since JSON path queries
            // with array_contains don't work reliably for complex object matching
            const pendingPayments = await prisma.payment.findMany({
              where: {
                status: "PENDING",
                createdAt: { gte: pendingCutoff },
              },
              select: { metadata: true },
            });

            const overlapsWithPending = pendingPayments.some((p) => {
              const metadata = p.metadata as any;

              // Check single reservation
              const singleRes = metadata?.reservation;
              if (singleRes && singleRes.courtId === r.courtId) {
                const rs = new Date(singleRes.startTime);
                const re = new Date(singleRes.endTime);
                if (s < re && e > rs) return true;
              }

              // Check multiple reservations
              const multiRes = metadata?.reservations;
              if (Array.isArray(multiRes)) {
                for (const res of multiRes) {
                  if (res.courtId === r.courtId) {
                    const rs = new Date(res.startTime);
                    const re = new Date(res.endTime);
                    if (s < re && e > rs) return true;
                  }
                }
              }

              return false;
            });

            if (overlapsWithPending) {
              return res.status(409).json({
                message:
                  reservations.length > 1
                    ? `One of your selected time slots is currently being booked. Please wait a moment and try again.`
                    : `This time slot is currently being booked. Please wait a moment and try again.`,
              });
            }
          }
        } else if (hasSingleReservation) {
          // For backward compatibility, validate single reservation
          const {
            courtId,
            startTime,
            endTime,
            duration,
            numberOfPlayers,
            totalAmount,
          } = reservation || {};

          if (!courtId || !startTime || !endTime || !totalAmount) {
            return res.status(400).json({
              message:
                "Missing reservation details. Provide courtId, startTime, endTime, totalAmount",
            });
          }

          // --- Reservation validation (robust & tolerant) ---
          const s = new Date(startTime);
          const e = new Date(endTime);
          if (isNaN(s.getTime()) || isNaN(e.getTime())) {
            return res
              .status(400)
              .json({ message: "Invalid startTime or endTime" });
          }
          if (e <= s) {
            return res
              .status(400)
              .json({ message: "endTime must be after startTime" });
          }
          // Accept times that are on the hour in LOCAL time (not just UTC) and allow minor (<60s) drift by snapping
          const isLocalHour = (d: Date) =>
            d.getMinutes() === 0 && d.getSeconds() === 0;
          let normalizedStart = new Date(s);
          let normalizedEnd = new Date(e);
          const driftStart =
            s.getMinutes() !== 0 ||
            s.getSeconds() !== 0 ||
            s.getMilliseconds() !== 0;
          const driftEnd =
            e.getMinutes() !== 0 ||
            e.getSeconds() !== 0 ||
            e.getMilliseconds() !== 0;

          // Support flexible durations - allow times on 30-minute boundaries
          // Only validate that times are reasonable (minutes are 0 or 30)
          const hasValidMinutes = (d: Date) => {
            const mins = d.getMinutes();
            return (
              (mins === 0 || mins === 30) &&
              d.getSeconds() === 0 &&
              d.getMilliseconds() === 0
            );
          };

          if (!hasValidMinutes(s) || !hasValidMinutes(e)) {
            // Snap times to nearest valid minute boundary (00 or 30) if within 59 seconds
            const snap = (d: Date) => {
              const ms = d.getTime();
              const thirtyMinMs = 30 * 60 * 1000;
              const flooredToHalfHour =
                Math.floor(ms / thirtyMinMs) * thirtyMinMs;
              const diff = ms - flooredToHalfHour;
              if (diff < 60000) return new Date(flooredToHalfHour);
              // Try ceiling if within 60s of next half-hour
              const next = flooredToHalfHour + thirtyMinMs;
              if (next - ms < 60000) return new Date(next);
              return null;
            };
            const snappedS = snap(s);
            const snappedE = snap(e);
            if (!snappedS || !snappedE) {
              return res.status(400).json({
                message:
                  "Reservations must start and end on valid time boundaries (00 or 30 minutes)",
              });
            }
            normalizedStart = snappedS;
            normalizedEnd = snappedE;
          }

          const diffMinutes = Math.round(
            (normalizedEnd.getTime() - normalizedStart.getTime()) / 60000
          );

          // Validate booking does not extend past midnight (00:00)
          const startHour = normalizedStart.getHours();
          const startMinute = normalizedStart.getMinutes();
          const endHour = normalizedEnd.getHours();
          const endMinute = normalizedEnd.getMinutes();

          // Check if end time is past midnight (next day)
          const startOfNextDay = new Date(normalizedStart);
          startOfNextDay.setHours(24, 0, 0, 0); // Midnight of next day

          if (normalizedEnd.getTime() > startOfNextDay.getTime()) {
            return res.status(400).json({
              message:
                "Bookings cannot extend past midnight (00:00). Site closes at 00:00.",
            });
          }

          // Remove the hour-multiple validation to support flexible durations like 90 minutes
          // The isDurationAllowed check will validate against configured durations
          if (duration && duration !== diffMinutes) {
            // Instead of failing, trust computed duration & continue; log discrepancy
            console.warn("Duration mismatch; overriding provided duration", {
              provided: duration,
              computed: diffMinutes,
            });
          }
          // Replace original values with normalized for downstream overlap checks
          (reservation as any).startTime = normalizedStart.toISOString();
          (reservation as any).endTime = normalizedEnd.toISOString();

          // Validate date range (today .. +2 days)
          const bookingDate = startOfDay(new Date(startTime));
          const today = startOfDay(new Date());
          const maxDate = startOfDay(addMonths(today, 1));
          if (bookingDate < today) {
            return res
              .status(400)
              .json({ message: "Cannot book courts in the past" });
          }
          if (bookingDate > maxDate) {
            return res.status(400).json({
              message: "Bookings can only be made up to 1 month in advance",
            });
          }

          const court = await prisma.court.findUnique({
            where: { id: courtId },
          });
          if (!court || !court.isActive) {
            return res.status(400).json({ message: "Court not available" });
          }

          // Consider PENDING bookings/holds only within the last 1 minute
          const pendingCutoff = subMinutes(new Date(), 1);

          // Conflicting bookings
          const conflicting = await prisma.booking.findFirst({
            where: {
              courtId,
              AND: [
                {
                  OR: [
                    { status: { in: ["CONFIRMED", "CHECKED_IN"] } },
                    {
                      AND: [
                        { status: "PENDING" },
                        { createdAt: { gte: pendingCutoff } },
                      ],
                    },
                  ],
                },
                {
                  OR: [
                    {
                      AND: [
                        { startTime: { lte: new Date(startTime) } },
                        { endTime: { gt: new Date(startTime) } },
                      ],
                    },
                    {
                      AND: [
                        { startTime: { lt: new Date(endTime) } },
                        { endTime: { gt: new Date(endTime) } },
                      ],
                    },
                    {
                      AND: [
                        { startTime: { gte: new Date(startTime) } },
                        { endTime: { lte: new Date(endTime) } },
                      ],
                    },
                  ],
                },
              ],
            },
          });
          if (conflicting) {
            console.log("CONFLICT DETECTED:");
            console.log("New booking:", { courtId, startTime, endTime });
            console.log("Conflicting booking:", {
              id: conflicting.id,
              startTime: conflicting.startTime.toISOString(),
              endTime: conflicting.endTime.toISOString(),
              status: conflicting.status,
            });
            // This could be either a confirmed booking OR a pending booking created within last 1 minute
            const isConfirmed =
              conflicting.status === "CONFIRMED" ||
              conflicting.status === "CHECKED_IN";
            return res.status(409).json({
              message: isConfirmed
                ? "This time slot is no longer available. Please refresh and select a different time."
                : "This time slot is currently being booked. Please wait a moment and try again.",
            });
          }

          // Conflicting pending payments holds
          // Fetch ALL pending payments and filter in-memory since JSON path queries
          // may not work reliably across all database engines
          const pendingPayments = await prisma.payment.findMany({
            where: {
              status: "PENDING",
              createdAt: { gte: pendingCutoff },
            },
            select: { metadata: true },
          });
          const overlaps = pendingPayments.some((p) => {
            const metadata = (p as any).metadata;

            // Check single reservation
            const r: any = metadata?.reservation;
            if (r && r.courtId === courtId) {
              const rs = new Date(r.startTime);
              const re = new Date(r.endTime);
              const S = s;
              const E = e;
              // Use half-open interval overlap logic: [a,b) & [c,d) overlap if a < d && b > c
              if (S < re && E > rs) return true;
            }

            // Check multiple reservations
            const multiRes = metadata?.reservations;
            if (Array.isArray(multiRes)) {
              for (const res of multiRes) {
                if (res.courtId === courtId) {
                  const rs = new Date(res.startTime);
                  const re = new Date(res.endTime);
                  if (s < re && e > rs) return true;
                }
              }
            }

            return false;
          });
          if (overlaps) {
            return res.status(409).json({
              message:
                "This time slot is currently being booked. Please wait a moment and try again.",
            });
          }
        }
      }

      // If fully covered by voucher/gift card, complete booking without M-Pesa payment
      if (
        effectiveAmount <= 0 &&
        (meta?.giftcard?.applied || meta?.voucher?.discount)
      ) {
        if (!userId) {
          return res.status(400).json({
            message: "Sign in to complete booking with voucher or gift card.",
          });
        }
        try {
          const settlement =
            await PaymentController.handleGiftCardOnlySettlement({
              userId,
              bookingId,
              reservation,
              reservations,
              meta,
            });

          const successMessage =
            meta?.giftcard?.applied && meta?.voucher?.discount
              ? "Voucher and gift card applied successfully"
              : meta?.voucher?.discount
              ? "Voucher applied successfully"
              : "Gift card applied successfully";

          return res.status(200).json({
            message: successMessage,
            data: {
              paymentId: settlement.payment.id,
              bookingId: settlement.booking?.id || bookingId || null,
              giftCardOnly: true,
            },
          });
        } catch (error: any) {
          console.error("Zero-payment settlement error", error);
          return res.status(400).json({
            message:
              error?.message || "Failed to complete booking. Please try again.",
          });
        }
      }

      const chargeAmount = Math.max(1, effectiveAmount);

      const result = await MpesaService.initiateStkPush({
        phoneNumber,
        amount: chargeAmount,
        bookingId,
        accountReference,
        description,
        userId,
        reservation: reservation || undefined,
        reservations: reservations || undefined,
        context,
        paymentMetadata: sanitizedPaymentMetadata,
        // @ts-ignore - allow metadata to be carried via payment record created inside service
        // The service will store metadata on the created payment
        // We attach voucher/giftcard intent in a follow-up update below
      });

      try {
        console.info("STK push request accepted", {
          paymentId: (result as any)?.paymentId,
          responseCode: (result as any)?.ResponseCode,
          responseDescription: (result as any)?.ResponseDescription,
        });
      } catch (logError) {
        console.warn("Failed to log STK push response", logError);
      }
      // If a payment record was created, persist the metadata with voucher/giftcard intent
      try {
        const paymentId = (result as any)?.paymentId;
        if (paymentId) {
          const existingMeta = (
            await prisma.payment.findUnique({
              where: { id: paymentId },
              select: { metadata: true },
            })
          )?.metadata as any;
          await prisma.payment.update({
            where: { id: paymentId },
            data: { metadata: { ...(existingMeta || {}), ...meta } as any },
          });
        }
      } catch (e) {
        console.warn(
          "Failed to persist voucher/giftcard metadata on payment",
          e
        );
      }

      // ✅ SECURITY FIX: Sanitize response - only return minimal client-safe fields
      // Client only needs:
      // - paymentId: to track payment status via polling/websocket
      // - CustomerMessage: user-friendly message to display
      //
      // NEVER expose to client:
      // - CheckoutRequestID: internal MPESA tracking ID
      // - ResponseCode/ResponseDescription: internal MPESA status codes
      // - MerchantRequestID: internal MPESA merchant identifier
      // - mpesaPayload: raw MPESA API request/response data
      // - Full phone numbers, internal metadata, etc.
      const sanitizedResponse = {
        paymentId: (result as any)?.paymentId,
        CustomerMessage:
          (result as any)?.CustomerMessage ||
          "STK push sent. Please check your phone.",
      };

      // Add cache control headers for sensitive payment data
      res.setHeader(
        "Cache-Control",
        "no-store, no-cache, must-revalidate, max-age=0"
      );
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");

      return res.status(200).json({
        message: "STK push initiated",
        data: sanitizedResponse,
      });
    } catch (error: any) {
      console.error("STK Push initiation error", error);
      return res.status(500).json({
        message: "Failed to initiate STK push",
        error: error.message,
      });
    }
  }

  static async stkCallback(req: Request, res: Response) {
    try {
      const result = await MpesaService.handleCallback(req.body);
      // If result includes payment status we can emit analytics
      try {
        const payment = (result as any)?.payment;
        if (
          payment &&
          ["COMPLETED", "PARTIALLY_REFUNDED", "PROCESSING"].includes(
            payment.status
          )
        ) {
          emitAdminAnalytics("payment", {
            kind: "completed",
            amount: Number(payment.amount),
            paymentId: payment.id,
            bookingId: payment.bookingId,
            createdAt: payment.createdAt,
          });
        }
      } catch (e) {
        console.warn("Analytics emit failed in stkCallback", e);
      }
      // M-Pesa expects 200 response regardless, with no specific body content required besides acknowledgment
      return res
        .status(200)
        .json({ ResultCode: 0, ResultDesc: "Accepted", result });
    } catch (error: any) {
      console.error("STK callback handling error", error);
      return res
        .status(200)
        .json({ ResultCode: 1, ResultDesc: "Callback processing failed" });
    }
  }

  static async getPaymentStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const payment = await prisma.payment.findUnique({
        where: { id },
        include: {
          booking: { select: { id: true, userId: true, status: true } },
        },
      });

      if (!payment) {
        return res.status(404).json({ message: "Payment not found" });
      }

      const user = (req as any).user;
      const privilegedRoles = new Set([
        "ADMIN",
        "SUPER_ADMIN",
        "FINANCE_OFFICER",
        "MANAGER",
      ]);
      const isPrivileged = user && privilegedRoles.has(user.role);

      if (!isPrivileged) {
        if (
          payment.booking &&
          payment.booking.userId &&
          payment.booking.userId !== user?.id
        ) {
          return res.status(403).json({ message: "Access denied" });
        }
        if (payment.userId && payment.userId !== user?.id && !payment.booking) {
          return res.status(403).json({ message: "Access denied" });
        }
      }

      const sanitizedPayment = {
        id: payment.id,
        bookingId: payment.bookingId,
        amount: payment.amount,
        status: payment.status,
        failureReason: payment.failureReason,
        method: payment.method,
        provider: payment.provider,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
        bookingStatus: payment.booking?.status ?? null,
      };

      return res.status(200).json({ data: sanitizedPayment });
    } catch (error: any) {
      console.error("Get payment status error", error);
      return res
        .status(500)
        .json({ message: "Failed to fetch payment status" });
    }
  }

  // Get a single payment by id (protected)
  static async getPayment(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const payment = await prisma.payment.findUnique({
        where: { id },
        include: {
          booking: { select: { id: true, userId: true, status: true } },
        },
      });
      if (!payment)
        return res.status(404).json({ message: "Payment not found" });

      // Ensure the requester owns the booking/payment unless admin; basic check
      const user = (req as any).user;
      if (
        payment.booking &&
        user?.role !== "ADMIN" &&
        user?.role !== "SUPER_ADMIN"
      ) {
        if (payment.booking.userId !== user?.id) {
          return res.status(403).json({ message: "Access denied" });
        }
      }

      // ✅ SECURITY FIX: Sanitize payment response
      // Remove sensitive metadata that might contain internal MPESA data
      const sanitizedPayment = {
        ...payment,
        metadata: undefined, // Don't expose internal metadata to clients
      };

      return res.status(200).json({ data: sanitizedPayment });
    } catch (error: any) {
      console.error("Get payment error", error);
      return res.status(500).json({ message: "Failed to fetch payment" });
    }
  }

  // Get payment by booking id (protected)
  static async getPaymentByBooking(req: Request, res: Response) {
    try {
      const { bookingId } = req.params;
      const user = (req as any).user;
      const payment = await prisma.payment.findFirst({
        where: { bookingId },
        include: {
          booking: { select: { id: true, userId: true, status: true } },
        },
      });
      if (!payment)
        return res.status(404).json({ message: "Payment not found" });

      if (
        payment.booking &&
        user?.role !== "ADMIN" &&
        user?.role !== "SUPER_ADMIN"
      ) {
        if (payment.booking.userId !== user?.id) {
          return res.status(403).json({ message: "Access denied" });
        }
      }

      // ✅ SECURITY FIX: Sanitize payment response
      // Remove sensitive metadata that might contain internal MPESA data
      const sanitizedPayment = {
        ...payment,
        metadata: undefined, // Don't expose internal metadata to clients
      };

      return res.status(200).json({ data: sanitizedPayment });
    } catch (error: any) {
      console.error("Get payment by booking error", error);
      return res
        .status(500)
        .json({ message: "Failed to fetch payment by booking" });
    }
  }

  /**
   * Manual REFUND (B2C ONLY) – All automatic reversal/async flows removed.
   * Behaviour:
   *  - Always executes an Mpesa B2C payout (requires MPESA_B2C_* env vars).
   *  - Immediately (optimistically) marks payment as REFUNDED / PARTIALLY_REFUNDED on successful B2C request submission.
   *  - Booking slot is freed instantly (booking status -> REFUNDED) when fully refunded – allowing other users to book.
   *  - No PROCESSING or refundPending intermediate state; callbacks (if received later) are ignored harmlessly.
   *  - If B2C initiation fails, payment state is reverted and error returned.
   */
  static async refundPayment(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { amount, reason } = req.body || {};
      const actor = (req as any).user;
      const payment = await prisma.payment.findUnique({
        where: { id },
        include: { booking: { include: { court: true } }, user: true },
      });
      if (!payment)
        return res.status(404).json({ message: "Payment not found" });
      if (payment.status === "REFUNDED") {
        return res
          .status(409)
          .json({ message: "Payment already fully refunded" });
      }
      if (
        payment.status !== "COMPLETED" &&
        payment.status !== "PARTIALLY_REFUNDED"
      ) {
        return res.status(400).json({
          message:
            "Only completed or partially refunded payments can be refunded",
        });
      }

      // --- Refund eligibility based on booked slot end time (NOT booking creation/payment time) ---
      // If the payment is tied to a booking, enforce that the scheduled slot endTime has not fully expired beyond grace period.
      // This prevents refunds for games that have already been played.
      const graceMinutes =
        parseInt(process.env.REFUND_SLOT_GRACE_MINUTES || "0", 10) || 0;
      if (!canRefundSlot(payment.booking?.endTime, graceMinutes)) {
        return res.status(400).json({
          code: "REFUND_WINDOW_CLOSED",
          message: `Refund not allowed - the game has already been played${
            graceMinutes ? ` (grace period: ${graceMinutes} minutes)` : ""
          }.`,
        });
      }

      const meta: any = payment.metadata || {};

      const numericPaid = Number(payment.amount);
      const alreadyRefunded = Number(payment.refundAmount || 0);
      const remaining = numericPaid - alreadyRefunded;
      let toRefund = amount != null ? Number(amount) : remaining;
      if (isNaN(toRefund) || toRefund <= 0) {
        return res.status(400).json({ message: "Invalid refund amount" });
      }
      if (toRefund > remaining) {
        return res
          .status(400)
          .json({ message: "Refund amount exceeds remaining" });
      }
      // Enforce B2C path
      if (payment.provider !== "MPESA") {
        return res
          .status(400)
          .json({ message: "Only M-Pesa payments can be refunded right now" });
      }

      // Try to get phone from metadata first, then fall back to user profile
      let phone = (payment.metadata as any)?.phone;
      if (!phone && payment.user?.phone) {
        phone = payment.user.phone;
      }

      if (!phone) {
        return res.status(400).json({
          message: "Cannot refund – original payer phone not captured",
        });
      }

      // Attempt B2C payout
      const refundRequestId = `B2C_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      try {
        await (MpesaService as any).b2cRefund?.({
          paymentId: payment.id,
          amount: toRefund,
          phone,
          reason: reason || "ADMIN_REFUND",
          actorId: actor?.id,
          requestId: refundRequestId,
        });
      } catch (err: any) {
        await prisma.auditLog.create({
          data: {
            userId: actor?.id || null,
            action: "PAYMENT_REFUND_B2C_FAILED",
            entity: "Payment",
            entityId: payment.id,
            newData: { error: err.message, amount: toRefund },
          },
        });
        return res.status(502).json({
          message: "Mpesa B2C refund initiation failed",
          error: err.message,
        });
      }

      // Immediately finalize (optimistic). If callback later arrives, it will be ignored (no refundPending flag present).
      const newTotal = alreadyRefunded + toRefund;
      const fullyRefunded = Math.abs(newTotal - numericPaid) < 0.00001;
      const now = new Date();

      const refreshedPayment = await prisma.payment.findUnique({
        where: { id: payment.id },
        select: { metadata: true },
      });
      const freshMeta: any = refreshedPayment?.metadata || meta;

      const updated = await prisma.payment.update({
        where: { id: payment.id },
        data: {
          refundAmount: newTotal,
          refundReason: reason || freshMeta.refundReason || "ADMIN_REFUND",
          status: fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED",
          refundedAt: fullyRefunded ? now : payment.refundedAt,
          metadata: {
            ...freshMeta,
            lastRefundAt: now.toISOString(),
            lastRefundRequestId: refundRequestId,
            b2cOptimistic: true,
            refundPending: true,
            refundInitiatedAt: now.toISOString(),
            refundRequestedAmount: toRefund,
            refundReasonPending: reason || "ADMIN_REFUND",
            refundPreviousStatus: payment.status,
            activeRefundRequestId: refundRequestId,
            refundActorId: actor?.id || null,
            refundRequests: [
              ...((freshMeta?.refundRequests as any[]) || []),
              {
                id: refundRequestId,
                amount: toRefund,
                reason: reason || "ADMIN_REFUND",
                requestedAt: now.toISOString(),
                status: "REQUESTED",
                actorId: actor?.id,
              },
            ],
          },
        },
        include: { booking: { include: { court: true } } },
      });

      if (updated.booking && fullyRefunded) {
        const b = await prisma.booking.update({
          where: { id: updated.booking.id },
          data: {
            status: "REFUNDED",
            cancellationReason: reason || "ADMIN_REFUND",
            cancelledAt: now,
          },
          select: { id: true, courtId: true, startTime: true },
        });
        try {
          emitCourtAvailability(
            b.courtId,
            format(new Date(b.startTime), "yyyy-MM-dd")
          );
        } catch (e) {
          console.warn("Emit court availability error (refund finalize)", e);
        }
      }

      try {
        emitPaymentUpdate(payment.userId, {
          status: fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED",
          paymentId: payment.id,
          bookingId: payment.bookingId,
          refundAmount: toRefund,
          refundTotal: newTotal,
          fullyRefunded,
          b2c: true,
        });
        emitAdminAnalytics("payment", {
          kind: "refund_completed",
          paymentId: payment.id,
          amount: toRefund,
          completedAt: now,
        });
      } catch (e) {
        console.warn("Emit payment update error (refund finalize)", e);
      }

      // Deduct loyalty points for refunded amount
      if (payment.userId) {
        try {
          const pointsToDeduct = await calculatePointsFromAmount(toRefund);
          const adjustmentType = "ADJUSTMENT" as any;

          const earnedAggregate = await prisma.loyaltyPoint.aggregate({
            where: {
              userId: payment.userId,
              referenceId: payment.id,
              type: "EARNED",
            },
            _sum: { points: true },
          });

          const totalEarned = earnedAggregate._sum?.points ?? 0;
          if (totalEarned > 0) {
            const adjustmentAggregate = await prisma.loyaltyPoint.aggregate({
              where: {
                userId: payment.userId,
                referenceId: payment.id,
                type: adjustmentType,
              },
              _sum: { points: true },
            });

            const netAdjustable = Math.max(
              0,
              totalEarned + (adjustmentAggregate._sum?.points ?? 0)
            );

            const pointsToRemove = Math.min(netAdjustable, pointsToDeduct);

            if (pointsToRemove > 0) {
              await prisma.$transaction([
                prisma.user.update({
                  where: { id: payment.userId },
                  data: { loyaltyPoints: { decrement: pointsToRemove } },
                }),
                prisma.loyaltyPoint.create({
                  data: {
                    userId: payment.userId,
                    points: -pointsToRemove,
                    type: adjustmentType,
                    description: payment.transactionId
                      ? `Refund adjustment for payment ${payment.transactionId}`
                      : "Refund adjustment",
                    referenceId: payment.id,
                  },
                }),
              ]);
            }
          }
        } catch (loyaltyErr) {
          console.error(
            "Failed to adjust loyalty points for refund:",
            loyaltyErr
          );
        }
      }

      await prisma.auditLog.create({
        data: {
          userId: actor?.id || null,
          action: fullyRefunded
            ? "PAYMENT_REFUND_FULL"
            : "PAYMENT_REFUND_PARTIAL",
          entity: "Payment",
          entityId: payment.id,
          oldData: { refundAmount: alreadyRefunded },
          newData: {
            refundAmount: newTotal,
            provider: "MPESA_B2C_OPTIMISTIC",
            amount: toRefund,
          },
        },
      });

      // -------------------------------------------------------------------
      // Refund notification email (Managers & Finance Officers)
      // -------------------------------------------------------------------
      try {
        const notifyRoles = ["MANAGER", "FINANCE_OFFICER"] as any; // cast for prisma enum
        const staffRecipients = await prisma.user.findMany({
          where: {
            role: { in: notifyRoles as any },
            emailVerified: true,
            isActive: true,
            isDeleted: false,
          },
          select: { email: true, firstName: true, role: true },
        });
        const toList = staffRecipients.map((r) => r.email).filter(Boolean);
        if (toList.length) {
          // Fetch detailed data for email template
          const booking = updated.booking;
          const customer = payment.userId
            ? await prisma.user.findUnique({
                where: { id: payment.userId },
                select: { firstName: true, lastName: true, email: true },
              })
            : null;
          const actorUser = actor?.id
            ? await prisma.user.findUnique({
                where: { id: actor.id },
                select: {
                  firstName: true,
                  lastName: true,
                  email: true,
                  role: true,
                },
              })
            : null;

          // Import email utilities
          const { sendMail, buildRefundNotificationEmail } = await import(
            "../utils/mailer"
          );

          // Build professional email using template
          const { subject, html } = buildRefundNotificationEmail({
            refundAmount: toRefund,
            totalRefunded: newTotal,
            totalPaid: Number(payment.amount),
            full: fullyRefunded,
            transactionId: payment.transactionId,
            bookingCode: booking?.bookingCode || null,
            courtName: booking?.court?.name || null,
            slotStart: booking?.startTime || null,
            slotEnd: booking?.endTime || null,
            customerName: customer
              ? `${customer.firstName || ""} ${customer.lastName || ""}`.trim()
              : null,
            customerEmail: customer?.email || null,
            actorName: actorUser
              ? `${actorUser.firstName || ""} ${
                  actorUser.lastName || ""
                }`.trim()
              : null,
            actorRole: actorUser?.role || null,
            reason: reason || null,
            referenceId: refundRequestId,
          });

          // Send individually (better deliverability / avoids exposing addresses)
          await Promise.all(
            toList.map((to) =>
              sendMail({ to, subject, html, skipVerify: true }).catch((e) =>
                console.warn("Refund email send failed", to, e)
              )
            )
          );
        }
      } catch (e) {
        console.warn("Refund notification email failed (non-fatal)", e);
      }

      // -------------------------------------------------------------------
      // Customer refund notification email
      // -------------------------------------------------------------------
      (async () => {
        try {
          // Only send if we have user email and booking details
          if (!payment.user?.email) {
            console.log("Skipping customer refund notification (no email)");
            return;
          }

          const { buildBookingCancellationEmail, sendMail } = await import(
            "../utils/mailer"
          );

          // Fetch full booking details if available
          const booking = payment.booking
            ? await prisma.booking.findUnique({
                where: { id: payment.booking.id },
                include: {
                  court: { select: { name: true } },
                  user: {
                    select: { firstName: true, lastName: true, email: true },
                  },
                },
              })
            : null;

          if (!booking) {
            console.log(
              "Skipping customer refund notification (no booking linked)"
            );
            return;
          }

          // Format date and time
          const startDate = new Date(booking.startTime);
          const endDate = new Date(booking.endTime);

          const dateFmt = startDate.toLocaleDateString("en-KE", {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric",
          });

          const timeRange = `${startDate.toLocaleTimeString("en-KE", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })} - ${endDate.toLocaleTimeString("en-KE", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })}`;

          // Determine if booking is already cancelled
          const isAlreadyCancelled = ["CANCELLED", "REFUNDED"].includes(
            booking.status
          );

          // Convert technical reasons to user-friendly messages
          const getUserFriendlyReason = (
            technicalReason?: string | null
          ): string => {
            if (!technicalReason) {
              return fullyRefunded
                ? "Your payment has been refunded"
                : "A partial refund has been processed";
            }

            // Map technical codes to user-friendly messages
            const reasonMap: Record<string, string> = {
              ADMIN_REFUND: "Refund processed by our team",
              MAINTENANCE: "Court maintenance scheduled",
              MAINTENANCE_CANCELLATION: "Court maintenance scheduled",
              DUPLICATE_BOOKING: "Duplicate booking detected",
              PAYMENT_ERROR: "Payment processing issue",
              CUSTOMER_REQUEST: "Refund requested",
              SYSTEM_ERROR: "Technical issue - apologies for the inconvenience",
              COURT_UNAVAILABLE: "Court became unavailable",
              WEATHER: "Adverse weather conditions",
              EMERGENCY: "Unforeseen circumstances",
            };

            // Return mapped message or capitalize the technical reason
            return (
              reasonMap[technicalReason] ||
              technicalReason
                .split("_")
                .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
                .join(" ")
            );
          };

          const customerReason = getUserFriendlyReason(
            reason || booking.cancellationReason
          );

          // Build appropriate email content
          const emailContent = buildBookingCancellationEmail({
            firstName:
              booking.user?.firstName || payment.user.email.split("@")[0],
            bookingCode: booking.bookingCode,
            courtName: booking.court?.name,
            date: dateFmt,
            timeRange,
            reason: customerReason,
            refundedAmount: toRefund,
            manageUrl: process.env.APP_URL || "https://tudorpadel.com/account",
          });

          // Send email to customer
          await sendMail({
            to: payment.user.email,
            subject: fullyRefunded
              ? emailContent.subject
              : `💰 Partial Refund Processed • ${booking.bookingCode}`,
            html: emailContent.html,
          });

          console.log(
            `📧 Refund notification sent to customer ${payment.user.email} for booking ${booking.bookingCode}`
          );

          // Log in audit trail
          await prisma.auditLog.create({
            data: {
              userId: actor?.id || null,
              action: "REFUND_CUSTOMER_NOTIFICATION",
              entity: "Payment",
              entityId: payment.id,
              newData: {
                customerEmail: payment.user.email,
                bookingCode: booking.bookingCode,
                refundAmount: toRefund,
                fullyRefunded,
              },
            },
          });
        } catch (emailError: any) {
          console.error(
            "Customer refund notification failed (non-fatal):",
            emailError.message
          );
          // Don't log to audit trail on failure to avoid noise
        }
      })();

      return res.status(200).json({
        message: "Refund completed (B2C initiated and recorded).",
        data: {
          id: payment.id,
          status: fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED",
          refundAmount: newTotal,
          refundedAt: fullyRefunded ? now : payment.refundedAt,
          fullyRefunded,
        },
      });
    } catch (error: any) {
      console.error("Refund payment error", error);
      return res.status(500).json({ message: "Failed to process refund" });
    }
  }

  /**
   * Reset a stuck refund (admin recovery).
   * Use case: Provider callback failed auth (401) so payment remains PROCESSING with refundPending=true.
   * Only allowed if status=PROCESSING AND metadata.refundPending=true.
   */
  static async resetRefundState(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const actor = (req as any).user;
      const payment = await prisma.payment.findUnique({ where: { id } });
      if (!payment)
        return res.status(404).json({ message: "Payment not found" });
      const meta: any = payment.metadata || {};
      if (payment.status !== "PROCESSING" || !meta.refundPending) {
        return res.status(400).json({
          message: "Refund state is not pending or already finalized",
        });
      }
      const previousStatus =
        payment.refundAmount && Number(payment.refundAmount) > 0
          ? "PARTIALLY_REFUNDED"
          : "COMPLETED";
      const updated = await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: previousStatus,
          metadata: {
            ...meta,
            refundPending: false,
            refundResetAt: new Date().toISOString(),
            refundResetBy: actor?.id,
          },
        },
      });
      await prisma.auditLog.create({
        data: {
          userId: actor?.id || null,
          action: "PAYMENT_REFUND_RESET",
          entity: "Payment",
          entityId: payment.id,
          oldData: { status: payment.status, refundPending: true },
          newData: { status: updated.status, refundPending: false },
        },
      });
      return res.status(200).json({
        message: "Refund state reset",
        data: { id: payment.id, status: updated.status },
      });
    } catch (e: any) {
      console.error("Refund reset error", e);
      return res.status(500).json({ message: "Failed to reset refund state" });
    }
  }

  /**
   * Export refunds (CSV) within a date range.
   * Query params:
   *   from (ISO date) - inclusive lower bound on refundedAt
   *   to (ISO date)   - inclusive upper bound on refundedAt
   *   search          - optional search across transactionId, booking.bookingCode, user email/name
   *   email=true      - if present/true, email CSV to MANAGER & FINANCE_OFFICER instead of inline download
   *   limit           - optional safety cap (default 5000, max 20000)
   */
  static async exportRefunds(req: Request, res: Response) {
    try {
      const { from, to, search } = req.query as any;
      const emailMode = /^(true|1|yes)$/i.test(
        (req.query.email as string) || "false"
      );
      const limit = Math.min(
        20000,
        Math.max(1, parseInt((req.query.limit as string) || "5000", 10))
      );

      const dateFilter: any = {};
      if (from) dateFilter.gte = new Date(from);
      if (to) dateFilter.lte = new Date(to);
      if (
        (dateFilter.gte && isNaN(dateFilter.gte.getTime())) ||
        (dateFilter.lte && isNaN(dateFilter.lte.getTime()))
      ) {
        return res.status(400).json({ message: "Invalid from/to date" });
      }

      const whereAnd: any[] = [
        { status: { in: ["REFUNDED", "PARTIALLY_REFUNDED"] } },
      ];
      if (dateFilter.gte || dateFilter.lte)
        whereAnd.push({ refundedAt: dateFilter });

      if (search) {
        const s = String(search).trim();
        whereAnd.push({
          OR: [
            { transactionId: { contains: s, mode: "insensitive" } },
            { providerRef: { contains: s, mode: "insensitive" } },
            {
              user: {
                OR: [
                  { email: { contains: s, mode: "insensitive" } },
                  { firstName: { contains: s, mode: "insensitive" } },
                  { lastName: { contains: s, mode: "insensitive" } },
                ],
              },
            },
            { booking: { bookingCode: { contains: s, mode: "insensitive" } } },
          ],
        });
      }

      const where: any = { AND: whereAnd };

      const records = await prisma.payment.findMany({
        where,
        include: {
          booking: {
            select: {
              bookingCode: true,
              startTime: true,
              endTime: true,
              court: { select: { name: true } },
            },
          },
          user: { select: { email: true, firstName: true, lastName: true } },
        },
        orderBy: { refundedAt: "desc" },
        take: limit,
      });

      // Build CSV manually (avoid additional deps)
      const headers = [
        "PaymentID",
        "TransactionID",
        "Status",
        "RefundAmount",
        "TotalPaid",
        "RefundedAt",
        "RefundReason",
        "BookingCode",
        "Court",
        "SlotStart",
        "SlotEnd",
        "CustomerName",
        "CustomerEmail",
        "ProviderRef",
        "LastRefundRequestId",
      ];
      const esc = (v: any) => {
        if (v == null) return "";
        const s = String(v);
        if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
        return s;
      };
      const rows = records.map((r) => {
        const customerName = r.user
          ? `${r.user.firstName || ""} ${r.user.lastName || ""}`.trim()
          : "";
        const meta: any = (r as any).metadata || {};
        return [
          r.id,
          r.transactionId,
          r.status,
          r.refundAmount ? Number(r.refundAmount) : "",
          Number(r.amount),
          r.refundedAt ? new Date(r.refundedAt).toISOString() : "",
          r.refundReason || "",
          r.booking?.bookingCode || "",
          r.booking?.court?.name || "",
          r.booking?.startTime
            ? new Date(r.booking.startTime).toISOString()
            : "",
          r.booking?.endTime ? new Date(r.booking.endTime).toISOString() : "",
          customerName,
          r.user?.email || "",
          r.providerRef || "",
          meta.lastRefundRequestId || "",
        ]
          .map(esc)
          .join(",");
      });
      const csv = [headers.join(","), ...rows].join("\n");

      if (!emailMode) {
        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="refunds_${Date.now()}.csv"`
        );
        return res.status(200).send(csv);
      }

      // Email mode – send to managers & finance officers
      try {
        const recipients = await prisma.user.findMany({
          where: {
            role: { in: ["MANAGER", "FINANCE_OFFICER"] as any },
            emailVerified: true,
            isActive: true,
            isDeleted: false,
          },
          select: { email: true },
        });
        const toList = recipients.map((r) => r.email).filter(Boolean);
        if (!toList.length) {
          return res.status(400).json({
            message: "No verified manager/finance emails to send export to",
          });
        }
        const { sendMail } = await import("../utils/mailer");
        const subject = `Refunds Export (${records.length} rows)`;
        const html = `<p style="font-family:Arial,sans-serif;font-size:14px;">Attached is the requested refunds export. Rows: <strong>${records.length}</strong>.</p>`;
        const attachmentName = `refunds_${from || "all"}_${
          to || "now"
        }.csv`.replace(/[^a-zA-Z0-9_.-]/g, "_");
        await Promise.all(
          toList.map((to) =>
            sendMail({
              to,
              subject,
              html,
              attachments: [{ filename: attachmentName, content: csv }],
            }).catch((e) => console.warn("Export email failed", to, e))
          )
        );
        await prisma.auditLog.create({
          data: {
            action: "REFUNDS_EXPORT_EMAIL",
            entity: "Payment",
            entityId: "BULK",
            newData: { from, to, rows: records.length },
          },
        });
        return res
          .status(200)
          .json({ message: "Refunds export emailed", rows: records.length });
      } catch (e) {
        console.error("Refund export email error", e);
        return res
          .status(500)
          .json({ message: "Failed to email refunds export" });
      }
    } catch (e: any) {
      console.error("Export refunds error", e);
      return res
        .status(500)
        .json({ message: "Failed to export refunds", error: e.message });
    }
  }
}

export default PaymentController;

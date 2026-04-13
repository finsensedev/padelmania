import axios from "axios";
import { PointType } from "@prisma/client";
import prisma from "../config/db";
import {
  emitBookingUpdate,
  emitCourtAvailability,
  emitPaymentUpdate,
} from "../utils/ws-bus";
import { sendMail, buildBookingConfirmationEmail } from "../utils/mailer";
import { format, addDays, addMonths } from "date-fns";
import { calculatePointsFromAmount } from "../utils/loyalty";
import { calculatePriceBreakdown } from "../utils/price-breakdown";
import { awardReferralPoints } from "./referral.service";

// Environment variable helper with explicit errors for required keys
function required(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var ${name}`);
  return val;
}

function requiredTrimmed(name: string): string {
  return required(name).trim();
}

export interface StkPushRequest {
  phoneNumber: string; // MSISDN in 2547XXXXXXXX format
  amount: number; // Integer amount
  accountReference?: string; // Booking code / order number
  description?: string; // Transaction description
  bookingId?: string; // Optional link to booking
  userId?: string; // Authenticated user ID
  // New: reservation details for creating a booking AFTER successful payment
  reservation?: {
    courtId: string;
    startTime: string; // ISO
    endTime: string; // ISO
    duration?: number; // minutes
    numberOfPlayers?: number;
    // Amount breakdown (optional but recommended)
    slotAmount?: number; // courts subtotal
    racketQty?: number; // number of rackets requested
    racketUnitPrice?: number; // unit price at time of booking
    racketsAmount?: number; // racketQty * racketUnitPrice
    ballsQty?: number; // number of ball packs requested
    ballsUnitPrice?: number; // unit price per pack at time of booking
    ballsAmount?: number; // ballsQty * ballsUnitPrice
    ballTypeId?: string; // specific ball type ID for equipment rental
    ballTypeName?: string; // label for fallback lookup
    totalAmount: number; // grand total to charge
    createdByOfficer?: boolean; // flag to suppress customer/officer duplicate emails
  };
  // New: Support multiple court reservations in one payment
  reservations?: Array<{
    courtId: string;
    startTime: string; // ISO
    endTime: string; // ISO
    duration?: number; // minutes
    numberOfPlayers?: number;
    slotAmount?: number; // courts subtotal for this reservation
    racketQty?: number;
    racketUnitPrice?: number;
    racketsAmount?: number;
    ballsQty?: number;
    ballsUnitPrice?: number;
    ballsAmount?: number;
    ballTypeId?: string; // specific ball type ID
    ballTypeName?: string; // label for fallback lookup
    totalAmount: number; // total for this reservation
    createdByOfficer?: boolean;
  }>;
  context?: string; // Arbitrary context to distinguish payment intent (e.g., GIFTCARD_PURCHASE)
  paymentMetadata?: Record<string, unknown>; // Additional metadata persisted on the payment row
}

export class MpesaService {
  // In-memory timers for pending STK pushes to enforce a 60s timeout window
  private static pendingTimers = new Map<string, NodeJS.Timeout>();

  private static getTimeoutMs() {
    const v = Number(process.env.MPESA_PAYMENT_TIMEOUT_MS || 60000);
    return Number.isFinite(v) && v > 0 ? v : 60000;
  }

  private static async finalizeRefund(params: {
    paymentId: string;
    amount?: number;
    reason?: string;
    actorId?: string | null;
    requestId?: string | null;
    simulated?: boolean;
    providerMeta?: Record<string, unknown> | null;
  }) {
    const {
      paymentId,
      amount,
      reason,
      actorId,
      requestId,
      simulated,
      providerMeta,
    } = params;

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { booking: true },
    });
    if (!payment) throw new Error("Payment not found for refund finalization");

    const meta: any = payment.metadata || {};
    if (!meta.refundPending) {
      return { skipped: true };
    }

    const providerMetaJson =
      providerMeta != null ? JSON.parse(JSON.stringify(providerMeta)) : null;

    const fallbackAmount = Number(meta.refundRequestedAmount || 0);
    const refundAmountCandidate =
      amount != null && Number.isFinite(amount)
        ? Number(amount)
        : fallbackAmount;
    if (!Number.isFinite(refundAmountCandidate) || refundAmountCandidate <= 0) {
      throw new Error("Invalid refund amount for finalization");
    }

    const refundAmount = refundAmountCandidate;
    const numericPaid = Number(payment.amount);
    const alreadyRefunded = Number(payment.refundAmount || 0);
    const newRefundTotal = alreadyRefunded + refundAmount;
    const fullyRefunded = Math.abs(newRefundTotal - numericPaid) < 0.00001;
    const now = new Date();

    const targetRequestId =
      requestId || meta.activeRefundRequestId || meta.refundRequestId || null;

    const existingRequests = Array.isArray(meta.refundRequests)
      ? (meta.refundRequests as any[])
      : [];
    const updatedRequests = existingRequests.map((req: any) =>
      req.id === targetRequestId
        ? {
            ...req,
            status: "COMPLETED",
            completedAt: now.toISOString(),
            amount: refundAmount,
          }
        : req,
    );

    const refundEvents = [
      ...(Array.isArray(meta.refundEvents) ? (meta.refundEvents as any[]) : []),
      {
        at: now.toISOString(),
        amount: refundAmount,
        reason: reason || meta.refundReasonPending || payment.refundReason,
        actorId: actorId || meta.refundActorId || null,
        provider: "MPESA",
        simulated: Boolean(simulated),
        requestId: targetRequestId,
        providerMeta: providerMetaJson,
      },
    ];

    const mpesaReversalMeta = {
      ...(meta.mpesaReversal || {}),
      lastStatus: "COMPLETED",
      lastCompletedAt: now.toISOString(),
      lastResult: providerMetaJson,
    };

    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        refundAmount: newRefundTotal,
        refundReason:
          reason || meta.refundReasonPending || payment.refundReason,
        status: fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED",
        refundedAt: fullyRefunded ? now : payment.refundedAt,
        metadata: {
          ...meta,
          refundPending: false,
          refundCompletedAt: now.toISOString(),
          refundReasonPending: null,
          refundError: null,
          refundRequests: updatedRequests,
          refundEvents,
          activeRefundRequestId: null,
          mpesaReversal: mpesaReversalMeta,
        },
      },
      include: { booking: true },
    });

    if (updated.userId) {
      try {
        await MpesaService.adjustLoyaltyForRefund({
          userId: updated.userId,
          paymentId: payment.id,
          refundAmount,
          paymentReference: payment.transactionId,
          initialPointsEarned: await calculatePointsFromAmount(
            Number(payment.amount),
          ),
        });
      } catch (adjustErr) {
        console.error(
          "Failed to adjust loyalty points after refund",
          adjustErr,
        );
      }
    }

    if (updated.booking && fullyRefunded) {
      await prisma.booking.update({
        where: { id: updated.booking.id },
        data: {
          status: "REFUNDED",
          cancellationReason:
            reason || meta.refundReasonPending || "ADMIN_REFUND",
          cancelledAt: now,
        },
      });
      try {
        emitCourtAvailability(
          updated.booking.courtId,
          format(new Date(updated.booking.startTime), "yyyy-MM-dd"),
        );
      } catch (e) {
        console.warn("Emit availability error (refund finalize)", e);
      }
    }

    await prisma.auditLog.create({
      data: {
        userId: actorId || meta.refundActorId || null,
        action: fullyRefunded
          ? "PAYMENT_REFUND_FULL"
          : "PAYMENT_REFUND_PARTIAL",
        entity: "Payment",
        entityId: payment.id,
        oldData: { status: payment.status, refundAmount: payment.refundAmount },
        newData: {
          status: updated.status,
          refundAmount: updated.refundAmount,
          amountRefundedNow: refundAmount,
          requestId: targetRequestId,
          providerMeta: providerMetaJson,
        },
      },
    });

    try {
      emitPaymentUpdate(payment.userId, {
        status: updated.status,
        paymentId: payment.id,
        bookingId: updated.bookingId,
        refundAmount,
        refundTotal: newRefundTotal,
        fullyRefunded,
        completed: true,
      });
    } catch (e) {
      console.warn("Emit payment update error (refund finalize)", e);
    }

    return { ok: true, fullyRefunded, paymentId: payment.id };
  }

  private static async markRefundFailed(params: {
    paymentId: string;
    reason: string;
    requestId?: string | null;
    resultCode?: number | string | null;
    details?: Record<string, unknown> | null;
    status?: string;
  }) {
    const { paymentId, reason, requestId, resultCode, details, status } =
      params;
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) return;

    const meta: any = payment.metadata || {};
    const now = new Date();
    const targetRequestId =
      requestId || meta.activeRefundRequestId || meta.refundRequestId || null;

    const existingRequests = Array.isArray(meta.refundRequests)
      ? (meta.refundRequests as any[])
      : [];
    const updatedRequests = existingRequests.map((req: any) =>
      req.id === targetRequestId
        ? {
            ...req,
            status: status || "FAILED",
            failedAt: now.toISOString(),
            failureReason: reason,
          }
        : req,
    );

    const providerMetaJson =
      details != null ? JSON.parse(JSON.stringify(details)) : null;

    const mpesaReversalMeta = {
      ...(meta.mpesaReversal || {}),
      lastStatus: status || "FAILED",
      lastCompletedAt: now.toISOString(),
      lastResult: {
        ...(providerMetaJson || {}),
        resultCode: resultCode ?? null,
        failureReason: reason,
      },
    };

    const revertedStatus = meta.refundPreviousStatus || payment.status;

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: revertedStatus,
        metadata: {
          ...meta,
          refundPending: false,
          refundCompletedAt: now.toISOString(),
          refundError: reason,
          activeRefundRequestId: null,
          refundRequests: updatedRequests,
          mpesaReversal: mpesaReversalMeta,
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: meta.refundActorId || null,
        action: "PAYMENT_REFUND_FAILED",
        entity: "Payment",
        entityId: payment.id,
        oldData: { status: payment.status },
        newData: {
          status: revertedStatus,
          reason,
          requestId: targetRequestId,
          resultCode: resultCode ?? null,
          providerMeta: providerMetaJson,
        },
      },
    });

    try {
      emitPaymentUpdate(payment.userId, {
        status: revertedStatus,
        paymentId: payment.id,
        bookingId: payment.bookingId,
        refundPending: false,
        refundFailed: true,
        reason,
      });
    } catch (e) {
      console.warn("Emit payment update error (refund fail)", e);
    }
  }

  private static async adjustLoyaltyForRefund(params: {
    userId: string;
    paymentId: string;
    refundAmount: number;
    paymentReference?: string | null;
    initialPointsEarned?: number;
  }) {
    const {
      userId,
      paymentId,
      refundAmount,
      paymentReference,
      initialPointsEarned,
    } = params;
    // TODO: remove cast once Prisma client regenerated with ADJUSTMENT enum value
    const adjustmentType = "ADJUSTMENT" as PointType;
    const earnedAggregate = await prisma.loyaltyPoint.aggregate({
      where: {
        userId,
        referenceId: paymentId,
        type: PointType.EARNED,
      },
      _sum: { points: true },
    });

    const totalEarned = earnedAggregate._sum?.points ?? 0;
    if (totalEarned <= 0) {
      return;
    }

    const adjustmentAggregate = await prisma.loyaltyPoint.aggregate({
      where: {
        userId,
        referenceId: paymentId,
        type: adjustmentType,
      },
      _sum: { points: true },
    });

    const netAdjustable = Math.max(
      0,
      totalEarned + (adjustmentAggregate._sum?.points ?? 0),
    );

    if (netAdjustable <= 0) {
      return;
    }

    const pointsTarget =
      initialPointsEarned ?? (await calculatePointsFromAmount(refundAmount));
    const pointsToRemove = Math.min(netAdjustable, pointsTarget);

    if (pointsToRemove <= 0) {
      return;
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { loyaltyPoints: { decrement: pointsToRemove } },
      }),
      prisma.loyaltyPoint.create({
        data: {
          userId,
          points: -pointsToRemove,
          type: adjustmentType,
          description: paymentReference
            ? `Refund adjustment for payment ${paymentReference}`
            : "Refund adjustment",
          referenceId: paymentId,
        },
      }),
    ]);
  }

  private static async findPaymentForReversal(search: {
    conversationId?: string | null;
    originatorConversationId?: string | null;
    transactionId?: string | null;
  }) {
    const { conversationId, originatorConversationId, transactionId } = search;
    const clauses: any[] = [];

    if (conversationId) {
      clauses.push({
        metadata: {
          path: ["mpesaReversal", "conversationId"],
          equals: conversationId,
        },
      });
    }

    if (originatorConversationId) {
      clauses.push({
        metadata: {
          path: ["mpesaReversal", "originatorConversationId"],
          equals: originatorConversationId,
        },
      });
    }

    if (transactionId) {
      clauses.push({ transactionId });
    }

    if (!clauses.length) {
      return null;
    }

    const where =
      clauses.length === 1 ? clauses[0] : { OR: clauses.filter(Boolean) };

    return prisma.payment.findFirst({
      where,
    });
  }

  private static extractResultParameter(
    resultParameters: any,
    key: string,
  ): unknown {
    if (!resultParameters) return null;

    const entries = Array.isArray(resultParameters?.ResultParameter)
      ? resultParameters.ResultParameter
      : Array.isArray(resultParameters)
        ? resultParameters
        : [];

    for (const item of entries) {
      const itemKey =
        item?.Key ||
        item?.key ||
        item?.Name ||
        item?.name ||
        item?.ParameterKey;
      if (itemKey === key) {
        return item?.Value ?? item?.value ?? null;
      }
    }

    return null;
  }

  static async handleReversalCallback(callbackBody: any) {
    const result =
      callbackBody?.Result ||
      callbackBody?.Body?.Result ||
      callbackBody?.Body?.result;
    if (!result) return { ok: true, ignored: true };

    const conversationId =
      result.ConversationID || result.conversationId || null;
    const originatorConversationId =
      result.OriginatorConversationID ||
      result.originatorConversationId ||
      null;
    const transactionId = result.TransactionID || result.transactionId || null;

    const payment = await this.findPaymentForReversal({
      conversationId,
      originatorConversationId,
      transactionId,
    });

    if (!payment) {
      await prisma.auditLog.create({
        data: {
          action: "MPESA_REVERSAL_CALLBACK_UNMATCHED",
          entity: "Payment",
          entityId: conversationId || originatorConversationId || "UNKNOWN",
          newData: result,
        },
      });
      return {
        ok: false,
        message: "Payment not found for reversal callback",
      };
    }

    const meta: any = payment.metadata || {};
    const amountParam = this.extractResultParameter(
      result.ResultParameters,
      "Amount",
    );
    const amount = Number(
      amountParam ?? meta.refundRequestedAmount ?? result.Amount ?? 0,
    );
    const requestId =
      meta.activeRefundRequestId || meta.mpesaReversal?.requestId || null;

    const resultCode = Number(result.ResultCode);
    if (resultCode === 0) {
      await this.finalizeRefund({
        paymentId: payment.id,
        amount: Number.isFinite(amount) && amount > 0 ? amount : undefined,
        reason: meta.refundReasonPending || "ADMIN_REFUND",
        actorId: meta.refundActorId || null,
        requestId,
        simulated: false,
        providerMeta: result,
      });
      return { ok: true, status: "COMPLETED", paymentId: payment.id };
    }

    await this.markRefundFailed({
      paymentId: payment.id,
      reason: result.ResultDesc || "Mpesa reversal failed",
      requestId,
      resultCode: result.ResultCode,
      details: JSON.parse(
        JSON.stringify({ ...result, conversationId, originatorConversationId }),
      ),
      status: "FAILED",
    });
    return { ok: false, status: "FAILED", paymentId: payment.id };
  }

  static async handleReversalTimeout(callbackBody: any) {
    const result =
      callbackBody?.Result ||
      callbackBody?.Body?.Result ||
      callbackBody?.Body?.result;
    if (!result) return { ok: true, ignored: true };

    const conversationId =
      result.ConversationID || result.conversationId || null;
    const originatorConversationId =
      result.OriginatorConversationID ||
      result.originatorConversationId ||
      null;
    const transactionId = result.TransactionID || result.transactionId || null;

    const payment = await this.findPaymentForReversal({
      conversationId,
      originatorConversationId,
      transactionId,
    });

    if (!payment) {
      await prisma.auditLog.create({
        data: {
          action: "MPESA_REVERSAL_TIMEOUT_UNMATCHED",
          entity: "Payment",
          entityId: conversationId || originatorConversationId || "UNKNOWN",
          newData: result,
        },
      });
      return {
        ok: false,
        message: "Payment not found for reversal timeout callback",
      };
    }

    const meta: any = payment.metadata || {};
    const requestId =
      meta.activeRefundRequestId || meta.mpesaReversal?.requestId || null;

    await this.markRefundFailed({
      paymentId: payment.id,
      reason: result.ResultDesc || "Mpesa reversal timeout",
      requestId,
      resultCode: result.ResultCode ?? "TIMEOUT",
      details: JSON.parse(
        JSON.stringify({
          ...result,
          conversationId,
          originatorConversationId,
          timeout: true,
        }),
      ),
      status: "TIMEOUT",
    });

    return { ok: false, status: "TIMEOUT", paymentId: payment.id };
  }

  private static clearPendingTimeout(paymentId: string) {
    const t = this.pendingTimers.get(paymentId);
    if (t) {
      clearTimeout(t);
      this.pendingTimers.delete(paymentId);
    }
  }

  private static schedulePendingTimeout(paymentId: string) {
    // Clear any existing timer and schedule afresh (covers re-initiation attempts)
    this.clearPendingTimeout(paymentId);
    const timeoutMs = this.getTimeoutMs();
    const timer = setTimeout(async () => {
      try {
        // Re-check payment status at timeout time
        const payment = await prisma.payment.findUnique({
          where: { id: paymentId },
        });
        if (!payment) return;
        if (payment.status !== "PENDING") return; // resolved in time

        const existingMeta: any = (payment as any).metadata || {};

        // Mark payment as FAILED due to TIMEOUT
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: "FAILED",
            failureReason: "TIMEOUT",
            metadata: {
              ...existingMeta,
              timedOutAt: new Date().toISOString(),
              failureKind: "TIMEOUT",
            },
          },
        });

        // If there is a linked booking, cancel to release the slot
        if (payment.bookingId) {
          await prisma.booking.update({
            where: { id: payment.bookingId },
            data: {
              status: "CANCELLED",
              cancelledAt: new Date(),
              cancellationReason: "Payment timeout",
            },
          });

          try {
            emitPaymentUpdate((payment as any).userId, {
              status: "FAILED",
              paymentId: payment.id,
              bookingId: payment.bookingId,
              timedOut: true,
              reason: "TIMEOUT",
            });
            const booking = await prisma.booking.findUnique({
              where: { id: payment.bookingId },
              select: { courtId: true, startTime: true },
            });
            if (booking) {
              emitCourtAvailability(
                booking.courtId,
                format(new Date(booking.startTime), "yyyy-MM-dd"),
              );
            }
          } catch (e) {
            console.warn("WS emit error (timeout booking cancel):", e);
          }
        } else if (existingMeta?.reservation) {
          // No booking yet, but there was a reservation hold. Emit availability refresh.
          const r = existingMeta.reservation as {
            courtId: string;
            startTime: string;
          };
          try {
            emitPaymentUpdate((payment as any).userId, {
              status: "FAILED",
              paymentId: payment.id,
              bookingId: null,
              timedOut: true,
              reason: "TIMEOUT",
            });
            emitCourtAvailability(
              r.courtId,
              format(new Date(r.startTime), "yyyy-MM-dd"),
            );
          } catch (e) {
            console.warn("WS emit error (timeout reservation hold):", e);
          }
        } else {
          // No booking or reservation, still notify payment failure due to timeout
          try {
            emitPaymentUpdate((payment as any).userId, {
              status: "FAILED",
              paymentId: payment.id,
              bookingId: null,
              timedOut: true,
              reason: "TIMEOUT",
            });
          } catch (e) {
            console.warn("WS emit error (timeout generic):", e);
          }
        }
      } catch (err) {
        console.error("Error handling payment timeout:", err);
      } finally {
        // Cleanup regardless of outcome
        this.clearPendingTimeout(paymentId);
      }
    }, timeoutMs);

    this.pendingTimers.set(paymentId, timer);
  }

  private static baseUrl() {
    const env = process.env.MPESA_ENV || "sandbox"; // sandbox | production
    return env === "production"
      ? "https://api.safaricom.co.ke"
      : "https://sandbox.safaricom.co.ke";
  }

  static async getAccessToken() {
    const key = required("MPESA_CONSUMER_KEY");
    const secret = required("MPESA_CONSUMER_SECRET");
    const auth = Buffer.from(`${key}:${secret}`).toString("base64");
    const url = `${this.baseUrl()}/oauth/v1/generate?grant_type=client_credentials`;
    const { data } = await axios.get(url, {
      headers: { Authorization: `Basic ${auth}` },
    });
    return data.access_token as string;
  }

  private static buildPassword(
    shortcode: string,
    passkey: string,
    timestamp: string,
  ) {
    return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");
  }

  static normalizePhone(msisdn: string) {
    /**
     * Normalize Kenyan MSISDN to 12-digit 254XXXXXXXXX format (Safaricom / Airtel 7x / 1x prefixes).
     * Accepted input examples (all become 2547XXXXXXXX / 2541XXXXXXXX):
     *   07XXXXXXXX, 7XXXXXXXX, 01XXXXXXXX, 1XXXXXXXX
     *   2547XXXXXXXX, 2541XXXXXXXX
     *   +2547XXXXXXXX, +2541XXXXXXXX
     *   +254 7XX XXX XXX (with spaces / dashes / dots)
     * Rejected examples:
     *   07012345   (too short)
     *   2547123456789 (too long)
     *   555123456 (wrong prefix)
     *
     * Failure messages are explicit so frontend can surface helpful guidance.
     */
    if (!msisdn || typeof msisdn !== "string") {
      throw new Error("Phone number required");
    }

    // Strip all non-digit characters; keep leading + only for initial check
    let raw = msisdn.trim();
    // Remove common separators
    raw = raw.replace(/[()-.\s]/g, "");

    if (raw.startsWith("+")) raw = raw.substring(1);

    // After this point only digits expected
    if (!/^\d{7,15}$/.test(raw)) {
      throw new Error("Invalid phone number characters");
    }

    // Leading 0 local format -> replace with 254
    if (raw.startsWith("0")) {
      raw = "254" + raw.substring(1);
    }

    // Short 7XXXXXXXX or 1XXXXXXXX (9 digits) -> prepend 254
    if (/^(7|1)\d{8}$/.test(raw)) {
      raw = "254" + raw;
    }

    // Already in 254 format? keep
    // At this point we expect 12 digits starting 2547 or 2541
    if (!/^254(7|1)\d{8}$/.test(raw)) {
      // Provide granular error messages
      if (raw.startsWith("254") && !/^254(7|1)/.test(raw)) {
        throw new Error(
          "Unsupported Kenyan prefix – must start with 07, 01, 7, 1, +2547 or +2541",
        );
      }
      throw new Error(
        "Invalid Kenyan MSISDN format – expected 07XXXXXXXX, 01XXXXXXXX, 7XXXXXXXX, 1XXXXXXXX or +2547/2541XXXXXXXX",
      );
    }

    return raw;
  }

  /**
   * Convenience helper for ad-hoc validation scripts / tests.
   * Returns tuple [normalized, error]; does not throw.
   */
  static tryNormalizePhone(msisdn: string): [string | null, string | null] {
    try {
      return [this.normalizePhone(msisdn), null];
    } catch (e: any) {
      return [null, e.message || "Unknown error"];
    }
  }

  static async initiateStkPush(req: StkPushRequest) {
    const shortcode = required("MPESA_SHORTCODE");
    const passkey = required("MPESA_PASSKEY");
    const callbackBase = required("MPESA_CALLBACK_URL_BASE");

    const timestamp = format(new Date(), "yyyyMMddHHmmss");
    const password = this.buildPassword(shortcode, passkey, timestamp);
    const token = await this.getAccessToken();

    const phone = this.normalizePhone(req.phoneNumber);

    const accountRef = req.accountReference || req.bookingId || "TUDORPADEL";
    const description = req.description || "Padel court booking";

    let paymentId: string | undefined;
    let existing: any = null;

    // For ADD_EQUIPMENT context, always create a new payment (allow multiple equipment top-ups)
    // For other contexts (booking creation), check for existing payment to avoid duplicates
    if (req.bookingId && req.context !== "ADD_EQUIPMENT") {
      existing = await prisma.payment.findUnique({
        where: { bookingId: req.bookingId },
      });
    }

    const txId = `MPESA_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 8)}`;
    const now = new Date();

    if (existing) {
      if (existing.status === "COMPLETED") {
        return {
          message: "Payment already completed",
          status: "COMPLETED",
          paymentId: existing.id,
          bookingId: existing.bookingId,
          orderId: existing.orderId,
        };
      }

      const meta: any = existing.metadata || {};
      const attempt = (meta.attempt || 0) + 1;
      const updated = await prisma.payment.update({
        where: { id: existing.id },
        data: {
          transactionId: txId,
          amount: req.amount,
          status: "PENDING",
          failureReason: null,
          metadata: {
            ...meta,
            phone,
            attempt,
            stage: "REINITIATED",
            accountRef,
            lastReinitAt: now.toISOString(),
            ...(req.context ? { context: req.context } : {}),
            ...(req.paymentMetadata || {}),
          },
          updatedAt: now,
        },
      });
      paymentId = updated.id;
    } else if (req.bookingId) {
      // For ADD_EQUIPMENT context, set bookingId to null to avoid unique constraint
      // Store the booking reference in metadata instead
      const isAddEquipment = req.context === "ADD_EQUIPMENT";

      const payment = await prisma.payment.create({
        data: {
          transactionId: txId,
          userId: req.userId || null,
          bookingId: isAddEquipment ? null : req.bookingId,
          amount: req.amount,
          method: "MPESA",
          provider: "MPESA",
          status: "PENDING",
          metadata: {
            stage: "INITIATED",
            accountRef,
            attempt: 1,
            phone,
            ...(isAddEquipment ? { relatedBookingId: req.bookingId } : {}),
            ...(req.context ? { context: req.context } : {}),
            ...(req.paymentMetadata || {}),
          },
          createdAt: now,
          updatedAt: now,
        },
      });
      paymentId = payment.id;
    } else if (req.reservations && req.reservations.length > 0) {
      // Handle multiple reservations
      const payment = await prisma.payment.create({
        data: {
          transactionId: txId,
          userId: req.userId || null,
          bookingId: null,
          amount: req.amount,
          method: "MPESA",
          provider: "MPESA",
          status: "PENDING",
          metadata: {
            stage: "INITIATED",
            accountRef,
            attempt: 1,
            phone,
            reservations: req.reservations,
            ...(req.context ? { context: req.context } : {}),
            ...(req.paymentMetadata || {}),
          } as any,
          createdAt: now,
          updatedAt: now,
        },
      });
      paymentId = payment.id;

      // Emit availability updates for all courts
      try {
        for (const reservation of req.reservations) {
          emitCourtAvailability(
            reservation.courtId,
            format(new Date(reservation.startTime), "yyyy-MM-dd"),
          );
        }
      } catch (e) {
        console.warn("WS emit error (multiple reservations hold created):", e);
      }
    } else if (req.reservation) {
      const payment = await prisma.payment.create({
        data: {
          transactionId: txId,
          userId: req.userId || null,
          bookingId: null,
          amount: req.amount,
          method: "MPESA",
          provider: "MPESA",
          status: "PENDING",
          metadata: {
            stage: "INITIATED",
            accountRef,
            attempt: 1,
            phone,
            reservation: req.reservation,
            ...(req.context ? { context: req.context } : {}),
            ...(req.paymentMetadata || {}),
          } as any,
          createdAt: now,
          updatedAt: now,
        },
      });
      paymentId = payment.id;

      try {
        emitCourtAvailability(
          req.reservation.courtId,
          format(new Date(req.reservation.startTime), "yyyy-MM-dd"),
        );
      } catch (e) {
        console.warn("WS emit error (reservation hold created):", e);
      }
    } else if (req.context) {
      const baseMeta: Record<string, unknown> = {
        stage: "INITIATED",
        accountRef,
        attempt: 1,
        phone, // capture payer phone for refunds
        context: req.context,
      };
      const payment = await prisma.payment.create({
        data: {
          transactionId: txId,
          userId: req.userId || null,
          bookingId: null,
          amount: req.amount,
          method: "MPESA",
          provider: "MPESA",
          status: "PENDING",
          metadata: { ...baseMeta, ...(req.paymentMetadata || {}) } as any,
          createdAt: now,
          updatedAt: now,
        },
      });
      paymentId = payment.id;
    }

    const payload = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType:
        process.env.MPESA_TRANSACTION_TYPE || "CustomerPayBillOnline",
      Amount: req.amount,
      PartyA: phone,
      PartyB: shortcode,
      PhoneNumber: phone,
      CallBackURL: `${callbackBase}/api/payments/stk-callback${
        process.env.MPESA_CALLBACK_SECRET
          ? `?secret=${process.env.MPESA_CALLBACK_SECRET}`
          : ""
      }`,
      AccountReference: accountRef.substring(0, 12),
      TransactionDesc: description.substring(0, 30),
    };

    const url = `${this.baseUrl()}/mpesa/stkpush/v1/processrequest`;
    let data: any;

    console.info("🚀 Initiating M-Pesa STK push", {
      url,
      phone,
      amount: req.amount,
      bookingId: req.bookingId,
      hasReservation: Boolean(req.reservation || req.reservations),
      context: req.context,
      environment: process.env.MPESA_ENV || "sandbox",
    });

    try {
      const res = await axios.post(url, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      data = res.data;

      console.info("✅ M-Pesa STK API response", {
        responseCode: data?.ResponseCode,
        responseDescription: data?.ResponseDescription,
        customerMessage: data?.CustomerMessage,
        merchantRequestId: data?.MerchantRequestID,
        checkoutRequestId: data?.CheckoutRequestID,
        rawData: JSON.stringify(data),
      });
    } catch (err: any) {
      console.error("❌ M-Pesa STK API error", {
        message: err.message,
        responseData: err.response?.data,
        responseStatus: err.response?.status,
        responseHeaders: err.response?.headers,
      });
      // If we pre-created payment, mark as failed
      if (paymentId) {
        await prisma.payment.update({
          where: { id: paymentId },
          data: {
            status: "FAILED",
            failureReason:
              err.response?.data?.errorMessage ||
              err.response?.data?.errorMessage ||
              err.message ||
              "STK push request failed",
            metadata: {
              error: err.response?.data || err.message,
              stage: "REQUEST_FAILED",
            } as any,
          },
        });
      }

      const apiMsg = err.response?.data?.errorMessage || err.message;
      throw new Error(`M-Pesa STK Push error: ${apiMsg}`);
    }

    // Attach mpesa meta to payment if pre-created
    if (paymentId) {
      const existingMeta = (
        await prisma.payment.findUnique({
          where: { id: paymentId },
          select: { metadata: true },
        })
      )?.metadata as any;
      // ✅ SECURITY FIX: Never expose mpesaPayload to client
      // Store internally but exclude from client responses
      // Only CheckoutRequestID needed for tracking
      const { Password, ...safePayload } = payload;
      await prisma.payment.update({
        where: { id: paymentId },
        data: {
          metadata: {
            ...(existingMeta || {}),
            // Store for internal audit/debugging only - never returned to client
            _mpesaRequest: safePayload,
            CheckoutRequestID: data.CheckoutRequestID,
          } as any,
        },
      });

      // Start a best-effort 60-second timeout for pending payments
      MpesaService.schedulePendingTimeout(paymentId);
    }

    // ✅ SECURITY FIX: Never expose M-Pesa internal tracking IDs or callback URLs to client
    // Only return safe, minimal fields needed by the frontend
    return {
      paymentId,
      CustomerMessage:
        data.CustomerMessage || "STK push sent. Please check your phone.",
      ResponseCode: data.ResponseCode,
      ResponseDescription: data.ResponseDescription,
    };
  }

  // Handle STK push callback from M-Pesa
  static async handleCallback(callbackBody: any) {
    const stkCallback = callbackBody?.Body?.stkCallback;
    if (!stkCallback) return { ok: true, ignored: true };

    const {
      MerchantRequestID,
      CheckoutRequestID,
      ResultCode,
      ResultDesc,
      CallbackMetadata,
    } = stkCallback;

    // Extract amount + receipt number + phone
    let amount: number | undefined;
    let receipt: string | undefined;
    let phone: string | undefined;
    if (CallbackMetadata?.Item) {
      for (const item of CallbackMetadata.Item) {
        if (item.Name === "Amount") amount = item.Value;
        if (item.Name === "MpesaReceiptNumber") receipt = item.Value;
        if (item.Name === "PhoneNumber") phone = item.Value?.toString();
      }
    }

    // Try find payment by CheckoutRequestID stored in metadata
    const payment = await prisma.payment.findFirst({
      where: {
        metadata: { path: ["CheckoutRequestID"], equals: CheckoutRequestID },
      },
    });

    if (!payment) {
      // Could not map automatically, optionally log audit
      await prisma.auditLog.create({
        data: {
          action: "PAYMENT_CALLBACK_UNMATCHED",
          entity: "Payment",
          entityId: CheckoutRequestID || MerchantRequestID || "UNKNOWN",
          newData: stkCallback,
        },
      });
      return { ok: false, message: "Payment not found for callback" };
    }

    // Clear timeout if any, since we got a terminal callback
    if (payment?.id) {
      this.clearPendingTimeout(payment.id);
    }

    if (ResultCode === 0) {
      // Success

      // 🛡️ DEFENSE LAYER: Amount Verification (prevents worst-case attack)
      // Even if attacker has secret + IP spoofing, they cannot mark payments
      // as complete if the amount doesn't match what we expect
      if (amount !== undefined && payment.amount !== null) {
        const expectedAmount = Number(payment.amount);
        const receivedAmount = Number(amount);
        const tolerance = 0.01; // Allow 1 cent difference for rounding

        if (Math.abs(expectedAmount - receivedAmount) > tolerance) {
          // Amount mismatch - possible fraud or error
          await prisma.auditLog.create({
            data: {
              action: "PAYMENT_AMOUNT_MISMATCH",
              entity: "Payment",
              entityId: payment.id,
              newData: {
                expected: expectedAmount,
                received: receivedAmount,
                CheckoutRequestID,
                MerchantRequestID,
                phone,
                receipt,
              },
            },
          });

          // Mark payment as failed due to amount mismatch
          await prisma.payment.update({
            where: { id: payment.id },
            data: {
              status: "FAILED",
              failureReason: `Amount mismatch: expected ${expectedAmount}, received ${receivedAmount}`,
              metadata: {
                ...((payment as any).metadata || {}),
                amountMismatch: {
                  expected: expectedAmount,
                  received: receivedAmount,
                  CheckoutRequestID,
                },
              } as any,
            },
          });

          return {
            ok: false,
            status: "FAILED",
            message: "Amount verification failed",
            expected: expectedAmount,
            received: receivedAmount,
          };
        }
      }

      const existingMeta: any = (payment as any).metadata || {};
      // Before updating status, compute post-payment side effects for voucher/giftcard
      const voucherMeta = existingMeta?.voucher;
      const giftMeta = existingMeta?.giftcard;
      const updated = await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: "COMPLETED",
          providerRef: receipt,
          processedAt: new Date(),
          metadata: { ...existingMeta, phone, amount, CheckoutRequestID },
        },
        include: { booking: true, user: true },
      });

      // Clear server-side pending timeout on successful resolution
      MpesaService.clearPendingTimeout(payment.id);

      // Helper to attach racket rentals (if present in reservation) to a booking
      const attachRacketsToBooking = async (
        bookingId: string,
        reservation: any,
      ) => {
        try {
          const qty = Number(reservation?.racketQty || 0);
          if (!qty || qty <= 0) return;
          const unit = Number(
            reservation?.racketUnitPrice ||
              reservation?.racketsAmount / qty ||
              300,
          );

          // Ensure an Equipment record exists for rackets
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

          // Create a rental line for this booking
          await prisma.equipmentRental.create({
            data: {
              bookingId,
              equipmentId: racket.id,
              quantity: qty,
              price: unit, // unit price; total = quantity * price
            },
          });
        } catch (e) {
          console.warn("Failed to attach racket rentals to booking", e);
        }
      };

      // Helper to attach ball packs (if present in reservation) to a booking
      const attachBallsToBooking = async (
        bookingId: string,
        reservation: any,
      ) => {
        try {
          const qty = Number(reservation?.ballsQty || 0);
          if (!qty || qty <= 0) return;
          const unit = Number(
            reservation?.ballsUnitPrice ||
              reservation?.ballsAmount / qty ||
              1000,
          );

          let targetEquipment = null;

          // If ballTypeId is specified, use that exact equipment record (even if inactive)
          if (reservation?.ballTypeId) {
            targetEquipment = await prisma.equipment.findUnique({
              where: { id: reservation.ballTypeId },
            });
          }

          // Secondary fallback: try matching by provided name (case insensitive)
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

          // If still not found, fall back to any existing balls equipment
          if (!targetEquipment) {
            targetEquipment = await prisma.equipment.findFirst({
              where: {
                type: "BALLS",
                name: { contains: "Ball", mode: "insensitive" },
              },
            });
          }

          // If no equipment exists at all, create one using provided metadata
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

          // Create a rental line for this booking using the resolved equipment record
          await prisma.equipmentRental.create({
            data: {
              bookingId,
              equipmentId: targetEquipment.id,
              quantity: qty,
              price: unit, // unit price; total = quantity * price
            },
          });
        } catch (e) {
          console.warn("Failed to attach ball packs to booking", e);
        }
      };

      // Finalize voucher redemption and gift card consumption after marking payment completed
      try {
        if (voucherMeta?.code) {
          const { VoucherController } =
            await import("../controllers/admin/voucher.controller");
          await (VoucherController as any).recordRedemption?.(
            String(voucherMeta.code),
            updated.userId || null,
            updated.bookingId || null,
            Number(voucherMeta.discount || 0),
          );
        }
      } catch (e) {
        console.warn("Voucher redemption record failed", e);
      }
      try {
        if (giftMeta?.code && giftMeta?.applied && updated.userId) {
          const { GiftCardController } =
            await import("../controllers/giftcard.controller");
          await (GiftCardController as any).consumeCredit?.(
            updated.userId,
            String(giftMeta.code),
            Number(giftMeta.applied),
          );
        }
      } catch (e) {
        console.warn("Gift card consume failed", e);
      }

      // Handle ADD_EQUIPMENT payment type
      const addEquipmentMeta = existingMeta?.equipment as
        | {
            bookingId?: string;
            bookingCode?: string;
            courtName?: string;
            racketQty?: number;
            ballsQty?: number;
            racketUnitPrice?: number;
            ballsUnitPrice?: number;
            racketsAmount?: number;
            ballsAmount?: number;
            totalAmount?: number;
            durationHours?: number;
            ballTypeId?: string; // specific ball type ID
            ballTypeName?: string; // fallback display/lookup value
            type?: string;
            fulfilled?: boolean;
          }
        | undefined;

      const isAddEquipmentPayment =
        existingMeta?.context === "ADD_EQUIPMENT" ||
        (addEquipmentMeta?.type === "ADD_EQUIPMENT" &&
          addEquipmentMeta?.bookingId);

      const equipmentAlreadyAdded = Boolean(addEquipmentMeta?.fulfilled);

      // Get the booking ID from either the equipment metadata or the relatedBookingId
      const targetBookingId =
        addEquipmentMeta?.bookingId || existingMeta?.relatedBookingId;

      if (
        isAddEquipmentPayment &&
        !equipmentAlreadyAdded &&
        targetBookingId &&
        addEquipmentMeta
      ) {
        try {
          const booking = await prisma.booking.findUnique({
            where: { id: targetBookingId },
            include: {
              user: { select: { firstName: true, email: true } },
              court: { select: { name: true } },
            },
          });

          if (booking) {
            // Attach equipment to the booking
            if (addEquipmentMeta.racketQty && addEquipmentMeta.racketQty > 0) {
              await attachRacketsToBooking(booking.id, {
                racketQty: addEquipmentMeta.racketQty,
                racketUnitPrice: addEquipmentMeta.racketUnitPrice || 300,
                racketsAmount: addEquipmentMeta.racketsAmount,
              });
            }

            if (addEquipmentMeta.ballsQty && addEquipmentMeta.ballsQty > 0) {
              await attachBallsToBooking(booking.id, {
                ballsQty: addEquipmentMeta.ballsQty,
                ballsUnitPrice: addEquipmentMeta.ballsUnitPrice || 1000,
                ballsAmount: addEquipmentMeta.ballsAmount,
                ballTypeId: addEquipmentMeta.ballTypeId, // Pass ball type ID
              });
            }

            // Update the booking's total amount to include equipment
            const newTotal =
              Number(booking.totalAmount) +
              Number(addEquipmentMeta.totalAmount || 0);
            await prisma.booking.update({
              where: { id: booking.id },
              data: { totalAmount: newTotal },
            });

            // Mark equipment as fulfilled
            const currentMeta = (updated.metadata as any) || {};
            const nextEquipmentMeta = {
              ...(addEquipmentMeta || {}),
              fulfilled: true,
              fulfilledAt: new Date().toISOString(),
            };
            await prisma.payment.update({
              where: { id: updated.id },
              data: {
                metadata: {
                  ...currentMeta,
                  equipment: nextEquipmentMeta,
                },
              },
            });

            // Emit updates
            try {
              emitPaymentUpdate(updated.userId, {
                status: "COMPLETED",
                paymentId: updated.id,
                bookingId: booking.id,
                equipmentAdded: true,
              });

              emitBookingUpdate(booking.courtId, {
                type: "EQUIPMENT_ADDED",
                bookingId: booking.id,
                equipment: {
                  rackets: addEquipmentMeta.racketQty || 0,
                  balls: addEquipmentMeta.ballsQty || 0,
                },
              });
            } catch (e) {
              console.warn("WS emit error (equipment added path)", e);
            }

            console.log(`Equipment added to booking ${booking.bookingCode}:`, {
              rackets: addEquipmentMeta.racketQty || 0,
              balls: addEquipmentMeta.ballsQty || 0,
              amount: addEquipmentMeta.totalAmount,
            });
          } else {
            console.warn(
              `Booking not found for equipment payment: ${addEquipmentMeta.bookingId}`,
            );
          }
        } catch (error: any) {
          console.error("Failed to add equipment after payment", error);
          await prisma.auditLog.create({
            data: {
              action: "EQUIPMENT_ADD_FAILED",
              entity: "Payment",
              entityId: updated.id,
              newData: {
                error: error?.message || String(error),
                metadata: existingMeta,
              },
            },
          });
        }
      }

      // Handle STANDALONE_RENTAL payment type
      const standaloneRentalMeta = existingMeta?.standaloneRental as
        | {
            rentalCode?: string;
            userId?: string;
            items?: Array<{
              equipmentId: string;
              name: string;
              type: string;
              quantity: number;
              unitPrice: number;
              subtotal: number;
            }>;
            totalAmount?: number;
            type?: string;
            fulfilled?: boolean;
          }
        | undefined;

      const isStandaloneRental =
        existingMeta?.context === "STANDALONE_RENTAL" ||
        standaloneRentalMeta?.type === "STANDALONE_RENTAL";
      const rentalAlreadyFulfilled = Boolean(standaloneRentalMeta?.fulfilled);

      if (
        isStandaloneRental &&
        !rentalAlreadyFulfilled &&
        standaloneRentalMeta?.items &&
        standaloneRentalMeta.items.length > 0
      ) {
        try {
          const rentalUserId =
            standaloneRentalMeta.userId || updated.userId || null;
          const rentalCode =
            standaloneRentalMeta.rentalCode ||
            `TPR-${Date.now().toString(36).toUpperCase()}`;

          for (const item of standaloneRentalMeta.items) {
            await prisma.equipmentRental.create({
              data: {
                userId: rentalUserId,
                bookingId: null,
                equipmentId: item.equipmentId,
                rentalCode,
                quantity: item.quantity,
                price: item.unitPrice,
                status: "ACTIVE",
              },
            });

            // Decrement available quantity
            await prisma.equipment.update({
              where: { id: item.equipmentId },
              data: { availableQty: { decrement: item.quantity } },
            });
          }

          // Mark as fulfilled
          const currentMeta = (updated.metadata as any) || {};
          await prisma.payment.update({
            where: { id: updated.id },
            data: {
              metadata: {
                ...currentMeta,
                standaloneRental: {
                  ...(standaloneRentalMeta || {}),
                  fulfilled: true,
                  fulfilledAt: new Date().toISOString(),
                },
              },
            },
          });

          // Emit update
          try {
            emitPaymentUpdate(updated.userId, {
              status: "COMPLETED",
              paymentId: updated.id,
              standaloneRental: true,
              rentalCode,
            });
          } catch (e) {
            console.warn("WS emit error (standalone rental path)", e);
          }

          console.log(`Standalone rental fulfilled: ${rentalCode}`, {
            items: standaloneRentalMeta.items.length,
            total: standaloneRentalMeta.totalAmount,
          });
        } catch (error: any) {
          console.error("Failed to fulfill standalone equipment rental", error);
          await prisma.auditLog.create({
            data: {
              action: "STANDALONE_RENTAL_FAILED",
              entity: "Payment",
              entityId: updated.id,
              newData: {
                error: error?.message || String(error),
                metadata: existingMeta,
              },
            },
          });
        }
      }

      const purchaseMeta = existingMeta?.giftcardPurchase as
        | {
            amount?: number;
            recipientEmail?: string | null;
            message?: string | null;
            purchasedByUserId?: string | null;
            giftCardId?: string | null;
            code?: string | null;
            fulfilledAt?: string | null;
          }
        | undefined;
      const isStandaloneGiftPurchase =
        existingMeta?.context === "GIFTCARD_PURCHASE" || Boolean(purchaseMeta);
      const alreadyIssued = Boolean(purchaseMeta?.giftCardId);
      if (isStandaloneGiftPurchase && !alreadyIssued) {
        try {
          const amountCandidateRaw =
            typeof amount === "number" && Number.isFinite(amount)
              ? amount
              : Number(
                  purchaseMeta?.amount ??
                    (updated.amount ? Number(updated.amount) : 0),
                );
          const purchaserId =
            purchaseMeta?.purchasedByUserId || updated.userId || null;
          const { GiftCardController } =
            await import("../controllers/giftcard.controller");
          const issuedCard = await (
            GiftCardController as any
          ).issueGiftCardAfterPayment?.({
            amount: amountCandidateRaw,
            purchasedByUserId: purchaserId,
            recipientEmail: purchaseMeta?.recipientEmail || null,
            message: purchaseMeta?.message || null,
            performedByUserId: updated.userId || null,
            paymentId: updated.id,
            metadata: {
              checkoutRequestId: CheckoutRequestID,
              merchantRequestId: MerchantRequestID,
              mpesaReceipt: receipt,
            },
          });

          if (issuedCard) {
            const currentMeta = (updated.metadata as any) || {};
            const nextPurchaseMeta = {
              ...(purchaseMeta || {}),
              amount: issuedCard.amount,
              giftCardId: issuedCard.id,
              code: issuedCard.code,
              fulfilledAt: new Date().toISOString(),
            };
            const mergedMeta = {
              ...currentMeta,
              giftcardPurchase: nextPurchaseMeta,
            } as any;
            await prisma.payment.update({
              where: { id: updated.id },
              data: { metadata: mergedMeta },
            });

            try {
              emitPaymentUpdate(updated.userId, {
                status: "COMPLETED",
                paymentId: updated.id,
                giftCardCode: issuedCard.code,
                giftCardAmount: issuedCard.amount,
              });
            } catch (e) {
              console.warn("WS emit error (gift card purchase path)", e);
            }
          }
        } catch (error: any) {
          console.error("Gift card issuance after payment failed", error);
          await prisma.auditLog.create({
            data: {
              action: "GIFTCARD_ISSUE_FAILED",
              entity: "Payment",
              entityId: updated.id,
              newData: {
                error: error?.message || String(error),
                metadata: existingMeta,
              },
            },
          });
        }
      }

      // Handle shop order payment completion
      const isShopPurchase = existingMeta?.context === "SHOP_PURCHASE";
      if (isShopPurchase && updated.transactionId) {
        try {
          const { shopOrderService } = await import("./shop-order.service");
          await shopOrderService.updateOrderPaymentStatus(
            updated.transactionId,
            "COMPLETED",
            receipt,
          );
          console.log(
            `Order completed for transaction: ${updated.transactionId}`,
          );
        } catch (error: any) {
          console.error("Failed to update shop order status:", error);
          await prisma.auditLog.create({
            data: {
              action: "SHOP_ORDER_UPDATE_FAILED",
              entity: "Payment",
              entityId: updated.id,
              newData: {
                error: error?.message || String(error),
                transactionId: updated.transactionId,
                metadata: existingMeta,
              },
            },
          });
        }
      }

      // If booking already linked and was pending, mark confirmed
      if (updated.bookingId) {
        const confirmed = await prisma.booking.update({
          where: { id: updated.bookingId },
          data: {
            status: "CONFIRMED",
            // If reservation metadata includes a grand total, ensure booking reflects it
            ...(existingMeta?.reservation?.totalAmount
              ? { totalAmount: existingMeta.reservation.totalAmount as any }
              : {}),
          },
          include: {
            user: { select: { firstName: true, email: true } },
            court: { select: { name: true } },
          },
        });
        // Award loyalty points for booking
        const bookingAmount = Number(confirmed.totalAmount || 0);
        const loyaltyPoints = await calculatePointsFromAmount(bookingAmount);
        if (loyaltyPoints > 0 && updated.userId) {
          await prisma.$transaction([
            prisma.user.update({
              where: { id: updated.userId },
              data: { loyaltyPoints: { increment: loyaltyPoints } },
            }),
            prisma.loyaltyPoint.create({
              data: {
                userId: updated.userId,
                points: loyaltyPoints,
                type: "EARNED",
                description: "Court booking reward",
                referenceId: confirmed.id,
                expiresAt: addMonths(new Date(), 6),
              },
            }),
          ]);
        }

        // Check and award referral points if this is the user's first completed booking
        if (updated.userId) {
          try {
            await awardReferralPoints(updated.userId);
          } catch (referralError) {
            console.warn("Failed to award referral points:", referralError);
          }
        }

        // Attach racket rentals if any were part of reservation
        if (existingMeta?.reservation) {
          await attachRacketsToBooking(confirmed.id, existingMeta.reservation);
          await attachBallsToBooking(confirmed.id, existingMeta.reservation);
        }
        // Notify booking/payment update and availability change
        try {
          emitPaymentUpdate(updated.userId, {
            status: "COMPLETED",
            paymentId: updated.id,
            bookingId: updated.bookingId,
          });
          const booking = await prisma.booking.findUnique({
            where: { id: updated.bookingId },
            select: { courtId: true, startTime: true },
          });
          if (booking) {
            emitCourtAvailability(
              booking.courtId,
              format(new Date(booking.startTime), "yyyy-MM-dd"),
            );
          }
          // Send confirmation email (non-blocking)
          // Determine if booking was initiated by officer (reservation metadata stored on payment)
          const createdByOfficer = Boolean(
            existingMeta?.reservation?.createdByOfficer,
          );
          // Only send email if user email exists AND booking was NOT officer initiated
          if (confirmed?.user?.email && !createdByOfficer) {
            const start = confirmed.startTime;
            const end = confirmed.endTime;
            const timeRange = `${format(start, "HH:mm")} - ${format(
              end,
              "HH:mm",
            )}`;
            const dateStr = format(start, "EEEE, MMM d yyyy");

            // Extract payment breakdown from metadata
            const voucherDiscount = existingMeta?.voucher?.discount
              ? Number(existingMeta.voucher.discount)
              : undefined;
            const voucherCode = existingMeta?.voucher?.code || undefined;
            const giftCardAmount = existingMeta?.giftcard?.applied
              ? Number(existingMeta.giftcard.applied)
              : undefined;
            const giftCardCode = existingMeta?.giftcard?.code || undefined;

            // Calculate subtotal if there are discounts/credits
            const mpesaAmount = Number(updated.amount);
            const totalAmount = Number(confirmed.totalAmount);
            // totalAmount already represents the full booking amount before discounts
            const subtotal =
              voucherDiscount || giftCardAmount ? totalAmount : undefined;

            const emailTpl = buildBookingConfirmationEmail({
              firstName: confirmed.user.firstName || undefined,
              bookingCode: confirmed.bookingCode,
              courtName: confirmed.court.name,
              date: dateStr,
              timeRange,
              players: confirmed.numberOfPlayers,
              amount: mpesaAmount,
              subtotal,
              voucherDiscount,
              voucherCode,
              giftCardAmount,
              giftCardCode,
              manageUrl: `${
                process.env.APP_URL || "https://tudorpadel.com"
              }/customer/bookings/${confirmed.id}`,
            });
            sendMail({
              to: confirmed.user.email,
              subject: emailTpl.subject,
              html: emailTpl.html,
            }).catch((e) =>
              console.warn("Email send (booking confirmed existing) failed", e),
            );
          }
        } catch (e) {
          console.warn("WS emit error (booking confirmed path):", e);
        }
      }

      // If no booking linked but we have multiple reservations in metadata, create bookings now
      if (
        !updated.bookingId &&
        existingMeta?.reservations &&
        Array.isArray(existingMeta.reservations)
      ) {
        const reservations = existingMeta.reservations as Array<{
          courtId: string;
          startTime: string;
          endTime: string;
          duration?: number;
          numberOfPlayers?: number;
          totalAmount: number;
          slotAmount?: number;
          racketQty?: number;
          racketUnitPrice?: number;
          racketsAmount?: number;
          ballsQty?: number;
          ballsUnitPrice?: number;
          ballsAmount?: number;
          ballTypeId?: string; // specific ball type ID
          ballTypeName?: string; // fallback display/lookup value
        }>;

        const createdBookings = [];
        const failedReservations = [];

        for (const r of reservations) {
          // Validate reservation integrity
          const rs = new Date(r.startTime);
          const re = new Date(r.endTime);
          const aligned = (d: Date) => {
            const mins = d.getUTCMinutes();
            return (
              (mins === 0 || mins === 30) &&
              d.getUTCSeconds() === 0 &&
              d.getUTCMilliseconds() === 0
            );
          };

          if (
            isNaN(rs.getTime()) ||
            isNaN(re.getTime()) ||
            re <= rs ||
            !aligned(rs) ||
            !aligned(re)
          ) {
            failedReservations.push({ reservation: r, reason: "INVALID_TIME" });
            continue;
          }

          const diffMinutes = Math.round((re.getTime() - rs.getTime()) / 60000);

          // Check for conflicts
          const conflict = await prisma.booking.findFirst({
            where: {
              courtId: r.courtId,
              status: { in: ["PENDING", "CONFIRMED"] },
              OR: [{ startTime: { lt: re }, endTime: { gt: rs } }],
            },
          });

          if (conflict) {
            failedReservations.push({ reservation: r, reason: "CONFLICT" });
            continue;
          }

          try {
            // Fetch court details for price breakdown calculation
            const court = await prisma.court.findUnique({
              where: { id: r.courtId },
            });

            // Calculate price breakdown for this booking
            const priceBreakdown = await calculatePriceBreakdown({
              courtId: r.courtId,
              startTime: rs,
              endTime: re,
              durationMinutes: r.duration ?? diffMinutes,
              equipmentRentals: [],
              baseHourlyRate: Number(court?.baseHourlyRate || 0),
            });

            const bookingCode: string = `BK${Date.now()
              .toString(36)
              .toUpperCase()}${createdBookings.length}`;
            const created: any = await prisma.booking.create({
              data: {
                bookingCode,
                userId: updated.userId!,
                courtId: r.courtId,
                startTime: rs,
                endTime: re,
                duration: r.duration ?? diffMinutes,
                numberOfPlayers: r.numberOfPlayers ?? 4,
                totalAmount: r.totalAmount,
                priceBreakdown: priceBreakdown as any,
                status: "CONFIRMED",
              },
              include: {
                user: { select: { firstName: true, email: true } },
                court: { select: { name: true } },
              },
            });

            // Attach equipment from this specific reservation
            if (r.racketQty && r.racketQty > 0) {
              const racketUnit =
                r.racketUnitPrice ||
                (r.racketsAmount && r.racketQty
                  ? r.racketsAmount / r.racketQty
                  : 300);

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
                    rentalPrice: racketUnit,
                    condition: "GOOD",
                    isActive: true,
                    updatedAt: new Date(),
                  },
                });
              }

              await prisma.equipmentRental.create({
                data: {
                  bookingId: created.id,
                  equipmentId: racket.id,
                  quantity: r.racketQty,
                  price: racketUnit,
                },
              });
            }

            if (r.ballsQty && r.ballsQty > 0) {
              const ballsUnit =
                r.ballsUnitPrice ||
                (r.ballsAmount && r.ballsQty
                  ? r.ballsAmount / r.ballsQty
                  : 1000);

              let targetEquipment = null;

              if (r.ballTypeId) {
                targetEquipment = await prisma.equipment.findUnique({
                  where: { id: r.ballTypeId },
                });
              }

              if (!targetEquipment && r.ballTypeName) {
                targetEquipment = await prisma.equipment.findFirst({
                  where: {
                    type: "BALLS",
                    name: {
                      equals: r.ballTypeName,
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
                    name: r.ballTypeName || "Padel Balls",
                    type: "BALLS",
                    brand: "Generic",
                    totalQuantity: 1000,
                    availableQty: 1000,
                    rentalPrice: ballsUnit,
                    condition: "NEW",
                    isActive: true,
                    updatedAt: new Date(),
                  },
                });
              }

              await prisma.equipmentRental.create({
                data: {
                  bookingId: created.id,
                  equipmentId: targetEquipment.id,
                  quantity: r.ballsQty,
                  price: ballsUnit,
                },
              });
            }

            createdBookings.push(created);

            // Emit events for this booking
            try {
              emitCourtAvailability(
                created.courtId,
                format(new Date(created.startTime), "yyyy-MM-dd"),
              );
              emitBookingUpdate(created.courtId, {
                bookingId: created.id,
                status: "CONFIRMED",
              });
            } catch (e) {
              console.warn("WS emit error (multi-booking created):", e);
            }
          } catch (err) {
            console.error("Failed to create booking for reservation:", r, err);
            failedReservations.push({
              reservation: r,
              reason: "CREATE_ERROR",
              error: err,
            });
          }
        }

        // Link the first booking to payment (for tracking)
        if (createdBookings.length > 0) {
          await prisma.payment.update({
            where: { id: updated.id },
            data: {
              bookingId: createdBookings[0].id,
              metadata: {
                ...existingMeta,
                multipleBookings: createdBookings.map((b) => b.id),
                failedReservations:
                  failedReservations.length > 0
                    ? failedReservations
                    : undefined,
              } as any,
            },
          });

          // Emit payment update with all booking IDs
          try {
            emitPaymentUpdate(updated.userId, {
              status: "COMPLETED",
              paymentId: updated.id,
              bookingId: createdBookings[0].id,
              multipleBookings: createdBookings.map((b) => b.id),
            });
          } catch (e) {
            console.warn("WS emit error (multi-payment update):", e);
          }

          // Send confirmation email for the first booking (mentioning multiple courts)
          const createdByOfficer = Boolean(
            existingMeta?.reservations?.[0]?.createdByOfficer,
          );
          if (createdBookings[0]?.user?.email && !createdByOfficer) {
            const firstBooking = createdBookings[0];
            const timeRange = `${format(
              firstBooking.startTime,
              "HH:mm",
            )} - ${format(firstBooking.endTime, "HH:mm")}`;
            const dateStr = format(firstBooking.startTime, "EEEE, MMM d yyyy");

            // Extract payment breakdown from metadata
            const voucherDiscount = existingMeta?.voucher?.discount
              ? Number(existingMeta.voucher.discount)
              : undefined;
            const voucherCode = existingMeta?.voucher?.code || undefined;
            const giftCardAmount = existingMeta?.giftcard?.applied
              ? Number(existingMeta.giftcard.applied)
              : undefined;
            const giftCardCode = existingMeta?.giftcard?.code || undefined;

            const mpesaAmount = Number(updated.amount);
            const totalAmount = createdBookings.reduce(
              (sum, b) => sum + Number(b.totalAmount),
              0,
            );
            const subtotal =
              voucherDiscount || giftCardAmount ? totalAmount : undefined;

            const courtNames = createdBookings
              .map((b) => b.court.name)
              .join(", ");

            // Prepare court details for multi-court email template
            const courtDetails = createdBookings.map((b) => ({
              name: b.court.name,
              timeRange: `${format(b.startTime, "HH:mm")} - ${format(
                b.endTime,
                "HH:mm",
              )}`,
            }));

            const emailTpl = buildBookingConfirmationEmail({
              firstName: firstBooking.user.firstName || undefined,
              bookingCode: firstBooking.bookingCode,
              courtName:
                createdBookings.length > 1
                  ? `${courtNames} (${createdBookings.length} courts)`
                  : firstBooking.court.name,
              date: dateStr,
              timeRange,
              players: firstBooking.numberOfPlayers,
              amount: mpesaAmount,
              subtotal,
              voucherDiscount,
              voucherCode,
              giftCardAmount,
              giftCardCode,
              manageUrl: `${
                process.env.APP_URL || "https://tudorpadel.com"
              }/customer/bookings/${firstBooking.id}`,
              isMultipleCourts: createdBookings.length > 1,
              courtDetails:
                createdBookings.length > 1 ? courtDetails : undefined,
            });
            sendMail({
              to: firstBooking.user.email,
              subject: emailTpl.subject,
              html: emailTpl.html,
            }).catch((e) =>
              console.warn("Email send (multi-booking created) failed", e),
            );
          }
        } else if (failedReservations.length > 0) {
          // All reservations failed
          await prisma.auditLog.create({
            data: {
              action: "MULTIPLE_BOOKINGS_ALL_FAILED",
              entity: "Payment",
              entityId: updated.id,
              newData: {
                failedReservations: JSON.parse(
                  JSON.stringify(failedReservations),
                ),
              } as any,
            },
          });
        }
      }

      // If no booking linked but we have a reservation in metadata, create the booking now
      if (!updated.bookingId && existingMeta?.reservation) {
        const r = existingMeta.reservation as {
          courtId: string;
          startTime: string;
          endTime: string;
          duration?: number;
          numberOfPlayers?: number;
          totalAmount: number;
        };

        // Validate reservation integrity (hour alignment & duration) to avoid creating bookings spanning unintended slots
        const rs = new Date(r.startTime);
        const re = new Date(r.endTime);
        // Support flexible durations - allow times on 30-minute boundaries
        const aligned = (d: Date) => {
          const mins = d.getUTCMinutes();
          return (
            (mins === 0 || mins === 30) &&
            d.getUTCSeconds() === 0 &&
            d.getUTCMilliseconds() === 0
          );
        };
        if (
          isNaN(rs.getTime()) ||
          isNaN(re.getTime()) ||
          re <= rs ||
          !aligned(rs) ||
          !aligned(re)
        ) {
          // Log but do not create booking if invalid; mark payment metadata for investigation
          await prisma.auditLog.create({
            data: {
              action: "RESERVATION_INVALID",
              entity: "Payment",
              entityId: updated.id,
              newData: { reservation: r },
            },
          });
        } else {
          const diffMinutes = Math.round((re.getTime() - rs.getTime()) / 60000);
          // Remove hour-multiple validation to support flexible durations
          if (r.duration && r.duration !== diffMinutes) {
            await prisma.auditLog.create({
              data: {
                action: "RESERVATION_DURATION_MISMATCH",
                entity: "Payment",
                entityId: updated.id,
                newData: { reservation: r, computed: diffMinutes },
              },
            });
          } else {
            // Proceed with conflict check & creation
            const conflict = await prisma.booking.findFirst({
              where: {
                courtId: r.courtId,
                status: { in: ["PENDING", "CONFIRMED"] },
                OR: [
                  { startTime: { lt: re }, endTime: { gt: rs } }, // simpler half-open overlap
                ],
              },
            });

            if (!conflict) {
              // Fetch court details for price breakdown calculation
              const court = await prisma.court.findUnique({
                where: { id: r.courtId },
              });

              // Calculate price breakdown for this booking
              const priceBreakdown = await calculatePriceBreakdown({
                courtId: r.courtId,
                startTime: rs,
                endTime: re,
                durationMinutes: r.duration ?? diffMinutes,
                equipmentRentals: [], // Equipment will be added after booking creation
                baseHourlyRate: Number(court?.baseHourlyRate || 0),
              });

              const created = await prisma.booking.create({
                data: {
                  bookingCode: `BK${Date.now().toString(36).toUpperCase()}`,
                  userId: updated.userId!,
                  courtId: r.courtId,
                  startTime: rs,
                  endTime: re,
                  duration: r.duration ?? diffMinutes,
                  numberOfPlayers: r.numberOfPlayers ?? 4,
                  totalAmount: r.totalAmount,
                  priceBreakdown: priceBreakdown as any,
                  status: "CONFIRMED",
                },
                include: {
                  user: { select: { firstName: true, email: true } },
                  court: { select: { name: true } },
                },
              });

              await prisma.payment.update({
                where: { id: updated.id },
                data: { bookingId: created.id },
              });

              // Attach racket rentals from reservation (if any)
              await attachRacketsToBooking(
                created.id,
                existingMeta.reservation,
              );
              await attachBallsToBooking(created.id, existingMeta.reservation);

              try {
                emitPaymentUpdate(updated.userId, {
                  status: "COMPLETED",
                  paymentId: updated.id,
                  bookingId: created.id,
                });
                emitCourtAvailability(
                  created.courtId,
                  format(new Date(created.startTime), "yyyy-MM-dd"),
                );
                emitBookingUpdate(created.courtId, {
                  bookingId: created.id,
                  status: "CONFIRMED",
                });
                const createdByOfficer = Boolean(
                  existingMeta?.reservation?.createdByOfficer,
                );
                if (created?.user?.email && !createdByOfficer) {
                  const timeRange = `${format(
                    created.startTime,
                    "HH:mm",
                  )} - ${format(created.endTime, "HH:mm")}`;
                  const dateStr = format(created.startTime, "EEEE, MMM d yyyy");

                  // Extract payment breakdown from metadata
                  const voucherDiscount = existingMeta?.voucher?.discount
                    ? Number(existingMeta.voucher.discount)
                    : undefined;
                  const voucherCode = existingMeta?.voucher?.code || undefined;
                  const giftCardAmount = existingMeta?.giftcard?.applied
                    ? Number(existingMeta.giftcard.applied)
                    : undefined;
                  const giftCardCode =
                    existingMeta?.giftcard?.code || undefined;

                  // Calculate subtotal if there are discounts/credits
                  const mpesaAmount = Number(updated.amount);
                  const totalAmount = Number(created.totalAmount);
                  // totalAmount already represents the full booking amount before discounts
                  const subtotal =
                    voucherDiscount || giftCardAmount ? totalAmount : undefined;

                  const emailTpl = buildBookingConfirmationEmail({
                    firstName: created.user.firstName || undefined,
                    bookingCode: created.bookingCode,
                    courtName: created.court.name,
                    date: dateStr,
                    timeRange,
                    players: created.numberOfPlayers,
                    amount: mpesaAmount,
                    subtotal,
                    voucherDiscount,
                    voucherCode,
                    giftCardAmount,
                    giftCardCode,
                    manageUrl: `${
                      process.env.APP_URL || "https://tudorpadel.com"
                    }/customer/bookings/${created.id}`,
                  });
                  sendMail({
                    to: created.user.email,
                    subject: emailTpl.subject,
                    html: emailTpl.html,
                  }).catch((e) =>
                    console.warn("Email send (booking created) failed", e),
                  );
                }
              } catch (e) {
                console.warn("WS emit error (booking created path)", e);
              }
            } else {
              await prisma.auditLog.create({
                data: {
                  action: "BOOKING_CREATE_CONFLICT",
                  entity: "Payment",
                  entityId: updated.id,
                  newData: { reservation: r },
                },
              });
              try {
                emitPaymentUpdate(updated.userId, {
                  status: "COMPLETED",
                  paymentId: updated.id,
                  bookingId: null,
                  note: "BOOKING_CREATE_CONFLICT",
                });
              } catch (e) {
                console.warn("WS emit error (booking conflict path):", e);
              }
            }
          }
        }
      }

      // Award loyalty points asynchronously (fire and forget)
      if (updated.userId) {
        const points = await calculatePointsFromAmount(Number(updated.amount));
        if (points > 0) {
          await prisma.$transaction([
            prisma.user.update({
              where: { id: updated.userId! },
              data: { loyaltyPoints: { increment: points } },
            }),
            prisma.loyaltyPoint.create({
              data: {
                userId: updated.userId!,
                points,
                type: "EARNED",
                description: "Payment reward",
                referenceId: updated.id,
                expiresAt: addMonths(new Date(), 6),
              },
            }),
          ]);
        }
      }

      return { ok: true, status: "COMPLETED", paymentId: payment.id };
    } else {
      const existingMeta: any = (payment as any).metadata || {};
      const computedStatus =
        ResultCode === 1032 || /cancel/i.test(ResultDesc || "")
          ? "CANCELLED"
          : "FAILED";
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: computedStatus,
          failureReason: ResultDesc,
          metadata: { ...existingMeta, ResultCode, ResultDesc },
        },
      });

      // Clear server-side pending timeout on failure/cancellation
      MpesaService.clearPendingTimeout(payment.id);

      // Handle shop order payment failure
      const isShopPurchase = existingMeta?.context === "SHOP_PURCHASE";
      if (isShopPurchase && payment.transactionId) {
        try {
          const { shopOrderService } = await import("./shop-order.service");
          await shopOrderService.updateOrderPaymentStatus(
            payment.transactionId,
            computedStatus === "CANCELLED" ? "CANCELLED" : "FAILED",
          );
          console.log(
            `❌ Order ${computedStatus.toLowerCase()} for transaction: ${
              payment.transactionId
            }`,
          );
        } catch (error: any) {
          console.error(
            "Failed to update shop order on payment failure:",
            error,
          );
        }
      }

      if (payment.bookingId) {
        // On failed or cancelled payment, immediately cancel the booking to release the slot
        await prisma.booking.update({
          where: { id: payment.bookingId },
          data: {
            status: "CANCELLED",
            cancelledAt: new Date(),
            cancellationReason:
              ResultDesc || "Payment failed or cancelled by user",
          },
        });
        try {
          // Emit updates for failure and availability refresh
          emitPaymentUpdate((payment as any).userId, {
            status: computedStatus,
            paymentId: payment.id,
            bookingId: payment.bookingId,
            reason: ResultDesc || computedStatus,
          });
          const booking = await prisma.booking.findUnique({
            where: { id: payment.bookingId },
            select: { courtId: true, startTime: true },
          });
          if (booking) {
            emitCourtAvailability(
              booking.courtId,
              format(new Date(booking.startTime), "yyyy-MM-dd"),
            );
          }
        } catch (e) {
          console.warn("WS emit error (payment failed path):", e);
        }
      } else if (existingMeta?.reservation) {
        try {
          const r = existingMeta.reservation as {
            courtId: string;
            startTime: string;
          };
          emitPaymentUpdate((payment as any).userId, {
            status: computedStatus,
            paymentId: payment.id,
            bookingId: null,
            reason: ResultDesc || computedStatus,
          });
          emitCourtAvailability(
            r.courtId,
            format(new Date(r.startTime), "yyyy-MM-dd"),
          );
        } catch (e) {
          console.warn("WS emit error (reservation failed path):", e);
        }
      } else {
        // Generic failure without linked booking or reservation
        try {
          emitPaymentUpdate((payment as any).userId, {
            status: computedStatus,
            paymentId: payment.id,
            bookingId: null,
            reason: ResultDesc || computedStatus,
          });
        } catch (e) {
          console.warn("WS emit error (generic failed path):", e);
        }
      }
      return { ok: false, status: computedStatus, ResultCode, ResultDesc };
    }
  }

  /**
   * B2C Refund – Send money to customer's phone number
   * Replaces the reversal API for refunds
   */
  static async b2cRefund(params: {
    paymentId: string;
    amount: number;
    phone: string;
    reason: string;
    actorId?: string;
    requestId?: string;
  }) {
    const { paymentId, amount, phone, reason, actorId, requestId } = params;

    // Validate required env vars
    const shortcode = required("MPESA_B2C_SHORTCODE");
    const initiator = requiredTrimmed("MPESA_B2C_INITIATOR");
    const securityCredential = requiredTrimmed("MPESA_B2C_SECURITY_CREDENTIAL");
    const resultUrl = requiredTrimmed("MPESA_B2C_RESULT_URL");
    const timeoutUrl = requiredTrimmed("MPESA_B2C_TIMEOUT_URL");

    // Get access token
    const token = await this.getAccessToken();

    // Format phone number (ensure 254... format)
    const formattedPhone = phone.startsWith("254")
      ? phone
      : phone.startsWith("0")
        ? `254${phone.slice(1)}`
        : phone.startsWith("+254")
          ? phone.slice(1)
          : `254${phone}`;

    // Build B2C request payload
    const payload = {
      InitiatorName: initiator,
      SecurityCredential: securityCredential,
      CommandID: "BusinessPayment", // or 'SalaryPayment', 'PromotionPayment' depending on use case
      Amount: Math.floor(amount),
      PartyA: shortcode,
      PartyB: formattedPhone,
      Remarks: reason.substring(0, 100) || "Refund",
      QueueTimeOutURL: timeoutUrl,
      ResultURL: resultUrl,
      Occasion: "REFUND",
    };

    try {
      const url = `${this.baseUrl()}/mpesa/b2c/v1/paymentrequest`;
      const { data } = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      // Store B2C request details in payment metadata
      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        select: { metadata: true },
      });
      const meta: any = payment?.metadata || {};

      await prisma.payment.update({
        where: { id: paymentId },
        data: {
          metadata: {
            ...meta,
            b2cRefundRequest: {
              requestId: requestId || `B2C_${Date.now()}`,
              apiResponse: data,
              amount,
              phone: formattedPhone,
              reason,
              actorId,
              requestedAt: new Date().toISOString(),
              conversationId: data.ConversationID,
              originatorConversationId: data.OriginatorConversationID,
            },
          },
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: actorId || null,
          action: "MPESA_B2C_REFUND_INITIATED",
          entity: "Payment",
          entityId: paymentId,
          newData: {
            amount,
            phone: formattedPhone,
            conversationId: data.ConversationID,
            responseCode: data.ResponseCode,
            responseDescription: data.ResponseDescription,
          },
        },
      });

      return {
        success: true,
        conversationId: data.ConversationID,
        originatorConversationId: data.OriginatorConversationID,
        responseCode: data.ResponseCode,
        responseDescription: data.ResponseDescription,
      };
    } catch (error: any) {
      console.error("B2C refund request failed:", error);

      await prisma.auditLog.create({
        data: {
          userId: actorId || null,
          action: "MPESA_B2C_REFUND_FAILED",
          entity: "Payment",
          entityId: paymentId,
          newData: {
            error: error.message,
            response: error.response?.data,
          },
        },
      });

      throw new Error(
        `B2C refund failed: ${
          error.response?.data?.errorMessage || error.message
        }`,
      );
    }
  }
}

export default MpesaService;

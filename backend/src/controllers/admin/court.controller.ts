import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";
import { generateBookingCode } from "../../utils/helpers";
import { PricingCacheService } from "../../services/pricing-cache.service";

import {
  format,
  addDays,
  isAfter,
  startOfDay,
  setHours,
  setMinutes,
  subMinutes,
  addMinutes,
  addMonths,
} from "date-fns";
import {
  getOperatingHoursConfig,
  type OperatingHoursConfig,
} from "../../utils/operating-hours";

const prisma = new PrismaClient();

export class CourtController {
  public static ok(res: Response, data: unknown, message = "OK") {
    return res.json({ success: true, message, data });
  }

  public static fail(res: Response, message = "Bad Request", code = 400) {
    return res.status(code).json({ success: false, message });
  }

  static async listCourts(_req: Request, res: Response) {
    try {
      const courts = await prisma.court.findMany({
        orderBy: { displayOrder: "asc" },
      });
      return CourtController.ok(res, courts);
    } catch (err) {
      console.error("Error listing courts:", err);
      return CourtController.fail(res, "Failed to fetch courts", 500);
    }
  }

  static async getCourt(req: Request, res: Response) {
    const id = String(req.params.id);
    try {
      const court = await prisma.court.findUnique({ where: { id } });
      if (!court) return CourtController.fail(res, "Court not found", 404);
      return CourtController.ok(res, court);
    } catch (err) {
      console.error("Error fetching court:", err);
      return CourtController.fail(res, "Failed to fetch court", 500);
    }
  }

  static async createCourt(req: Request, res: Response) {
    const { name, surface, description, isActive, displayOrder, location } =
      req.body || {};

    if (!name || typeof name !== "string")
      return CourtController.fail(res, "'name' is required", 400);
    const trimmedName = name.trim();
    try {
      const existing = await prisma.court.findUnique({
        where: { name: trimmedName },
      });
      if (existing)
        return CourtController.fail(res, "Court name already exists", 409);

      const court = await prisma.court.create({
        data: {
          name: trimmedName,
          surface: surface || "ARTIFICIAL_GRASS",
          location: location || "INDOOR",
          description: description || null,
          isActive: isActive !== false,
          // Always set pricing to 0 - handled by pricing rules
          baseHourlyRate: 0,
          peakHourlyRate: 0,
          weekendRate: 0,
          displayOrder: displayOrder || 0,
        },
      });
      return res.status(201).json({
        success: true,
        message: "Court created successfully",
        data: court,
      });
    } catch (err: any) {
      console.error("Error creating court:", err);
      const code = (err as any)?.code;
      if (code === "P2002") {
        return CourtController.fail(res, "Court name already exists", 409);
      }
      return CourtController.fail(res, "Failed to create court", 500);
    }
  }

  static async updateCourt(req: Request, res: Response) {
    const id = String(req.params.id);
    const exists = await prisma.court.findUnique({ where: { id } });
    if (!exists) return CourtController.fail(res, "Court not found", 404);

    const { name, surface, location, description, isActive, displayOrder } =
      req.body || {};

    const data: any = {};

    if (typeof name === "string") {
      const trimmedName = name.trim();
      if (trimmedName !== exists.name) {
        const duplicate = await prisma.court.findFirst({
          where: { name: trimmedName, NOT: { id } },
        });
        if (duplicate)
          return CourtController.fail(res, "Court name already exists", 409);
      }
      data.name = trimmedName;
    }

    if (surface != null) data.surface = surface;
    if (location != null) data.location = location;
    if (description !== undefined) data.description = description || null;
    if (typeof isActive === "boolean") data.isActive = isActive;
    if (displayOrder != null) data.displayOrder = Number(displayOrder) || 0;

    try {
      const court = await prisma.court.update({ where: { id }, data });
      return CourtController.ok(res, court, "Court updated successfully");
    } catch (err: any) {
      console.error("Error updating court:", err);
      const code = (err as any)?.code;
      if (code === "P2002") {
        return CourtController.fail(res, "Court name already exists", 409);
      }
      return CourtController.fail(res, "Failed to update court", 500);
    }
  }

  static async deleteCourt(req: Request, res: Response) {
    const id = String(req.params.id);

    const exists = await prisma.court.findUnique({ where: { id } });
    if (!exists) return CourtController.fail(res, "Court not found", 404);
    const deps = await prisma.booking.count({ where: { courtId: id } });
    if (deps > 0) {
      return CourtController.fail(
        res,
        "Cannot delete court with existing bookings. Please cancel or remove bookings first.",
        409,
      );
    }
    try {
      await prisma.court.delete({ where: { id } });
      return CourtController.ok(res, { id }, "Deleted");
    } catch (err: any) {
      if (err?.code === "P2003") {
        return CourtController.fail(
          res,
          "Cannot delete court due to existing references.",
          409,
        );
      }
      return CourtController.fail(res, "Internal Server Error", 500);
    }

    try {
      await prisma.court.delete({ where: { id } });
      return CourtController.ok(res, { id }, "Deleted");
    } catch (err: any) {
      const code = (err as any)?.code;
      if (code === "P2003") {
        return CourtController.fail(
          res,
          "Cannot delete court due to linked records (e.g., bookings). Remove related data or deactivate the court instead.",
          409,
        );
      }
      return CourtController.fail(res, "Failed to delete court", 500);
    }
  }

  static async toggleCourt(req: Request, res: Response) {
    const id = String(req.params.id);
    const exists = await prisma.court.findUnique({ where: { id } });
    if (!exists) return CourtController.fail(res, "Court not found", 404);
    const court = await prisma.court.update({
      where: { id },
      data: { isActive: !exists.isActive },
    });
    return CourtController.ok(res, court, "Toggled");
  }

  static async createCourtBlackout(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { userId, startTime, endTime } = req.body;
      const dryRun =
        String(
          req.query.dryRun || req.query.dryrun || req.query.preview || "",
        ) === "1";

      const court = await prisma.court.findUnique({
        where: { id },
      });

      if (!court) {
        return res.status(404).json({
          success: false,
          message: "Court not found",
        });
      }

      // Parse and validate times
      const start = new Date(startTime);
      const end = new Date(endTime);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid date/time format",
        });
      }

      if (end <= start) {
        return res.status(400).json({
          success: false,
          message: "End time must be after start time",
        });
      }

      // Enforce maintenance hours 06:00 - 23:00 boundaries (end cannot exceed 23:00, last slot ends 23:00)
      const hourStart = start.getHours();
      const hourEnd = end.getHours();
      if (
        hourStart < 6 ||
        hourEnd > 23 ||
        (hourEnd === 23 && end.getMinutes() > 0)
      ) {
        return res.status(400).json({
          success: false,
          message: "Maintenance must be within 06:00 - 23:00",
        });
      }
      // Allow 30-minute intervals (0 or 30 minutes)
      if (
        (start.getMinutes() !== 0 && start.getMinutes() !== 30) ||
        (end.getMinutes() !== 0 && end.getMinutes() !== 30)
      ) {
        return res.status(400).json({
          success: false,
          message: "Maintenance times must align to 30-minute intervals",
        });
      }

      const duration = Math.floor((end.getTime() - start.getTime()) / 60000);
      if (duration <= 0) {
        return res.status(400).json({
          success: false,
          message: "End time must be after start time",
        });
      }

      // Fetch overlapping active bookings to show impact or cancel
      const overlapping = await prisma.booking.findMany({
        where: {
          courtId: id,
          startTime: { lt: end },
          endTime: { gt: start },
          status: { in: ["PENDING", "CONFIRMED", "CHECKED_IN"] },
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              phone: true,
            },
          },
          payment: {
            select: {
              amount: true,
              status: true,
              providerRef: true,
              transactionId: true,
            },
          },
        },
      });

      if (dryRun) {
        const impactBookings = overlapping.map((b) => ({
          id: b.id,
          bookingCode: b.bookingCode,
          customerName: `${b.user?.firstName || ""} ${
            b.user?.lastName || ""
          }`.trim(),
          email: b.user?.email,
          phone: b.user?.phone,
          amount: b.payment?.amount,
          paid: b.payment?.status === "COMPLETED",
          paymentRef:
            b.payment?.providerRef || b.payment?.transactionId || null,
          status: b.status,
        }));
        // Suggest alternative 1-hour slots after the maintenance window within same day
        const dayStart = new Date(start);
        dayStart.setHours(6, 0, 0, 0);
        const dayEnd = new Date(start);
        dayEnd.setHours(23, 0, 0, 0);
        const busyIntervals = overlapping.map((b) => ({
          s: new Date(b.startTime),
          e: new Date(b.endTime),
        }));
        const suggestions: Array<{ startTime: string; endTime: string }> = [];
        for (let h = end.getHours(); h < 23 && suggestions.length < 5; h++) {
          const slotStart = new Date(start);
          slotStart.setHours(h, 0, 0, 0);
          if (slotStart < end) continue;
          if (slotStart < dayStart || slotStart >= dayEnd) continue;
          const slotEnd = new Date(slotStart);
          slotEnd.setHours(slotStart.getHours() + 1);
          const overlaps = busyIntervals.some(
            (iv) => slotStart < iv.e && slotEnd > iv.s,
          );
          if (!overlaps)
            suggestions.push({
              startTime: slotStart.toISOString(),
              endTime: slotEnd.toISOString(),
            });
        }
        return res.json({
          success: true,
          data: {
            dryRun: true,
            proposed: {
              startTime: start.toISOString(),
              endTime: end.toISOString(),
              durationMinutes: duration,
            },
            impact: {
              total: impactBookings.length,
              paid: impactBookings.filter((b) => b.paid).length,
              bookings: impactBookings,
            },
            suggestions,
          },
        });
      }

      // Commit path: create maintenance record & cancel overlapping inside a transaction
      const result = await prisma.$transaction(async (tx: any) => {
        // @ts-ignore - maintenance model added in new schema, ensure prisma generate run
        const maintenance = await tx.maintenance.create({
          data: {
            courtId: id,
            startTime: start,
            endTime: end,
            createdByUserId: userId || null,
            reason: "MAINTENANCE",
          },
        });

        const cancelled: Array<{
          id: string;
          bookingCode: string;
          userEmail?: string;
          phone?: string;
          amount?: unknown;
          paymentRef?: string | null;
          previousStatus: string;
          refundPending?: boolean;
          startTime: Date;
          endTime: Date;
          paymentId?: string;
          paymentPhone?: string;
        }> = [];
        for (const b of overlapping) {
          const updated: any = await tx.booking.update({
            where: { id: b.id },
            data: {
              status: "CANCELLED",
              cancellationReason: "MAINTENANCE",
              cancelledAt: new Date(),
              cancelledByUserId: userId || null,
              cancelledByRole: "MANAGER",
              // @ts-ignore maintenanceId field new
              maintenanceId: maintenance.id,
              // @ts-ignore previousStatus field new
              previousStatus: b.status,
            },
            include: {
              user: { select: { email: true, phone: true } },
              payment: {
                select: {
                  id: true,
                  amount: true,
                  providerRef: true,
                  transactionId: true,
                  status: true,
                  metadata: true,
                },
              },
            },
          });
          const refundPending =
            !!updated.payment && updated.payment.status === "COMPLETED";
          const paymentPhone = updated.payment?.metadata?.phone;
          cancelled.push({
            id: updated.id,
            bookingCode: updated.bookingCode,
            userEmail: updated.user?.email,
            phone: updated.user?.phone,
            amount: updated.payment?.amount,
            paymentRef:
              updated.payment?.providerRef ||
              updated.payment?.transactionId ||
              null,
            previousStatus: b.status,
            refundPending,
            startTime: b.startTime,
            endTime: b.endTime,
            paymentId: updated.payment?.id,
            paymentPhone,
          });
          // audit log for each cancellation
          await tx.auditLog.create({
            data: {
              userId: userId || null,
              action: "MAINTENANCE_CANCEL",
              entity: "booking",
              entityId: b.id,
              oldData: { status: b.status },
              newData: { status: "CANCELLED", maintenanceId: maintenance.id },
            },
          });
        }
        // audit log for maintenance create
        await tx.auditLog.create({
          data: {
            userId: userId || null,
            action: "MAINTENANCE_CREATE",
            entity: "maintenance",
            entityId: maintenance.id,
            newData: {
              courtId: id,
              startTime: start,
              endTime: end,
              cancelled: cancelled.length,
            },
          },
        });

        return { maintenance, cancelled };
      });

      // Process automatic refunds for paid bookings (fire and forget, optimistic)
      (async () => {
        try {
          const { MpesaService } = await import("../../services/mpesa.service");
          const refundResults = [];

          for (const cancelledBooking of result.cancelled) {
            if (
              !cancelledBooking.refundPending ||
              !cancelledBooking.paymentId ||
              !cancelledBooking.paymentPhone
            ) {
              continue; // Skip non-paid or missing payment info
            }

            try {
              const refundRequestId = `B2C_MAINT_${Date.now()}_${Math.random()
                .toString(36)
                .slice(2, 8)}`;
              const refundAmount = Number(cancelledBooking.amount);

              // Initiate B2C refund
              await (MpesaService as any).b2cRefund?.({
                paymentId: cancelledBooking.paymentId,
                amount: refundAmount,
                phone: cancelledBooking.paymentPhone,
                reason: "MAINTENANCE_CANCELLATION",
                actorId: userId,
                requestId: refundRequestId,
              });

              const refreshedPayment = await prisma.payment.findUnique({
                where: { id: cancelledBooking.paymentId },
                select: { metadata: true },
              });
              const freshMeta: any = refreshedPayment?.metadata || {};

              // Optimistically finalize the refund
              const now = new Date();
              await prisma.payment.update({
                where: { id: cancelledBooking.paymentId },
                data: {
                  refundAmount: refundAmount,
                  refundReason: "MAINTENANCE_CANCELLATION",
                  status: "REFUNDED",
                  refundedAt: now,
                  metadata: {
                    ...freshMeta,
                    lastRefundAt: now.toISOString(),
                    lastRefundRequestId: refundRequestId,
                    b2cOptimistic: true,
                    maintenanceAutoRefund: true,
                    maintenanceId: result.maintenance.id,
                  } as any,
                },
              });

              // Update booking status to REFUNDED
              await prisma.booking.update({
                where: { id: cancelledBooking.id },
                data: {
                  status: "REFUNDED",
                  cancellationReason: "MAINTENANCE",
                },
              });

              refundResults.push({
                bookingCode: cancelledBooking.bookingCode,
                amount: refundAmount,
                status: "SUCCESS",
              });

              console.log(
                `✅ Auto-refund initiated for booking ${cancelledBooking.bookingCode}: KSh ${refundAmount}`,
              );
            } catch (refundError: any) {
              console.error(
                `❌ Auto-refund failed for booking ${cancelledBooking.bookingCode}:`,
                refundError.message,
              );
              refundResults.push({
                bookingCode: cancelledBooking.bookingCode,
                amount: Number(cancelledBooking.amount),
                status: "FAILED",
                error: refundError.message,
              });

              // Log failure in audit
              await prisma.auditLog.create({
                data: {
                  userId: userId || null,
                  action: "MAINTENANCE_AUTO_REFUND_FAILED",
                  entity: "payment",
                  entityId: cancelledBooking.paymentId,
                  newData: {
                    bookingCode: cancelledBooking.bookingCode,
                    error: refundError.message,
                    maintenanceId: result.maintenance.id,
                  },
                },
              });
            }
          }

          // Log summary if any refunds were processed
          if (refundResults.length > 0) {
            await prisma.auditLog.create({
              data: {
                userId: userId || null,
                action: "MAINTENANCE_AUTO_REFUNDS_SUMMARY",
                entity: "maintenance",
                entityId: result.maintenance.id,
                newData: {
                  total: refundResults.length,
                  successful: refundResults.filter(
                    (r) => r.status === "SUCCESS",
                  ).length,
                  failed: refundResults.filter((r) => r.status === "FAILED")
                    .length,
                  results: refundResults,
                },
              },
            });
          }
        } catch (error) {
          console.error("Maintenance auto-refund processing error:", error);
        }
      })();

      // Send customer cancellation notification emails (fire and forget)
      (async () => {
        try {
          const { buildBookingCancellationEmail, sendMail } =
            await import("../../utils/mailer");
          const TZ = "Africa/Nairobi";

          // Fetch court details for email
          const court = await prisma.court.findUnique({
            where: { id },
            select: { name: true },
          });

          const emailResults = [];

          for (const cancelledBooking of result.cancelled) {
            if (!cancelledBooking.userEmail) {
              continue; // Skip if no email
            }

            try {
              // Format date and time for email
              const startDate = new Date(cancelledBooking.startTime);
              const endDate = new Date(cancelledBooking.endTime);

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

              // Get refund amount if booking was paid
              const refundAmount = cancelledBooking.refundPending
                ? Number(cancelledBooking.amount)
                : null;

              const emailContent = buildBookingCancellationEmail({
                firstName: cancelledBooking.userEmail.split("@")[0], // Fallback to email username if no first name
                bookingCode: cancelledBooking.bookingCode,
                courtName: court?.name,
                date: dateFmt,
                timeRange,
                reason: "Court maintenance scheduled",
                refundedAmount: refundAmount,
                manageUrl:
                  process.env.APP_URL || "https://padelmania.co.ke/account",
              });

              await sendMail({
                to: cancelledBooking.userEmail,
                subject: emailContent.subject,
                html: emailContent.html,
              });

              emailResults.push({
                bookingCode: cancelledBooking.bookingCode,
                email: cancelledBooking.userEmail,
                status: "SENT",
              });

              console.log(
                `📧 Cancellation email sent to ${cancelledBooking.userEmail} for booking ${cancelledBooking.bookingCode}`,
              );
            } catch (emailError: any) {
              console.error(
                `❌ Failed to send cancellation email for booking ${cancelledBooking.bookingCode}:`,
                emailError.message,
              );
              emailResults.push({
                bookingCode: cancelledBooking.bookingCode,
                email: cancelledBooking.userEmail,
                status: "FAILED",
                error: emailError.message,
              });
            }
          }

          // Log email summary
          if (emailResults.length > 0) {
            await prisma.auditLog.create({
              data: {
                userId: userId || null,
                action: "MAINTENANCE_CUSTOMER_NOTIFICATIONS",
                entity: "maintenance",
                entityId: result.maintenance.id,
                newData: {
                  total: emailResults.length,
                  sent: emailResults.filter((r) => r.status === "SENT").length,
                  failed: emailResults.filter((r) => r.status === "FAILED")
                    .length,
                  results: emailResults,
                },
              },
            });
          }
        } catch (error) {
          console.error("Maintenance customer notification error:", error);
        }
      })();

      // Emit events & asynchronous notifications
      try {
        const {
          emitCourtAvailability,
          emitMaintenanceCreated,
          emitMaintenanceCancellations,
        } = await import("../../utils/ws-bus");
        emitMaintenanceCreated({
          maintenanceId: result.maintenance.id,
          courtId: id,
          start: start.toISOString(),
          end: end.toISOString(),
          cancelledCount: result.cancelled.length,
        });
        if (result.cancelled.length) {
          emitMaintenanceCancellations({
            maintenanceId: result.maintenance.id,
            courtId: id,
            start: start.toISOString(),
            end: end.toISOString(),
            bookings: result.cancelled.map((c) => ({
              bookingId: c.id,
              bookingCode: c.bookingCode,
              userEmail: c.userEmail,
              phone: c.phone,
              paymentRef: c.paymentRef,
              previousStatus: c.previousStatus,
              amount: c.amount,
              refundPending: c.refundPending,
            })),
          });
        }
        emitCourtAvailability(id, start.toISOString().slice(0, 10));
      } catch (e) {
        console.warn("Maintenance emit failed", e);
      }

      // Email summary (fire and forget)
      (async () => {
        try {
          if (result.cancelled.length === 0) return;
          const { sendMail } = await import("../../utils/mailer");
          const { emitMaintenanceEmailSummary } =
            await import("../../utils/ws-bus");
          const TZ = "Africa/Nairobi";
          const fmt = (d: Date) =>
            new Intl.DateTimeFormat("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
              timeZone: TZ,
            }).format(d);
          const maintLocal = `${fmt(start)}-${fmt(end)}`;
          const maintUTC = `${start.toISOString().slice(11, 16)}-${end
            .toISOString()
            .slice(11, 16)} UTC`;
          const mgrEmail = req.user?.email || process.env.MAINTENANCE_ALERT_TO;
          if (mgrEmail) {
            const dateStr = start.toISOString().substring(0, 10);
            const paidCount = result.cancelled.filter(
              (c) => c.refundPending,
            ).length;
            const potentialRefund = result.cancelled
              .filter((c) => c.refundPending)
              .reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
            const tableRows = result.cancelled
              .map((c) => {
                const refundBadge = c.refundPending
                  ? '<span style="color:#b45309;font-weight:600">YES</span>'
                  : '<span style="color:#065f46">NO</span>';
                const bwLocal = `${fmt(new Date(c.startTime))}-${fmt(
                  new Date(c.endTime),
                )}`;
                const bwUTC = `${new Date(c.startTime)
                  .toISOString()
                  .slice(11, 16)}-${new Date(c.endTime)
                  .toISOString()
                  .slice(11, 16)} UTC`;
                return `<tr>
                <td style="padding:4px 6px;font-family:monospace">${
                  c.bookingCode
                }</td>
                <td style="padding:4px 6px">${c.userEmail || ""}</td>
                <td style="padding:4px 6px">${c.phone || ""}</td>
                <td style="padding:4px 6px;text-align:center">${
                  c.previousStatus || ""
                }</td>
                <td style="padding:4px 6px">${c.paymentRef || ""}</td>
                <td style="padding:4px 6px;text-align:right">${
                  c.amount ? "KSh " + c.amount : "—"
                }</td>
                <td style="padding:4px 6px;text-align:center">${refundBadge}</td>
                <td style="padding:4px 6px;text-align:center;font-family:monospace">${bwLocal}</td>
                <td style="padding:4px 6px;text-align:center;font-family:monospace;color:#555">${bwUTC}</td>
              </tr>`;
              })
              .join("");
            const html = `
              <div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;font-size:14px;line-height:1.5;color:#111">
                <p style="margin:0 0 8px">Maintenance window executed on <strong>court ${id}</strong> (<code style="background:#f3f4f6;padding:2px 4px;border-radius:4px">${dateStr}</code>)</p>
                <p style="margin:0 0 4px"><strong>Maintenance Window (Local ${TZ}):</strong> ${maintLocal}</p>
                <p style="margin:0 0 12px"><strong>Maintenance Window (UTC):</strong> ${maintUTC}</p>
                <p style="margin:0 0 16px">Total cancellations: <strong>${
                  result.cancelled.length
                }</strong> • Paid: <strong>${paidCount}</strong> • Potential Refund: <strong>KSh ${potentialRefund}</strong></p>
                <table style="border-collapse:collapse;width:100%;font-size:12px">
                  <thead>
                    <tr style="background:#1f2937;color:#fff;text-align:left">
                      <th style="padding:6px 8px;font-weight:600">Code</th>
                      <th style="padding:6px 8px;font-weight:600">Email</th>
                      <th style="padding:6px 8px;font-weight:600">Phone</th>
                      <th style="padding:6px 8px;font-weight:600;text-align:center">Prev Status</th>
                      <th style="padding:6px 8px;font-weight:600">Payment Ref</th>
                      <th style="padding:6px 8px;font-weight:600;text-align:right">Amount</th>
                      <th style="padding:6px 8px;font-weight:600;text-align:center">Refund?</th>
                      <th style="padding:6px 8px;font-weight:600;text-align:center">Bk Window (Local)</th>
                      <th style="padding:6px 8px;font-weight:600;text-align:center">Bk Window (UTC)</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${
                      tableRows ||
                      '<tr><td colspan="9" style="padding:8px;text-align:center;color:#555">No bookings cancelled</td></tr>'
                    }
                  </tbody>
                </table>
                <p style="margin:18px 0 8px;font-size:12px;color:#374151">Refund Guidance: <em>Process ONLY rows marked YES in Refund column. Cross-check payment reference in finance system and log refund action separately.</em></p>
                <p style="margin:0;font-size:11px;color:#6b7280">Automated maintenance summary • Do not reply</p>
              </div>`;
            await sendMail({
              to: mgrEmail,
              subject: `Maintenance Cancellation Summary (${dateStr})`,
              html,
            });
            // Optional finance distribution list
            if (process.env.MAINTENANCE_FINANCE_TO) {
              try {
                const paidRows = result.cancelled
                  .filter((c) => c.refundPending)
                  .map(
                    (c) => `<tr>
                  <td style=\"padding:4px 6px;font-family:monospace\">${
                    c.bookingCode
                  }</td>
                  <td style=\"padding:4px 6px\">${c.userEmail || ""}</td>
                  <td style=\"padding:4px 6px\">${c.phone || ""}</td>
                  <td style=\"padding:4px 6px\">${c.paymentRef || ""}</td>
                  <td style=\"padding:4px 6px;text-align:right\">${
                    c.amount ? "KSh " + c.amount : "—"
                  }</td>
                </tr>`,
                  )
                  .join("");
                const financeHtml = `<div style=\"font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;font-size:13px\"><p style=\"margin:0 0 12px\">Paid bookings queued for refund (court ${id}, ${dateStr}):</p><table style=\"border-collapse:collapse;width:100%;font-size:12px\"><thead><tr style=\"background:#374151;color:#fff\"><th style=\"padding:6px 8px;text-align:left\">Code</th><th style=\"padding:6px 8px;text-align:left\">Email</th><th style=\"padding:6px 8px;text-align:left\">Phone</th><th style=\"padding:6px 8px;text-align:left\">Payment Ref</th><th style=\"padding:6px 8px;text-align:right\">Amount</th></tr></thead><tbody>${
                  paidRows ||
                  '<tr><td colspan=5 style="padding:8px;text-align:center;color:#555">No paid bookings</td></tr>'
                }</tbody></table><p style=\"margin:14px 0 0;font-size:11px;color:#6b7280\">Automated refund queue extract</p></div>`;
                await sendMail({
                  to: process.env.MAINTENANCE_FINANCE_TO,
                  subject: `Maintenance Refund Queue (${dateStr})`,
                  html: financeHtml,
                });
              } catch (e) {
                /* ignore */
              }
            }
            try {
              emitMaintenanceEmailSummary({
                maintenanceId: result.maintenance.id,
                courtId: id,
                start: start.toISOString(),
                end: end.toISOString(),
                cancelled: result.cancelled.length,
                paid: paidCount,
                potentialRefund,
              });
            } catch (e) {
              /* ignore */
            }
          }
        } catch (err) {
          console.error("Maintenance summary email failed", err);
        }
      })();

      return res.status(201).json({
        success: true,
        data: {
          maintenanceId: result.maintenance.id,
          cancelledCount: result.cancelled.length,
          cancelled: result.cancelled,
        },
      });
    } catch (error) {
      console.error("Create court blackout error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to create blackout",
      });
    }
  }

  /**
   * Dedicated maintenance endpoint implementing the requested lifecycle:
   * POST /courts/:id/maintenance?dryRun=1 -> preview overlaps & suggestions
   * POST /courts/:id/maintenance         -> execute (2FA enforced in route layer)
   */
  static async createMaintenance(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { startTime, endTime } = req.body || {};
      const actorId = (req.body?.userId || (req.user as any)?.id) as
        | string
        | undefined;
      const dryRun = ["1", "true", "yes"].includes(
        String(
          req.query.dryRun || req.query.preview || req.query.dryrun || "",
        ).toLowerCase(),
      );

      // Basic validations
      if (!startTime || !endTime)
        return CourtController.fail(
          res,
          "'startTime' and 'endTime' required",
          400,
        );
      const start = new Date(startTime);
      const end = new Date(endTime);
      if (isNaN(start.getTime()) || isNaN(end.getTime()))
        return CourtController.fail(res, "Invalid date/time format", 400);
      if (end <= start)
        return CourtController.fail(res, "End must be after start", 400);
      // Allow 30-minute intervals (0 or 30 minutes)
      if (
        (start.getMinutes() !== 0 && start.getMinutes() !== 30) ||
        (end.getMinutes() !== 0 && end.getMinutes() !== 30)
      )
        return CourtController.fail(
          res,
          "Times must align to 30-minute intervals",
          400,
        );
      if (
        start.getHours() < 6 ||
        end.getHours() > 23 ||
        (end.getHours() === 23 && end.getMinutes() > 0)
      )
        return CourtController.fail(
          res,
          "Maintenance must be within 06:00-23:00",
          400,
        );

      const court = await prisma.court.findUnique({ where: { id } });
      if (!court) return CourtController.fail(res, "Court not found", 404);

      // Check for overlapping maintenance windows
      const overlappingMaintenance: any[] = await (
        prisma as any
      ).maintenance.findMany({
        where: {
          courtId: id,
          startTime: { lt: end },
          endTime: { gt: start },
        },
      });

      if (overlappingMaintenance.length > 0) {
        return CourtController.fail(
          res,
          "Cannot create maintenance: This time slot overlaps with existing maintenance window(s). Please remove the existing maintenance or choose a different time.",
          400,
        );
      }

      // Find overlapping active-ish bookings
      const overlapping = await prisma.booking.findMany({
        where: {
          courtId: id,
          startTime: { lt: end },
          endTime: { gt: start },
          status: { in: ["PENDING", "CONFIRMED", "CHECKED_IN"] },
        },
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
          payment: {
            select: {
              amount: true,
              status: true,
              providerRef: true,
              transactionId: true,
            },
          },
        },
        orderBy: { startTime: "asc" },
      });

      if (dryRun) {
        const preview = overlapping.map((b) => ({
          id: b.id,
          code: b.bookingCode,
          customerName: `${b.user?.firstName || ""} ${
            b.user?.lastName || ""
          }`.trim(),
          paid: b.payment?.status === "COMPLETED",
          paymentRef:
            b.payment?.providerRef || b.payment?.transactionId || null,
          amount: b.payment?.amount,
          status: b.status,
          startTime: b.startTime,
          endTime: b.endTime,
        }));
        // Suggest up to 5 alternative one-hour slots after maintenance same day
        const suggestions: Array<{ startTime: string; endTime: string }> = [];
        const dayStart = new Date(start);
        dayStart.setHours(6, 0, 0, 0);
        const dayEnd = new Date(start);
        dayEnd.setHours(23, 0, 0, 0);
        const busy = overlapping.map((o) => ({ s: o.startTime, e: o.endTime }));
        for (let h = end.getHours(); h < 23 && suggestions.length < 5; h++) {
          const s = new Date(start);
          s.setHours(h, 0, 0, 0);
          if (s < end || s < dayStart || s >= dayEnd) continue;
          const e = new Date(s);
          e.setHours(s.getHours() + 1);
          if (!busy.some((iv) => s < iv.e && e > iv.s))
            suggestions.push({
              startTime: s.toISOString(),
              endTime: e.toISOString(),
            });
        }
        return CourtController.ok(res, {
          dryRun: true,
          proposed: {
            startTime: start.toISOString(),
            endTime: end.toISOString(),
            durationMinutes: (end.getTime() - start.getTime()) / 60000,
          },
          overlapCount: preview.length,
          overlaps: preview,
          paidCount: preview.filter((p) => p.paid).length,
          suggestions,
        });
      }

      // Execute transaction: create maintenance + cancel overlapping
      const result = await prisma.$transaction(async (tx) => {
        // @ts-ignore new model
        const maintenance = await (tx as any).maintenance.create({
          data: {
            courtId: id,
            startTime: start,
            endTime: end,
            createdByUserId: actorId || null,
            reason: "MAINTENANCE",
          },
        });
        const cancelled: any[] = [];
        for (const b of overlapping) {
          const updated: any = await tx.booking.update({
            where: { id: b.id },
            data: {
              status: "CANCELLED",
              cancellationReason: "MAINTENANCE",
              cancelledAt: new Date(),
              cancelledByUserId: actorId || null,
              cancelledByRole: (req.user as any)?.role || "MANAGER",
              // @ts-ignore - field exists in schema
              maintenanceId: (maintenance as any).id,
              // @ts-ignore - field exists in schema
              previousStatus: b.status,
            },
            include: {
              payment: {
                select: {
                  id: true,
                  amount: true,
                  status: true,
                  providerRef: true,
                  transactionId: true,
                  metadata: true,
                },
              },
              user: { select: { email: true, phone: true } },
            },
          });
          const paymentPhone = updated.payment?.metadata?.phone;
          cancelled.push({
            id: updated.id,
            code: updated.bookingCode,
            userEmail: updated.user?.email,
            phone: updated.user?.phone,
            amount: updated.payment?.amount,
            paymentRef:
              updated.payment?.providerRef ||
              updated.payment?.transactionId ||
              null,
            previousStatus: b.status,
            refundPending: updated.payment?.status === "COMPLETED",
            startTime: b.startTime,
            endTime: b.endTime,
            paymentId: updated.payment?.id,
            paymentPhone,
          });
          await tx.auditLog.create({
            data: {
              userId: actorId || null,
              action: "MAINTENANCE_CANCEL",
              entity: "booking",
              entityId: updated.id,
              oldData: { status: b.status },
              newData: {
                status: "CANCELLED",
                maintenanceId: (maintenance as any).id,
              },
            },
          });
        }
        await tx.auditLog.create({
          data: {
            userId: actorId || null,
            action: "MAINTENANCE_CREATE",
            entity: "maintenance",
            entityId: (maintenance as any).id,
            newData: {
              courtId: id,
              startTime: start,
              endTime: end,
              cancelled: cancelled.length,
            },
          },
        });
        return { maintenance, cancelled };
      });

      // Process automatic refunds for paid bookings (fire and forget, optimistic)
      (async () => {
        try {
          const { MpesaService } = await import("../../services/mpesa.service");
          const refundResults = [];

          for (const cancelledBooking of result.cancelled) {
            if (
              !cancelledBooking.refundPending ||
              !cancelledBooking.paymentId ||
              !cancelledBooking.paymentPhone
            ) {
              continue; // Skip non-paid or missing payment info
            }

            try {
              const refundRequestId = `B2C_MAINT_${Date.now()}_${Math.random()
                .toString(36)
                .slice(2, 8)}`;
              const refundAmount = Number(cancelledBooking.amount);

              // Initiate B2C refund
              await (MpesaService as any).b2cRefund?.({
                paymentId: cancelledBooking.paymentId,
                amount: refundAmount,
                phone: cancelledBooking.paymentPhone,
                reason: "MAINTENANCE_CANCELLATION",
                actorId,
                requestId: refundRequestId,
              });

              const refreshedPayment = await prisma.payment.findUnique({
                where: { id: cancelledBooking.paymentId },
                select: { metadata: true },
              });
              const freshMeta: any = refreshedPayment?.metadata || {};

              // Optimistically finalize the refund
              const now = new Date();
              await prisma.payment.update({
                where: { id: cancelledBooking.paymentId },
                data: {
                  refundAmount: refundAmount,
                  refundReason: "MAINTENANCE_CANCELLATION",
                  status: "REFUNDED",
                  refundedAt: now,
                  metadata: {
                    ...freshMeta,
                    lastRefundAt: now.toISOString(),
                    lastRefundRequestId: refundRequestId,
                    b2cOptimistic: true,
                    maintenanceAutoRefund: true,
                    maintenanceId: (result.maintenance as any).id,
                  } as any,
                },
              });

              // Update booking status to REFUNDED
              await prisma.booking.update({
                where: { id: cancelledBooking.id },
                data: {
                  status: "REFUNDED",
                  cancellationReason: "MAINTENANCE",
                },
              });

              refundResults.push({
                bookingCode: cancelledBooking.code,
                amount: refundAmount,
                status: "SUCCESS",
              });

              console.log(
                `✅ Auto-refund initiated for booking ${cancelledBooking.code}: KSh ${refundAmount}`,
              );
            } catch (refundError: any) {
              console.error(
                `❌ Auto-refund failed for booking ${cancelledBooking.code}:`,
                refundError.message,
              );
              refundResults.push({
                bookingCode: cancelledBooking.code,
                amount: Number(cancelledBooking.amount),
                status: "FAILED",
                error: refundError.message,
              });

              // Log failure in audit
              await prisma.auditLog.create({
                data: {
                  userId: actorId || null,
                  action: "MAINTENANCE_AUTO_REFUND_FAILED",
                  entity: "payment",
                  entityId: cancelledBooking.paymentId,
                  newData: {
                    bookingCode: cancelledBooking.code,
                    error: refundError.message,
                    maintenanceId: (result.maintenance as any).id,
                  },
                },
              });
            }
          }

          // Log summary if any refunds were processed
          if (refundResults.length > 0) {
            await prisma.auditLog.create({
              data: {
                userId: actorId || null,
                action: "MAINTENANCE_AUTO_REFUNDS_SUMMARY",
                entity: "maintenance",
                entityId: (result.maintenance as any).id,
                newData: {
                  total: refundResults.length,
                  successful: refundResults.filter(
                    (r) => r.status === "SUCCESS",
                  ).length,
                  failed: refundResults.filter((r) => r.status === "FAILED")
                    .length,
                  results: refundResults,
                },
              },
            });
          }
        } catch (error) {
          console.error("Maintenance auto-refund processing error:", error);
        }
      })();

      // Send customer cancellation notification emails (fire and forget)
      (async () => {
        try {
          const { buildBookingCancellationEmail, sendMail } =
            await import("../../utils/mailer");

          // Fetch court details and user details for email
          const court = await prisma.court.findUnique({
            where: { id },
            select: { name: true },
          });

          const emailResults = [];

          for (const cancelledBooking of result.cancelled) {
            if (!cancelledBooking.userEmail) {
              continue; // Skip if no email
            }

            try {
              // Fetch user's first name
              const user = await prisma.user.findFirst({
                where: { email: cancelledBooking.userEmail },
                select: { firstName: true },
              });

              // Format date and time for email
              const startDate = new Date(cancelledBooking.startTime);
              const endDate = new Date(cancelledBooking.endTime);

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

              // Get refund amount if booking was paid
              const refundAmount = cancelledBooking.refundPending
                ? Number(cancelledBooking.amount)
                : null;

              const emailContent = buildBookingCancellationEmail({
                firstName:
                  user?.firstName || cancelledBooking.userEmail.split("@")[0],
                bookingCode: cancelledBooking.code,
                courtName: court?.name,
                date: dateFmt,
                timeRange,
                reason: "Court maintenance scheduled",
                refundedAmount: refundAmount,
                manageUrl:
                  process.env.APP_URL || "https://padelmania.co.ke/account",
              });

              await sendMail({
                to: cancelledBooking.userEmail,
                subject: emailContent.subject,
                html: emailContent.html,
              });

              emailResults.push({
                bookingCode: cancelledBooking.code,
                email: cancelledBooking.userEmail,
                status: "SENT",
              });

              console.log(
                `📧 Cancellation email sent to ${cancelledBooking.userEmail} for booking ${cancelledBooking.code}`,
              );
            } catch (emailError: any) {
              console.error(
                `❌ Failed to send cancellation email for booking ${cancelledBooking.code}:`,
                emailError.message,
              );
              emailResults.push({
                bookingCode: cancelledBooking.code,
                email: cancelledBooking.userEmail,
                status: "FAILED",
                error: emailError.message,
              });
            }
          }

          // Log email summary
          if (emailResults.length > 0) {
            await prisma.auditLog.create({
              data: {
                userId: actorId || null,
                action: "MAINTENANCE_CUSTOMER_NOTIFICATIONS",
                entity: "maintenance",
                entityId: (result.maintenance as any).id,
                newData: {
                  total: emailResults.length,
                  sent: emailResults.filter((r) => r.status === "SENT").length,
                  failed: emailResults.filter((r) => r.status === "FAILED")
                    .length,
                  results: emailResults,
                },
              },
            });
          }
        } catch (error) {
          console.error("Maintenance customer notification error:", error);
        }
      })();

      // Emit events
      try {
        const {
          emitMaintenanceCreated,
          emitMaintenanceCancellations,
          emitCourtAvailability,
        } = await import("../../utils/ws-bus");
        emitMaintenanceCreated({
          maintenanceId: (result.maintenance as any).id,
          courtId: id,
          start: start.toISOString(),
          end: end.toISOString(),
          cancelledCount: result.cancelled.length,
        });
        if (result.cancelled.length) {
          emitMaintenanceCancellations({
            maintenanceId: (result.maintenance as any).id,
            courtId: id,
            start: start.toISOString(),
            end: end.toISOString(),
            bookings: result.cancelled.map((c) => ({
              bookingId: c.id,
              bookingCode: c.code,
              userEmail: c.userEmail,
              phone: c.phone,
              paymentRef: c.paymentRef,
              previousStatus: c.previousStatus,
              amount: c.amount,
            })),
          });
        }
        emitCourtAvailability(id, start.toISOString().slice(0, 10));
      } catch (e) {
        console.warn("Maintenance event emit failed", e);
      }

      // Async summary email & refund queue placeholder
      (async () => {
        try {
          if (!result.cancelled.length) return;
          const { sendMail } = await import("../../utils/mailer");
          const { emitMaintenanceEmailSummary } =
            await import("../../utils/ws-bus");
          const to =
            (req.user as any)?.email || process.env.MAINTENANCE_ALERT_TO;
          if (to) {
            const dateStr = start.toISOString().slice(0, 10);
            const TZ = "Africa/Nairobi";
            const fmt = (d: Date) =>
              new Intl.DateTimeFormat("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
                timeZone: TZ,
              }).format(d);
            const windowStrLocal = `${fmt(start)} – ${fmt(end)}`;
            const windowStrUTC = `${start.toISOString().slice(11, 16)} – ${end
              .toISOString()
              .slice(11, 16)} UTC`;
            const total = result.cancelled.length;
            const paid = result.cancelled.filter((c) => c.refundPending).length;
            const totalRefund = result.cancelled
              .filter((c) => c.refundPending)
              .reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
            const tableRows = result.cancelled
              .map((c) => {
                const refundBadge = c.refundPending
                  ? '<span style="background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:12px;font-size:11px;font-weight:600">YES</span>'
                  : '<span style="background:#d1fae5;color:#065f46;padding:2px 6px;border-radius:12px;font-size:11px;font-weight:600">NO</span>';
                const bwLocal = `${fmt(new Date(c.startTime))} – ${fmt(
                  new Date(c.endTime),
                )}`;
                const bwUTC = `${new Date(c.startTime)
                  .toISOString()
                  .slice(11, 16)} – ${new Date(c.endTime)
                  .toISOString()
                  .slice(11, 16)} UTC`;
                return `<tr>
                <td style="padding:6px 8px;font-family:monospace;white-space:nowrap">${
                  c.code
                }</td>
                <td style="padding:6px 8px">${c.userEmail || ""}</td>
                <td style="padding:6px 8px">${c.phone || ""}</td>
                <td style="padding:6px 8px;text-align:center">${
                  c.previousStatus || ""
                }</td>
                <td style="padding:6px 8px">${c.paymentRef || ""}</td>
                <td style="padding:6px 8px;text-align:right">${
                  c.amount ? "KSh " + c.amount : "—"
                }</td>
                <td style="padding:6px 8px;text-align:center">${refundBadge}</td>
                <td style="padding:6px 8px;text-align:center;font-family:monospace">${bwLocal}</td>
                <td style="padding:6px 8px;text-align:center;font-family:monospace;color:#555">${bwUTC}</td>
              </tr>`;
              })
              .join("");
            const html = `
              <div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;font-size:14px;line-height:1.5;color:#111">
                <h2 style="margin:0 0 4px;font-size:18px;font-weight:600;color:#111">Maintenance Cancellation Summary</h2>
                <p style="margin:0 0 6px;color:#374151">Court: <strong>${
                  (court as any)?.name || id
                }</strong> • Date <code style="background:#f3f4f6;padding:2px 4px;border-radius:4px">${dateStr}</code></p>
                <p style="margin:0 0 4px;color:#374151"><strong>Maintenance Window (Local ${TZ}):</strong> ${windowStrLocal}</p>
                <p style="margin:0 0 12px;color:#374151"><strong>Maintenance Window (UTC):</strong> ${windowStrUTC}</p>
                <div style="display:flex;flex-wrap:wrap;gap:12px;margin:0 0 16px">
                  <div style="background:#f3f4f6;padding:8px 12px;border-radius:8px;font-size:12px"><strong>${total}</strong><br/><span style="color:#374151">Total Cancelled</span></div>
                  <div style="background:#f3f4f6;padding:8px 12px;border-radius:8px;font-size:12px"><strong>${paid}</strong><br/><span style="color:#374151">Paid Bookings</span></div>
                  <div style="background:#f3f4f6;padding:8px 12px;border-radius:8px;font-size:12px"><strong>KSh ${totalRefund}</strong><br/><span style="color:#374151">Potential Refund</span></div>
                </div>
                <table style="border-collapse:collapse;width:100%;font-size:12px;margin:0 0 12px">
                  <thead>
                    <tr style="background:#1f2937;color:#fff;text-align:left">
                      <th style="padding:6px 8px;font-weight:600">Code</th>
                      <th style="padding:6px 8px;font-weight:600">Email</th>
                      <th style="padding:6px 8px;font-weight:600">Phone</th>
                      <th style="padding:6px 8px;font-weight:600;text-align:center">Prev Status</th>
                      <th style="padding:6px 8px;font-weight:600">Payment Ref</th>
                      <th style="padding:6px 8px;font-weight:600;text-align:right">Amount</th>
                      <th style="padding:6px 8px;font-weight:600;text-align:center">Refund?</th>
                      <th style="padding:6px 8px;font-weight:600;text-align:center">Bk Window (Local)</th>
                      <th style="padding:6px 8px;font-weight:600;text-align:center">Bk Window (UTC)</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${
                      tableRows ||
                      '<tr><td colspan="9" style="padding:10px;text-align:center;color:#555">No bookings cancelled</td></tr>'
                    }
                  </tbody>
                </table>
                <p style="margin:12px 0 8px;font-size:12px;color:#374151">Action Steps:</p>
                <ol style="margin:0 0 16px 18px;padding:0;font-size:12px;color:#374151;line-height:1.4">
                  <li>Contact affected customers (Paid rows first).</li>
                  <li>Initiate refunds for all rows marked YES.</li>
                  <li>Offer alternative slots (consider suggestions generated during preview).</li>
                  <li>Log refund references in Finance system.</li>
                </ol>
                <p style="margin:0;font-size:11px;color:#6b7280">Automated maintenance report • Do not reply</p>
              </div>`;
            await sendMail({
              to,
              subject: `Maintenance Cancellation Summary (${dateStr})`,
              html,
            });
            try {
              emitMaintenanceEmailSummary({
                maintenanceId: (result.maintenance as any).id,
                courtId: id,
                start: start.toISOString(),
                end: end.toISOString(),
                cancelled: total,
                paid,
                potentialRefund: totalRefund,
              });
            } catch (e) {
              /* ignore */
            }
          }
        } catch (e) {
          console.error("Maintenance summary email failure", e);
        }
      })();

      return CourtController.ok(res, {
        maintenanceId: (result.maintenance as any).id,
        cancelledCount: result.cancelled.length,
        cancelled: result.cancelled,
      });
    } catch (error) {
      console.error("Create maintenance error", error);
      return CourtController.fail(res, "Failed to create maintenance", 500);
    }
  }

  static async listCourtBlackouts(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { date } = req.query;
      const where: any = { courtId: id };
      if (date) {
        // Parse date string components to avoid timezone issues
        const dateStr = String(date);
        const [year, month, dayOfMonth] = dateStr.split("-").map(Number);
        if (!year || !month || !dayOfMonth) {
          return CourtController.fail(
            res,
            "Invalid date format. Expected YYYY-MM-DD",
            400,
          );
        }

        // Create date in local timezone (EAT)
        const startOfDay = new Date(year, month - 1, dayOfMonth, 0, 0, 0, 0);
        const endOfDay = new Date(year, month - 1, dayOfMonth, 23, 59, 59, 999);

        // Reject overflow dates (e.g. Feb 29 in a non-leap year).
        // JavaScript silently rolls over invalid days (Feb 29 → Mar 1), which
        // would return maintenance windows for the wrong date.
        if (
          startOfDay.getFullYear() !== year ||
          startOfDay.getMonth() !== month - 1 ||
          startOfDay.getDate() !== dayOfMonth
        ) {
          return CourtController.fail(
            res,
            `Invalid date: ${dateStr} does not exist in the calendar`,
            400,
          );
        }

        // Find maintenance that overlaps with this day
        // (starts before day ends AND ends after day starts)
        where.startTime = { lt: endOfDay };
        where.endTime = { gt: startOfDay };
      }
      // @ts-ignore maintenance model added in new schema
      const maint: any[] = await (prisma as any).maintenance.findMany({
        where,
        orderBy: { startTime: "asc" },
      });
      const shaped = maint.map((m) => ({
        id: m.id,
        startTime: m.startTime,
        endTime: m.endTime,
        duration: Math.floor(
          (m.endTime.getTime() - m.startTime.getTime()) / 60000,
        ),
        status: "MAINTENANCE" as const,
      }));
      res.json({ success: true, data: shaped });
    } catch (error) {
      console.error("List court blackouts error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch blackouts",
      });
    }
  }

  static async cancelCourtBlackout(req: Request, res: Response) {
    try {
      const { id, bookingId } = req.params;
      // @ts-ignore maintenance model added in new schema
      const maintenance = await (prisma as any).maintenance.findFirst({
        where: { id: bookingId, courtId: id },
      });
      if (!maintenance) {
        return res
          .status(404)
          .json({ success: false, message: "Maintenance window not found" });
      }
      // @ts-ignore maintenance model
      await (prisma as any).maintenance.delete({
        where: { id: maintenance.id },
      });
      res.json({ success: true, message: "Maintenance window removed" });
    } catch (error) {
      console.error("Cancel court blackout error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to cancel blackout",
      });
    }
  }

  // Admin utility: when marking a court unavailable, preview conflicting bookings in a given range
  static async getConflictingBookings(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { startTime, endTime } = req.query as any;
      if (!startTime || !endTime) {
        return res
          .status(400)
          .json({ message: "startTime and endTime are required" });
      }
      const start = new Date(String(startTime));
      const end = new Date(String(endTime));
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
        return res.status(400).json({ message: "Invalid date range" });
      }

      const conflicts = await prisma.booking.findMany({
        where: {
          courtId: id,
          status: { in: ["PENDING", "CONFIRMED", "CHECKED_IN"] },
          startTime: { lt: end },
          endTime: { gt: start },
          NOT: { notes: "MAINTENANCE" },
        },
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
        orderBy: { startTime: "asc" },
      });
      return res.status(200).json({ data: conflicts });
    } catch (error) {
      console.error("getConflictingBookings error", error);
      return res.status(500).json({ message: "Failed to get conflicts" });
    }
  }

  // Admin action: reassign a booking to another court/time and notify the client
  static async reassignBooking(req: Request, res: Response) {
    try {
      const { id } = req.params; // booking id
      const { targetCourtId, startTime, endTime, reason } = req.body || {};
      if (!targetCourtId || !startTime || !endTime) {
        return res
          .status(400)
          .json({ message: "targetCourtId, startTime, endTime are required" });
      }
      const booking = await prisma.booking.findUnique({
        where: { id },
        include: { user: true, court: true },
      });
      if (!booking)
        return res.status(404).json({ message: "Booking not found" });

      const s = new Date(String(startTime));
      const e = new Date(String(endTime));
      if (isNaN(s.getTime()) || isNaN(e.getTime()) || e <= s) {
        return res.status(400).json({ message: "Invalid date range" });
      }
      // Check conflicts on target court
      const conflict = await prisma.booking.findFirst({
        where: {
          courtId: targetCourtId,
          id: { not: id },
          OR: [
            { status: { in: ["CONFIRMED", "CHECKED_IN"] } },
            {
              AND: [
                { status: "PENDING" },
                { createdAt: { gte: subMinutes(new Date(), 10) } },
              ],
            },
            { AND: [{ status: "CANCELLED" }, { notes: "MAINTENANCE" }] as any },
          ],
          startTime: { lt: e },
          endTime: { gt: s },
        },
      });
      if (conflict) {
        return res.status(409).json({ message: "Target slot not available" });
      }

      const updated = await prisma.booking.update({
        where: { id },
        data: {
          courtId: targetCourtId,
          startTime: s,
          endTime: e,
          duration: Math.round((e.getTime() - s.getTime()) / 60000),
          notes: booking.notes || undefined,
        },
        include: { court: true, user: true },
      });

      // Notify by email
      (async () => {
        try {
          const { sendMail } = await import("../../utils/mailer");
          if (updated.user?.email) {
            const dateFmt = updated.startTime.toLocaleDateString("en-KE", {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
            });
            const timeRange = `${updated.startTime.toLocaleTimeString("en-KE", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })} - ${updated.endTime.toLocaleTimeString("en-KE", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })}`;
            const subject = `Your booking ${updated.bookingCode} has been rescheduled`;
            const html = `<p>Hi ${updated.user.firstName || ""},</p>
              <p>Due to court unavailability, your booking has been moved.</p>
              <p><strong>New details:</strong><br />
              Court: ${updated.court?.name}<br/>
              Date: ${dateFmt}<br/>
              Time: ${timeRange}</p>
              ${reason ? `<p>Reason: ${reason}</p>` : ""}
              <p>We apologize for the inconvenience.</p>`;
            await sendMail({ to: updated.user.email, subject, html });
          }
        } catch (e) {
          console.error("Failed to send reschedule email", e);
        }
      })();

      // Audit
      try {
        await prisma.auditLog.create({
          data: {
            userId: (req as any).user?.id,
            action: "BOOKING_RESCHEDULE",
            entity: "BOOKING",
            entityId: id,
            oldData: booking as any,
            newData: updated as any,
          },
        });
      } catch {}

      return res
        .status(200)
        .json({ data: updated, message: "Booking reassigned" });
    } catch (error) {
      console.error("reassignBooking error", error);
      return res.status(500).json({ message: "Failed to reassign booking" });
    }
  }

  static async getCourtAvailability(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { date } = req.query;

      if (!date) {
        return res.status(400).json({ message: "Date is required" });
      }

      // Parse the date string as local date (not UTC) to avoid timezone conversion
      const [year, month, dayOfMonth] = (date as string).split("-").map(Number);
      const selectedDate = new Date(year, month - 1, dayOfMonth, 0, 0, 0, 0);
      const today = startOfDay(new Date());
      const maxDate = startOfDay(addMonths(today, 1)); // 1 month from today

      // Allow viewing availability for past dates, but limit future viewing to 1 month
      if (selectedDate > maxDate) {
        return res.status(400).json({
          message: "Availability can only be viewed up to 1 month in advance",
        });
      }

      // Resolve operating hours for this day
      const operatingHours: OperatingHoursConfig =
        await getOperatingHoursConfig();
      const dayConfig = operatingHours.days.find(
        (d) => d.dayOfWeek === selectedDate.getDay(),
      );

      if (!dayConfig) {
        return res
          .status(500)
          .json({ message: "Operating hours not configured" });
      }

      const parseMinutes = (value: string): number => {
        const [h, m] = value.split(":").map(Number);
        return h * 60 + m;
      };

      const openMinutes = parseMinutes(dayConfig.openTime);
      const rawCloseMinutes = parseMinutes(dayConfig.closeTime);
      if (!Number.isFinite(openMinutes) || !Number.isFinite(rawCloseMinutes)) {
        return res
          .status(500)
          .json({ message: "Operating hours misconfigured" });
      }
      const closeMinutes =
        rawCloseMinutes <= openMinutes
          ? rawCloseMinutes + 24 * 60
          : rawCloseMinutes;
      const windowStart = openMinutes;
      const windowEnd = closeMinutes;

      const dayEnd = addMinutes(selectedDate, windowEnd);

      const pendingCutoff = subMinutes(new Date(), 1);

      const court = await prisma.court.findUnique({
        where: { id },
        include: {
          bookings: {
            where: {
              startTime: { gte: selectedDate, lt: dayEnd },
              OR: [
                { status: { in: ["CONFIRMED", "CHECKED_IN"] } },
                {
                  AND: [
                    { status: "PENDING" },
                    { createdAt: { gte: pendingCutoff } },
                  ],
                },
                // Include cancellations caused by maintenance (new linkage)
                {
                  AND: [
                    { status: "CANCELLED" },
                    { cancellationReason: "MAINTENANCE" },
                  ],
                },
              ],
            },
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
              equipmentRentals: {
                include: {
                  equipment: {
                    select: {
                      id: true,
                      name: true,
                      type: true,
                      rentalPrice: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!court) {
        return res.status(404).json({ message: "Court not found" });
      }

      if (dayConfig.isClosed) {
        return res.status(200).json({
          data: {
            court: {
              id: court.id,
              name: court.name,
              surface: court.surface,
              location: court.location,
              isActive: court.isActive,
              pricingRules: 0,
            },
            date: format(selectedDate, "yyyy-MM-dd"),
            timeSlots: [],
          },
        });
      }

      // Fetch pricing rules using cache service (95% faster on repeated requests)
      const dayOfWeek = selectedDate.getDay();
      const pricingRules = await PricingCacheService.getActivePricingRules(
        undefined,
        selectedDate,
      );

      // Separate global and court-specific rules
      const globalRules = pricingRules.filter((rule) => !rule.courtId);
      const courtSpecificRules = pricingRules.filter(
        (rule) => rule.courtId === id,
      );

      // Helper function to check if a pricing rule applies to a specific day/hour
      const appliesTo = (
        rule: any,
        dayOfWeek: number,
        hour: number,
      ): boolean => {
        // Check day of week - if dayOfWeek array is empty or null, it applies to all days
        if (rule.dayOfWeek && rule.dayOfWeek.length > 0) {
          if (!rule.dayOfWeek.includes(dayOfWeek)) {
            return false;
          }
        }

        // Check time constraints
        if (rule.startTime && rule.endTime) {
          const [startHour, startMin = 0] = rule.startTime
            .split(":")
            .map(Number);
          const [endHour, endMin = 0] = rule.endTime.split(":").map(Number);

          // Convert to total minutes for accurate comparison
          const currentMinutes = hour * 60;
          const startMinutes = startHour * 60 + startMin;
          let endMinutes = endHour * 60 + endMin;

          // If end time is 00:00, treat it as 24:00 (end of day)
          if (endMinutes === 0) {
            endMinutes = 24 * 60;
          }

          // Check if current hour is within the range (inclusive of start, exclusive of end)
          if (currentMinutes < startMinutes || currentMinutes >= endMinutes) {
            return false;
          }
        }

        return true;
      };

      // Helper function to apply pricing rule to a base rate
      const applyPricingRule = (baseRate: number, rule: any): number => {
        const priceValue = Number(rule.priceValue);

        switch (rule.pricingType) {
          case "FIXED":
            return priceValue;
          case "PERCENTAGE":
            // PERCENTAGE is a discount, so subtract from base
            return baseRate * (1 - priceValue / 100);
          case "MULTIPLIER":
            return baseRate * priceValue;
          case "ADDITION":
            return baseRate + priceValue;
          default:
            return baseRate;
        }
      };

      // Also fetch recent pending payment holds for this court (with reservation metadata, 1-minute window)
      const pendingHolds = await prisma.payment.findMany({
        where: {
          status: "PENDING",
          createdAt: { gte: subMinutes(new Date(), 1) },
          metadata: { path: ["reservation", "courtId"], equals: id },
        },
        select: { metadata: true, createdAt: true },
      });

      // Return the earliest hold expiry (heldUntil) for the given slot if any pending hold overlaps it
      const getHoldExpiryForSlot = (
        slotStart: Date,
        slotEnd: Date,
      ): Date | null => {
        let earliest: Date | null = null;
        for (const p of pendingHolds) {
          const r: any = (p as any).metadata?.reservation;
          if (!r) continue;
          const rs = new Date(r.startTime);
          const re = new Date(r.endTime);
          // Half-open interval overlap check: [slotStart, slotEnd) vs [rs, re)
          if (slotStart < re && slotEnd > rs) {
            const expiry = addMinutes(new Date((p as any).createdAt), 1);
            if (!earliest || expiry < earliest) earliest = expiry;
          }
        }
        return earliest;
      };

      // Fetch dedicated maintenance intervals (new Maintenance table) overlapping this day
      const maintIntervals: Array<{
        startTime: Date;
        endTime: Date;
        id: string;
      }> = await (prisma as any).maintenance.findMany({
        where: {
          courtId: id,
          startTime: { lt: dayEnd },
          endTime: { gt: selectedDate },
        },
        orderBy: { startTime: "asc" },
      });

      // Generate time slots - now supporting 30-minute intervals
      const timeSlots: any[] = [];
      const wrapsPastMidnight = rawCloseMinutes <= openMinutes;

      // Generate slots across configured operating window (supports wrap past midnight)
      for (let minute = windowStart; minute < windowEnd; minute += 30) {
        const slotStart = addMinutes(selectedDate, minute);
        const slotEnd = addMinutes(slotStart, 30);
        const timeString = format(slotStart, "HH:mm");
        const hour = slotStart.getHours();
        const minutes = slotStart.getMinutes();

        // Find booking for this slot - ensure we're checking the correct range
        const booking = court.bookings.find((booking) => {
          const bookingStart = new Date(booking.startTime);
          const bookingEnd = new Date(booking.endTime);
          // Half-open interval overlap check to avoid grabbing adjacent hour
          return slotStart < bookingEnd && slotEnd > bookingStart;
        });

        const isLegacyMaintenanceBooking =
          !!booking &&
          booking.status === "CANCELLED" &&
          (booking as any).cancellationReason === "MAINTENANCE";

        // Check if held by pending payment reservation and compute earliest expiry
        const heldUntil = getHoldExpiryForSlot(slotStart, slotEnd);
        const held = !!heldUntil && heldUntil > new Date();

        // Calculate price based on pricing rules
        let rate = 3000; // Default base rate if no rules apply
        let appliedRule = "Default Rate";
        let ruleApplied = false;

        // Sort rules by priority and specificity
        const sortedRules = [...courtSpecificRules, ...globalRules].sort(
          (a, b) => {
            // Court-specific rules take precedence
            if (a.courtId && !b.courtId) return -1;
            if (!a.courtId && b.courtId) return 1;

            // Then sort by priority (higher number = higher priority)
            return Number(b.priority) - Number(a.priority);
          },
        );

        // Apply the first matching rule
        let matchedRule: any = null;
        for (const rule of sortedRules) {
          if (appliesTo(rule, dayOfWeek, hour)) {
            // For FIXED type, directly set the price
            if (rule.pricingType === "FIXED") {
              rate = Number(rule.priceValue);
            } else {
              // For other types, apply as modifier to base rate
              rate = applyPricingRule(rate, rule);
            }
            appliedRule = rule.name;
            ruleApplied = true;
            matchedRule = rule;

            break; // Only apply the first matching rule
          }
        }

        if (!ruleApplied && process.env.NODE_ENV !== "production") {
          console.log(
            `No rule applied for ${timeString}, using default rate: ${rate}`,
          );
        }

        // Determine if this slot is covered by a dedicated maintenance interval
        const intervalMaintenance = maintIntervals.some(
          (iv) => slotStart < iv.endTime && slotEnd > iv.startTime,
        );

        // Transform booking status for legacy maintenance cancellations
        const legacyMaintenance =
          isLegacyMaintenanceBooking && maintIntervals.length === 0;
        const isMaintenance = intervalMaintenance || legacyMaintenance;

        const bookingForSlot = isLegacyMaintenanceBooking ? undefined : booking;

        // If purely maintenance (no booking), synthesize a booking-like object for UI consistency
        const transformedBooking = bookingForSlot
          ? {
              id: bookingForSlot.id,
              bookingCode: bookingForSlot.bookingCode,
              courtId: bookingForSlot.courtId,
              startTime: bookingForSlot.startTime,
              endTime: bookingForSlot.endTime,
              duration: bookingForSlot.duration,
              status: isMaintenance
                ? ("MAINTENANCE" as const)
                : bookingForSlot.status,
              totalAmount: Number(bookingForSlot.totalAmount),
              numberOfPlayers: bookingForSlot.numberOfPlayers,
              user: bookingForSlot.user,
              equipmentRentals: bookingForSlot.equipmentRentals,
              priceBreakdown: bookingForSlot.priceBreakdown, // Include price breakdown for accurate display
            }
          : isMaintenance
            ? {
                id: `maint-${hour}`,
                bookingCode: "MAINT",
                courtId: id,
                startTime: slotStart,
                endTime: slotEnd,
                duration: 60,
                status: "MAINTENANCE" as const,
                totalAmount: 0,
                numberOfPlayers: 0,
                user: undefined,
                equipmentRentals: undefined,
              }
            : undefined;

        // Calculate slot rate: pricing rules define hourly rates, but slots are 30 minutes
        // So we divide by 2 to get the per-slot (30-minute) rate
        const slotRate = Math.round(rate / 2);

        const isNextDay = slotStart.getDate() !== selectedDate.getDate();

        timeSlots.push({
          time: timeString,
          hour,
          minutes,
          isNextDay,
          isAvailable: !bookingForSlot && !held && !isMaintenance,
          booking: transformedBooking,
          isMaintenance, // explicit flag for client
          rate: slotRate,
          isPeak: matchedRule?.isPeak || false, // Use isPeak from the pricing rule
          appliedRule,
          ...(held ? { heldUntil: heldUntil!.toISOString() } : {}),
        });
      }

      // Ensure wrap-midnight slots (e.g., 00:00/00:30) appear at the end of the day
      timeSlots.sort((a, b) => {
        const normalize = (slot: any) => {
          const base = slot.hour * 60 + (slot.minutes || 0);
          // When the day wraps, early-morning slots belong to the tail of the prior day
          if (wrapsPastMidnight && base < openMinutes) {
            return base + 24 * 60;
          }
          return base;
        };

        return normalize(a) - normalize(b);
      });

      return res.status(200).json({
        data: {
          court: {
            id: court.id,
            name: court.name,
            surface: court.surface,
            location: court.location,
            isActive: court.isActive,
            pricingRules: courtSpecificRules.length,
          },
          date: format(selectedDate, "yyyy-MM-dd"),
          timeSlots,
        },
      });
    } catch (error) {
      console.error("Error fetching court availability:", error);
      return res.status(500).json({ message: "Failed to fetch availability" });
    }
  }

  static async getCourtDayStats(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { date } = req.query;
      if (!date) return CourtController.fail(res, "'date' is required", 400);

      // Parse date string components to avoid timezone issues
      const dateStr = String(date);
      const [year, month, dayOfMonth] = dateStr.split("-").map(Number);
      if (!year || !month || !dayOfMonth) {
        return CourtController.fail(
          res,
          "Invalid date format. Expected YYYY-MM-DD",
          400,
        );
      }

      // Create date in local timezone (EAT)
      const day = new Date(year, month - 1, dayOfMonth, 0, 0, 0, 0);
      if (isNaN(day.getTime()))
        return CourtController.fail(res, "Invalid date", 400);
      // Reject overflow dates (e.g. Feb 29 in a non-leap year)
      if (
        day.getFullYear() !== year ||
        day.getMonth() !== month - 1 ||
        day.getDate() !== dayOfMonth
      ) {
        return CourtController.fail(
          res,
          `Invalid date: ${dateStr} does not exist in the calendar`,
          400,
        );
      }
      const dayEnd = new Date(year, month - 1, dayOfMonth, 23, 59, 59, 999);

      // CRITICAL FIX: Include payment info for accurate revenue calculation
      const bookings = await prisma.booking.findMany({
        where: { courtId: id, startTime: { gte: day, lt: dayEnd } },
        select: {
          id: true,
          bookingCode: true,
          startTime: true,
          endTime: true,
          status: true,
          cancellationReason: true,
          totalAmount: true,
          payment: {
            select: {
              amount: true,
              method: true,
              provider: true,
              status: true,
            },
          },
        },
        orderBy: { startTime: "asc" },
      });

      const maintIntervals: Array<{
        startTime: Date;
        endTime: Date;
        id: string;
      }> = await (prisma as any).maintenance.findMany({
        where: { courtId: id, startTime: { lt: dayEnd }, endTime: { gt: day } },
        orderBy: { startTime: "asc" },
      });

      const HOURS_START = 6; // 6 AM
      const HOURS_END = 24; // exclusive
      const totalSlots = HOURS_END - HOURS_START; // 18 slots
      const bookedHours = new Set<number>();
      const maintenanceHours = new Set<number>();
      let revenue = 0;
      let revenueBookings = 0;

      for (const b of bookings) {
        const isMaintenance =
          b.status === "CANCELLED" &&
          (b as any).cancellationReason === "MAINTENANCE";
        const status = b.status;
        // CRITICAL FIX: Only count M-Pesa payments as revenue
        if (
          !isMaintenance &&
          ["CONFIRMED", "CHECKED_IN", "COMPLETED"].includes(status) &&
          (b as any).payment?.status === "COMPLETED" &&
          (b as any).payment?.method === "MPESA" &&
          (b as any).payment?.provider === "MPESA"
        ) {
          revenue += Number((b as any).payment?.amount) || 0;
          revenueBookings++;
        }
        const startH = Math.max(HOURS_START, new Date(b.startTime).getHours());
        const endH = Math.min(HOURS_END, new Date(b.endTime).getHours());
        for (let h = startH; h < endH; h++) {
          if (isMaintenance) maintenanceHours.add(h);
          else if (!["CANCELLED", "NO_SHOW", "REFUNDED"].includes(status))
            bookedHours.add(h);
        }
      }

      // Add maintenance hours from dedicated intervals (may cover hours without a booking row)
      for (const m of maintIntervals) {
        const startH = Math.max(HOURS_START, new Date(m.startTime).getHours());
        const endH = Math.min(HOURS_END, new Date(m.endTime).getHours());
        for (let h = startH; h < endH; h++) maintenanceHours.add(h);
      }

      // Remove any overlap from free slots by union of both sets
      const bookedSlots = bookedHours.size;
      const maintenanceSlots = maintenanceHours.size;
      const freeSlots =
        totalSlots - new Set([...bookedHours, ...maintenanceHours]).size;
      const averageIncome = revenueBookings ? revenue / revenueBookings : 0;

      return CourtController.ok(res, {
        courtId: id,
        date: day.toISOString().slice(0, 10),
        totalSlots,
        bookedSlots,
        freeSlots,
        maintenanceSlots,
        revenue,
        averageIncome: Math.round(averageIncome),
        totalBookings: revenueBookings,
      });
    } catch (err) {
      console.error("Court day stats error", err);
      return CourtController.fail(res, "Failed to compute court stats", 500);
    }
  }

  // Court-scoped blackout endpoints
}

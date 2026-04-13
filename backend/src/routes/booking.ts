import { Router } from "express";
import { BookingController } from "../controllers/admin/booking.controller";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { requireTwoFactor } from "../middleware/twofa.middleware";
import prisma from "../config/db";
import {
  addDays,
  startOfDay,
  addMinutes,
  isBefore,
  subMinutes,
  addMonths,
} from "date-fns";
import { calculatePointsFromAmount } from "../utils/loyalty";
import { calculatePriceBreakdown } from "../utils/price-breakdown";
import { generateBookingCode } from "../utils/helpers";

const router = Router();

router.get("/my-bookings", authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const bookings = await prisma.booking.findMany({
      where: { userId },
      include: {
        court: {
          select: {
            id: true,
            name: true,
            location: true,
          },
        },
        equipmentRentals: {
          include: {
            equipment: {
              select: {
                name: true,
                type: true,
              },
            },
          },
        },
        payment: {
          select: {
            metadata: true,
            bookingId: true, // Include bookingId to identify the primary booking
          },
        },
      },
      orderBy: { startTime: "desc" },
    });

    // Fetch all payments related to these bookings (including ADD_EQUIPMENT payments)
    const bookingIds = bookings.map((b) => b.id);
    const allRelatedPayments = await prisma.payment.findMany({
      where: {
        bookingId: { in: bookingIds }, // Original booking payments
        status: "COMPLETED",
      },
      select: {
        id: true,
        bookingId: true,
        metadata: true,
      },
    });

    // Also fetch ADD_EQUIPMENT payments (they have bookingId: null but relatedBookingId in metadata)
    const addEquipmentPayments = await prisma.payment.findMany({
      where: {
        bookingId: null,
        status: "COMPLETED",
        metadata: {
          path: ["context"],
          equals: "ADD_EQUIPMENT",
        },
      },
      select: {
        id: true,
        bookingId: true,
        metadata: true,
      },
    });

    // Filter ADD_EQUIPMENT payments to only those related to these bookings
    const relevantAddEquipmentPayments = addEquipmentPayments.filter((p) => {
      const meta = p.metadata as any;
      return (
        meta?.relatedBookingId && bookingIds.includes(meta.relatedBookingId)
      );
    });

    // Combine all payments
    const allPayments = [
      ...allRelatedPayments,
      ...relevantAddEquipmentPayments,
    ];

    const toFiniteNumber = (value: unknown): number | undefined => {
      const num = Number(value);
      return Number.isFinite(num) ? num : undefined;
    };

    const serialized = bookings.map((b) => {
      const durationHours = b.duration > 0 ? b.duration / 60 : 0;
      const bookingTotal = toFiniteNumber(b.totalAmount) ?? 0;

      // Get ALL payment metadata for this booking (original + ADD_EQUIPMENT)
      const bookingPayments = allPayments.filter(
        (p) =>
          p.bookingId === b.id || (p.metadata as any)?.relatedBookingId === b.id
      );

      // Sum up all voucher discounts and gift card amounts from all payments
      let totalVoucherDiscount = 0;
      let totalGiftCardApplied = 0;

      bookingPayments.forEach((payment) => {
        const meta = payment.metadata as any;
        const voucherDiscount = toFiniteNumber(meta?.voucher?.discount) ?? 0;
        const giftCardApplied = toFiniteNumber(meta?.giftcard?.applied) ?? 0;
        totalVoucherDiscount += voucherDiscount;
        totalGiftCardApplied += giftCardApplied;
      });

      // Get primary payment metadata for price breakdown (original booking payment)
      const paymentMeta = (b.payment?.metadata ?? null) as any;

      // Try to get price breakdown from stored data first
      const storedBreakdown = b.priceBreakdown as any;
      let courtSubtotal: number;
      let equipmentSubtotal: number;
      let pricePerHour: number;

      if (storedBreakdown?.courtSubtotal != null) {
        // Use stored breakdown data (accurate)
        courtSubtotal = toFiniteNumber(storedBreakdown.courtSubtotal) ?? 0;
        equipmentSubtotal =
          toFiniteNumber(storedBreakdown.equipmentSubtotal) ?? 0;

        // Calculate average hourly rate from hourly breakdown if available
        if (storedBreakdown.hourlyBreakdown?.length > 0) {
          const totalHourlyRate = storedBreakdown.hourlyBreakdown.reduce(
            (sum: number, hour: any) =>
              sum + (toFiniteNumber(hour.finalRate) ?? 0),
            0
          );
          pricePerHour =
            totalHourlyRate / storedBreakdown.hourlyBreakdown.length;
        } else {
          pricePerHour =
            durationHours > 0 ? courtSubtotal / durationHours : courtSubtotal;
        }
      } else {
        // Fallback: calculate from payment metadata or equipment
        const equipmentSubtotalCalc = (b.equipmentRentals || []).reduce(
          (sum, rental) => {
            const price = toFiniteNumber(rental.price) ?? 0;
            const qty = toFiniteNumber(rental.quantity) ?? 0;
            const isHourly = rental.equipment.type === "RACKET";
            const subtotal = isHourly
              ? price * qty * durationHours
              : price * qty;
            return sum + subtotal;
          },
          0
        );

        const reservationMeta = paymentMeta?.reservation ?? null;
        const slotAmount = toFiniteNumber(reservationMeta?.slotAmount);
        const racketsAmount = toFiniteNumber(reservationMeta?.racketsAmount);

        let courtSubtotalCalc: number | undefined = slotAmount;
        if (courtSubtotalCalc == null && racketsAmount != null) {
          courtSubtotalCalc = bookingTotal - racketsAmount;
        }
        if (courtSubtotalCalc == null) {
          courtSubtotalCalc = bookingTotal - equipmentSubtotalCalc;
        }
        if (!Number.isFinite(courtSubtotalCalc)) {
          courtSubtotalCalc = bookingTotal;
        }
        courtSubtotal = Math.max(0, courtSubtotalCalc ?? 0);
        equipmentSubtotal = equipmentSubtotalCalc;
        pricePerHour =
          durationHours > 0 ? courtSubtotal / durationHours : courtSubtotal;
      }

      // For multi-court bookings, only show discount on the primary booking
      // (the one linked to the payment record) to avoid duplicating discounts in the UI
      const isPrimaryBooking = b.payment?.bookingId === b.id;
      const effectiveVoucherDiscount = isPrimaryBooking
        ? totalVoucherDiscount
        : undefined;
      const effectiveGiftCardApplied = isPrimaryBooking
        ? totalGiftCardApplied
        : undefined;

      // Build equipment breakdown - ALWAYS use actual equipmentRentals from database
      // because equipment is attached after booking creation, so storedBreakdown.equipment is often empty
      const equipmentBreakdown: any[] = (b.equipmentRentals || []).map(
        (rental) => {
          const qty = toFiniteNumber(rental.quantity) ?? 0;
          const pricePerUnit = toFiniteNumber(rental.price) ?? 0;
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
        }
      );

      // For totalAmount, return the gross booking amount
      // The frontend will handle displaying the breakdown with discounts
      const grossTotal = bookingTotal;

      return {
        id: b.id,
        bookingCode: b.bookingCode,
        court: b.court,
        startTime: b.startTime,
        endTime: b.endTime,
        duration: b.duration,
        numberOfPlayers: b.numberOfPlayers,
        status: b.status,
        totalAmount: grossTotal,
        createdAt: b.createdAt,
        pricing: {
          totalAmount: grossTotal,
          courtSubtotal,
          equipmentSubtotal,
          voucherDiscount: effectiveVoucherDiscount ?? null,
          giftCardApplied: effectiveGiftCardApplied ?? null,
          pricePerHour,
          equipment: equipmentBreakdown,
        },
      };
    });

    return res.status(200).json(serialized);
  } catch (error) {
    console.error("Error fetching my bookings:", error);
    return res.status(500).json({ message: "Failed to fetch bookings" });
  }
});

router.get("/:id/status", authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    let booking = await prisma.booking.findFirst({
      where: { id, userId },
      include: {
        court: { select: { id: true, name: true } },
        payment: { select: { status: true, provider: true } },
      },
    });

    if (!booking) {
      return res
        .status(403)
        .json({ message: "Booking not found or access denied" });
    }

    if (
      booking.payment?.status === "COMPLETED" &&
      booking.status !== "CONFIRMED" &&
      booking.status !== "COMPLETED"
    ) {
      await prisma.booking.update({
        where: { id: booking.id },
        data: { status: "CONFIRMED" },
      });

      booking = await prisma.booking.findFirst({
        where: { id, userId },
        include: {
          court: { select: { id: true, name: true } },
          payment: { select: { status: true, provider: true } },
        },
      });
    }

    if (booking && booking.status === "PENDING") {
      const created = new Date(booking.createdAt);
      const expiry = addMinutes(created, 10);
      if (isBefore(expiry, new Date())) {
        await prisma.booking.update({
          where: { id: booking.id },
          data: {
            status: "CANCELLED",
            cancelledAt: new Date(),
            cancellationReason: "Auto-cancelled due to payment timeout (10m)",
          },
        });
        booking = await prisma.booking.findFirst({
          where: { id, userId },
          include: {
            court: { select: { id: true, name: true } },
            payment: { select: { status: true, provider: true } },
          },
        });
      }
    }

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    return res.status(200).json({
      id: booking.id,
      bookingCode: booking.bookingCode,
      status: booking.status,
      startTime: booking.startTime,
      endTime: booking.endTime,
      duration: booking.duration,
      totalAmount: Number(booking.totalAmount),
      court: booking.court,
      payment: booking.payment,
      createdAt: booking.createdAt,
    });
  } catch (error) {
    console.error("Error fetching booking status:", error);
    return res.status(500).json({ message: "Failed to fetch booking status" });
  }
});

router.post("/", authenticate, async (req, res) => {
  try {
    const {
      courtId,
      startTime,
      endTime,
      numberOfPlayers,
      totalAmount,
      duration,
    } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);
    const now = new Date();

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return res.status(400).json({ message: "Invalid start or end time" });
    }

    if (isBefore(start, now)) {
      return res
        .status(400)
        .json({ message: "Cannot book a slot that has already started" });
    }

    if (!isBefore(start, end)) {
      return res
        .status(400)
        .json({ message: "End time must be after start time" });
    }

    const bookingDate = startOfDay(start);
    const today = startOfDay(new Date());
    const maxDate = startOfDay(addMonths(today, 1));

    // Note: Past time validation already handled above with isBefore(start, now)

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

    const pendingCutoff = subMinutes(new Date(), 1);
    const existingBooking = await prisma.booking.findFirst({
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
                  { startTime: { lte: start } },
                  { endTime: { gt: start } },
                ],
              },
              {
                AND: [{ startTime: { lt: end } }, { endTime: { gt: end } }],
              },
              {
                AND: [{ startTime: { gte: start } }, { endTime: { lte: end } }],
              },
            ],
          },
        ],
      },
    });

    if (existingBooking) {
      console.log("BOOKING CONFLICT DETECTED:");
      console.log("New booking:", { courtId, start, end });
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

    const bookingCode = generateBookingCode();

    const computedDuration =
      duration || Math.round((end.getTime() - start.getTime()) / 60000);

    // Calculate price breakdown for this booking (court already fetched above)
    const priceBreakdown = await calculatePriceBreakdown({
      courtId,
      startTime: start,
      endTime: end,
      durationMinutes: computedDuration,
      equipmentRentals: [], // Equipment will be added separately if needed
      baseHourlyRate: Number(court?.baseHourlyRate || 0),
    });

    const booking = await prisma.booking.create({
      data: {
        bookingCode,
        userId,
        courtId,
        startTime: start,
        endTime: end,
        duration: computedDuration,
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

    return res.status(201).json({
      data: booking,
      message: "Booking created successfully",
      loyaltyPoints: {
        pending: Math.floor(totalAmount / 100),
        message: "Points will be credited after payment confirmation",
      },
    });
  } catch (error) {
    console.error("Error creating booking:", error);
    return res.status(500).json({ message: "Failed to create booking" });
  }
});

router.get(
  "/",
  authenticate,
  authorize("BOOKING_OFFICER", "MANAGER", "ADMIN", "SUPER_ADMIN"),
  BookingController.getBookings
);
// Manager summary endpoints (manager has read access similar to booking officer)
router.get(
  "/manager/summary",
  authenticate,
  authorize("MANAGER", "ADMIN", "SUPER_ADMIN"),
  BookingController.getManagerSummary
);
router.get(
  "/manager/export",
  authenticate,
  authorize("MANAGER", "ADMIN", "SUPER_ADMIN"),
  // 2FA middleware could be reused if present (twoFactor middleware name inferred as twofa in repo) - fallback simple check
  BookingController.exportManagerBookings
);
router.get(
  "/:id",
  authenticate,
  authorize("BOOKING_OFFICER", "SUPER_ADMIN"),
  BookingController.getBooking
);
router.put(
  "/:id",
  authenticate,
  authorize("SUPER_ADMIN"),
  BookingController.updateBooking
);
// Customer self-service edit (24-hour rule enforced in controller)
router.patch("/:id", authenticate, BookingController.updateBooking);
router.patch("/:id/cancel", authenticate, BookingController.cancelBooking);
// Generate gift card for cancelled/rescheduled booking (MANAGER only, requires 2FA)
router.post(
  "/:id/generate-giftcard",
  authenticate,
  authorize("MANAGER", "ADMIN", "SUPER_ADMIN"),
  requireTwoFactor,
  BookingController.generateGiftCardForCancellation
);
// Reschedule booking - available to customers (with 24-hour rule) and booking officers
router.patch(
  "/:id/reschedule",
  authenticate,
  BookingController.rescheduleBooking
);
// Add equipment to an existing booking
router.post("/:id/add-equipment", authenticate, async (req, res) => {
  try {
    const { id: bookingId } = req.params;
    const userId = req.user!.id;
    const {
      phoneNumber,
      racketQty,
      ballsQty,
      racketUnitPrice,
      ballsUnitPrice,
      ballTypeId,
      ballTypeName,
    } = req.body;

    // Validate input
    if (!phoneNumber || !phoneNumber.trim()) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required for payment.",
      });
    }

    const rackets = Number(racketQty || 0);
    const balls = Number(ballsQty || 0);

    if (!Number.isFinite(rackets) || !Number.isFinite(balls)) {
      return res.status(400).json({
        success: false,
        message: "Equipment quantities must be numeric values.",
      });
    }

    if (!Number.isInteger(rackets) || !Number.isInteger(balls)) {
      return res.status(400).json({
        success: false,
        message: "Equipment quantities must be whole numbers.",
      });
    }

    if (rackets < 0 || balls < 0) {
      return res.status(400).json({
        success: false,
        message: "Top-ups only. You cannot reduce previously booked equipment.",
      });
    }

    if (rackets === 0 && balls === 0) {
      return res.status(400).json({
        success: false,
        message: "Please select at least one equipment item.",
      });
    }

    if (rackets === 0 && balls === 0) {
      return res.status(400).json({
        success: false,
        message: "Please select at least one equipment item.",
      });
    }

    if (rackets > 8 || balls > 5) {
      return res.status(400).json({
        success: false,
        message: "Maximum 8 rackets and 5 ball packs allowed.",
      });
    }

    // Get the booking
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, userId },
      include: {
        court: {
          select: {
            id: true,
            name: true,
          },
        },
        equipmentRentals: {
          include: {
            equipment: {
              select: {
                type: true,
              },
            },
          },
        },
      },
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found or access denied.",
      });
    }

    // Validate booking status
    if (!["PENDING", "CONFIRMED"].includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message:
          "Equipment can only be added to pending or confirmed bookings.",
      });
    }

    // Validate booking hasn't started yet
    const now = new Date();
    const startTime = new Date(booking.startTime);
    if (isBefore(startTime, now)) {
      return res.status(400).json({
        success: false,
        message: "Cannot add equipment to a booking that has already started.",
      });
    }

    // Check current equipment counts
    const currentRackets = booking.equipmentRentals
      .filter((r) => r.equipment.type === "RACKET")
      .reduce((sum, r) => sum + r.quantity, 0);
    const currentBalls = booking.equipmentRentals
      .filter((r) => r.equipment.type === "BALLS")
      .reduce((sum, r) => sum + r.quantity, 0);

    if (currentRackets + rackets > 8) {
      return res.status(400).json({
        success: false,
        message: `Cannot add ${rackets} rackets. Current: ${currentRackets}, Maximum: 8`,
      });
    }

    if (currentBalls + balls > 5) {
      return res.status(400).json({
        success: false,
        message: `Cannot add ${balls} ball packs. Current: ${currentBalls}, Maximum: 5`,
      });
    }

    // Calculate costs
    const durationHours = booking.duration / 60;
    const racketPrice = Number(racketUnitPrice || 300);
    const ballsPrice = Number(ballsUnitPrice || 1000);
    const racketsAmount = rackets * racketPrice * durationHours;
    const ballsAmount = balls * ballsPrice;
    const totalAmount = racketsAmount + ballsAmount;

    if (totalAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid equipment pricing.",
      });
    }

    // Store equipment details for payment callback
    const equipmentPayload = {
      bookingId,
      bookingCode: booking.bookingCode,
      courtName: booking.court.name,
      racketQty: rackets,
      ballsQty: balls,
      racketUnitPrice: racketPrice,
      ballsUnitPrice: ballsPrice,
      racketsAmount,
      ballsAmount,
      totalAmount,
      durationHours,
      type: "ADD_EQUIPMENT",
      ...(ballTypeId && { ballTypeId }),
      ...(ballTypeName && { ballTypeName }),
    };

    // Return payment initiation data (frontend will handle STK push)
    return res.status(200).json({
      success: true,
      data: {
        bookingId,
        bookingCode: booking.bookingCode,
        totalAmount,
        equipment: equipmentPayload,
      },
      message: "Equipment quote calculated. Proceed with payment.",
    });
  } catch (error) {
    console.error("Error adding equipment to booking:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to add equipment to booking.",
    });
  }
});

// Invite users to a booking
router.post("/:id/invite", authenticate, async (req, res) => {
  try {
    const { id: bookingId } = req.params;
    const { emails } = req.body; // Array of email addresses

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide at least one email address to invite.",
      });
    }

    // Maximum 3 additional invitations (booking owner + 3 invitees = 4 total)
    if (emails.length > 10) {
      return res.status(400).json({
        success: false,
        message:
          "You can only invite up to 10 additional players (maximum 10 players total including yourself).",
      });
    }

    // Get the booking with user and court details
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        court: {
          select: {
            id: true,
            name: true,
            location: true,
          },
        },
      },
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found.",
      });
    }

    // Only the booking owner can send invitations
    if (booking.userId !== req.user!.id) {
      return res.status(403).json({
        success: false,
        message: "Only the booking owner can invite players.",
      });
    }

    // Only allow invitations for confirmed bookings
    if (booking.status !== "CONFIRMED") {
      return res.status(400).json({
        success: false,
        message:
          "Invitations can only be sent for confirmed bookings. Please complete payment first.",
      });
    }

    const inviterName = `${booking.user.firstName} ${booking.user.lastName}`;
    const createdInvitations: any[] = [];
    const { sendMail, buildBookingInvitationEmail } = await import(
      "../utils/mailer"
    );

    // Format booking details
    const start = new Date(booking.startTime);
    const end = new Date(booking.endTime);
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

    // Process each invitation
    for (const email of emails) {
      const trimmedEmail = email.trim().toLowerCase();

      if (!trimmedEmail || !/^\S+@\S+\.\S+$/.test(trimmedEmail)) {
        continue; // Skip invalid emails
      }

      // Check if user already invited
      const existing = await prisma.bookingInvitation.findFirst({
        where: {
          bookingId,
          email: trimmedEmail,
        },
      });

      if (existing) {
        continue; // Skip already invited users
      }

      // Check if email exists in system
      const invitedUser = await prisma.user.findUnique({
        where: { email: trimmedEmail },
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      });

      // Create invitation record
      const invitation = await prisma.bookingInvitation.create({
        data: {
          bookingId,
          email: trimmedEmail,
          userId: invitedUser?.id,
          userName: invitedUser
            ? `${invitedUser.firstName} ${invitedUser.lastName}`
            : null,
          status: "PENDING",
        },
      });

      createdInvitations.push(invitation);

      // Send invitation email
      try {
        const emailTemplate = buildBookingInvitationEmail({
          recipientEmail: trimmedEmail,
          recipientFirstName: invitedUser?.firstName || null,
          inviterName,
          bookingCode: booking.bookingCode,
          courtName: booking.court.name,
          date: dateFmt,
          timeRange,
          location: booking.court.location,
        });

        await sendMail({
          to: trimmedEmail,
          subject: emailTemplate.subject,
          html: emailTemplate.html,
        });

        // Update invitation as sent
        await prisma.bookingInvitation.update({
          where: { id: invitation.id },
          data: {
            status: "SENT",
            sentAt: new Date(),
          },
        });
      } catch (emailError) {
        console.error(
          `Failed to send invitation email to ${trimmedEmail}:`,
          emailError
        );
        // Don't fail the request if email fails, just log it
      }
    }

    return res.status(201).json({
      success: true,
      message: `Successfully sent ${createdInvitations.length} invitation(s).`,
      data: {
        bookingId,
        invitationsSent: createdInvitations.length,
        invitations: createdInvitations,
      },
    });
  } catch (error) {
    console.error("Error sending booking invitations:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send invitations. Please try again.",
    });
  }
});
// Get invitations for a booking
router.get("/:id/invitations", authenticate, async (req, res) => {
  try {
    const { id: bookingId } = req.params;

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        userId: true,
        invitations: {
          select: {
            id: true,
            email: true,
            userName: true,
            status: true,
            invitedAt: true,
            sentAt: true,
          },
          orderBy: {
            invitedAt: "asc",
          },
        },
      },
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found.",
      });
    }

    // Only booking owner can view invitations
    if (booking.userId !== req.user!.id) {
      return res.status(403).json({
        success: false,
        message: "Access denied.",
      });
    }

    return res.status(200).json({
      success: true,
      data: booking.invitations,
    });
  } catch (error) {
    console.error("Error fetching booking invitations:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch invitations.",
    });
  }
});
router.patch(
  "/:id/confirm",
  authenticate,
  authorize("SUPER_ADMIN"),
  BookingController.confirmBooking
);
router.delete(
  "/:id",
  authenticate,
  authorize("SUPER_ADMIN"),
  BookingController.deleteBooking
);

export default router;

async function awardLoyaltyPoints(
  userId: string,
  bookingId: string,
  amount: number
) {
  const points = await calculatePointsFromAmount(amount);

  if (points > 0) {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { loyaltyPoints: { increment: points } },
      }),
      prisma.loyaltyPoint.create({
        data: {
          userId,
          points,
          type: "EARNED",
          description: "Court booking reward",
          referenceId: bookingId,
          expiresAt: addMonths(new Date(), 6),
        },
      }),
    ]);
  }

  return points;
}

import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export class CustomerDashboardController {
  static async getStats(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
      }

      // Get user with loyalty points
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          loyaltyPoints: true,
          membershipCard: true,
        },
      });

      // Get booking stats (exclude cancelled and refunded)
      const bookings = await prisma.booking.findMany({
        where: {
          userId,
          status: {
            notIn: ["CANCELLED", "REFUNDED"],
          },
        },
        include: {
          court: true,
        },
      });

      const upcomingBookings = bookings.filter(
        (b) => new Date(b.startTime) > new Date() && b.status === "CONFIRMED"
      ).length;

      const totalPlayingHours =
        bookings.reduce((sum, b) => sum + b.duration, 0) / 60;

      // Calculate total spent
      const totalSpent = bookings
        .filter((b) => b.status === "COMPLETED" || b.status === "CONFIRMED")
        .reduce((sum, b) => sum + Number(b.totalAmount), 0);

      // Find favorite court name (most booked court)
      const courtNames = bookings.reduce((acc, b) => {
        const name = b.court.name;
        acc[name] = (acc[name] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const favoriteCourtName =
        Object.entries(courtNames).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

      // Get last booking date
      const lastBooking = bookings
        .filter((b) => b.status === "COMPLETED")
        .sort(
          (a, b) =>
            new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
        )[0];

      res.json({
        success: true,
        data: {
          totalBookings: bookings.length,
          upcomingBookings,
          totalSpent,
          loyaltyPoints: user?.loyaltyPoints || 0,
          membershipTier: user?.membershipCard?.tier || "BRONZE",
          favoriteCourtName,
          lastBookingDate: lastBooking?.startTime || null,
          totalPlayingHours: Math.round(totalPlayingHours),
        },
      });
    } catch (error) {
      console.error("Get customer stats error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch stats",
      });
    }
  }

  static async getUpcomingBookings(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;

      const bookings = await prisma.booking.findMany({
        where: {
          userId,
          startTime: {
            gte: new Date(),
          },
          status: "CONFIRMED",
        },
        include: {
          court: true,
        },
        orderBy: {
          startTime: "asc",
        },
        take: 5,
      });

      const formattedBookings = bookings.map((b) => ({
        id: b.id,
        bookingCode: b.bookingCode,
        courtName: b.court.name,
        startTime: b.startTime,
        endTime: b.endTime,
        totalAmount: Number(b.totalAmount),
        status: b.status,
      }));

      res.json({
        success: true,
        data: formattedBookings,
      });
    } catch (error) {
      console.error("Get upcoming bookings error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch upcoming bookings",
      });
    }
  }

  static async getRecentActivity(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;

      // Get recent bookings (exclude cancelled and refunded)
      const recentBookings = await prisma.booking.findMany({
        where: {
          userId,
          status: {
            notIn: ["CANCELLED", "REFUNDED"],
          },
        },
        orderBy: { createdAt: "desc" },
        take: 3,
        include: {
          court: true,
        },
      });

      // Combine and format activities
      const activities: any[] = [];

      recentBookings.forEach((booking) => {
        activities.push({
          id: booking.id,
          type: "booking",
          description: `Booked ${booking.court.name}`,
          timestamp: booking.createdAt,
          amount: Number(booking.totalAmount),
        });
      });

      // Restaurant order activities removed

      // Sort by timestamp
      activities.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      res.json({
        success: true,
        data: activities.slice(0, 10),
      });
    } catch (error) {
      console.error("Get recent activity error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch recent activity",
      });
    }
  }

  static async getNotificationCount(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;

      const count = await prisma.notification.count({
        where: {
          userId,
          isRead: false,
        },
      });

      res.json({
        success: true,
        data: count,
      });
    } catch (error) {
      console.error("Get notification count error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch notification count",
      });
    }
  }
}

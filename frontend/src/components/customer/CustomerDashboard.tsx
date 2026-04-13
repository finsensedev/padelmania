import { useQuery } from "react-query";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import type { RootState } from "src/redux/store";
import {
  Calendar,
  Clock,
  Award,
  CreditCard,
  ShoppingBag,
  ArrowRight,
  Plus,
  Star,
  Activity,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { Button } from "src/components/ui/button";
import { Badge } from "src/components/ui/badge";
import api from "src/utils/api";
import { format } from "date-fns";

interface DashboardStats {
  totalBookings: number;
  upcomingBookings: number;
  totalSpent: number;
  loyaltyPoints: number;
  membershipTier: string;
  favoriteCourtName: string | null;
  lastBookingDate: string | null;
  totalPlayingHours: number;
}

interface UpcomingBooking {
  id: string;
  bookingCode: string;
  courtName: string;
  startTime: string;
  endTime: string;
  totalAmount: number;
  status: string;
}

interface RecentActivity {
  id: string;
  type: "booking" | "order" | "payment" | "points";
  description: string;
  timestamp: string;
  amount?: number;
}

function CustomerDashboard() {
  const navigate = useNavigate();
  const { user } = useSelector((state: RootState) => state.userState);

  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
  } = useQuery<DashboardStats>({
    queryKey: ["customer-stats"],
    queryFn: async () => {
      const res = await api.get("/customer/stats");
      return res.data.data;
    },
  });

  const {
    data: upcomingBookings = [],
    isLoading: bookingsLoading,
    error: bookingsError,
  } = useQuery<UpcomingBooking[]>({
    queryKey: ["customer-upcoming-bookings"],
    queryFn: async () => {
      const res = await api.get("/customer/bookings/upcoming");
      return res.data.data || [];
    },
  });

  const {
    data: recentActivity = [],
    isLoading: activityLoading,
    error: activityError,
  } = useQuery<RecentActivity[]>({
    queryKey: ["customer-recent-activity"],
    queryFn: async () => {
      const res = await api.get("/customer/activity/recent");
      return res.data.data || [];
    },
  });

  const isLoading = statsLoading || bookingsLoading || activityLoading;
  const hasError = statsError || bookingsError || activityError;

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: "KES",
      maximumFractionDigits: 0,
    }).format(amount);

  const getMembershipColor = (tier: string) => {
    switch (tier.toUpperCase()) {
      case "PLATINUM":
        return "bg-gradient-to-br from-slate-600 to-slate-700 text-white";
      case "GOLD":
        return "bg-gradient-to-br from-yellow-500 to-yellow-600 text-white";
      case "SILVER":
        return "bg-gradient-to-br from-gray-400 to-gray-500 text-white";
      case "BRONZE":
        return "bg-gradient-to-b from-amber-600 to-amber-700 text-white";
      default:
        return "bg-gradient-to-br from-blue-500 to-blue-600 text-white";
    }
  };

  if (isLoading) {
    return (
      <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 bg-background flex flex-col h-full overflow-auto">
        <div className="animate-pulse">
          {/* Welcome Header Skeleton */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div className="space-y-2">
              <div className="h-8 sm:h-10 bg-muted rounded w-48" />
              <div className="h-4 bg-muted rounded w-64" />
            </div>
            <div className="h-12 bg-muted rounded w-full sm:w-40" />
          </div>

          {/* Membership Card Skeleton */}
          <div className="h-40 sm:h-48 bg-gradient-to-br from-muted to-muted/50 rounded-lg mb-6" />

          {/* Stats Grid Skeleton */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 sm:h-32 bg-muted rounded-lg" />
            ))}
          </div>

          {/* Main Content Grid Skeleton */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6">
            {/* Upcoming Bookings Skeleton */}
            <div className="xl:col-span-2">
              <div className="bg-card border border-border rounded-lg p-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="h-6 bg-muted rounded w-40" />
                  <div className="h-8 bg-muted rounded w-20" />
                </div>
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-4 p-4 border border-border rounded-lg"
                    >
                      <div className="w-12 h-12 bg-muted rounded-lg flex-shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-muted rounded w-32" />
                        <div className="h-3 bg-muted rounded w-40" />
                      </div>
                      <div className="space-y-2 text-right">
                        <div className="h-4 bg-muted rounded w-20" />
                        <div className="h-5 bg-muted rounded w-16" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Recent Activity Skeleton */}
            <div className="bg-card border border-border rounded-lg p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="h-6 bg-muted rounded w-32" />
                <div className="w-4 h-4 bg-muted rounded" />
              </div>
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-muted rounded-full flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-muted rounded w-full" />
                      <div className="h-3 bg-muted rounded w-24" />
                    </div>
                    <div className="h-4 bg-muted rounded w-16" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="text-center max-w-md w-full">
          <p className="text-muted-foreground mb-4">
            Failed to load dashboard data. Please try again.
          </p>
          <Button
            onClick={() => window.location.reload()}
            className="w-full sm:w-auto touch-manipulation h-11"
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 bg-background min-h-full overflow-y-auto">
      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
            Welcome, {user?.firstName}!
          </h1>
        </div>
        <Button
          onClick={() => navigate("/customer/book-court")}
          size="lg"
          className="bg-primary hover:bg-primary/90 w-full sm:w-auto touch-manipulation h-12"
        >
          <Plus className="mr-2 h-5 w-5" />
          Book a Court
        </Button>
      </div>

      {/* Membership Card */}
      <Card
        className={`${getMembershipColor(
          stats?.membershipTier || "BRONZE"
        )} shadow-lg border-0`}
      >
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-3 flex-1">
              <div className="flex items-center gap-2">
                <Award className="h-6 w-6 text-white" />
                <span className="text-lg sm:text-xl font-bold text-white">
                  {stats?.membershipTier || "BRONZE"} Member
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:flex sm:items-center sm:gap-6">
                <div>
                  <p className="text-sm font-semibold text-white/90">
                    Loyalty Points
                  </p>
                  <p className="text-xl sm:text-2xl font-bold text-white">
                    {stats?.loyaltyPoints || 0} pts
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-white/90">
                    Total Hours Played
                  </p>
                  <p className="text-xl sm:text-2xl font-bold text-white">
                    {stats?.totalPlayingHours || 0}h
                  </p>
                </div>
              </div>
            </div>
            <Button
              variant="secondary"
              onClick={() => navigate("/customer/loyalty")}
              className="bg-white/20 hover:bg-white/30 border-0 text-white font-bold w-full sm:w-auto touch-manipulation h-11 flex-shrink-0"
            >
              View Benefits
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Bookings Card */}
        <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all duration-300">
          <CardHeader className="pb-2 sm:pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs sm:text-sm font-bold text-white">
                Total Bookings
              </CardTitle>
              <div className="p-1.5 sm:p-2 rounded-lg bg-white/20 flex-shrink-0">
                <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-1">
              {stats?.totalBookings || 0}
            </p>
            <p className="text-xs font-medium text-white/90">
              All time bookings
            </p>
          </CardContent>
        </Card>

        {/* Upcoming Games Card */}
        <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-cyan-500 to-cyan-600 text-white shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all duration-300">
          <CardHeader className="pb-2 sm:pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs sm:text-sm font-bold text-white">
                Upcoming Games
              </CardTitle>
              <div className="p-1.5 sm:p-2 rounded-lg bg-white/20 flex-shrink-0">
                <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-1">
              {stats?.upcomingBookings || 0}
            </p>
            <p className="text-xs font-medium text-white/90">
              Scheduled this week
            </p>
          </CardContent>
        </Card>

        {/* Total Spent Card */}
        <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-green-500 to-green-600 text-white shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all duration-300">
          <CardHeader className="pb-2 sm:pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs sm:text-sm font-bold text-white">
                Total Spent
              </CardTitle>
              <div className="p-1.5 sm:p-2 rounded-lg bg-white/20 flex-shrink-0">
                <CreditCard className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xl sm:text-2xl md:text-3xl font-bold text-white mb-1 break-words">
              {formatCurrency(stats?.totalSpent || 0)}
            </p>
            <p className="text-xs font-medium text-white/90">Lifetime value</p>
          </CardContent>
        </Card>

        {/* Favorite Court Card */}
        <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all duration-300">
          <CardHeader className="pb-2 sm:pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs sm:text-sm font-bold text-white">
                Favorite Court
              </CardTitle>
              <div className="p-1.5 sm:p-2 rounded-lg bg-white/20 flex-shrink-0">
                <Star className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-base sm:text-lg md:text-xl font-bold text-white mb-1 truncate">
              {stats?.favoriteCourtName || "N/A"}
            </p>
            <p className="text-xs font-medium text-white/90">
              Most booked court
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6">
        {/* Upcoming Bookings */}
        <div className="xl:col-span-2 flex flex-col">
          <Card className="flex-1 flex flex-col">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle>Upcoming Bookings</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate("/customer/bookings")}
                  className="touch-manipulation"
                >
                  View All
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              {upcomingBookings.length === 0 ? (
                <div className="text-center py-8 sm:py-12">
                  <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground mb-4">
                    No upcoming bookings
                  </p>
                  <Button
                    onClick={() => navigate("/customer/book-court")}
                    variant="outline"
                    className="touch-manipulation h-11"
                  >
                    Book Your Court
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {upcomingBookings.slice(0, 3).map((booking) => (
                    <div
                      key={booking.id}
                      className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors touch-manipulation"
                      onClick={() => navigate(`/customer/bookings`)}
                    >
                      <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Calendar className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">
                            {booking.courtName}
                          </p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Clock className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate">
                              {format(
                                new Date(booking.startTime),
                                "MMM d, h:mm a"
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <p className="font-medium text-sm sm:text-base">
                          {formatCurrency(booking.totalAmount)}
                        </p>
                        <Badge variant="outline" className="text-xs">
                          {booking.bookingCode}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        <Card className="flex flex-col">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle>Recent Activity</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="flex-1">
            <div className="space-y-4">
              {recentActivity.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No recent activity</p>
                </div>
              ) : (
                recentActivity.slice(0, 5).map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-start gap-3 touch-manipulation"
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        activity.type === "booking"
                          ? "bg-blue-100 text-blue-600"
                          : activity.type === "order"
                          ? "bg-green-100 text-green-600"
                          : activity.type === "points"
                          ? "bg-yellow-100 text-yellow-600"
                          : "bg-purple-100 text-purple-600"
                      }`}
                    >
                      {activity.type === "booking" ? (
                        <Calendar className="h-4 w-4" />
                      ) : activity.type === "order" ? (
                        <ShoppingBag className="h-4 w-4" />
                      ) : activity.type === "points" ? (
                        <Star className="h-4 w-4" />
                      ) : (
                        <CreditCard className="h-4 w-4" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-relaxed">
                        {activity.description}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(activity.timestamp), "MMM d, h:mm a")}
                      </p>
                    </div>
                    {activity.amount && (
                      <span className="text-sm font-medium flex-shrink-0">
                        {formatCurrency(activity.amount)}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default CustomerDashboard;

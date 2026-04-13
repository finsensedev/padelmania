/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useQuery } from "react-query";
import {
  Trophy,
  Star,
  Gift,
  TrendingUp,
  Clock,
  Award,
  Zap,
  ArrowUp,
  ArrowDown,
  Info,
  AlertCircle,
  Loader2,
} from "lucide-react";
import {
  format,
  formatDistanceToNow,
  differenceInDays,
  differenceInMonths,
} from "date-fns";
import { Card, CardContent, CardHeader } from "src/components/ui/card";

import { Progress } from "src/components/ui/progress";
import { Button } from "src/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "src/components/ui/tabs";
import { Skeleton } from "src/components/ui/skeleton";
import api from "src/utils/api";
import useNotification from "src/hooks/useNotification";
import ReferralSection from "src/components/customer/ReferralSection";
import {
  redeemPointsForGiftCard,
  getActiveLoyaltyConfig,
} from "src/services/loyalty-config.service";
import type { LoyaltyConfig } from "src/services/loyalty-config.service";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";

interface PointsTransaction {
  id: string;
  points: number;
  type: "EARNED" | "REDEEMED" | "EXPIRED" | "BONUS" | "ADJUSTMENT";
  description: string;
  referenceId?: string;
  createdAt: string;
  expiresAt?: string;
  balance?: number;
}

interface LoyaltyStats {
  totalPoints: number;
  availablePoints: number;
  pendingPoints: number;
  expiringSoon: number;
  earliestExpiryDate: string | null;
  lifetimePoints: number;
  currentTier: string;
  nextTier: string;
  pointsToNextTier: number;
  tierProgress: number;
}

// Helper function to calculate precise time remaining
function getTimeRemaining(expiryDate: string | Date): string {
  const now = new Date();
  const expiry = new Date(expiryDate);

  const totalDays = differenceInDays(expiry, now);

  if (totalDays < 0) return "Expired";
  if (totalDays === 0) return "Today";
  if (totalDays === 1) return "1 day";

  const months = differenceInMonths(expiry, now);
  const remainingDaysAfterMonths = totalDays - months * 30;
  const weeks = Math.floor(remainingDaysAfterMonths / 7);
  const days = remainingDaysAfterMonths % 7;

  const parts: string[] = [];
  if (months > 0) parts.push(`${months} month${months > 1 ? "s" : ""}`);
  if (weeks > 0) parts.push(`${weeks} week${weeks > 1 ? "s" : ""}`);
  if (days > 0 && months === 0) parts.push(`${days} day${days > 1 ? "s" : ""}`);

  return parts.join(", ");
}

function LoyaltyPoints() {
  const { toaster } = useNotification();
  const [selectedTab, setSelectedTab] = useState("overview");
  const [filter, setFilter] = useState<
    "all" | "earned" | "redeemed" | "expired"
  >("all");
  const [redeemDialogOpen, setRedeemDialogOpen] = useState(false);
  const [pointsToRedeem, setPointsToRedeem] = useState("");
  const [isRedeeming, setIsRedeeming] = useState(false);

  // Fetch loyalty stats
  const {
    data: stats,
    isLoading: statsLoading,
    isError: statsError,
    refetch: refetchStats,
  } = useQuery<LoyaltyStats>(
    "loyaltyStats",
    async () => {
      const response = await api.get("/loyalty/stats");
      return response.data.data;
    },
    {
      onError: () => {
        toaster("Failed to load loyalty stats", { variant: "error" });
      },
    }
  );

  // Fetch points history
  const {
    data: transactions,
    isLoading: transactionsLoading,
    isError: transactionsError,
  } = useQuery<PointsTransaction[]>(
    ["loyaltyHistory", filter],
    async () => {
      const params = filter !== "all" ? `?type=${filter.toUpperCase()}` : "";
      const response = await api.get(`/loyalty/history${params}`);
      return response.data.data;
    },
    {
      onError: () => {
        toaster("Failed to load points history", { variant: "error" });
      },
    }
  );

  // Fetch loyalty config
  const { data: loyaltyConfig } = useQuery<LoyaltyConfig>(
    "loyaltyConfig",
    getActiveLoyaltyConfig
  );

  // Handle redeem points
  const handleRedeem = async () => {
    const points = parseInt(pointsToRedeem);

    if (!points || points <= 0) {
      toaster("Please enter a valid amount of points", { variant: "error" });
      return;
    }

    if (!loyaltyConfig) {
      toaster("Configuration not loaded", { variant: "error" });
      return;
    }

    if (points < loyaltyConfig.minimumRedeemablePoints) {
      toaster(
        `Minimum ${loyaltyConfig.minimumRedeemablePoints} points required`,
        { variant: "error" }
      );
      return;
    }

    if (!stats || points > stats.availablePoints) {
      toaster("Insufficient points", { variant: "error" });
      return;
    }

    try {
      setIsRedeeming(true);
      const response = await redeemPointsForGiftCard(points);

      toaster(
        `Successfully redeemed ${points} points! Gift card code: ${response.data.giftCard.code}`,
        { variant: "success" }
      );

      setRedeemDialogOpen(false);
      setPointsToRedeem("");
      refetchStats();
    } catch (error: any) {
      toaster(error?.response?.data?.message || "Failed to redeem points", {
        variant: "error",
      });
    } finally {
      setIsRedeeming(false);
    }
  };

  const getTierColor = (tier: string) => {
    switch (tier?.toUpperCase()) {
      case "VIP":
        return "bg-gradient-to-br from-purple-600 to-pink-600";
      case "PLATINUM":
        return "bg-gradient-to-br from-cyan-500 to-blue-500";
      case "GOLD":
        return "bg-gradient-to-br from-yellow-500 to-orange-500";
      case "SILVER":
        return "bg-gradient-to-br from-gray-400 to-gray-500";
      case "BRONZE":
        return "bg-gradient-to-br from-amber-600 to-orange-700";
      default:
        return "bg-gradient-to-br from-gray-500 to-gray-600";
    }
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case "EARNED":
        return <ArrowUp className="h-4 w-4 text-primary" />;
      case "REDEEMED":
        return <ArrowDown className="h-4 w-4 text-destructive" />;
      case "EXPIRED":
        return <Clock className="h-4 w-4 text-muted-foreground" />;
      case "BONUS":
        return <Gift className="h-4 w-4 text-primary" />;
      case "ADJUSTMENT":
        return <Info className="h-4 w-4 text-primary" />;
      default:
        return <Star className="h-4 w-4 text-accent" />;
    }
  };

  // Show loading skeleton while stats are loading
  if (statsLoading) {
    return (
      <div className="p-6 space-y-6 bg-background min-h-screen">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader>
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-32 mt-2" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-24 w-full" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-4 w-full" />
            </CardContent>
          </Card>
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  // Show error state if stats failed to load
  if (statsError || !stats) {
    return (
      <div className="p-6 space-y-6 bg-background min-h-screen">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-destructive mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              Failed to Load Loyalty Data
            </h3>
            <p className="text-muted-foreground text-center mb-4">
              We couldn't fetch your loyalty information. Please try again.
            </p>
            <Button onClick={() => refetchStats()}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 bg-background min-h-screen">
      {/* Header with Points Balance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="lg:col-span-2 flex flex-wrap gap-2 p-4 overflow-hidden border border-border bg-card shadow-lg rounded-xl">
          <div className="flex w-full flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                Your Loyalty Points
              </h2>
              <p className="text-xs sm:text-sm font-semibold text-muted-foreground">
                Member since{" "}
                {format(new Date(Date.now() - 31536000000), "MMMM yyyy")}
              </p>
            </div>
            <div className="flex flex-col sm:items-end gap-2">
              <div className="sm:text-right">
                <div className="text-2xl sm:text-3xl font-bold text-foreground">
                  {stats.availablePoints.toLocaleString()}
                </div>
                <p className="text-xs sm:text-sm font-semibold text-muted-foreground">
                  Available Points
                </p>
              </div>
              <Button
                onClick={() => setRedeemDialogOpen(true)}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white"
                disabled={
                  !loyaltyConfig ||
                  stats.availablePoints <
                    (loyaltyConfig?.minimumRedeemablePoints || 0)
                }
              >
                <Gift className="mr-2 h-4 w-4" />
                Redeem Points
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 w-full gap-3 sm:gap-4">
            <div className="relative overflow-hidden border-0 bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg hover:shadow-xl transition-all duration-300 rounded-lg p-3">
              <div>
                <p className="text-xs sm:text-sm font-bold text-white">
                  Expiring Soon
                </p>
                <p className="text-lg sm:text-xl font-bold text-white">
                  {stats.expiringSoon.toLocaleString()}
                </p>
                {stats.earliestExpiryDate && (
                  <div className="mt-1 pt-1 border-t border-white/20">
                    <div className="flex items-center gap-1 text-white/90">
                      <Clock className="h-3 w-3" />
                      <p className="text-xs font-medium">
                        {getTimeRemaining(stats.earliestExpiryDate)} left
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="relative overflow-hidden border-0 bg-gradient-to-br from-pink-500 to-pink-600 text-white shadow-lg hover:shadow-xl transition-all duration-300 rounded-lg p-3">
              <div>
                <p className="text-xs sm:text-sm font-bold text-white">
                  Lifetime Earned
                </p>
                <p className="text-lg sm:text-xl font-bold text-white">
                  {stats.lifetimePoints.toLocaleString()}
                </p>
              </div>
            </div>
            <div
              className={`relative overflow-hidden border-0 ${getTierColor(
                stats.currentTier
              )} text-white shadow-lg hover:shadow-xl transition-all duration-300 rounded-lg p-3`}
            >
              <div>
                <p className="text-xs sm:text-sm font-bold text-white">
                  Current Tier
                </p>
                <p className="text-lg sm:text-xl font-bold text-white mt-1">
                  {stats.currentTier}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Tier Progress Card */}
        <div className="bg-card rounded-xl border border-border shadow-sm">
          <div className="p-4 sm:p-6">
            <h3 className="flex items-center gap-2 text-base sm:text-lg font-semibold">
              <Trophy className="h-4 w-4 sm:h-5 sm:w-5" />
              Tier Progress
            </h3>
          </div>
          <div className="space-y-4 p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <span
                className={`inline-block ${getTierColor(
                  stats.currentTier
                )} text-white px-2.5 py-0.5 rounded-full text-xs font-medium`}
              >
                {stats.currentTier}
              </span>
              <span className="inline-block border border-border px-2.5 py-0.5 rounded-full text-xs font-medium">
                {stats.nextTier}
              </span>
            </div>
            <Progress value={stats.tierProgress} className="h-3" />
            <p className="text-sm text-center text-muted-foreground">
              {stats.pointsToNextTier.toLocaleString()} points to{" "}
              {stats.nextTier}
            </p>
            <div className="pt-2 space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-accent" />
                <span>Earn 1 point per KES 100 spent</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs for different sections */}
      <Tabs
        value={selectedTab}
        onValueChange={setSelectedTab}
        className="space-y-4"
      >
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 h-auto">
          <TabsTrigger
            value="overview"
            className="text-xs sm:text-sm py-2 sm:py-2.5"
          >
            Overview
          </TabsTrigger>
          <TabsTrigger
            value="referrals"
            className="text-xs sm:text-sm py-2 sm:py-2.5"
          >
            <span className="hidden sm:inline">Referrals</span>
            <span className="sm:hidden">Refer</span>
          </TabsTrigger>
          <TabsTrigger
            value="history"
            className="text-xs sm:text-sm py-2 sm:py-2.5"
          >
            History
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {/* How to Earn Points Card */}
            <div className="bg-card rounded-xl border border-border shadow-sm">
              <div className="p-4 sm:p-6">
                <h3 className="text-sm sm:text-base font-semibold">
                  How to Earn Points
                </h3>
              </div>
              <div className="space-y-2 px-4 pb-4 sm:px-6 sm:pb-6">
                <div className="flex items-center justify-between text-sm">
                  <span>Bookings & Payments</span>
                  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-primary text-primary-foreground">
                    {loyaltyConfig
                      ? `${loyaltyConfig.pointsPerCurrency} pt/KES ${loyaltyConfig.currencyUnit}`
                      : "1 pt/KES 100"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>Registration Bonus</span>
                  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-green-600 text-white">
                    {loyaltyConfig
                      ? `${loyaltyConfig.registrationBonusPoints} pts`
                      : "40 pts"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>Refer a Friend</span>
                  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-blue-600 text-white">
                    {loyaltyConfig
                      ? `${loyaltyConfig.referralBonusPoints} pts`
                      : "20 pts"}
                  </span>
                </div>
              </div>
            </div>

            {/* Member Benefits Card */}
            <div className="bg-card rounded-xl border border-border shadow-sm">
              <div className="p-4 sm:p-6">
                <h3 className="text-sm sm:text-base font-semibold">
                  Member Benefits
                </h3>
              </div>
              <div className="space-y-2 px-4 pb-4 sm:px-6 sm:pb-6">
                <div className="flex items-center gap-2 text-sm">
                  <Award className="h-4 w-4 text-primary" />
                  <span>Standard court access</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Gift className="h-4 w-4 text-primary" />
                  <span>Redeem points for gift cards</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Star className="h-4 w-4 text-primary" />
                  <span>Use gift cards for bookings</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  <span>Flexible booking anytime</span>
                </div>
              </div>
            </div>

            {/* Points Expiry Card */}
            <div className="bg-card rounded-xl border border-border shadow-sm">
              <div className="p-4 sm:p-6">
                <h3 className="text-sm sm:text-base font-semibold">
                  Points Expiry
                </h3>
              </div>
              <div className="px-4 pb-4 sm:px-6 sm:pb-6">
                <div className="space-y-3">
                  <div className="flex items-start gap-2">
                    <Info className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium">
                        Points expire after 6 months
                      </p>
                      <p className="text-muted-foreground mt-1">
                        All earned points will automatically expire 6 months
                        from the date they were awarded.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-0">
          <div className="bg-card rounded-xl border border-border shadow-sm">
            <div className="p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h3 className="text-base sm:text-lg font-semibold">
                  Points History
                </h3>
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as any)}
                  className="px-3 py-2 text-xs sm:text-sm border border-border focus:outline-none focus:ring-2 focus:ring-ring rounded-lg bg-background w-full sm:w-auto"
                >
                  <option value="all">All Transactions</option>
                  <option value="earned">Earned</option>
                  <option value="redeemed">Redeemed</option>
                  <option value="expired">Expired</option>
                </select>
              </div>
            </div>
            <div className="px-4 pb-4 sm:px-6 sm:pb-6">
              {transactionsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-16 w-full bg-muted animate-pulse rounded-lg"
                    />
                  ))}
                </div>
              ) : transactionsError || !transactions ? (
                <div className="text-center py-8">
                  <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
                  <p className="text-muted-foreground">
                    Failed to load transaction history
                  </p>
                </div>
              ) : transactions.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">
                  No transactions found
                </p>
              ) : (
                <div className="space-y-3">
                  {transactions.map((transaction) => (
                    <div
                      key={transaction.id}
                      className="flex items-start sm:items-center justify-between p-3 sm:p-4 bg-muted/30 border border-border rounded-lg gap-3"
                    >
                      <div className="flex items-start sm:items-center gap-2 sm:gap-3 min-w-0 flex-1">
                        <div className="flex-shrink-0 mt-0.5 sm:mt-0">
                          {getTransactionIcon(transaction.type)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm sm:text-base truncate">
                            {transaction.description}
                          </p>
                          <p className="text-xs sm:text-sm text-muted-foreground">
                            {formatDistanceToNow(
                              new Date(transaction.createdAt),
                              { addSuffix: true }
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p
                          className={`font-semibold text-sm sm:text-base ${
                            transaction.points > 0
                              ? "text-primary"
                              : "text-destructive"
                          }`}
                        >
                          {transaction.points > 0 ? "+" : ""}
                          {transaction.points}
                        </p>
                        {transaction.balance && (
                          <p className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
                            Bal: {transaction.balance.toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Referrals Tab */}
        <TabsContent value="referrals" className="">
          <ReferralSection />
        </TabsContent>
      </Tabs>

      {/* Redeem Points Dialog */}
      <Dialog open={redeemDialogOpen} onOpenChange={setRedeemDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Gift className="w-5 h-5 text-primary" />
              Redeem Loyalty Points
            </DialogTitle>
            <DialogDescription>
              Convert your loyalty points into a gift card that can be used for
              future bookings.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Available Points Info */}
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div>
                <p className="text-sm text-muted-foreground">
                  Available Points
                </p>
                <p className="text-2xl font-bold text-foreground">
                  {stats?.availablePoints.toLocaleString() || 0}
                </p>
              </div>
              <Award className="w-10 h-10 text-primary opacity-20" />
            </div>

            {/* Points Input */}
            <div className="space-y-2">
              <Label htmlFor="points" className="text-base font-medium">
                Points to Redeem
              </Label>
              <Input
                id="points"
                type="number"
                placeholder={`Minimum ${
                  loyaltyConfig?.minimumRedeemablePoints || 100
                } points`}
                value={pointsToRedeem}
                onChange={(e) => setPointsToRedeem(e.target.value)}
                min={loyaltyConfig?.minimumRedeemablePoints || 100}
                max={stats?.availablePoints || 0}
                className="text-lg h-12"
              />
              <p className="text-xs text-muted-foreground">
                Minimum:{" "}
                {loyaltyConfig?.minimumRedeemablePoints.toLocaleString() || 0}{" "}
                points • Maximum: {stats?.availablePoints.toLocaleString() || 0}{" "}
                points
              </p>
            </div>

            {/* Gift Card Value Preview */}
            {pointsToRedeem &&
              loyaltyConfig &&
              parseInt(pointsToRedeem) >=
                (loyaltyConfig?.minimumRedeemablePoints || 0) && (
                <div className="p-6 bg-primary border-2 border-green-300 dark:border-green-700 rounded-xl shadow-lg">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-green-700 dark:text-green-400 mb-2 uppercase tracking-wide">
                        Gift Card Value
                      </p>
                      <p className="text-4xl font-extrabold text-green-900 dark:text-green-50 tracking-tight">
                        {(
                          parseInt(pointsToRedeem) *
                          loyaltyConfig.pointsToGiftCardRatio
                        ).toLocaleString()}
                        <span className="text-2xl ml-2 font-bold">KES</span>
                      </p>
                    </div>
                    <div className="text-6xl animate-pulse">🎁</div>
                  </div>
                </div>
              )}

            {/* Validation Message */}
            {pointsToRedeem &&
              loyaltyConfig &&
              parseInt(pointsToRedeem) <
                (loyaltyConfig?.minimumRedeemablePoints || 0) && (
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <p className="text-sm text-amber-800 dark:text-amber-200 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Minimum {loyaltyConfig?.minimumRedeemablePoints} points
                    required
                  </p>
                </div>
              )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setRedeemDialogOpen(false);
                setPointsToRedeem("");
              }}
              className="flex-1 sm:flex-none"
            >
              Cancel
            </Button>
            <Button
              onClick={handleRedeem}
              disabled={
                isRedeeming ||
                !pointsToRedeem ||
                parseInt(pointsToRedeem) <
                  (loyaltyConfig?.minimumRedeemablePoints || 0) ||
                parseInt(pointsToRedeem) > (stats?.availablePoints || 0)
              }
              className="flex-1 sm:flex-none"
            >
              {isRedeeming ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Redeeming...
                </>
              ) : (
                <>
                  <Gift className="mr-2 h-4 w-4" />
                  Redeem Now
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default LoyaltyPoints;

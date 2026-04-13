import { useQuery } from "react-query";
import {
  Copy,
  Users,
  Gift,
  CheckCircle,
  Clock,
  Link as LinkIcon,
} from "lucide-react";
import useNotification from "../../hooks/useNotification";
import { format } from "date-fns";
import referralService from "../../services/referral.service";
import type { ReferralHistoryItem } from "../../services/referral.service";

function ReferralSection() {
  const { toaster } = useNotification();

  // Fetch referral link (code is generated in background for tracking)
  const {
    data: referralData,
    isLoading: codeLoading,
    isError: codeError,
  } = useQuery("referralCode", () => referralService.getReferralCode(), {
    onError: () => {
      toaster("Failed to load referral link", { variant: "error" });
    },
  });

  // Fetch referral stats
  const {
    data: stats,
    isLoading: statsLoading,
    isError: statsError,
  } = useQuery("referralStats", () => referralService.getReferralStats(), {
    onError: () => {
      toaster("Failed to load referral statistics", { variant: "error" });
    },
  });

  // Fetch referral history
  const {
    data: history,
    isLoading: historyLoading,
    isError: historyError,
  } = useQuery("referralHistory", () => referralService.getReferralHistory(), {
    onError: () => {
      toaster("Failed to load referral history", { variant: "error" });
    },
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toaster(`${label} copied to clipboard!`, { variant: "success" });
  };

  const getStatusBadge = (status: string) => {
    const baseClasses =
      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium";

    switch (status) {
      case "COMPLETED":
        return (
          <span className={`${baseClasses} bg-primary text-primary-foreground`}>
            <CheckCircle className="h-3 w-3 mr-1" />
            Completed
          </span>
        );
      case "PENDING":
        return (
          <span className={`${baseClasses} border border-border text-accent`}>
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </span>
        );
      case "EXPIRED":
        return (
          <span
            className={`${baseClasses} bg-secondary text-secondary-foreground`}
          >
            Expired
          </span>
        );
      case "CANCELLED":
        return (
          <span
            className={`${baseClasses} bg-destructive text-destructive-foreground`}
          >
            Cancelled
          </span>
        );
      default:
        return (
          <span className={`${baseClasses} border border-border`}>
            {status}
          </span>
        );
    }
  };

  if (codeError || statsError) {
    return (
      <div className="bg-card text-card-foreground rounded-xl border border-border shadow-sm">
        <div className="flex flex-col items-center justify-center py-12 px-6">
          <p className="text-destructive">
            Failed to load referral information
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {/* Referral Link Card */}
      <div className="bg-gradient-to-br from-primary/10 via-accent/10 to-primary/5 rounded-xl border border-border shadow-sm">
        <div className="p-4 sm:p-6 space-y-1.5">
          <h3 className="text-base sm:text-lg font-semibold flex items-center gap-2">
            <Gift className="h-5 w-5 text-primary" />
            Your Referral Link
          </h3>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Share your link and earn 100 points when friends complete their
            first booking!
          </p>
        </div>
        <div className="space-y-3 p-4 sm:p-6 sm:pt-0 pt-0">
          {codeLoading ? (
            <div className="h-16 w-full bg-muted animate-pulse rounded-lg" />
          ) : (
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1 flex items-center gap-2 bg-background border-2 border-primary/20 rounded-lg px-3 py-3 text-sm">
                <LinkIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="truncate text-foreground font-medium">
                  {referralData?.referralLink}
                </span>
              </div>
              <button
                onClick={() =>
                  copyToClipboard(
                    referralData?.referralLink || "",
                    "Referral link"
                  )
                }
                className="w-full sm:w-auto inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-3 text-sm font-medium transition-colors shadow-sm hover:shadow-md"
              >
                <Copy className="h-4 w-4 mr-2" />
                Copy Link
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {statsLoading ? (
          <>
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="bg-card rounded-xl border border-border shadow-sm"
              >
                <div className="p-3 sm:p-4">
                  <div className="h-16 w-full bg-muted animate-pulse rounded-lg" />
                </div>
              </div>
            ))}
          </>
        ) : (
          <>
            <div className="bg-card rounded-xl border border-border shadow-sm">
              <div className="p-3 sm:p-4">
                <div className="flex flex-col space-y-1.5">
                  <span className="text-xs sm:text-sm text-muted-foreground">
                    Total Referrals
                  </span>
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    <span className="text-2xl sm:text-3xl font-bold">
                      {stats?.totalReferrals || 0}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-card rounded-xl border border-border shadow-sm">
              <div className="p-3 sm:p-4">
                <div className="flex flex-col space-y-1.5">
                  <span className="text-xs sm:text-sm text-muted-foreground">
                    Pending
                  </span>
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-accent" />
                    <span className="text-2xl sm:text-3xl font-bold">
                      {stats?.pendingReferrals || 0}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-card rounded-xl border border-border shadow-sm">
              <div className="p-3 sm:p-4">
                <div className="flex flex-col space-y-1.5">
                  <span className="text-xs sm:text-sm text-muted-foreground">
                    Completed
                  </span>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-primary" />
                    <span className="text-2xl sm:text-3xl font-bold">
                      {stats?.completedReferrals || 0}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-primary/10 to-accent/10 rounded-xl border border-border shadow-sm">
              <div className="p-3 sm:p-4">
                <div className="flex flex-col space-y-1.5">
                  <span className="text-xs sm:text-sm text-muted-foreground">
                    Points Earned
                  </span>
                  <div className="flex items-center gap-2">
                    <Gift className="h-5 w-5 text-primary" />
                    <span className="text-2xl sm:text-3xl font-bold text-primary">
                      {stats?.totalPointsEarned || 0}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Referral History */}
      <div className="bg-card rounded-xl border border-border shadow-sm">
        <div className="p-4 sm:p-6 pb-0 sm:pb-0 space-y-1.5">
          <h3 className="text-base sm:text-lg font-semibold">
            Referral History
          </h3>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Track your referrals and their status
          </p>
        </div>
        <div className="p-4 sm:p-6">
          {historyLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-20 w-full bg-muted animate-pulse rounded-lg"
                />
              ))}
            </div>
          ) : historyError ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Failed to load history
            </p>
          ) : !history || history.length === 0 ? (
            <div className="text-center py-8">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                No referrals yet. Share your code to start earning rewards!
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((referral: ReferralHistoryItem) => (
                <div
                  key={referral.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 sm:p-4 bg-muted/30 border border-border rounded-lg hover:shadow-md transition-shadow"
                >
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm sm:text-base">
                        {referral.referredUser?.name || "Unknown User"}
                      </p>
                      {getStatusBadge(referral.status)}
                    </div>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      {referral.referredUser?.email || "No email"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Joined{" "}
                      {format(new Date(referral.createdAt), "MMM d, yyyy")}
                    </p>
                  </div>
                  <div className="flex items-center justify-between sm:flex-col sm:items-end gap-2">
                    {referral.status === "COMPLETED" && (
                      <>
                        <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                          +{referral.pointsAwarded} pts
                        </span>
                        {referral.completedAt && (
                          <p className="text-xs text-muted-foreground">
                            {format(
                              new Date(referral.completedAt),
                              "MMM d, yyyy"
                            )}
                          </p>
                        )}
                      </>
                    )}
                    {referral.status === "PENDING" && (
                      <p className="text-xs text-accent">
                        Waiting for first booking
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* How It Works Card */}
      <div className="bg-card rounded-xl border border-border shadow-sm">
        <div className="p-4 pb-0 sm:pb-0 sm:p-6 ">
          <h3 className="text-base sm:text-lg font-semibold">How It Works</h3>
        </div>
        <div className="space-y-3 p-4 sm:p-6">
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
              1
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm sm:text-base mb-1">
                Share Your Link
              </p>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Copy your referral link and share it with friends via any
                platform
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
              2
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm sm:text-base mb-1">
                Friend Signs Up
              </p>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Your friend clicks your link and registers for a new account
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
              3
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm sm:text-base mb-1">
                First Booking Completed
              </p>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Once your friend completes their first booking, you earn 100
                loyalty points!
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ReferralSection;

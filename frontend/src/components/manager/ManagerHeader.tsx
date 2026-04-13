import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { useQuery } from "react-query";
import {
  Bell,
  Settings,
  LogOut,
  ChevronDown,
  Clock,
  Calendar,
  Info,
  Users,
  CreditCard,
  Target,
  DollarSign,
} from "lucide-react";
import { useSelector } from "react-redux";
import type { RootState } from "src/redux/store";
import { AuthService } from "src/services/authService";
import { dashboardService } from "src/services/dashboard.service";
import { useManagerDashboard } from "src/hooks/useManagerDashboard";
import ConfirmLogout from "src/components/ConfirmLogout";
import useModal from "src/hooks/useModal";

interface Notification {
  id: string;
  type: "booking" | "payment" | "system" | "customer";
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  priority: "low" | "medium" | "high";
  actionUrl?: string;
}

interface QuickStat {
  label: string;
  value: string | number;
  change: number;
  icon: React.ReactNode;
  color: string;
}

export default function ManagerHeader() {
  const { user } = useSelector((state: RootState) => state.userState);
  const authService = AuthService.getInstance();
  const navigate = useNavigate();
  const { pushModal } = useModal();
  const { range, selectedCourt, customFrom, customTo } = useManagerDashboard();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);

  const [currentTime, setCurrentTime] = useState(new Date());

  const profileRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);

  // Fetch manager stats - sync with dashboard filters
  const { data: stats } = useQuery(
    ["manager-header-stats", range, selectedCourt, customFrom, customTo],
    () => {
      const court = selectedCourt === "all" ? undefined : selectedCourt;
      if (range === "CUSTOM") {
        return dashboardService.getStats(
          court,
          "CUSTOM",
          undefined,
          customFrom,
          customTo,
        );
      }
      return dashboardService.getStats(court, range);
    },
    {
      enabled:
        range !== "CUSTOM" ||
        !!(customFrom && customTo && customFrom <= customTo),
      refetchInterval: 60000,
      staleTime: 30000,
    },
  );

  // Fetch recent activities for notifications
  const { data: activities } = useQuery(
    ["manager-header-activities"],
    () => dashboardService.getRecentActivities(),
    {
      refetchInterval: 30000,
    },
  );

  // Convert activities to notifications
  const notifications: Notification[] = useMemo(
    () =>
      activities
        ? activities.slice(0, 5).map((activity) => ({
            id: activity.id,
            type: activity.type as
              | "booking"
              | "payment"
              | "system"
              | "customer",
            title: activity.title,
            message: activity.description,
            timestamp: activity.time,
            read: Boolean(activity.read),
            priority: "medium" as const,
          }))
        : [],
    [activities],
  );

  const [notificationReadStatus, setNotificationReadStatus] = useState<
    Record<string, boolean>
  >({});

  // sync read status from server activities on load/update
  useEffect(() => {
    if (notifications.length) {
      setNotificationReadStatus((prev) => {
        const next = { ...prev };
        notifications.forEach((n) => {
          if (n.read) next[n.id] = true;
        });
        return next;
      });
    }
  }, [activities, notifications]);

  // Get period label based on selected range
  const getPeriodLabel = () => {
    switch (range) {
      case "DAY":
        return "Today";
      case "WEEK":
        return "This Week";
      case "MONTH":
        return "This Month";
      case "YEAR":
        return "This Year";
      default:
        return "Today";
    }
  };

  // Quick stats for header bar
  const quickStats: QuickStat[] = stats
    ? [
        {
          label: `${getPeriodLabel()}'s Bookings`,
          value: stats.periodSummary?.bookings.total || 0,
          change: 0,
          icon: <Calendar className="w-4 h-4" />,
          color: "text-blue-500",
        },
        {
          label: `Revenue ${getPeriodLabel()}`,
          value: `KSh ${(
            stats.periodSummary?.revenue.total || 0
          ).toLocaleString()}`,
          change: 0,
          icon: <DollarSign className="w-4 h-4" />,
          color: "text-primary",
        },
        {
          label: "Court Utilization",
          value: `${(stats.periodSummary?.courts.utilizationPct || 0).toFixed(
            1,
          )}%`,
          change: 0,
          icon: <Target className="w-4 h-4" />,
          color: "text-orange-500",
        },
        {
          label: "Active Customers",
          value: stats.periodSummary?.customers.activeVerified || 0,
          change: 0,
          icon: <Users className="w-4 h-4" />,
          color: "text-green-500",
        },
      ]
    : [];

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Click outside handlers
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        profileRef.current &&
        !profileRef.current.contains(event.target as Node)
      ) {
        setIsProfileOpen(false);
      }
      if (
        notificationRef.current &&
        !notificationRef.current.contains(event.target as Node)
      ) {
        setIsNotificationOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      await authService.logout();
      navigate("/login");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const openLogoutModal = () => {
    pushModal(<ConfirmLogout onSubmit={handleLogout} />);
  };

  const markNotificationAsRead = async (id: string, type: string) => {
    // optimistic update
    setNotificationReadStatus((prev) => ({ ...prev, [id]: true }));
    try {
      await dashboardService.markActivityRead(type, id);
    } catch {
      // rollback if failed
      setNotificationReadStatus((prev) => {
        const clone = { ...prev };
        delete clone[id];
        return clone;
      });
    }
  };

  const markAllAsRead = async () => {
    // optimistic
    const allRead = notifications.reduce(
      (acc, notif) => {
        acc[notif.id] = true;
        return acc;
      },
      {} as Record<string, boolean>,
    );
    setNotificationReadStatus(allRead);
    try {
      await dashboardService.markAllActivitiesRead();
    } catch {
      // refetch activities to restore accurate state
      // simplest: reset local (will be re-synced by useEffect upon react-query refetch interval)
    }
  };

  const unreadCount = notifications.filter(
    (n) => !notificationReadStatus[n.id],
  ).length;

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "booking":
        return <Calendar className="w-4 h-4" />;
      case "payment":
        return <CreditCard className="w-4 h-4" />;
      case "customer":
        return <Users className="w-4 h-4" />;
      case "system":
        return <Settings className="w-4 h-4" />;
      default:
        return <Info className="w-4 h-4" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "bg-destructive/10 text-destructive border-destructive/20";
      case "medium":
        return "bg-accent/10 text-accent-foreground border-accent/20";
      case "low":
        return "bg-primary/10 text-primary border-primary/20";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  };

  return (
    <>
      <header className="bg-background border-b border-border sticky top-0 z-40 shadow-sm">
        {/* Top Bar - Quick Stats - Hidden on mobile, visible on md+ */}
        {stats && (
          <div className="hidden md:block bg-muted/50 px-4 md:px-6 py-2 border-b border-border/50">
            <div className="flex items-center justify-between gap-4">
              {/* Stats - Scrollable on tablet */}
              <div className="flex items-center gap-4 lg:gap-6 overflow-x-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent pb-1">
                {quickStats.map((stat, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 flex-shrink-0 px-2 py-1 rounded-md hover:bg-muted/50 transition-colors"
                  >
                    <div
                      className={`${stat.color} p-1 rounded-md bg-background`}
                    >
                      {stat.icon}
                    </div>
                    <div className="text-xs lg:text-sm">
                      <span className="text-muted-foreground hidden lg:inline">
                        {stat.label}:
                      </span>
                      <span className="ml-1 font-semibold text-foreground">
                        {stat.value}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Clock - Responsive */}
              <div className="flex items-center gap-2 text-xs lg:text-sm text-muted-foreground flex-shrink-0 pl-2 border-l border-border">
                <Clock className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                <span className="font-mono">
                  {currentTime.toLocaleTimeString("en-US", {
                    hour12: false,
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
                <span className="mx-1 hidden lg:inline">|</span>
                <Calendar className="w-3.5 h-3.5 lg:w-4 lg:h-4 hidden lg:inline" />
                <span className="hidden lg:inline">
                  {currentTime.toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Main Header */}
        <div className="px-3 md:px-6 py-3 md:py-4">
          <div className="flex items-center justify-between gap-2 md:gap-4">
            {/* Left Section */}
            <div className="flex items-center gap-2 md:gap-4 min-w-0 flex-1">
              {/* Spacer for mobile menu button */}
              <div className="w-11 md:hidden flex-shrink-0" />

              {/* Logo/Brand */}
              <div className="flex items-center gap-2 md:gap-3 min-w-0">
                <div className="w-8 h-8 md:w-10 md:h-10 bg-primary rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm">
                  <span className="text-primary-foreground font-bold text-sm md:text-lg">
                    TP
                  </span>
                </div>
                <div className="hidden sm:block min-w-0">
                  <h1 className="text-base md:text-xl font-bold text-foreground truncate">
                    Padel Mania
                  </h1>
                  <p className="text-xs text-muted-foreground truncate">
                    Manager Dashboard
                  </p>
                </div>
              </div>
            </div>

            {/* Right Section - Actions */}
            <div className="flex items-center gap-2 md:gap-3">
              {/* Notifications */}
              <div ref={notificationRef} className="relative">
                <button
                  onClick={() => setIsNotificationOpen(!isNotificationOpen)}
                  className="p-2 md:p-2.5 rounded-lg hover:bg-muted active:scale-95 transition-all relative"
                  title="Notifications"
                  aria-label="Notifications"
                >
                  <Bell className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-destructive text-destructive-foreground text-[10px] md:text-xs rounded-full flex items-center justify-center font-semibold shadow-sm">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </button>

                {/* Notification Dropdown - Responsive */}
                {isNotificationOpen && (
                  <div className="fixed md:absolute right-2 md:right-0 top-16 md:top-full md:mt-2 w-[calc(100vw-1rem)] max-w-sm md:w-80 bg-background rounded-lg shadow-xl border border-border py-2 max-h-[70vh] md:max-h-96 overflow-y-auto z-50">
                    <div className="px-3 md:px-4 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-sm md:text-base text-foreground">
                          Notifications
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {unreadCount} unread
                        </p>
                      </div>
                      <button
                        onClick={markAllAsRead}
                        className="text-xs text-primary hover:text-primary/80 whitespace-nowrap"
                      >
                        Mark all read
                      </button>
                    </div>
                    <div className="py-1 md:py-2">
                      {notifications.length > 0 ? (
                        notifications.map((notification) => (
                          <div
                            key={notification.id}
                            className={`px-3 md:px-4 py-2.5 md:py-3 hover:bg-muted cursor-pointer border-l-4 transition-all ${
                              !notificationReadStatus[notification.id]
                                ? "border-primary bg-primary/5"
                                : "border-transparent"
                            }`}
                            onClick={() => {
                              markNotificationAsRead(
                                notification.id,
                                notification.type,
                              );
                            }}
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className={`p-1.5 rounded-lg flex-shrink-0 ${getPriorityColor(
                                  notification.priority,
                                )}`}
                              >
                                {getNotificationIcon(notification.type)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-foreground truncate">
                                      {notification.title}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                      {notification.message}
                                    </p>
                                  </div>
                                  {!notificationReadStatus[notification.id] && (
                                    <span className="w-2 h-2 bg-primary rounded-full flex-shrink-0 mt-1"></span>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground/60 mt-1.5">
                                  {formatDistanceToNow(notification.timestamp, {
                                    addSuffix: true,
                                  })}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="px-4 py-8 text-center text-muted-foreground">
                          <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">No notifications</p>
                        </div>
                      )}
                    </div>
                    <div className="px-4 py-2 border-t border-border">
                      <button
                        className="text-xs text-primary hover:underline"
                        onClick={() => {
                          navigate("/manager/notifications");
                          setIsNotificationOpen(false);
                        }}
                      >
                        View all notifications
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Profile Dropdown */}
              <div ref={profileRef} className="relative">
                <button
                  onClick={() => setIsProfileOpen(!isProfileOpen)}
                  className="flex items-center gap-1.5 md:gap-2 p-1.5 md:p-2 rounded-lg hover:bg-muted active:scale-95 transition-all"
                  aria-label="User menu"
                >
                  <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center shadow-sm border-2 border-primary/20">
                    <span className="text-primary-foreground font-semibold text-xs md:text-sm">
                      {user?.firstName?.charAt(0)?.toUpperCase() || "M"}
                    </span>
                  </div>
                  <div className="hidden lg:block text-left">
                    <p className="text-sm font-medium text-foreground truncate max-w-[120px]">
                      {user?.firstName} {user?.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground">Manager</p>
                  </div>
                  <ChevronDown className="hidden md:block w-4 h-4 text-muted-foreground" />
                </button>

                {/* Profile Dropdown - Responsive */}
                {isProfileOpen && (
                  <div className="fixed md:absolute right-2 md:right-0 top-16 md:top-full md:mt-2 w-56 bg-background rounded-lg shadow-xl border border-border py-2 z-50">
                    <div className="px-4 py-3 border-b border-border bg-muted/30">
                      <p className="font-semibold text-sm text-foreground truncate">
                        {user?.firstName} {user?.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {user?.email}
                      </p>
                    </div>
                    <div className="py-1">
                      <button
                        className="w-full px-4 py-2.5 text-left hover:bg-muted active:bg-muted/80 flex items-center gap-3 transition-colors group"
                        onClick={() => {
                          navigate("/manager/settings");
                          setIsProfileOpen(false);
                        }}
                      >
                        <Settings className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                        <span className="text-sm font-medium">Preferences</span>
                      </button>
                    </div>
                    <div className="py-1 border-t border-border">
                      <button
                        onClick={openLogoutModal}
                        className="w-full px-4 py-2.5 text-left hover:bg-destructive/10 active:bg-destructive/20 flex items-center gap-3 text-destructive transition-colors group"
                      >
                        <LogOut className="w-4 h-4 group-hover:scale-110 transition-transform" />
                        <span className="text-sm font-medium">Sign Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>
    </>
  );
}

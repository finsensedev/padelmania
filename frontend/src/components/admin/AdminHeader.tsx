/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { useQuery } from "react-query";
import {
  Bell,
  Search,
  Settings,
  LogOut,
  ChevronDown,
  Clock,
  Calendar,
  Info,
  Users,
  ShoppingBag,
  CreditCard,
} from "lucide-react";
import { useSelector } from "react-redux";
import type { RootState } from "src/redux/store";
import { AuthService } from "src/services/authService";
import { dashboardService } from "src/services/dashboard.service";
import { usePermissions } from "src/hooks/usePermissions";
import ConfirmLogout from "src/components/ConfirmLogout";
import useModal from "src/hooks/useModal";

interface Notification {
  id: string;
  type: "booking" | "order" | "payment" | "system" | "staff";
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

interface AdminHeaderProps {
  title?: string;
  subtitle?: string;
}

export default function AdminHeader({
  title = "Padel Mania",
  subtitle = "Admin Dashboard",
}: AdminHeaderProps = {}) {
  const { user } = useSelector((state: RootState) => state.userState);
  const authService = AuthService.getInstance();
  const navigate = useNavigate();
  const { pushModal } = useModal();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [currentTime, setCurrentTime] = useState(new Date());

  const profileRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);

  const { role, has } = usePermissions();
  // Determine if current user should see admin stats (role or permission check)
  const canViewAdminMetrics = role === "SUPER_ADMIN" || has("dashboard.view");

  // Fetch real-time stats (only if allowed)
  const { data: stats } = useQuery(
    ["header-stats"],
    () => dashboardService.getStats(),
    {
      enabled: canViewAdminMetrics,
      refetchInterval: canViewAdminMetrics ? 60000 : false,
      staleTime: 30000,
    },
  );

  // Fetch recent activities for notifications (only if allowed)
  const { data: activities } = useQuery(
    ["header-activities"],
    () => dashboardService.getRecentActivities(),
    {
      enabled: canViewAdminMetrics,
      refetchInterval: canViewAdminMetrics ? 30000 : false,
    },
  );

  // Convert activities to notifications
  const notifications: Notification[] = useMemo(
    () =>
      activities
        ? activities.slice(0, 5).map((activity) => ({
            id: activity.id,
            type: activity.type as any,
            title: activity.title,
            message: activity.description,
            timestamp: activity.time,
            read: Boolean(activity.read),
            priority:
              activity.type === "payment"
                ? "high"
                : activity.type === "booking"
                  ? "medium"
                  : "low",
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

  // Calculate quick stats with real data
  const quickStats: QuickStat[] = stats
    ? [
        {
          label: "Today's Bookings",
          value: stats.bookings.today,
          change:
            stats.bookings.today > stats.bookings.yesterday
              ? Math.round(
                  ((stats.bookings.today - stats.bookings.yesterday) /
                    (stats.bookings.yesterday || 1)) *
                    100,
                )
              : -Math.round(
                  ((stats.bookings.yesterday - stats.bookings.today) /
                    (stats.bookings.yesterday || 1)) *
                    100,
                ),
          icon: <Calendar className="w-4 h-4" />,
          color: "text-primary",
        },
        {
          label: "Revenue Today",
          value: `KES ${stats.revenue.today.toLocaleString()}`,
          change: Number(stats.revenue.growth),
          icon: <CreditCard className="w-4 h-4" />,
          color: "text-primary",
        },
        {
          label: "Active Customers",
          value: stats.customers.active,
          change: Number(stats.customers.growthRate),
          icon: <Users className="w-4 h-4" />,
          color: "text-accent",
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
    await authService.logout();
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
      case "order":
        return <ShoppingBag className="w-4 h-4" />;
      case "payment":
        return <CreditCard className="w-4 h-4" />;
      case "staff":
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
      <header className="bg-background border-b border-border sticky top-0 z-40">
        {/* Top Bar - Quick Stats */}
        {stats && canViewAdminMetrics && (
          <div className="bg-muted/50 px-6 py-2 border-b border-border/50 hidden md:block">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6 overflow-x-auto">
                {quickStats.map((stat, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 flex-shrink-0"
                  >
                    <div className={stat.color}>{stat.icon}</div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">
                        {stat.label}:
                      </span>
                      <span className="ml-1 font-semibold text-foreground">
                        {stat.value}
                      </span>
                      {stat.change !== 0 && (
                        <span
                          className={`ml-2 text-xs ${
                            stat.change > 0
                              ? "text-primary"
                              : "text-destructive"
                          }`}
                        >
                          {stat.change > 0 ? "↑" : "↓"} {Math.abs(stat.change)}%
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground flex-shrink-0">
                <Clock className="w-4 h-4" />
                <span className="font-mono">
                  {currentTime.toLocaleTimeString("en-US", {
                    hour12: false,
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
                <span className="mx-2 hidden sm:inline">|</span>
                <Calendar className="w-4 h-4 hidden sm:inline" />
                <span className="hidden sm:inline">
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
        <div className="px-4 md:px-6 py-4">
          <div className="flex items-center justify-between gap-2">
            {/* Left Section */}
            <div className="flex items-center gap-2 md:gap-4 min-w-0">
              {/* Spacer for mobile menu button - hidden on desktop */}
              <div className="w-12 md:hidden flex-shrink-0" />

              {/* Logo/Brand */}
              <div className="flex items-center gap-2 md:gap-3 min-w-0">
                <div className="w-8 h-8 md:w-10 md:h-10 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
                  <span className="text-primary-foreground font-bold text-base md:text-lg">
                    PM
                  </span>
                </div>
                <div className="hidden sm:block min-w-0">
                  <h1 className="text-lg md:text-xl font-bold text-foreground truncate">
                    {title}
                  </h1>
                  <p className="text-xs text-muted-foreground truncate">
                    {subtitle}
                  </p>
                </div>
              </div>
            </div>

            {/* Right Section */}
            <div className="flex items-center gap-3">
              {/* Notifications */}
              {canViewAdminMetrics && (
                <div ref={notificationRef} className="relative">
                  <button
                    onClick={() => setIsNotificationOpen(!isNotificationOpen)}
                    className="relative p-2 rounded-lg hover:bg-muted transition-colors"
                    title="Notifications"
                  >
                    <Bell className="w-5 h-5 text-muted-foreground" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground text-xs rounded-full flex items-center justify-center">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    )}
                  </button>

                  {/* Notifications Dropdown */}
                  {isNotificationOpen && (
                    <div className="fixed sm:absolute left-2 right-2 sm:left-auto sm:right-0 mt-2 sm:w-96 bg-background rounded-lg shadow-lg border border-border z-50">
                      <div className="px-3 sm:px-4 py-3 border-b border-border flex items-center justify-between">
                        <h3 className="font-semibold text-foreground text-sm sm:text-base">
                          Recent Activity
                        </h3>
                        <button
                          onClick={markAllAsRead}
                          className="text-xs text-primary hover:text-primary/80 whitespace-nowrap"
                        >
                          Mark all read
                        </button>
                      </div>
                      <div className="max-h-96 overflow-y-auto">
                        {notifications.length > 0 ? (
                          notifications.map((notification) => (
                            <div
                              key={notification.id}
                              className={`px-3 sm:px-4 py-3 hover:bg-muted cursor-pointer border-b border-border/50 transition-colors ${
                                !notificationReadStatus[notification.id]
                                  ? "bg-primary/5"
                                  : ""
                              }`}
                              onClick={() => {
                                markNotificationAsRead(
                                  notification.id,
                                  notification.type,
                                );
                              }}
                            >
                              <div className="flex items-start gap-2 sm:gap-3">
                                <div
                                  className={`p-1.5 sm:p-2 rounded-lg flex-shrink-0 ${getPriorityColor(
                                    notification.priority,
                                  )}`}
                                >
                                  {getNotificationIcon(notification.type)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium text-foreground text-xs sm:text-sm truncate">
                                        {notification.title}
                                      </p>
                                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                        {notification.message}
                                      </p>
                                    </div>
                                    {!notificationReadStatus[
                                      notification.id
                                    ] && (
                                      <span className="w-2 h-2 bg-primary rounded-full flex-shrink-0 mt-1"></span>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground/60 mt-1.5 sm:mt-2">
                                    {formatDistanceToNow(
                                      notification.timestamp,
                                      {
                                        addSuffix: true,
                                      },
                                    )}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="px-3 sm:px-4 py-8 text-center text-muted-foreground">
                            <Bell className="w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-2 text-muted-foreground/50" />
                            <p className="text-xs sm:text-sm">
                              No recent activity
                            </p>
                          </div>
                        )}
                      </div>
                      {/* Removed bottom navigation link as per request */}
                    </div>
                  )}
                </div>
              )}

              {/* Profile Dropdown */}
              <div ref={profileRef} className="relative">
                <button
                  onClick={() => setIsProfileOpen(!isProfileOpen)}
                  className="flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2 rounded-lg hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-8 h-8 bg-accent rounded-full flex items-center justify-center">
                      <span className="text-accent-foreground font-semibold text-sm">
                        {user?.firstName?.[0]}
                        {user?.lastName?.[0]}
                      </span>
                    </div>
                    <div className="hidden lg:block text-left">
                      <p className="text-sm font-semibold text-foreground">
                        {user?.firstName} {user?.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {user?.role.replace("_", " ").toLowerCase()}
                      </p>
                    </div>
                  </div>
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                </button>

                {/* Profile Dropdown */}
                {isProfileOpen && (
                  <div className="absolute right-0 mt-2 w-[calc(100vw-2rem)] sm:w-64 max-w-sm bg-background rounded-lg shadow-lg border border-border">
                    <div className="px-3 sm:px-4 py-3 border-b border-border">
                      <p className="font-semibold text-foreground text-sm sm:text-base truncate">
                        {user?.firstName} {user?.lastName}
                      </p>
                      <p className="text-xs sm:text-sm text-muted-foreground truncate">
                        {user?.email}
                      </p>
                      <div className="mt-2">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                          {user?.role.replace("_", " ")}
                        </span>
                      </div>
                    </div>
                    <div className="py-2">
                      <button
                        onClick={() => {
                          navigate("/admin/settings");
                          setIsProfileOpen(false);
                        }}
                        className="w-full px-3 sm:px-4 py-2 text-left text-xs sm:text-sm hover:bg-muted flex items-center gap-2 transition-colors"
                      >
                        <Settings className="w-4 h-4 text-muted-foreground" />
                        <span>Settings</span>
                      </button>
                    </div>
                    <div className="py-2 border-t border-border">
                      <button
                        onClick={openLogoutModal}
                        className="w-full px-3 sm:px-4 py-2 text-left text-xs sm:text-sm hover:bg-destructive/10 text-destructive flex items-center gap-2 transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Search Bar */}
      <div className="lg:hidden px-4 py-2 bg-background border-b border-border">
        <div className="relative">
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 pl-10 pr-4 text-sm bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
        </div>
      </div>
    </>
  );
}

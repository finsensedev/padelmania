import { useState, useEffect, useMemo } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useQuery } from "react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home,
  Users,
  Calendar,
  CreditCard,
  BarChart3,
  Settings,
  ChevronDown,
  ChevronRight,
  LogOut,
  Moon,
  Sun,
  Bell,
  HelpCircle,
  Grid3X3,
  Logs,
  X,
  MenuIcon,
  Activity,
} from "lucide-react";
import { AuthService } from "src/services/authService";
import type { RootState } from "src/redux/store";
import { useSelector } from "react-redux";
import { dashboardService } from "src/services/dashboard.service";
import { usePermissions } from "src/hooks/usePermissions";
import ConfirmLogout from "src/components/ConfirmLogout";
import useModal from "src/hooks/useModal";
import { useTheme } from "src/contexts/useTheme";

interface MenuItem {
  id: string;
  label: string;
  icon: React.ElementType;
  path?: string;
  badge?: number | string;
  subItems?: SubMenuItem[];
}

interface SubMenuItem {
  id: string;
  label: string;
  path: string;
  badge?: number | string;
}

const ADMIN_RESTRICTED_MENU_IDS = ["courts", "bookings", "payments", "reports"];

const AdminSidebar = () => {
  const location = useLocation();
  const { user } = useSelector((state: RootState) => state.userState);
  const [collapsed, setCollapsed] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<string[]>([]);
  const { theme, toggle: toggleTheme } = useTheme();
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" && window.innerWidth < 768,
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const authService = AuthService.getInstance();
  const { has, loading: permissionsLoading } = usePermissions();
  const { pushModal } = useModal();
  const role = user?.role ?? null;
  const canViewDashboardStats = role === "SUPER_ADMIN" || has("dashboard.view");

  // Fetch real-time stats
  const { data: stats } = useQuery(
    ["sidebar-stats"],
    () => dashboardService.getStats(),
    {
      enabled: canViewDashboardStats,
      refetchInterval: canViewDashboardStats ? 60000 : false,
      staleTime: 30000,
    },
  );

  // Calculate notification count from pending items
  const notificationCount = useMemo(() => {
    if (!stats) return 0;
    return stats.bookings.pending || 0;
  }, [stats]);

  // Menu items configuration with dynamic badges
  const menuItems: MenuItem[] = useMemo<MenuItem[]>(
    () => [
      {
        id: "dashboard",
        label: "Dashboard",
        icon: Home,
        path: "/admin",
      },
      {
        id: "users",
        label: "User Management",
        icon: Users,
        subItems: [
          ...(has("users.read")
            ? [{ id: "all-users", label: "All Users", path: "/admin/users" }]
            : []),
          {
            id: "customers",
            label: "Customers",
            path: "/admin/users/customers",
          },
        ],
      },
      {
        id: "courts",
        label: "Court Management",
        icon: Grid3X3,
        subItems: [
          ...(has("courts.read")
            ? [{ id: "all-courts", label: "All Courts", path: "/admin/courts" }]
            : []),
          {
            id: "availability",
            label: "Availability",
            path: "/admin/courts/availability",
          },
          {
            id: "maintenance",
            label: "Maintenance",
            path: "/admin/courts/maintenance",
          },
          {
            id: "pricing",
            label: "Pricing Rules",
            path: "/admin/courts/pricing",
          },
          {
            id: "ball-types",
            label: "Ball Types",
            path: "/admin/equipment/ball-types",
          },
        ],
      },
      {
        id: "bookings",
        label: "Bookings",
        icon: Calendar,
        badge: stats?.bookings.pending
          ? String(stats.bookings.pending)
          : undefined,
        subItems: [
          {
            id: "all-bookings",
            label: "All Bookings",
            path: "/admin/bookings",
          },
          {
            id: "calendar-view",
            label: "Calendar View",
            path: "/admin/bookings/calendar",
          },

          {
            id: "cancellations",
            label: "Cancellations",
            path: "/admin/bookings/cancellations",
            badge: stats?.bookings.cancelled
              ? String(stats.bookings.cancelled)
              : undefined,
          },
        ],
      },
      {
        id: "payments",
        label: "Payments",
        icon: CreditCard,
        subItems: [
          ...(has("payments.read")
            ? [
                {
                  id: "transactions",
                  label: "Transactions",
                  path: "/admin/payments",
                },
              ]
            : []),
          ...(has("payments.refund")
            ? [
                {
                  id: "refunds",
                  label: "Refunds",
                  path: "/admin/payments/refunds",
                },
              ]
            : []),
          {
            id: "vouchers",
            label: "Vouchers",
            path: "/admin/payments/vouchers",
          },
          {
            id: "gift-cards",
            label: "Gift Cards",
            path: "/admin/payments/gift-cards",
          },
        ],
      },
      {
        id: "reports",
        label: "Reports & Analytics",
        icon: BarChart3,
        subItems: [
          ...(has("reports.view")
            ? [{ id: "overview", label: "Overview", path: "/admin/reports" }]
            : []),
          ...(has("reports.view")
            ? [
                {
                  id: "revenue",
                  label: "Revenue",
                  path: "/admin/reports/revenue",
                },
                {
                  id: "bookings",
                  label: "Bookings",
                  path: "/admin/reports/bookings",
                },
                {
                  id: "customers",
                  label: "Customers",
                  path: "/admin/reports/customers",
                },
                {
                  id: "courts",
                  label: "Courts",
                  path: "/admin/reports/courts",
                },
              ]
            : []),
        ],
      },
      {
        id: "audit",
        label: "Audit Logs",
        icon: Logs,
        path: has("audit.view") ? "/admin/audit-logs" : undefined,
      },
      // {
      //   id: "loyalty",
      //   label: "Loyalty Program",
      //   icon: TrendingUp,
      //   subItems: [
      //     {
      //       id: "points",
      //       label: "Points Management",
      //       path: "/admin/loyalty/points",
      //     },
      //     { id: "members", label: "Members", path: "/admin/loyalty/members" },
      //     { id: "rewards", label: "Rewards", path: "/admin/loyalty/rewards" },
      //   ],
      // },
      // {
      //   id: "audit",
      //   label: "Audit Logs",
      //   icon: FileText,
      //   path: "/admin/audit",
      // },
      {
        id: "settings",
        label: "Settings",
        icon: Settings,
        subItems: undefined,
        path: "/admin/settings",
      },
    ],
    [stats, has],
  );

  const finalMenuItems = useMemo<MenuItem[]>(() => {
    const items = menuItems
      .map((item) => {
        if (item.subItems) {
          const subs = item.subItems.filter((s) => !!s.path);
          if (subs.length === 0) return null;
          return { ...item, subItems: subs } as MenuItem;
        }
        return item.path ? item : null;
      })
      .filter(Boolean) as MenuItem[];

    if (role === "ADMIN") {
      return items.filter(
        (item) => !ADMIN_RESTRICTED_MENU_IDS.includes(item.id),
      );
    }

    return items;
  }, [menuItems, role]);

  // Check if mobile with debounced resize handler
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);

      if (mobile) {
        setCollapsed(false); // Don't collapse on mobile, use overlay instead
        setMobileMenuOpen(false); // Close mobile menu on resize to mobile
      } else {
        setMobileMenuOpen(false); // Close mobile menu when resizing to desktop
      }
    };

    const debouncedCheck = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(checkMobile, 150);
    };

    checkMobile();
    window.addEventListener("resize", debouncedCheck);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("resize", debouncedCheck);
    };
  }, []);

  // Toggle expanded menus
  const toggleMenu = (menuId: string) => {
    setExpandedMenus((prev) =>
      prev.includes(menuId)
        ? prev.filter((id) => id !== menuId)
        : [...prev, menuId],
    );
  };

  // Check if menu should be expanded based on current path
  useEffect(() => {
    const currentPath = location.pathname;
    const expandedIds: string[] = [];

    finalMenuItems.forEach((item) => {
      if (item.subItems) {
        const hasActiveSubItem = item.subItems.some((sub) =>
          currentPath.startsWith(sub.path),
        );
        if (hasActiveSubItem) {
          expandedIds.push(item.id);
        }
      }
    });

    setExpandedMenus(expandedIds);
  }, [finalMenuItems, location.pathname]);

  // Handle logout
  const handleLogout = async () => {
    await authService.logout();
  };

  // Open logout confirmation modal
  const openLogoutModal = () => {
    pushModal(<ConfirmLogout onSubmit={handleLogout} />);
  };

  // Close mobile menu on route change
  useEffect(() => {
    if (isMobile) {
      setMobileMenuOpen(false);
    }
  }, [location.pathname, isMobile]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (isMobile && mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }

    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isMobile, mobileMenuOpen]);

  // Show loading skeleton while permissions are being fetched
  if (permissionsLoading) {
    return (
      <div className="relative">
        {/* Mobile Menu Button - Skeleton during loading */}
        {isMobile && (
          <div className="fixed top-4 right-4 z-50 w-10 h-10 bg-muted/80 rounded-lg animate-pulse md:hidden shadow-lg" />
        )}

        {/* Sidebar Loading Skeleton */}
        <aside
          className={`
          ${isMobile ? "fixed" : "sticky"} 
          top-0 left-0 h-screen z-40
          ${collapsed && !isMobile ? "w-20" : isMobile ? "w-[280px]" : "w-72"}
          ${isMobile && !mobileMenuOpen ? "-translate-x-full" : "translate-x-0"}
          transition-all duration-300 ease-in-out
          bg-sidebar border-r border-sidebar-border
          flex flex-col
          overflow-hidden
          ${isMobile ? "shadow-2xl" : ""}
        `}
        >
          {/* Header Skeleton */}
          <div className="p-4 border-b border-sidebar-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-br from-muted to-muted/60 rounded-lg animate-pulse shadow-sm"></div>
                {(!collapsed || isMobile) && (
                  <div className="space-y-2 flex-1">
                    <div className="h-5 w-32 bg-gradient-to-r from-muted to-muted/60 rounded animate-pulse"></div>
                    <div className="h-3 w-24 bg-gradient-to-r from-muted/70 to-muted/40 rounded animate-pulse"></div>
                  </div>
                )}
              </div>
              {!isMobile && (
                <div className="w-6 h-6 bg-muted/60 rounded animate-pulse"></div>
              )}
            </div>
          </div>

          {/* User Info Skeleton */}
          {(!collapsed || isMobile) && (
            <div className="p-4 border-b border-sidebar-border">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-muted to-muted/60 animate-pulse shadow-sm flex-shrink-0"></div>
                <div className="flex-1 space-y-2 min-w-0">
                  <div className="h-4 w-28 bg-gradient-to-r from-muted to-muted/60 rounded animate-pulse"></div>
                  <div className="h-3 w-20 bg-gradient-to-r from-muted/70 to-muted/40 rounded animate-pulse"></div>
                </div>
                <div className="flex-shrink-0">
                  <div className="w-6 h-6 bg-muted/60 rounded-full animate-pulse"></div>
                </div>
              </div>
            </div>
          )}

          {/* Quick Stats Skeleton */}
          {(!collapsed || isMobile) && (
            <div className="p-4 border-b border-sidebar-border space-y-2 flex-shrink-0">
              <div className="flex items-center justify-between p-2 bg-muted/20 rounded-lg">
                <div className="flex items-center space-x-2 min-w-0 flex-1">
                  <div className="w-4 h-4 bg-muted/60 rounded animate-pulse flex-shrink-0"></div>
                  <div className="h-3 w-20 bg-gradient-to-r from-muted/60 to-muted/40 rounded animate-pulse"></div>
                </div>
                <div className="h-4 w-16 bg-gradient-to-r from-muted to-muted/60 rounded animate-pulse ml-2 flex-shrink-0"></div>
              </div>
              <div className="flex items-center justify-between p-2 bg-muted/20 rounded-lg">
                <div className="flex items-center space-x-2 min-w-0 flex-1">
                  <div className="w-4 h-4 bg-muted/60 rounded animate-pulse flex-shrink-0"></div>
                  <div className="h-3 w-24 bg-gradient-to-r from-muted/60 to-muted/40 rounded animate-pulse"></div>
                </div>
                <div className="h-4 w-8 bg-gradient-to-r from-muted to-muted/60 rounded animate-pulse ml-2 flex-shrink-0"></div>
              </div>
            </div>
          )}

          {/* Menu Skeleton */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {/* Main menu items with varying widths to simulate different menu labels */}
            {[
              { width: "w-full", hasSubmenu: false },
              { width: "w-full", hasSubmenu: true },
              { width: "w-full", hasSubmenu: true },
              { width: "w-full", hasSubmenu: true },
              { width: "w-full", hasSubmenu: true },
              { width: "w-full", hasSubmenu: false },
              { width: "w-full", hasSubmenu: false },
            ].map((item, i) => (
              <div key={i} className="space-y-1">
                {/* Main menu item */}
                <div
                  className={`flex items-center ${
                    collapsed && !isMobile
                      ? "justify-center"
                      : "justify-between"
                  } p-3 rounded-lg bg-muted/30 animate-pulse`}
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-5 h-5 bg-muted/70 rounded animate-pulse flex-shrink-0"></div>
                    {(!collapsed || isMobile) && (
                      <div
                        className={`h-4 ${
                          item.width === "w-full"
                            ? ["w-20", "w-24", "w-28", "w-32"][i % 4]
                            : item.width
                        } bg-gradient-to-r from-muted/80 to-muted/50 rounded animate-pulse`}
                      ></div>
                    )}
                  </div>
                  {(!collapsed || isMobile) && item.hasSubmenu && (
                    <div className="w-4 h-4 bg-muted/60 rounded animate-pulse"></div>
                  )}
                </div>

                {/* Submenu items for some menu items */}
                {(!collapsed || isMobile) && item.hasSubmenu && i % 2 === 1 && (
                  <div className="ml-4 pl-4 border-l-2 border-muted/40 space-y-1">
                    {[1, 2].map((subIndex) => (
                      <div
                        key={subIndex}
                        className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/20 animate-pulse"
                      >
                        <div
                          className={`h-3 ${
                            subIndex === 1 ? "w-16" : "w-20"
                          } bg-gradient-to-r from-muted/60 to-muted/40 rounded animate-pulse`}
                        ></div>
                        {subIndex === 1 && (
                          <div className="w-4 h-3 bg-muted/50 rounded-full animate-pulse"></div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Footer Skeleton */}
          <div className="p-4 border-t border-sidebar-border space-y-2 flex-shrink-0">
            {(!collapsed || isMobile) && (
              <>
                {/* Theme toggle skeleton */}
                <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-muted/30 animate-pulse">
                  <div className="flex items-center space-x-3">
                    <div className="w-5 h-5 bg-muted/70 rounded animate-pulse flex-shrink-0"></div>
                    <div className="h-4 w-20 bg-gradient-to-r from-muted/80 to-muted/50 rounded animate-pulse"></div>
                  </div>
                  <div className="w-10 h-6 bg-muted/60 rounded-full animate-pulse flex-shrink-0"></div>
                </div>

                {/* Help & Support skeleton */}
                <div className="flex items-center space-x-3 px-3 py-2.5 rounded-lg bg-muted/30 animate-pulse">
                  <div className="w-5 h-5 bg-muted/70 rounded animate-pulse flex-shrink-0"></div>
                  <div className="h-4 w-24 bg-gradient-to-r from-muted/80 to-muted/50 rounded animate-pulse"></div>
                </div>
              </>
            )}

            {/* Logout skeleton */}
            <div
              className={`flex items-center ${
                collapsed && !isMobile ? "justify-center" : "space-x-3"
              } px-3 py-2.5 rounded-lg bg-destructive/10 animate-pulse`}
            >
              <div className="w-5 h-5 bg-destructive/30 rounded animate-pulse flex-shrink-0"></div>
              {(!collapsed || isMobile) && (
                <div className="h-4 w-14 bg-gradient-to-r from-destructive/30 to-destructive/20 rounded animate-pulse"></div>
              )}
            </div>
          </div>
        </aside>

        {/* Loading Animation Overlay */}
        <div className="absolute inset-0 pointer-events-none z-50">
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
            <div className="flex items-center space-x-2 bg-background/95 backdrop-blur-sm border border-border rounded-lg px-4 py-3 shadow-lg">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
              <span className="text-sm text-foreground/70">
                Loading permissions...
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Mobile Menu Button - Fixed position, always visible on mobile */}
      {isMobile && (
        <motion.button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="fixed top-4 left-4 z-50 p-2.5 bg-card border-2 border-border rounded-lg shadow-lg hover:bg-accent transition-colors md:hidden"
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileMenuOpen}
          whileTap={{ scale: 0.95 }}
          whileHover={{ scale: 1.05 }}
        >
          {mobileMenuOpen ? (
            <X size={20} className="text-foreground" />
          ) : (
            <MenuIcon size={20} className="text-foreground" />
          )}
        </motion.button>
      )}

      {/* Overlay for mobile - Improved interaction */}
      <AnimatePresence>
        {isMobile && mobileMenuOpen && (
          <motion.div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        className={`
        ${isMobile ? "fixed" : "sticky"} 
        top-0 left-0 h-screen z-50
        ${collapsed && !isMobile ? "w-20" : isMobile ? "w-[280px]" : "w-72"}
        bg-sidebar border-r border-sidebar-border
        flex flex-col
        ${isMobile ? "shadow-2xl" : ""}
        overflow-hidden
      `}
        role="navigation"
        aria-label="Admin sidebar navigation"
        initial={isMobile ? { x: "-100%" } : false}
        animate={isMobile ? { x: mobileMenuOpen ? 0 : "-100%" } : {}}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
      >
        {/* Header */}
        <motion.div
          className="p-4 border-b border-sidebar-border bg-sidebar/50"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex items-center justify-between">
            <div
              className={`flex items-center space-x-3 ${
                collapsed && !isMobile ? "justify-center" : ""
              }`}
            >
              <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center shadow-sm">
                <span className="text-primary-foreground font-bold text-lg md:text-xl">
                  PM
                </span>
              </div>
              {(!collapsed || isMobile) && (
                <div>
                  <h2 className="font-bold text-base md:text-lg text-sidebar-foreground">
                    Padel Mania
                  </h2>
                  <p className="text-xs text-sidebar-foreground/60">
                    Admin Panel
                  </p>
                </div>
              )}
            </div>
            {!isMobile && (
              <motion.button
                onClick={() => setCollapsed(!collapsed)}
                className="p-1.5 hover:bg-sidebar-accent rounded-lg transition-colors"
                whileTap={{ scale: 0.9 }}
                whileHover={{ scale: 1.1 }}
              >
                <ChevronRight
                  className={`w-5 h-5 text-sidebar-foreground/60 transition-transform ${
                    collapsed ? "" : "rotate-180"
                  }`}
                />
              </motion.button>
            )}
          </div>
        </motion.div>

        {/* User Info */}
        {(!collapsed || isMobile) && (
          <motion.div
            className="p-4 border-b border-sidebar-border flex-shrink-0 bg-sidebar/30"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center flex-shrink-0">
                <span className="text-primary font-medium text-sm">
                  {user?.firstName?.[0]?.toUpperCase()}
                  {user?.lastName?.[0]?.toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-sidebar-foreground truncate">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="text-xs text-sidebar-foreground/60 truncate">
                  {user?.role?.replace("_", " ")}
                </p>
              </div>
              <div className="relative flex-shrink-0">
                <motion.button
                  className="p-1.5 hover:bg-sidebar-accent rounded-full transition-colors"
                  aria-label="Notifications"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <Bell className="w-5 h-5 text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors" />
                  {notificationCount > 0 && (
                    <motion.span
                      className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-medium shadow-sm"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{
                        type: "spring",
                        stiffness: 500,
                        damping: 15,
                      }}
                    >
                      {notificationCount > 9 ? "9+" : notificationCount}
                    </motion.span>
                  )}
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Quick Stats - Only on expanded sidebar with real data */}
        {(!collapsed || isMobile) && stats && (
          <motion.div
            className="p-4 border-b border-sidebar-border space-y-2 flex-shrink-0"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
          >
            <motion.div
              className="flex items-center justify-between p-2 bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors"
              whileHover={{ x: 4 }}
            >
              <div className="flex items-center space-x-2 min-w-0 flex-1">
                <Activity className="w-4 h-4 text-primary flex-shrink-0" />
                <span className="text-xs text-sidebar-foreground/70 truncate">
                  Today's Revenue
                </span>
              </div>
              <span className="text-sm font-bold text-primary ml-2 flex-shrink-0">
                KES {stats.revenue.today.toLocaleString()}
              </span>
            </motion.div>
            <motion.div
              className="flex items-center justify-between p-2 bg-accent/10 rounded-lg hover:bg-accent/20 transition-colors"
              whileHover={{ x: 4 }}
            >
              <div className="flex items-center space-x-2 min-w-0 flex-1">
                <Calendar className="w-4 h-4 text-accent flex-shrink-0" />
                <span className="text-xs text-sidebar-foreground/70 truncate">
                  Active Bookings
                </span>
              </div>
              <span className="text-sm font-bold text-accent ml-2 flex-shrink-0">
                {stats.bookings.confirmed}
              </span>
            </motion.div>
          </motion.div>
        )}

        {/* Navigation Menu */}
        <nav className="flex-1 overflow-y-auto p-4 overscroll-contain scrollbar-thin scrollbar-thumb-sidebar-border scrollbar-track-transparent">
          <motion.ul
            className="space-y-2 pb-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.3 }}
          >
            {finalMenuItems.map((item, index) => {
              // Check if any submenu item is active (exact match)
              const hasActiveSubItem = item.subItems?.some(
                (subItem) => location.pathname === subItem.path,
              );
              const isParentActive =
                hasActiveSubItem ||
                (item.path && location.pathname === item.path);

              return (
                <motion.li
                  key={item.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2, delay: 0.3 + index * 0.05 }}
                >
                  {item.path ? (
                    // Single item without submenu
                    <NavLink
                      to={item.path}
                      end={item.path === "/admin"}
                      className={({ isActive }) => `
                      flex items-center ${
                        collapsed && !isMobile
                          ? "justify-center"
                          : "justify-between"
                      } 
                      px-3 py-2 rounded-lg transition-colors
                      ${
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      }
                    `}
                      title={collapsed && !isMobile ? item.label : undefined}
                    >
                      <div className="flex items-center space-x-3">
                        <item.icon className="w-5 h-5 flex-shrink-0" />
                        {(!collapsed || isMobile) && (
                          <span className="text-sm font-medium">
                            {item.label}
                          </span>
                        )}
                      </div>
                      {(!collapsed || isMobile) && item.badge && (
                        <span className="px-2 py-0.5 text-xs font-medium bg-primary text-primary-foreground rounded-full">
                          {item.badge}
                        </span>
                      )}
                    </NavLink>
                  ) : (
                    // Item with submenu
                    <>
                      <button
                        onClick={() => toggleMenu(item.id)}
                        className={`
                        w-full flex items-center ${
                          collapsed && !isMobile
                            ? "justify-center"
                            : "justify-between"
                        } 
                        px-3 py-2 rounded-lg transition-colors
                        ${
                          isParentActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        }
                      `}
                        title={collapsed && !isMobile ? item.label : undefined}
                      >
                        <div className="flex items-center space-x-3">
                          <item.icon className="w-5 h-5 flex-shrink-0" />
                          {(!collapsed || isMobile) && (
                            <span className="text-sm font-medium">
                              {item.label}
                            </span>
                          )}
                        </div>
                        {(!collapsed || isMobile) && (
                          <div className="flex items-center space-x-2">
                            {item.badge && (
                              <span className="px-2 py-0.5 text-xs font-medium bg-primary text-primary-foreground rounded-full">
                                {item.badge}
                              </span>
                            )}
                            <ChevronDown
                              className={`w-4 h-4 transition-transform ${
                                expandedMenus.includes(item.id)
                                  ? "rotate-180"
                                  : ""
                              }`}
                            />
                          </div>
                        )}
                      </button>

                      {/* Submenu items */}
                      {(!collapsed || isMobile) &&
                        expandedMenus.includes(item.id) &&
                        item.subItems && (
                          <ul className="mt-2 ml-4 pl-4 border-l-2 border-sidebar-border space-y-1">
                            {item.subItems.map((subItem) => (
                              <li key={subItem.id}>
                                <NavLink
                                  to={subItem.path}
                                  end
                                  className={({ isActive }) => `
                                flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors
                                ${
                                  isActive
                                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                                }
                              `}
                                >
                                  <span>{subItem.label}</span>
                                  {subItem.badge && (
                                    <span className="px-1.5 py-0.5 text-xs font-medium bg-destructive text-destructive-foreground rounded-full">
                                      {subItem.badge}
                                    </span>
                                  )}
                                </NavLink>
                              </li>
                            ))}
                          </ul>
                        )}
                    </>
                  )}
                </motion.li>
              );
            })}
          </motion.ul>
        </nav>

        {/* Footer Actions */}
        <motion.div
          className="p-4 border-t border-sidebar-border space-y-2 flex-shrink-0 bg-sidebar/50"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.5 }}
        >
          {(!collapsed || isMobile) && (
            <>
              <motion.button
                onClick={toggleTheme}
                className="w-full flex items-center justify-between px-3 py-2.5 text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-lg transition-colors"
                aria-label={`Switch to ${
                  theme === "light" ? "dark" : "light"
                } mode`}
                whileTap={{ scale: 0.95 }}
                whileHover={{ x: 4 }}
              >
                <div className="flex items-center space-x-3">
                  {theme === "light" ? (
                    <Moon className="w-5 h-5 flex-shrink-0" />
                  ) : (
                    <Sun className="w-5 h-5 flex-shrink-0" />
                  )}
                  <span className="font-medium">Dark Mode</span>
                </div>
                <div
                  className={`w-10 h-6 rounded-full p-1 transition-colors flex-shrink-0 ${
                    theme === "dark" ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <motion.div
                    className="w-4 h-4 bg-background rounded-full shadow-sm"
                    animate={{ x: theme === "dark" ? 16 : 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                </div>
              </motion.button>

              <motion.button
                className="w-full flex items-center space-x-3 px-3 py-2.5 text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-lg transition-colors"
                aria-label="Help and support"
                whileTap={{ scale: 0.95 }}
                whileHover={{ x: 4 }}
              >
                <HelpCircle className="w-5 h-5 flex-shrink-0" />
                <span className="font-medium">Help & Support</span>
              </motion.button>
            </>
          )}

          <motion.button
            onClick={openLogoutModal}
            className={`w-full flex items-center ${
              collapsed && !isMobile ? "justify-center" : "space-x-3"
            } px-3 py-2.5 text-sm text-destructive hover:bg-destructive/10 rounded-lg transition-colors font-medium`}
            title={collapsed && !isMobile ? "Logout" : undefined}
            aria-label="Logout"
            whileTap={{ scale: 0.95 }}
            whileHover={{ x: collapsed && !isMobile ? 0 : 4 }}
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {(!collapsed || isMobile) && <span>Logout</span>}
          </motion.button>
        </motion.div>
      </motion.aside>
    </>
  );
};

export default AdminSidebar;

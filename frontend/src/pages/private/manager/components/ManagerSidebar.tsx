import { NavLink, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home,
  Calendar,
  Grid3X3,
  CreditCard,
  BarChart3,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  Gift,
  Ticket,
  Moon,
  Sun,
  Calendar1,
  Clock,
  Settings2,
  Award,
  // Store,
  // FolderTree,
  // Package,
  // Warehouse,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useSelector } from "react-redux";
import type { RootState } from "src/redux/store";
import { AuthService } from "src/services/authService";
import ConfirmLogout from "src/components/ConfirmLogout";
import useModal from "src/hooks/useModal";
import { useTheme } from "src/contexts/useTheme";

function ExpandableNavItem({
  item,
  location,
}: {
  item: NavItem;
  location: ReturnType<typeof useLocation>;
}) {
  const Icon = item.icon;
  const isAnyChildActive =
    item.children?.some((child) => location.pathname.startsWith(child.path)) ??
    false;
  const [expanded, setExpanded] = useState(isAnyChildActive);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all font-medium
          ${
            isAnyChildActive
              ? "bg-sidebar-accent/50 text-sidebar-accent-foreground"
              : "text-sidebar-foreground hover:bg-sidebar-accent/30 hover:text-sidebar-accent-foreground"
          }
        `}
      >
        <Icon className="w-4 h-4 flex-shrink-0" />
        <span className="flex-1 text-left">{item.label}</span>
        {expanded ? (
          <ChevronDown className="w-4 h-4" />
        ) : (
          <ChevronRight className="w-4 h-4" />
        )}
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="ml-4 mt-1 space-y-1 overflow-hidden"
          >
            {item.children?.map((child) => {
              const childActive = location.pathname === child.path;
              const ChildIcon = child.icon;
              return (
                <NavLink
                  key={child.path}
                  to={child.path}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all font-medium
                    ${
                      childActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                    }
                  `}
                >
                  <ChildIcon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="flex-1">{child.label}</span>
                  {childActive && (
                    <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  )}
                </NavLink>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface NavChild {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavItem {
  label: string;
  path?: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: NavChild[];
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", path: "/manager", icon: Home },
  { label: "Users", path: "/manager/users", icon: Users },
  { label: "Calendar", path: "/manager/calendar", icon: Calendar1 },
  { label: "Bookings", path: "/manager/bookings", icon: Calendar },
  { label: "Availability", path: "/manager/availability", icon: Clock },
  { label: "Courts", path: "/manager/courts", icon: Grid3X3 },
  { label: "Transactions", path: "/manager/transactions", icon: CreditCard },
  { label: "Vouchers", path: "/manager/vouchers", icon: Ticket },
  { label: "Gift Cards", path: "/manager/gift-cards", icon: Gift },
  { label: "Reports", path: "/manager/reports", icon: BarChart3 },
  // {
  //   label: "Shop",
  //   icon: Store,
  //   children: [
  //     { label: "Categories", path: "/manager/shop/categories", icon: FolderTree },
  //     { label: "Products", path: "/manager/shop/products", icon: Package },
  //     { label: "Inventory", path: "/manager/shop/inventory", icon: Warehouse },
  //   ],
  // },
  {
    label: "Booking Settings",
    path: "/manager/booking-settings",
    icon: Settings2,
  },
  {
    label: "Loyalty Configuration",
    path: "/manager/loyalty-configuration",
    icon: Award,
  },
  { label: "Settings", path: "/manager/settings", icon: Settings },
];

export default function ManagerSidebar() {
  const { user } = useSelector((s: RootState) => s.userState);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const location = useLocation();
  const authService = AuthService.getInstance();
  const { pushModal } = useModal();
  const { theme, toggle: toggleTheme } = useTheme();

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const logout = async () => {
    await authService.logout();
  };

  const content = (
    <div className="h-full  flex flex-col bg-sidebar border-r border-sidebar-border w-64 shadow-lg md:shadow-none">
      {/* Brand Header */}
      <div className="p-4 border-b border-sidebar-border flex items-center gap-3 bg-sidebar/50">
        <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center font-bold text-primary-foreground shadow-sm">
          PM
        </div>
        <div>
          <p className="font-semibold text-sm text-sidebar-foreground">
            Padel Mania
          </p>
          <p className="text-xs text-sidebar-foreground/60">Manager Portal</p>
        </div>
      </div>

      {/* User Profile */}
      <div className="p-4 border-b border-sidebar-border flex items-center gap-3 bg-sidebar/30">
        <div className="w-10 h-10 rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center font-medium text-primary">
          {user?.firstName?.[0]?.toUpperCase()}
          {user?.lastName?.[0]?.toUpperCase()}
        </div>
        <div className="text-xs flex-1 min-w-0">
          <p className="font-medium text-sidebar-foreground leading-tight truncate">
            {user?.firstName} {user?.lastName}
          </p>
          <p className="text-sidebar-foreground/60 truncate">{user?.email}</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1 scrollbar-thin scrollbar-thumb-sidebar-border scrollbar-track-transparent">
        {NAV_ITEMS.map((item) => {
          if (item.children) {
            return (
              <ExpandableNavItem
                key={item.label}
                item={item}
                location={location}
              />
            );
          }

          // Render regular item
          const active = location.pathname === item.path;
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path!}
              to={item.path!}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all font-medium
                ${
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm scale-[0.98]"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground hover:translate-x-0.5"
                }
              `}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{item.label}</span>
              {active && (
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Logout Button */}
      <div className="p-4 border-t border-sidebar-border bg-sidebar/50">
        <motion.button
          onClick={toggleTheme}
          className="w-full flex items-center justify-between px-3 py-2.5 text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-lg transition-colors"
          aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
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
        <button
          onClick={() => pushModal(<ConfirmLogout onSubmit={logout} />)}
          className="w-full flex items-center justify-center gap-2 text-sm px-3 py-2.5 rounded-lg text-destructive hover:bg-destructive/10 transition-all font-medium hover:shadow-sm"
        >
          <LogOut className="w-4 h-4" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <>
        {/* Mobile Menu Button */}
        <motion.button
          onClick={() => setMobileOpen((p) => !p)}
          className="fixed top-4 left-4 z-50 p-1.5 bg-background border-2 border-border rounded-lg md:hidden shadow-lg hover:bg-accent transition-colors"
          aria-label="Toggle menu"
          whileTap={{ scale: 0.95 }}
          whileHover={{ scale: 1.05 }}
        >
          {mobileOpen ? (
            <X className="w-5 h-5 text-foreground" />
          ) : (
            <Menu className="w-5 h-5 text-foreground" />
          )}
        </motion.button>

        {/* Mobile Sidebar Overlay */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              className="fixed inset-0 z-50 flex md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {/* Backdrop */}
              <motion.div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setMobileOpen(false)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />

              {/* Sidebar */}
              <motion.div
                className="relative z-50 h-full"
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
              >
                {content}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  }

  return <div className="hidden md:block">{content}</div>;
}

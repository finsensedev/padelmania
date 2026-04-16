import { NavLink, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home,
  Calendar,
  CreditCard,
  RotateCcw,
  BarChart,
  TrendingUp,
  Shield,
  LogOut,
  Menu,
  X,
  Moon,
  Sun,
} from "lucide-react";
import { useSelector } from "react-redux";
import type { RootState } from "src/redux/store";
import { AuthService } from "src/services/authService";
import ConfirmLogout from "src/components/ConfirmLogout";
import useModal from "src/hooks/useModal";
import { useTheme } from "src/contexts/useTheme";

const NAV_ITEMS = [
  { label: "Dashboard", path: "/finance-officer", icon: Home },
  { label: "Bookings", path: "/finance-officer/bookings", icon: Calendar },
  {
    label: "Transactions",
    path: "/finance-officer/transactions",
    icon: CreditCard,
  },
  { label: "Refunds", path: "/finance-officer/refunds", icon: RotateCcw },
  { label: "Reports", path: "/finance-officer/reports", icon: BarChart },
  { label: "Analytics", path: "/finance-officer/analytics", icon: TrendingUp },
  { label: "Security", path: "/finance-officer/security", icon: Shield },
];

export default function FinanceOfficerSidebar() {
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

  const openLogoutModal = () => {
    pushModal(<ConfirmLogout onSubmit={logout} />);
  };

  const content = (
    <div className="h-full flex flex-col bg-sidebar border-r border-sidebar-border w-64 shadow-lg md:shadow-none">
      {/* Brand Header */}
      <div className="p-4 border-b border-sidebar-border flex items-center gap-3 bg-sidebar/50">
        <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center font-bold text-primary-foreground shadow-sm">
          PM
        </div>
        <div>
          <p className="font-semibold text-sm text-sidebar-foreground">
            Padel Mania
          </p>
          <p className="text-xs text-sidebar-foreground/60">Finance Officer</p>
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
          const active = location.pathname === item.path;
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
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
              theme === "dark" ? "bg-primary" : "bg-foreground/20"
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
          onClick={openLogoutModal}
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
          className="fixed top-3 right-4 z-50 p-2.5 bg-background border-2 border-border rounded-lg md:hidden shadow-lg hover:bg-accent transition-colors"
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
              className="fixed z-50 inset-0 flex md:hidden"
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

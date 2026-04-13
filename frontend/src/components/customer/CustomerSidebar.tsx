import { useState, useEffect } from "react";
import { useQuery } from "react-query";
import { NavLink, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import type { RootState } from "src/redux/store";
import {
  Home,
  Calendar,
  List,
  Award,
  LogOut,
  Menu,
  X,
  Bell,
  ChevronRight,
  Gift,
  Moon,
  Sun,
  // Package,
  // ShoppingBag,
} from "lucide-react";
import { Badge } from "src/components/ui/badge";
import { authService } from "src/services/authService";
import api from "src/utils/api";
import ConfirmLogout from "src/components/ConfirmLogout";
import useModal from "src/hooks/useModal";
import { AnimatePresence, motion } from "framer-motion";
import { useTheme } from "src/contexts/useTheme";
import { Button } from "../ui/button";

interface MenuItem {
  id: string;
  label: string;
  icon: React.ElementType;
  path: string;
  badge?: string | number;
}

function CustomerSidebar() {
  const location = useLocation();
  const { user } = useSelector((state: RootState) => state.userState);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pushModal } = useModal();
  const { theme, toggle } = useTheme();
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" && window.innerWidth < 768,
  );

  // Check if mobile with debounced resize handler
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);

      if (mobile) {
        setCollapsed(false); // Don't collapse on mobile, use overlay instead
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

  const { data: notifications = 0 } = useQuery<number>({
    queryKey: ["customer-notifications-unread-count"],
    queryFn: async () => {
      const res = await api.get("/customer/notifications/unread-count");
      return res.data?.data ?? res.data ?? 0;
    },
    staleTime: 30_000,
    refetchInterval: 120_000,
    onError: (error) => {
      console.error("Failed to fetch notifications:", error);
    },
  });

  const menuItems: MenuItem[] = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: Home,
      path: "/customer",
    },
    {
      id: "book-court",
      label: "Book Court",
      icon: Calendar,
      path: "/customer/book-court",
    },
    {
      id: "bookings",
      label: "My Bookings",
      icon: List,
      path: "/customer/bookings",
    },
    // {
    //   id: "rent-equipment",
    //   label: "Rent Equipment",
    //   icon: Package,
    //   path: "/customer/rent-equipment",
    // },
    // {
    //   id: "shop",
    //   label: "Shop",
    //   icon: ShoppingBag,
    //   path: "/customer/shop",
    // },
    {
      id: "loyalty",
      label: "Loyalty Points",
      icon: Award,
      path: "/customer/loyalty",
    },
    {
      id: "gift-cards",
      label: "Gift Cards",
      icon: Gift,
      path: "/customer/gift-cards",
    },
  ];

  const handleLogout = async () => {
    await authService.logout();
  };

  const openLogoutModal = () => {
    pushModal(<ConfirmLogout onSubmit={handleLogout} />);
  };

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Animation variants

  const overlayVariants = {
    open: {
      opacity: 1,
      transition: {
        duration: 0.2,
      },
    },
    closed: {
      opacity: 0,
      transition: {
        duration: 0.2,
      },
    },
  };

  return (
    <>
      {/* Mobile Menu Toggle */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed top-4 right-4 z-50 p-2 bg-background border border-border rounded-lg shadow-lg lg:hidden"
      >
        {mobileOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Overlay for mobile */}
      <AnimatePresence>
        {mobileOpen && isMobile && (
          <motion.div
            initial="closed"
            animate="open"
            exit="closed"
            variants={overlayVariants}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-30 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        initial={{ x: isMobile ? "-100%" : 0 }}
        animate={{
          x: mobileOpen || !isMobile ? 0 : isMobile ? "-100%" : 0,
        }}
        exit={{
          x: mobileOpen ? 0 : "-100%",
        }}
        transition={{ type: "tween", duration: 0.2 }}
        className={`
          fixed lg:sticky top-0 left-0 bottom-0 z-40
          ${collapsed ? "w-20" : "w-72"}
          bg-sidebar border-r border-sidebar-border
          flex flex-col overflow-hidden
        `}
      >
        {/* Header */}
        <div className="p-4 border-b border-sidebar-border">
          <div className="flex items-center justify-between">
            <div
              className={`flex items-center space-x-3 ${
                collapsed ? "justify-center" : ""
              }`}
            >
              <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-xl">
                  T
                </span>
              </div>
              {!collapsed && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <h2 className="font-bold text-lg text-sidebar-foreground">
                    Padel Mania
                  </h2>
                  <p className="text-xs text-sidebar-foreground/60">
                    Customer Portal
                  </p>
                </motion.div>
              )}
            </div>
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="hidden lg:block p-1 hover:bg-sidebar-accent rounded"
            >
              <motion.div
                animate={{ rotate: collapsed ? 0 : 180 }}
                transition={{ duration: 0.3 }}
              >
                <ChevronRight className="w-5 h-5 text-sidebar-foreground/60" />
              </motion.div>
            </button>
          </div>
        </div>

        {/* User Info */}
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="p-4 border-b border-sidebar-border"
          >
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center">
                <span className="text-accent-foreground font-medium">
                  {user?.firstName?.[0]}
                  {user?.lastName?.[0]}
                </span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-sidebar-foreground">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="text-xs text-sidebar-foreground/60">
                  {user?.email}
                </p>
              </div>
              <div className="relative">
                <Bell className="w-5 h-5 text-sidebar-foreground/60 cursor-pointer hover:text-sidebar-foreground" />
                {notifications > 0 && (
                  <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs rounded-full w-4 h-4 flex items-center justify-center">
                    {notifications}
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Navigation - only this area should scroll */}
        <nav className="flex-1 p-4 overflow-y-auto min-h-0 pb-24">
          <ul className="space-y-2">
            {menuItems.map((item) => (
              <li key={item.id}>
                <NavLink
                  to={item.path}
                  end={item.path === "/customer"}
                  className={({ isActive }) => `
                    flex items-center ${
                      collapsed ? "justify-center" : "justify-between"
                    } 
                    px-3 py-2 rounded-lg
                    ${
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    }
                  `}
                  title={collapsed ? item.label : undefined}
                >
                  <div className="flex items-center space-x-3">
                    <item.icon className="w-5 h-5 flex-shrink-0" />
                    {!collapsed && (
                      <span className="text-sm font-medium">{item.label}</span>
                    )}
                  </div>
                  {!collapsed && item.badge && (
                    <Badge variant="secondary" className="text-xs">
                      {item.badge}
                    </Badge>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* Footer (pinned) */}
        <div className="absolute bottom-0 left-0 right-0 p-4 z-30 space-y-2">
          {/* Theme Toggle */}
          <Button
            onClick={toggle}
            variant="secondary"
            className={`w-full flex items-center ${
              collapsed && !isMobile ? "justify-center" : "space-x-3"
            } px-3 py-2.5 text-sm rounded-lg font-medium`}
            title={
              collapsed && !isMobile
                ? theme === "dark"
                  ? "Switch to Light Mode"
                  : "Switch to Dark Mode"
                : undefined
            }
            aria-label="Toggle theme"
          >
            {theme === "dark" ? (
              <Sun className="w-5 h-5 flex-shrink-0" />
            ) : (
              <Moon className="w-5 h-5 flex-shrink-0" />
            )}
            {(!collapsed || isMobile) && (
              <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
            )}
          </Button>

          {/* Logout Button */}
          <Button
            onClick={openLogoutModal}
            className={`w-full flex items-center ${
              collapsed && !isMobile ? "justify-center" : "space-x-3"
            } px-3 py-2.5 text-sm rounded-lg font-medium`}
            title={collapsed && !isMobile ? "Logout" : undefined}
            aria-label="Logout"
            variant="destructive"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {(!collapsed || isMobile) && <span>Logout</span>}
          </Button>
        </div>
      </motion.aside>
    </>
  );
}

export default CustomerSidebar;

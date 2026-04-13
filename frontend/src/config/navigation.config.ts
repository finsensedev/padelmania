// config/navigation.config.ts
export const NAVIGATION_ITEMS = {
  CUSTOMER: [
    { label: "Dashboard", path: "/customer", icon: "Home" },
    { label: "Book Court", path: "/customer/book-court", icon: "Calendar" },
    { label: "My Bookings", path: "/customer/bookings", icon: "List" },
    { label: "Shop", path: "/customer/shop", icon: "ShoppingBag" },
    { label: "Restaurant", path: "/customer/restaurant", icon: "Utensils" },
    { label: "Orders", path: "/customer/orders", icon: "ShoppingBag" },
    { label: "Loyalty Points", path: "/customer/loyalty", icon: "Award" },
    { label: "Profile", path: "/customer/profile", icon: "User" },
  ],

  MANAGER: [
    { label: "Dashboard", path: "/manager", icon: "Home" },
    { label: "Bookings", path: "/manager/bookings", icon: "Calendar" },
    { label: "Courts", path: "/manager/courts", icon: "Grid" },
    {
      label: "Transactions",
      path: "/manager/transactions",
      icon: "CreditCard",
    },
    { label: "Reports", path: "/manager/reports", icon: "BarChart" },
    { label: "Users", path: "/manager/users", icon: "Users" },
    {
      label: "Shop",
      icon: "Store",
      children: [
        { label: "Categories", path: "/manager/shop/categories", icon: "FolderTree" },
        { label: "Products", path: "/manager/shop/products", icon: "Package" },
        { label: "Inventory", path: "/manager/shop/inventory", icon: "Warehouse" },
      ],
    },
    {
      label: "Booking Settings",
      path: "/manager/booking-settings",
      icon: "Clock",
    },
    {
      label: "Loyalty Configuration",
      path: "/manager/loyalty-configuration",
      icon: "Award",
    },
    { label: "Settings", path: "/manager/settings", icon: "Settings" },
  ],

  ADMIN: [
    { label: "Dashboard", path: "/admin", icon: "Home" },
    { label: "Analytics", path: "/admin/analytics", icon: "TrendingUp" },
    { label: "Users", path: "/admin/users", icon: "Users" },
    { label: "Customers", path: "/admin/users/customers", icon: "UserCheck" },
    { label: "Staff", path: "/admin/users/staff", icon: "Briefcase" },
    { label: "Courts", path: "/admin/courts", icon: "Grid" },
    { label: "Bookings", path: "/admin/bookings", icon: "Calendar" },
    { label: "Restaurant", path: "/admin/restaurant", icon: "Utensils" },
    { label: "Menu", path: "/admin/menu", icon: "Menu" },
    { label: "Payments", path: "/admin/payments", icon: "CreditCard" },
    { label: "Reports", path: "/admin/reports", icon: "BarChart" },
    { label: "Activity", path: "/admin/activity", icon: "Activity" },
    { label: "Settings", path: "/admin/settings", icon: "Settings" },
  ],

  SUPER_ADMIN: [
    { label: "Dashboard", path: "/superadmin", icon: "Home" },
    { label: "System Config", path: "/superadmin/system", icon: "Server" },
    { label: "Database", path: "/superadmin/database", icon: "Database" },
    { label: "API Management", path: "/superadmin/api", icon: "Code" },
    { label: "Security", path: "/superadmin/security", icon: "Shield" },
    { label: "Admin Panel", path: "/admin", icon: "Settings" },
    { label: "Reports", path: "/admin/reports", icon: "BarChart" },
  ],
  BOOKING_OFFICER: [
    { label: "Dashboard", path: "/booking-officer", icon: "Home" },
    { label: "Bookings", path: "/booking-officer/bookings", icon: "Calendar" },
    {
      label: "Availability",
      path: "/booking-officer/availability",
      icon: "Clock",
    },
    {
      label: "Create Booking",
      path: "/booking-officer/create",
      icon: "PlusCircle",
    },
  ],

  FINANCE_OFFICER: [
    { label: "Dashboard", path: "/finance-officer", icon: "Home" },
    { label: "Bookings", path: "/finance-officer/bookings", icon: "Calendar" },
    {
      label: "Transactions",
      path: "/finance-officer/transactions",
      icon: "CreditCard",
    },
    {
      label: "Reconciliation",
      path: "/finance-officer/reconciliation",
      icon: "GitMerge",
    },
    { label: "Refunds", path: "/finance-officer/refunds", icon: "RotateCcw" },
    { label: "Reports", path: "/finance-officer/reports", icon: "BarChart" },
    {
      label: "Analytics",
      path: "/finance-officer/analytics",
      icon: "TrendingUp",
    },
  ],
};

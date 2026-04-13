/* eslint-disable @typescript-eslint/no-explicit-any */

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  avatar?: string | null;
  role: UserRole;
  isActive: boolean;

  isDeleted?: boolean;
  deactivatedAt?: Date | string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  lastLogin?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;

  registrationNumber?: string | null;
  isVIP?: boolean;
  tags?: string[];

  totalBookings?: number;
  totalOrders?: number;
  totalSpent?: number;
  loyaltyPoints?: number;
  membershipTier?: MembershipTier | null;
  membershipCard?: MembershipCard | null;

  staff?: StaffInfo | null;

  preferences?: UserPreferences | null;
  addresses?: Address[];
  savedCards?: SavedCard[];
}

export type UserRole =
  | "CUSTOMER"
  | "BOOKING_OFFICER"
  | "FINANCE_OFFICER"
  | "MANAGER"
  | "ADMIN"
  | "SUPER_ADMIN";

export type MembershipTier = "BRONZE" | "SILVER" | "GOLD" | "PLATINUM";

export interface CreateUserInput {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: UserRole;
  password: string;
  isActive?: boolean;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  isVIP?: boolean;
  tags?: string[];
  sendWelcomeEmail?: boolean;
  membershipTier?: MembershipTier;
}

export interface UpdateUserInput {
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  avatar?: string;
  role?: UserRole;
  isActive?: boolean;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  password?: string;
  membershipTier?: MembershipTier;
  preferences?: Partial<UserPreferences>;
  isVIP?: boolean;
  tags?: string[];
}

export interface UserFilters {
  search?: string;
  role?: UserRole | "ALL";
  status?: UserStatus | "ALL";
  verified?: VerificationStatus | "ALL";
  membershipTier?: MembershipTier | "ALL" | "NONE";
  vip?: "ALL" | "VIP" | "NON_VIP" | boolean;
  tag?: string;
  hasBookings?: boolean;
  hasOrders?: boolean;
  createdFrom?: Date | string;
  createdTo?: Date | string;
  lastLoginFrom?: Date | string;
  lastLoginTo?: Date | string;
  minSpent?: number;
  maxSpent?: number;
  minPoints?: number;
  maxPoints?: number;
  department?: string;
  position?: string;
}

export type UserStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED" | "DELETED";
export type VerificationStatus = "VERIFIED" | "UNVERIFIED" | "PARTIAL";

export interface UserResponse {
  users: User[];
  total: number;
  page: number;
  limit?: number;
  pageSize?: number;
  totalPages: number;
  hasNext?: boolean;
  hasPrevious?: boolean;
  stats?: UserStats;
}

export interface UserStats {
  total: number;
  active: number;
  inactive?: number;
  verified: number;
  unverified?: number;
  newThisMonth: number;
  newThisWeek?: number;
  newToday?: number;
  byRole?: Record<UserRole, number>;
  byMembership?: Record<MembershipTier | "NONE", number>;

  averageSpent?: number;
  totalSpent?: number;
  totalBookings?: number;
  totalLoyaltyPoints?: number;
  premiumMembers?: number;
  totalRevenue?: number;
}

export interface UserDetailsResponse {
  user: User;
  bookings: BookingSummary[];
  orders: OrderSummary[];
  payments: PaymentSummary[];
  activities: ActivityLog[];
  pointsHistory: PointsTransaction[];
}

export interface BulkUpdateInput {
  userIds: string[];
  action: BulkAction;
  value?: any;
}

export type BulkAction =
  | "activate"
  | "deactivate"
  | "setRole"
  | "verifyEmail"
  | "verifyPhone"
  | "setMembershipTier"
  | "removeMembership"
  | "delete"
  | "softDelete"
  | "sendEmail"
  | "resetPassword"
  | "addPoints"
  | "removePoints";

export interface BulkUpdateResult {
  success?: number;
  updatedCount?: number;
  failed?: number;
  errors?: Array<{
    userId: string;
    error: string;
  }>;
}

export interface BulkDeleteResult {
  deleted: number;
  failed: number;
  errors?: string[];
}

export type ExportFormat = "csv" | "xlsx" | "pdf" | "json";

export interface ImportResult {
  total: number;
  imported: number;
  failed: number;
  errors?: Array<{
    row: number;
    errors: string[];
  }>;
}

export interface ImpersonationToken {
  token: string;
  expiresAt: Date | string;
  originalUser: {
    id: string;
    email: string;
    role: UserRole;
  };
}

export interface ActivityLog {
  id: string;
  userId?: string;
  action: string;
  entity: string;
  entityId: string;
  description: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: any;
  createdAt: Date | string;
}

export interface ActivityParams {
  startDate?: Date | string;
  endDate?: Date | string;
  actions?: string[];
  limit?: number;
  offset?: number;
}

export interface SearchOptions {
  fields?: Array<"email" | "firstName" | "lastName" | "phone">;
  roles?: UserRole[];
  limit?: number;
  fuzzy?: boolean;
}

export interface GetUsersParams extends UserFilters {
  page: number;
  limit: number;
  sort?: UserSortOptions;
  include?: UserInclude[];
}

export type UserInclude =
  | "bookings"
  | "orders"
  | "payments"
  | "staff"
  | "membership"
  | "addresses"
  | "savedCards";

export interface UserSortOptions {
  field: UserSortField;
  order: "asc" | "desc";
}

export type UserSortField =
  | "createdAt"
  | "updatedAt"
  | "lastLogin"
  | "firstName"
  | "lastName"
  | "email"
  | "totalSpent"
  | "totalBookings"
  | "loyaltyPoints";

export interface StaffInfo {
  id: string;
  employeeId: string;
  departmentId: string;
  department?: Department | string;
  position: string;
  employmentType: EmploymentType;
  hourlyRate?: number | null;
  monthlySalary?: number | null;
  hireDate: Date | string;
  contractEndDate?: Date | string | null;
}

export interface Department {
  id: string;
  name: string;
  description?: string | null;
  managerId?: string | null;
  isActive: boolean;
}

export type EmploymentType =
  | "FULL_TIME"
  | "PART_TIME"
  | "CONTRACT"
  | "INTERN"
  | "CASUAL";

export interface MembershipCard {
  id: string;
  userId: string;
  cardNumber: string;
  tier: MembershipTier;
  validFrom: Date | string;
  validUntil: Date | string;
  isActive: boolean;
  benefits?: MembershipBenefit[];
}

export interface MembershipBenefit {
  id: string;
  name: string;
  description: string;
  discountPercentage?: number;
  freeItems?: string[];
}

export interface UserPreferences {
  notifications: NotificationPreferences;
  privacy: PrivacySettings;
  display: DisplaySettings;
  communication: CommunicationPreferences;
}

export interface NotificationPreferences {
  email: boolean;
  sms: boolean;
  push: boolean;
  bookingReminders: boolean;
  orderUpdates: boolean;
  promotions: boolean;
  newsletters: boolean;
}

export interface PrivacySettings {
  profileVisibility: "PUBLIC" | "MEMBERS" | "PRIVATE";
  showEmail: boolean;
  showPhone: boolean;
  allowDataAnalytics: boolean;
}

export interface DisplaySettings {
  language: "en" | "sw";
  timezone: string;
  dateFormat: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";
  timeFormat: "12h" | "24h";
}

export interface CommunicationPreferences {
  preferredChannel: "EMAIL" | "SMS" | "WHATSAPP" | "PHONE";
  marketingOptIn: boolean;
  surveyOptIn: boolean;
}

export interface Address {
  id: string;
  userId: string;
  type: AddressType;
  label: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
}

export type AddressType = "HOME" | "WORK" | "OTHER";

export interface SavedCard {
  id: string;
  userId: string;
  last4: string;
  brand: CardBrand;
  expiryMonth: number;
  expiryYear: number;
  isDefault: boolean;
  stripeCardId?: string;
  createdAt: Date | string;
}

export type CardBrand =
  | "visa"
  | "mastercard"
  | "amex"
  | "discover"
  | "diners"
  | "jcb"
  | "unionpay"
  | "unknown";

export interface BookingSummary {
  id: string;
  courtName: string;
  startTime: Date | string;
  endTime: Date | string;
  status: BookingStatus;
  totalAmount: number;
  createdAt: Date | string;
}

export interface OrderSummary {
  id: string;
  orderNumber: string;
  type: OrderType;
  status: OrderStatus;
  totalAmount: number;
  itemCount: number;
  createdAt: Date | string;
}

export interface PaymentSummary {
  id: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  reference: string;
  createdAt: Date | string;
}

export interface PointsTransaction {
  id: string;
  points: number;
  type: PointType;
  description: string;
  balance: number;
  referenceId?: string;
  createdAt: Date | string;
  expiresAt?: Date | string | null;
}

export type BookingStatus =
  | "PENDING"
  | "CONFIRMED"
  | "CHECKED_IN"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW"
  | "REFUNDED";

export type OrderType = "DINE_IN" | "TAKEAWAY" | "DELIVERY" | "COURT_SIDE";

export type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PREPARING"
  | "READY"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "COMPLETED"
  | "CANCELLED"
  | "REFUNDED";

export type PaymentMethod =
  | "CARD"
  | "MPESA"
  | "CASH"
  | "BANK_TRANSFER"
  | "PAYPAL"
  | "WALLET";

export type PaymentStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED";

export type PointType =
  | "EARNED"
  | "REDEEMED"
  | "EXPIRED"
  | "BONUS"
  | "ADJUSTMENT";

/* eslint-disable @typescript-eslint/no-explicit-any */
import api from "src/utils/api";
import { format } from "date-fns";

export interface DashboardStats {
  revenue: {
    today: number;
    yesterday: number;
    thisWeek: number;
    lastWeek: number;
    thisMonth: number;
    lastMonth: number;
    growth: string; // backend sends toFixed(1)
  };
  bookings: {
    today: number;
    yesterday: number;
    thisWeek: number;
    pending: number;
    confirmed: number;
    cancelled: number;
    occupancyRate: number;
  };
  customers: {
    total: number;
    new: number;
    active: number;
    premium: number;
    growthRate: string; // backend sends toFixed(1)
  };
  orders?: {
    today: number;
    pending: number;
    completed: number;
    revenue: number;
  };
  // Added unified period summary for manager cards
  periodSummary?: ManagerPeriodSummary;
}

export interface ManagerPeriodSummary {
  period: string; // DAY | WEEK | MONTH | YEAR
  from: string;
  to: string;
  revenue: { total: number };
  bookings: {
    total: number;
    confirmed: number;
    pending: number;
    cancelled: number;
  };
  courts: { utilizationPct: number };
  customers: {
    verifiedTotal: number;
    activeVerified: number;
    newVerified: number;
  };
}

export interface RevenueChartData {
  date: string;
  revenue: number;
  bookings: number;
}

export interface HourlyBookingData {
  hour: string;
  bookings: number;
  capacity: number;
}

export interface CourtUtilizationData {
  name: string;
  value: number;
  color: string;
}

export interface ActivityData {
  id: string;
  type: "booking" | "payment" | "customer" | "staff";
  title: string;
  description: string;
  time: Date;
  user?: string;
  amount?: number;
  read?: boolean;
}

export interface TopCustomerData {
  name: string;
  bookings: number;
  spent: number;
  loyalty: string;
  currentPoints: number;
  pointsToNextTier?: number | null;
  nextTierName?: string | null;
}

export interface TopCustomersResponse {
  data: TopCustomerData[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Advanced analytics interfaces
export interface KPIResponse {
  period: { from: string; to: string };
  revenue: { gross: number; net: number; refunds: number; growthPct: number };
  bookings: {
    total: number;
    confirmed: number;
    cancelled: number;
    pending: number;
    completed: number;
    conversionPct: number;
    avgBookingValue: number;
  };
  customers: {
    new: number;
    returning: number;
    active30d: number;
    churned30d: number;
    retentionPct: number;
  };
  courts: {
    utilizationPct: number;
    avgHoursPerCourt: number;
    peakHour: string | null;
  };
  previous?: { revenue?: { gross: number } };
}

export interface RevenueAdvancedSeriesItem {
  date: string;
  gross: number;
  net: number;
  refunds: number;
  bookings: number;
  avgBookingValue: number;
}
export interface RevenueAdvancedResponse {
  period: { from: string; to: string };
  series: RevenueAdvancedSeriesItem[];
  aggregates: {
    gross: number;
    net: number;
    refunds: number;
    refundRatePct: number;
    revenuePerCourt: number;
    revenuePerHour: number;
    peakDay?: any;
    worstDay?: any;
  };
  previous?: { aggregates: { gross: number; net: number; refunds: number } };
}

export interface BookingFunnelResponse {
  period: { from: string; to: string };
  counts: Record<string, number>;
  rates: {
    confirmRate: number;
    completionRate: number;
    cancellationRate: number;
    refundRate: number;
  };
}

export interface RefundsResponse {
  period: { from: string; to: string };
  refunds: Array<{
    paymentId: string;
    bookingCode: string | null;
    amount: number;
    refundedAt: string;
    reason?: string | null;
    daysFromPayment: number | null;
  }>;
  aggregates: {
    count: number;
    totalRefunded: number;
    avgRefundAmount: number;
    medianRefundTimeDays: number;
  };
}

export interface CustomerCohortsResponse {
  period: { from: string; to: string };
  cohorts: Array<{
    cohortMonth: string;
    newCustomers: number;
    activeCustomers: number;
  }>;
  distribution: {
    lifetimeBookings: Array<{ bucket: string; count: number }>;
    lifetimeValue: { p50: number; p75: number; p90: number; max: number };
  };
  topCustomers: Array<{
    userId: string | null;
    name: string;
    netSpend: number;
  }>;
}

class DashboardService {
  async getStats(
    courtId?: string,
    period?: string,
    date?: Date,
    startDate?: string,
    endDate?: string,
  ): Promise<DashboardStats> {
    const response = await api.get("/dashboard/stats", {
      params: {
        courtId,
        period,
        date: date ? format(date, "yyyy-MM-dd") : undefined,
        startDate,
        endDate,
      },
    });
    return response.data;
  }

  async getRevenueChart(
    days: number = 30,
    courtId?: string,
  ): Promise<RevenueChartData[]> {
    const response = await api.get("/dashboard/revenue-chart", {
      params: { days, courtId },
    });
    return response.data;
  }

  async getHourlyBookings(): Promise<HourlyBookingData[]> {
    const response = await api.get("/dashboard/hourly-bookings");
    return response.data;
  }

  async getCourtUtilization(courtId?: string): Promise<CourtUtilizationData[]> {
    const response = await api.get("/dashboard/court-utilization", {
      params: { courtId },
    });
    return response.data;
  }

  async getRecentActivities(courtId?: string): Promise<ActivityData[]> {
    const response = await api.get("/dashboard/recent-activities", {
      params: { courtId },
    });
    return response.data.map((a: any) => ({
      ...a,
      time: new Date(a.time),
    }));
  }

  async markActivityRead(type: string, id: string): Promise<void> {
    await api.patch(`/dashboard/recent-activities/${type}/${id}/read`);
  }

  async markAllActivitiesRead(): Promise<void> {
    await api.patch(`/dashboard/recent-activities/read-all`);
  }

  async getTopCustomers(
    limit: number = 5,
    page: number = 1,
  ): Promise<TopCustomersResponse> {
    const response = await api.get("/dashboard/top-customers", {
      params: { limit, page },
    });
    return response.data;
  }

  // Advanced endpoints
  async getKPIs(params?: {
    range?: string;
    from?: string;
    to?: string;
    compare?: boolean;
  }): Promise<KPIResponse> {
    const response = await api.get("/dashboard/kpis", { params });
    return response.data;
  }

  async getRevenueAdvanced(params?: {
    range?: string;
    from?: string;
    to?: string;
    compare?: boolean;
  }): Promise<RevenueAdvancedResponse> {
    const response = await api.get("/dashboard/revenue-advanced", { params });
    return response.data;
  }

  async getBookingFunnel(params?: {
    range?: string;
    from?: string;
    to?: string;
  }): Promise<BookingFunnelResponse> {
    const response = await api.get("/dashboard/booking-funnel", { params });
    return response.data;
  }

  async getRefunds(params?: {
    range?: string;
    from?: string;
    to?: string;
  }): Promise<RefundsResponse> {
    const response = await api.get("/dashboard/refunds", { params });
    return response.data;
  }

  async getCustomerCohorts(params?: {
    range?: string;
    from?: string;
    to?: string;
  }): Promise<CustomerCohortsResponse> {
    const response = await api.get("/dashboard/customer-cohorts", { params });
    return response.data;
  }
}

export const dashboardService = new DashboardService();

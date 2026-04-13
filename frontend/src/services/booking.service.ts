import api from "src/utils/api";

export type BookingStatus =
  | "PENDING"
  | "CONFIRMED"
  | "CANCELLED"
  | "COMPLETED"
  | "NO_SHOW"
  | "REFUNDED"; // added for unified cancellations view

export interface BookingListParams {
  courtId?: string;
  date?: string; // yyyy-MM-dd
  status?: BookingStatus;
  cancellations?: 1; // when set returns CANCELLED + REFUNDED enriched set
  start?: string; // range start yyyy-MM-dd
  end?: string; // range end yyyy-MM-dd (inclusive)
  page?: number;
  limit?: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface BookingListResponse {
  data: BookingRecord[];
  pagination: PaginationMeta;
}

// Manager analytics / summary types
export type ManagerPeriod = "DAY" | "WEEK" | "MONTH" | "YEAR";

export interface ManagerSummaryParams {
  period: ManagerPeriod;
  date?: string; // anchor date ISO (yyyy-MM-dd)
  start?: string; // explicit start (yyyy-MM-dd)
  end?: string; // explicit end (yyyy-MM-dd)
}

export interface ManagerBookingSummary {
  period: ManagerPeriod;
  from: string;
  to: string;
  totalBookings: number;
  revenue: number;
  averageBookingValue: number;
}

export interface BookingPriceBreakdownHourly {
  hour?: number;
  startTime?: string;
  baseRate?: number;
  finalRate?: number;
  amount?: number;
  durationMinutes?: number;
  dayOfWeek?: number;
  isPeakTime?: boolean;
}

export interface BookingPriceBreakdownEquipment {
  type?: string;
  name: string;
  quantity?: number;
  pricePerUnit?: number;
  subtotal?: number;
}

export interface BookingPriceBreakdown {
  courtSubtotal?: number;
  equipmentSubtotal?: number;
  totalAmount?: number;
  currency?: string;
  hourlyBreakdown?: BookingPriceBreakdownHourly[];
  equipment?: BookingPriceBreakdownEquipment[];
  appliedRules?: Array<{
    ruleId?: string;
    name?: string;
    type?: string;
    value?: number;
    hourIndex?: number;
    priority?: number;
  }>;
}

export interface BookingEquipmentRental {
  id?: string;
  quantity?: number;
  price?: number;
  equipment?: { type?: string; name?: string };
}

export interface BookingRecord {
  id: string;
  bookingCode: string;
  user?: { firstName: string; lastName: string; email: string };
  court?: { name: string };
  startTime: string;
  endTime: string;
  duration: number;
  status: BookingStatus;
  totalAmount: number;
  createdAt?: string;
  pricing?: {
    totalAmount: number;
    courtSubtotal: number;
    equipmentSubtotal: number;
    voucherDiscount?: number | null;
    giftCardApplied?: number | null;
    pricePerHour: number;
    equipment?: BookingPriceBreakdownEquipment[];
  };
  payment?: {
    amount?: number | null;
    status?: string;
    failureReason?: string | null;
    providerRef?: string | null;
    refundAmount?: number | null;
    refundedAt?: string | null;
  } | null;
  // Maintenance lineage enrichment (backend adds these when cancellationReason === 'MAINTENANCE')
  maintenanceId?: string;
  previousStatus?: BookingStatus;
  // Optional enrichment fields when cancellations=1
  derivedReason?: string;
  cancellationReason?: string;
  refundInfo?: { amount: number; refundedAt?: string; at?: string } | null;
  cancelActor?: {
    userId: string;
    name: string;
    role: string;
    type: "CANCEL" | "REFUND";
  };
  // Optional enrichment from backend: equipment rentals summary (rackets)
  rackets?: {
    quantity: number; // total rackets rented for this booking
    amount: number; // total revenue from rackets for this booking
  };
  balls?: {
    quantity: number; // total ball packs rented for this booking
    amount: number; // total revenue from balls for this booking
  };
  priceBreakdown?: BookingPriceBreakdown | null;
  equipmentRentals?: BookingEquipmentRental[];
  // Gift card generation tracking
  giftCardGenerated?: boolean;
  generatedGiftCardId?: string;
}

const bookingService = {
  async list(params: BookingListParams = {}): Promise<BookingRecord[]> {
    const query = new URLSearchParams();
    if (params.courtId) query.set("courtId", params.courtId);
    if (params.date) query.set("date", params.date);
    if (params.start) query.set("start", params.start);
    if (params.end) query.set("end", params.end);
    if (params.status) query.set("status", params.status);
    if (params.cancellations)
      query.set("cancellations", String(params.cancellations));
    if (params.page) query.set("page", String(params.page));
    if (params.limit) query.set("limit", String(params.limit));
    const qs = query.toString();
    const { data } = await api.get(`/bookings${qs ? `?${qs}` : ""}`);
    return data.data || data;
  },

  async listPaginated(
    params: BookingListParams = {}
  ): Promise<BookingListResponse> {
    const query = new URLSearchParams();
    if (params.courtId) query.set("courtId", params.courtId);
    if (params.date) query.set("date", params.date);
    if (params.start) query.set("start", params.start);
    if (params.end) query.set("end", params.end);
    if (params.status) query.set("status", params.status);
    if (params.cancellations)
      query.set("cancellations", String(params.cancellations));
    if (params.page) query.set("page", String(params.page));
    if (params.limit) query.set("limit", String(params.limit));
    const qs = query.toString();
    const { data } = await api.get(`/bookings${qs ? `?${qs}` : ""}`);
    return {
      data: data.data || data,
      pagination: data.pagination || { page: 1, limit: 20, total: 0, pages: 0 },
    };
  },

  async get(id: string): Promise<BookingRecord> {
    const { data } = await api.get(`/bookings/${id}`);
    return data.data || data;
  },

  async confirm(id: string): Promise<BookingRecord> {
    const { data } = await api.patch(`/bookings/${id}/confirm`);
    return data.data || data;
  },

  async cancel(id: string): Promise<BookingRecord> {
    const { data } = await api.patch(`/bookings/${id}/cancel`);
    return data.data || data;
  },

  async cancelWith2FA(
    id: string,
    sessionToken: string
  ): Promise<BookingRecord> {
    const { data } = await api.patch(`/bookings/${id}/cancel`, undefined, {
      headers: { "X-2FA-Session": sessionToken },
    });
    return data.data || data;
  },

  async generateGiftCardForBooking(
    id: string,
    sessionToken: string
  ): Promise<{
    booking: { id: string; bookingCode: string; giftCardGenerated: boolean };
    giftCard: {
      id: string;
      code: string;
      amount: number;
      balance: number;
      redeemedByUserId: string;
      redeemedAt: string;
    };
  }> {
    const { data } = await api.post(
      `/bookings/${id}/generate-giftcard`,
      undefined,
      {
        headers: { "X-2FA-Session": sessionToken },
      }
    );
    return data.data || data;
  },

  async remove(id: string, sessionToken?: string): Promise<{ id: string }> {
    const headers: Record<string, string> = {};
    if (sessionToken) headers["X-2FA-Session"] = sessionToken;
    const { data } = await api.delete(`/bookings/${id}`, { headers });
    return data.data || data;
  },

  async update(
    id: string,
    payload: Partial<{
      startTime: string;
      endTime: string;
      numberOfPlayers: number;
      courtId: string;
    }>
  ): Promise<BookingRecord> {
    const { data } = await api.patch(`/bookings/${id}`, payload);
    return data.data || data;
  },

  async reschedule(
    id: string,
    payload: {
      courtId: string;
      startTime: string;
      endTime: string;
    }
  ): Promise<BookingRecord> {
    const { data } = await api.patch(`/bookings/${id}/reschedule`, payload);
    return data.data || data;
  },

  async addEquipment(
    id: string,
    payload: {
      phoneNumber: string;
      racketQty: number;
      ballsQty: number;
      racketUnitPrice: number;
      ballsUnitPrice: number;
      ballTypeId?: string;
      ballTypeName?: string;
    }
  ): Promise<{
    success: boolean;
    data: {
      bookingId: string;
      bookingCode: string;
      totalAmount: number;
      equipment: Record<string, unknown>;
    };
    message: string;
  }> {
    const { data } = await api.post(`/bookings/${id}/add-equipment`, payload);
    return data;
  },

  async myBookings() {
    const { data } = await api.get(`/booking/my-bookings`);
    return data.data || data;
  },

  async managerSummary(
    params: ManagerSummaryParams
  ): Promise<ManagerBookingSummary> {
    const query = new URLSearchParams();
    query.set("period", params.period);
    if (params.date) query.set("date", params.date);
    if (params.start) query.set("start", params.start);
    if (params.end) query.set("end", params.end);
    const { data } = await api.get(
      `/bookings/manager/summary?${query.toString()}`
    );
    const payload = data.data || data;
    return {
      period: payload.period,
      from: payload.from,
      to: payload.to,
      totalBookings: payload.totalBookings || 0,
      revenue: payload.revenue || 0,
      averageBookingValue: payload.averageBookingValue || 0,
    };
  },

  async managerList(
    params: ManagerSummaryParams & { status?: BookingStatus }
  ): Promise<BookingRecord[]> {
    // reuse existing list endpoint with derived range
    const query = new URLSearchParams();
    if (params.period) query.set("period", params.period); // not used server-side directly but kept for cache key clarity
    if (params.date) query.set("date", params.date);
    if (params.start) query.set("start", params.start);
    if (params.end) query.set("end", params.end);
    if (params.status) query.set("status", params.status);
    const { data } = await api.get(`/bookings?${query.toString()}`);
    return data.data || data;
  },

  async exportManager(
    params: ManagerSummaryParams,
    twoFactorSession: string
  ): Promise<Blob> {
    const query = new URLSearchParams();
    query.set("period", params.period);
    if (params.date) query.set("date", params.date);
    if (params.start) query.set("start", params.start);
    if (params.end) query.set("end", params.end);
    const response = await api.get(
      `/bookings/manager/export?${query.toString()}`,
      {
        responseType: "blob",
        headers: { "X-2FA-Session": twoFactorSession },
      }
    );
    return response.data as Blob;
  },
};

export default bookingService;

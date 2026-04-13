import api from "src/utils/api";

export interface CourtRecord {
  id: string;
  name: string;
  type: string;
  status: "ACTIVE" | "MAINTENANCE" | string;
}

export interface CourtDayStats {
  courtId: string;
  date: string; // yyyy-MM-dd
  totalSlots: number;
  bookedSlots: number;
  freeSlots: number;
  maintenanceSlots: number;
  revenue: number;
  averageIncome: number;
  totalBookings: number;
}

export interface MaintenanceWindowInput {
  startTime: string; // ISO
  endTime: string; // ISO
  userId?: string; // acting user id if required
}

export interface MaintenanceWindow {
  id: string;
  startTime: string;
  endTime: string;
  duration: number;
  status: "MAINTENANCE";
}

export interface MaintenanceDryRunImpactBooking {
  id: string;
  bookingCode: string;
  customerName?: string;
  email?: string;
  phone?: string;
  amount?: string | number;
  paymentRef?: string | null;
  paid?: boolean;
  status: string;
}

export interface MaintenanceDryRunResponse {
  dryRun: true;
  proposed: { startTime: string; endTime: string; durationMinutes: number };
  impact: {
    total: number;
    paid: number;
    bookings: MaintenanceDryRunImpactBooking[];
  };
}

export interface MaintenanceCommitResponse {
  maintenanceId: string;
  cancelledCount: number;
  cancelled: Array<{
    bookingId?: string;
    id?: string;
    bookingCode: string;
    userEmail?: string;
    phone?: string;
    amount?: string | number;
    paymentRef?: string | null;
    previousStatus?: string;
  }>;
}

const courtService = {
  async list(): Promise<CourtRecord[]> {
    const { data } = await api.get("/courts");
    return data.data || data;
  },
  async updateStatus(id: string, status: string): Promise<CourtRecord> {
    const { data } = await api.patch(`/courts/${id}/status`, { status });
    return data.data || data;
  },
  async dayStats(courtId: string, date: string): Promise<CourtDayStats> {
    const { data } = await api.get(`/courts/${courtId}/day-stats?date=${date}`);
    return data.data || data;
  },
  async listMaintenance(
    courtId: string,
    date?: string
  ): Promise<MaintenanceWindow[]> {
    const qs = date ? `?date=${date}` : "";
    // Backend still serves listCourtBlackouts under /blackouts for now
    const { data } = await api.get(`/courts/${courtId}/blackouts${qs}`);
    return data.data || data;
  },
  async maintenanceDryRun(
    courtId: string,
    payload: MaintenanceWindowInput
  ): Promise<MaintenanceDryRunResponse> {
    // Prefer new dedicated maintenance endpoint; fallback to legacy blackouts only for 404 errors
    try {
      const { data } = await api.post(
        `/courts/${courtId}/maintenance?dryRun=1`,
        payload
      );
      // Transform new shape -> old expected shape if needed
      if (data?.data?.dryRun && data.data.overlaps) {
        interface NewOverlap {
          id: string;
          code?: string;
          bookingCode?: string;
          customerName?: string;
          email?: string;
          phone?: string;
          amount?: number | string;
          paymentRef?: string | null;
          paid?: boolean;
          status: string;
          startTime?: string;
          endTime?: string;
        }
        interface NewShape {
          dryRun: true;
          proposed: {
            startTime: string;
            endTime: string;
            durationMinutes: number;
          };
          overlapCount: number;
          overlaps: NewOverlap[];
          paidCount?: number;
        }
        const d = data.data as NewShape;
        return {
          dryRun: true,
          proposed: d.proposed,
          impact: {
            total: d.overlapCount,
            paid:
              typeof d.paidCount === "number"
                ? d.paidCount
                : d.overlaps.filter((o) => !!o.paid).length,
            bookings: d.overlaps.map((o) => ({
              id: o.id,
              bookingCode: o.code || o.bookingCode || "",
              customerName: o.customerName,
              email: o.email,
              phone: o.phone,
              amount: o.amount,
              paymentRef: o.paymentRef,
              paid: o.paid,
              status: o.status,
            })),
          },
        };
      }
      return (data.data || data) as MaintenanceDryRunResponse;
    } catch (err) {
      // Only fallback to legacy endpoint for 404 errors (endpoint not found)
      // For other errors (validation, overlap, etc.), rethrow to let caller handle
      const error = err as { response?: { status?: number } };
      if (error?.response?.status === 404) {
        const { data } = await api.post(
          `/courts/${courtId}/blackouts?dryRun=1`,
          payload
        );
        return (data.data || data) as MaintenanceDryRunResponse;
      }
      // Rethrow validation errors, overlap errors, etc.
      throw err;
    }
  },
  async createMaintenance(
    courtId: string,
    payload: MaintenanceWindowInput,
    twofaSession?: string
  ): Promise<MaintenanceCommitResponse> {
    const headers = twofaSession
      ? { "X-2FA-Session": twofaSession }
      : undefined;
    try {
      const { data } = await api.post(
        `/courts/${courtId}/maintenance`,
        payload,
        { headers }
      );
      return (data.data || data) as MaintenanceCommitResponse;
    } catch {
      // fallback legacy path
      const { data } = await api.post(`/courts/${courtId}/blackouts`, payload, {
        headers,
      });
      return (data.data || data) as MaintenanceCommitResponse;
    }
  },
  async cancelMaintenance(
    courtId: string,
    bookingId: string,
    twofaSession?: string
  ) {
    const headers = twofaSession
      ? { "X-2FA-Session": twofaSession }
      : undefined;
    const { data } = await api.delete(
      `/courts/${courtId}/blackouts/${bookingId}`,
      { headers }
    );
    return data;
  },
};

export default courtService;

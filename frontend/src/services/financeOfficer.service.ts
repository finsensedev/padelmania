import api from "src/utils/api";

export interface Pagination {
  page?: number;
  limit?: number;
}

export interface TransactionQuery extends Pagination {
  status?: string;
  // method?: string; // deprecated in UI (MPESA only)
  startDate?: string;
  endDate?: string;
  minAmount?: number;
  maxAmount?: number;
  search?: string;
}

export interface ReconcilePayload {
  bankReference?: string;
  reconciledAmount?: number;
  notes?: string;
  sessionToken?: string;
}

export interface BulkReconcilePayload {
  paymentIds: string[];
  bankStatementDate?: string;
  notes?: string;
  sessionToken?: string;
}

export interface RefundActionPayload {
  approvalNotes?: string;
  rejectionReason?: string;
  processingNotes?: string;
  amount?: number;
  reason?: string;
  sessionToken?: string;
}

class FinanceOfficerService {
  // Dashboard
  async getDashboardStats(params?: { startDate?: string; endDate?: string }): Promise<{
    revenue: { today: number; thisMonth: number; lastMonth: number; growth: number };
    reconciliation: { pending: number; completed: number };
    refunds: { pending: number; processed: number };
    transactions: { total: number; successful: number; failed: number };
    activeCustomers: number;
    recentTransactions: Array<{ id: string; amount: number; status: string; method: string; createdAt: string; customerName: string }>;
  }> {
    const { data } = await api.get(`/finance-officer/dashboard/stats`, { params });
    return data;
  }

  // Transactions
  async getTransactions(params: TransactionQuery = {}) {
    const { data } = await api.get(`/finance-officer/transactions`, { params });
    return data;
  }

  async exportTransactions(filters: Omit<TransactionQuery, "page" | "limit"> & { sessionToken?: string } = {}) {
    const { sessionToken, ...rest }: { sessionToken?: string } & Record<string, unknown> = filters;
    const headers: Record<string, string> = {};
    if (sessionToken) headers["X-2FA-Session"] = sessionToken;
    const response = await api.post(`/finance-officer/transactions/export`, rest, { responseType: "blob", headers });
    return response.data as Blob;
  }

  // Reconciliation
  async getPendingReconciliation(params: Pagination & { startDate?: string; endDate?: string } = {}) {
    const { data } = await api.get(`/finance-officer/reconciliation/pending`, { params });
    return data;
  }

  async reconcilePayment(paymentId: string, payload: ReconcilePayload) {
    const headers: Record<string, string> = {};
    if (payload.sessionToken) headers["X-2FA-Session"] = payload.sessionToken;
    const body: { bankReference?: string; reconciledAmount?: number; notes?: string } = {
      bankReference: payload.bankReference,
      reconciledAmount: payload.reconciledAmount,
      notes: payload.notes,
    };
    const { data } = await api.post(`/finance-officer/reconciliation/${paymentId}/reconcile`, body, { headers });
    return data;
  }

  async bulkReconcile(payload: BulkReconcilePayload) {
    const headers: Record<string, string> = {};
    if (payload.sessionToken) headers["X-2FA-Session"] = payload.sessionToken;
    const body = {
      paymentIds: payload.paymentIds,
      bankStatementDate: payload.bankStatementDate,
      notes: payload.notes,
    };
    const { data } = await api.post(`/finance-officer/reconciliation/bulk-reconcile`, body, { headers });
    return data;
  }

  // Refunds
  async getPendingRefunds(params: Pagination = {}) {
    const { data } = await api.get(`/finance-officer/refunds/pending`, { params });
    return data;
  }

  async getRefunds(params: Pagination & { status?: string; startDate?: string; endDate?: string } = {}) {
    const { data } = await api.get(`/finance-officer/refunds`, { params });
    return data;
  }

  async approveRefund(refundId: string, payload: RefundActionPayload = {}) {
    const headers: Record<string, string> = {};
    if (payload.sessionToken) headers["X-2FA-Session"] = payload.sessionToken;
    const body: { approvalNotes?: string } = { approvalNotes: payload.approvalNotes };
    const { data } = await api.post(`/finance-officer/refunds/${refundId}/approve`, body, { headers });
    return data;
  }

  async rejectRefund(refundId: string, payload: RefundActionPayload = {}) {
    const headers: Record<string, string> = {};
    if (payload.sessionToken) headers["X-2FA-Session"] = payload.sessionToken;
    const body: { rejectionReason?: string } = { rejectionReason: payload.rejectionReason };
    const { data } = await api.post(`/finance-officer/refunds/${refundId}/reject`, body, { headers });
    return data;
  }

  async processRefund(refundId: string, payload: RefundActionPayload = {}) {
    const headers: Record<string, string> = {};
    if (payload.sessionToken) headers["X-2FA-Session"] = payload.sessionToken;
    const body: { processingNotes?: string; amount?: number; reason?: string } = {
      processingNotes: payload.processingNotes,
      amount: payload.amount,
      reason: payload.reason,
    };
    const { data } = await api.post(`/finance-officer/refunds/${refundId}/process`, body, { headers });
    return data;
  }

  // Reports
  async getReportTemplates() {
    const { data } = await api.get(`/finance-officer/reports/templates`);
    return data;
  }

  async generateReport(payload: { templateId: string; parameters?: Record<string, unknown>; name?: string; sessionToken?: string }) {
    const { sessionToken, ...body } = payload;
    const headers: Record<string, string> = {};
    if (sessionToken) headers["X-2FA-Session"] = sessionToken;
    const { data } = await api.post(`/finance-officer/reports/generate`, body, { headers });
    return data;
  }

  async getReports(params: Pagination = {}) {
    const { data } = await api.get(`/finance-officer/reports`, { params });
    return data;
  }

  async getReport(reportId: string) {
    const { data } = await api.get(`/finance-officer/reports/${reportId}`);
    return data;
  }

  async downloadReport(reportId: string, sessionToken?: string) {
    const headers: Record<string, string> = {};
    if (sessionToken) headers["X-2FA-Session"] = sessionToken;
    const response = await api.get(`/finance-officer/reports/${reportId}/download`, { responseType: "blob", headers });
    return response.data as Blob;
  }

  // Reports metrics (for FO Reports top cards)
  async getReportMetrics(params?: { startDate?: string; endDate?: string }) {
    const { data } = await api.get(`/finance-officer/reports/metrics`, { params });
    return data as { period: { start: string; end: string }; metrics: {
      totalRevenue: number; totalTransactions: number; totalBookings: number; totalRefunds: number; averageTransactionValue: number;
      revenueChange?: number; transactionChange?: number; bookingChange?: number;
    } };
  }

  // Analytics
  async getRevenueAnalytics(params?: { startDate?: string; endDate?: string; groupBy?: "day" | "week" | "month" }) {
    const { data } = await api.get(`/finance-officer/analytics/revenue`, { params });
    return data;
  }

  async getTransactionAnalytics(params?: { startDate?: string; endDate?: string }) {
    const { data } = await api.get(`/finance-officer/analytics/transactions`, { params });
    return data;
  }

  async getReconciliationAnalytics(params?: { startDate?: string; endDate?: string }) {
    const { data } = await api.get(`/finance-officer/analytics/reconciliation`, { params });
    return data;
  }

  // Bookings
  async getBookings(params: Pagination & { date?: string; status?: string; paymentStatus?: string; startDate?: string; endDate?: string; courtId?: string; courtName?: string; search?: string } = {}) {
    const { data } = await api.get(`/finance-officer/bookings`, { params });
    return data;
  }

  async getBookingsByDate(date: string, params?: { courtId?: string; courtName?: string }) {
    const { data } = await api.get(`/finance-officer/bookings/${date}`, { params });
    return data;
  }

  // Exports
  async exportBookings(filters: { date?: string; startDate?: string; endDate?: string; status?: string; paymentStatus?: string; search?: string; courtId?: string; courtName?: string; sessionToken?: string } = {}) {
    const { sessionToken, ...rest }: { sessionToken?: string } & Record<string, unknown> = filters;
    const headers: Record<string, string> = {};
    if (sessionToken) headers["X-2FA-Session"] = sessionToken;
    const response = await api.post(`/finance-officer/bookings/export`, rest, { responseType: "blob", headers });
    return response.data as Blob;
  }

  async exportRefunds(filters: { status?: string; startDate?: string; endDate?: string; search?: string; sessionToken?: string } = {}) {
    const { sessionToken, ...rest }: { sessionToken?: string } & Record<string, unknown> = filters;
    const headers: Record<string, string> = {};
    if (sessionToken) headers["X-2FA-Session"] = sessionToken;
    const response = await api.post(`/finance-officer/refunds/export`, rest, { responseType: "blob", headers });
    return response.data as Blob;
  }

  async exportReconciliation(filters: { startDate?: string; endDate?: string; onlyUnreconciled?: boolean; sessionToken?: string } = {}) {
    const { sessionToken, ...rest }: { sessionToken?: string } & Record<string, unknown> = filters;
    const headers: Record<string, string> = {};
    if (sessionToken) headers["X-2FA-Session"] = sessionToken;
    const response = await api.post(`/finance-officer/reconciliation/export`, rest, { responseType: "blob", headers });
    return response.data as Blob;
  }

}

export const financeOfficerService = new FinanceOfficerService();

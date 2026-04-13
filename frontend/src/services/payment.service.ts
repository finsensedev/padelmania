import api from "src/utils/api";

export interface StkPushInitiatePayload {
  phoneNumber: string; // Accepts 07.. or 2547.. etc
  amount: number;
  bookingId?: string;
  orderId?: string;
  accountReference?: string;
  description?: string;
  reservation?: {
    courtId: string;
    startTime: string;
    endTime: string;
    duration?: number;
    numberOfPlayers?: number;
    totalAmount: number;
  };
  voucherCode?: string;
  useGiftCard?: boolean;
}

export interface StkPushResponse {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage: string;
  paymentId?: string;
}

const normalizePhone = (input: string) => {
  let phone = input.trim().replace(/[^0-9+]/g, "");
  if (phone.startsWith("+")) phone = phone.slice(1);
  if (phone.startsWith("0")) phone = `254${phone.substring(1)}`;
  if (/^7\d{8}$/.test(phone)) phone = `254${phone}`;
  return phone;
};

const paymentService = {
  async initiateStkPush(
    payload: StkPushInitiatePayload
  ): Promise<StkPushResponse> {
    const formatted = {
      ...payload,
      phoneNumber: normalizePhone(payload.phoneNumber),
    };
    const { data } = await api.post("/payments/stk-push", formatted);
    return data.data || data;
  },

  async getBookingStatus(bookingId: string) {
    // Use the customer-safe endpoint to avoid 403 on admin route
    const { data } = await api.get(`/booking/${bookingId}/status`);
    return data.data || data;
  },

  async getPayment(paymentId: string) {
    const { data } = await api.get(`/payments/${paymentId}`); // (Optional future endpoint)
    return data.data || data;
  },
  async getPaymentById(paymentId: string) {
    const { data } = await api.get(`/payments/${paymentId}`);
    return data.data || data;
  },
  async getPaymentByBooking(bookingId: string) {
    const { data } = await api.get(`/payments/by-booking/${bookingId}`);
    return data.data || data;
  },
  async listTransactions(
    params: {
      page?: number;
      limit?: number;
      search?: string;
      status?: string;
      from?: string;
      to?: string;
      mergeBookingDate?: boolean;
    } = {}
  ) {
    const { data } = await api.get(`/payments`, { params });
    return data;
  },
  async refundPayment(
    paymentId: string,
    payload: { amount?: number; reason?: string; sessionToken?: string }
  ) {
    const headers: Record<string, string> = {};
    if (payload.sessionToken) headers["X-2FA-Session"] = payload.sessionToken;
    const body: { amount?: number; reason?: string } = {};
    if (payload.amount != null) body.amount = payload.amount;
    if (payload.reason) body.reason = payload.reason;
    const { data } = await api.post(`/payments/${paymentId}/refund`, body, {
      headers,
    });
    return data;
  },

  async queryMpesaByCheckoutRequestId(checkoutRequestId: string) {
    const { data } = await api.get(
      `/payments/mpesa/query/${checkoutRequestId}`
    );
    return data;
  },

  async initiateShopPayment(payload: {
    productId: string;
    variantId?: string;
    quantity: number;
    phoneNumber: string;
  }): Promise<{ orderId: string; orderNumber: string; checkoutRequestID: string }> {
    const formatted = {
      ...payload,
      phoneNumber: normalizePhone(payload.phoneNumber),
    };
    const { data } = await api.post("/shop/orders", formatted);
    return data.data || data;
  },

  async getShopOrderStatus(orderId: string) {
    const { data } = await api.get(`/shop/orders/${orderId}`);
    return data.data || data;
  },
};

export default paymentService;

import api from "src/utils/api";

export interface VoucherValidation {
  valid: boolean;
  discount: number;
  finalAmount: number;
  quotedAmount?: number;
  code: string;
  type: "PERCENTAGE" | "AMOUNT";
  value: number;
  status?: "ACTIVE" | "SCHEDULED" | "EXPIRED" | "DISABLED" | "EXHAUSTED";
  message?: string;
}

export interface VoucherRedemption {
  userId: string;
  userName?: string;
  userEmail?: string;
  bookingId?: string | null;
  amountDiscounted: number;
  at: string;
}

export interface Voucher {
  id: string;
  code: string;
  type: "PERCENTAGE" | "AMOUNT";
  value: number;
  isActive: boolean;
  startsAt?: string | null;
  expiresAt?: string | null;
  usageLimit?: number | null; // Maximum number of redemptions allowed
  createdAt: string;
  updatedAt: string;
  disabledAt?: string | null;
  status?: "ACTIVE" | "SCHEDULED" | "EXPIRED" | "DISABLED" | "EXHAUSTED";
  // Per-user tracking
  usedByUsers?: string[];
  redemptions?: VoucherRedemption[];
}

const voucherService = {
  async validate(code: string, amount: number): Promise<VoucherValidation> {
    const { data } = await api.post("/vouchers/validate", { code, amount });
    return data.data || data;
  },
  async list(): Promise<Voucher[]> {
    const { data } = await api.get("/vouchers");
    return data.data || data;
  },
  async create(
    payload: Partial<Voucher> & { code: string; type: string; value: number },
    twoFASession?: string
  ): Promise<Voucher> {
    const { data } = await api.post("/vouchers", payload, {
      headers: twoFASession ? { "X-2FA-Session": twoFASession } : {},
    });
    return data.data || data;
  },
  async update(
    id: string,
    payload: Partial<Voucher>,
    twoFASession?: string
  ): Promise<Voucher> {
    const { data } = await api.patch(`/vouchers/${id}`, payload, {
      headers: twoFASession ? { "X-2FA-Session": twoFASession } : {},
    });
    return data.data || data;
  },
  async disable(id: string, twoFASession?: string): Promise<Voucher> {
    const { data } = await api.patch(
      `/vouchers/${id}/disable`,
      {},
      {
        headers: twoFASession ? { "X-2FA-Session": twoFASession } : {},
      }
    );
    return data.data || data;
  },
};

export default voucherService;

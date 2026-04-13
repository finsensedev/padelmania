import api from "src/utils/api";

export type GiftCardStatus = "ISSUED" | "REDEEMED" | "EXHAUSTED" | "CANCELLED";

export type LedgerEntryType = "CREDIT" | "DEBIT" | "ADJUSTMENT";

export interface BasicUser {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}

export interface AdminGiftCard {
  id: string;
  code: string;
  amount: number;
  balance: number;
  currency: string;
  status: GiftCardStatus;
  isActive: boolean;
  purchasedByUserId?: string | null;
  redeemedByUserId?: string | null;
  redeemedAt?: string | null;
  recipientEmail?: string | null;
  message?: string | null;
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
  purchasedBy?: BasicUser | null;
  redeemedBy?: BasicUser | null;
}

export interface GiftCardLedgerEntry {
  id: string;
  giftCardId: string;
  type: LedgerEntryType;
  amount: number;
  balanceAfter: number;
  note?: string | null;
  metadata?: unknown;
  createdAt: string;
  performedByUserId?: string | null;
  performedBy?: BasicUser | null;
}

export interface PaginatedResponse<T> {
  data: T;
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ListGiftCardsParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: GiftCardStatus | "";
  isActive?: boolean;
  purchasedByUserId?: string;
  redeemedByUserId?: string;
  from?: string;
  to?: string;
}

export interface IssueGiftCardPayload {
  amount: number;
  currency?: string;
  recipientEmail?: string;
  message?: string;
  expiresAt?: string | Date | null;
  assignToUserId?: string | null;
  purchasedByUserId?: string | null;
  code?: string;
}

export interface AdjustGiftCardPayload {
  direction: "CREDIT" | "DEBIT";
  amount: number;
  note?: string;
}

export interface RevokeGiftCardPayload {
  note?: string;
}

export interface ListLedgerParams {
  page?: number;
  limit?: number;
}

function buildQuery(params: Record<string, unknown>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    query.append(key, String(value));
  });
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

const adminGiftcardService = {
  async list(
    params: ListGiftCardsParams = {}
  ): Promise<PaginatedResponse<AdminGiftCard[]>> {
    const query = buildQuery(params as Record<string, unknown>);
    const { data } = await api.get(`/giftcards${query}`);
    return data;
  },
  async issue(
    payload: IssueGiftCardPayload,
    twoFACode?: string
  ): Promise<AdminGiftCard> {
    const { data } = await api.post("/giftcards", payload, {
      headers: twoFACode ? { "X-2FA-Code": twoFACode } : {},
    });
    return data.data || data;
  },
  async adjust(
    id: string,
    payload: AdjustGiftCardPayload,
    twoFACode?: string
  ): Promise<AdminGiftCard> {
    const { data } = await api.post(`/giftcards/${id}/adjust`, payload, {
      headers: twoFACode ? { "X-2FA-Code": twoFACode } : {},
    });
    return data.data || data;
  },
  async revoke(
    id: string,
    payload: RevokeGiftCardPayload = {},
    twoFACode?: string
  ): Promise<AdminGiftCard> {
    const { data } = await api.post(`/giftcards/${id}/revoke`, payload, {
      headers: twoFACode ? { "X-2FA-Code": twoFACode } : {},
    });
    return data.data || data;
  },
  async ledger(
    id: string,
    params: ListLedgerParams = {}
  ): Promise<PaginatedResponse<GiftCardLedgerEntry[]>> {
    const query = buildQuery(params as Record<string, unknown>);
    const { data } = await api.get(`/giftcards/${id}/ledger${query}`);
    return data;
  },
};

export default adminGiftcardService;

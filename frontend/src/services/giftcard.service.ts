import api from "src/utils/api";

export interface GiftCard {
  id: string;
  code: string;
  amount: number;
  balance: number;
  currency?: string;
  status?: string;
  purchasedByUserId: string;
  recipientEmail?: string | null;
  message?: string | null;
  isActive: boolean;
  createdAt: string;
  redeemedByUserId?: string | null;
  redeemedAt?: string | null;
  expiresAt?: string | null;
}

export interface GiftCardQuote {
  applied: number;
  remaining: number;
  balance: number;
  code?: string;
}

export interface GiftCardPurchaseInit {
  paymentId: string | null;
  checkoutRequestId: string | null;
  merchantRequestId: string | null;
  customerMessage: string | null;
  amount: number;
}

const giftcardService = {
  async purchase(payload: {
    amount: number;
    phoneNumber: string;
    recipientEmail?: string;
    message?: string;
  }): Promise<GiftCardPurchaseInit> {
    const { data } = await api.post("/giftcards/purchase", payload);
    return data.data || data;
  },
  async redeem(code: string): Promise<GiftCard> {
    const { data } = await api.post("/giftcards/redeem", { code });
    return data.data || data;
  },
  async quote(amount: number): Promise<GiftCardQuote> {
    const { data } = await api.post("/giftcards/quote", { amount });
    return data.data || data;
  },
  async listMine(): Promise<GiftCard[]> {
    const { data } = await api.get("/giftcards/me");
    return data.data || data;
  },
};

export default giftcardService;

import axios from "axios";

const RAW_BASE = import.meta.env.VITE_BACKEND_URL || "http://localhost:8070";
const NORMALIZED_BASE = RAW_BASE.replace(/\/?$/u, "");
const API_URL = `${NORMALIZED_BASE.replace(/\/+$/u, "")}/api`;

const publicApi = axios.create({
  baseURL: API_URL,
  timeout: 30000,
});

export interface TimeSlotPricing {
  time: string;
  hour: number;
  minutes: number;
  rate: number;
  hourlyRate: number;
  isPeak: boolean;
  appliedRule: string;
  isNextDay?: boolean;
}

export interface CourtPricingSummary {
  id: string;
  name: string;
  surface: string;
  location: string;
  isActive: boolean;
}

export interface OperatingHoursInfo {
  openTime: string;
  closeTime: string;
  isClosed: boolean;
  timezone: string;
}

export interface CourtPricingData {
  court: CourtPricingSummary;
  date: string;
  dayOfWeek: string;
  operatingHours: OperatingHoursInfo;
  timeSlots: TimeSlotPricing[];
  summary: {
    lowestRate: number;
    highestRate: number;
    peakHours: string[];
    offPeakHours: string[];
  };
}

export interface CourtWithPricing extends CourtPricingSummary {
  lowestRate: number;
  highestRate: number;
  hasPeakHours: boolean;
}

export interface AllCourtsPricingData {
  date: string;
  dayOfWeek: string;
  operatingHours: OperatingHoursInfo;
  courts: CourtWithPricing[];
  pricingSummary: {
    lowestRate: number;
    highestRate: number;
    peakTimeRanges: string[];
    offPeakTimeRanges: string[];
  };
}

export interface PublicPricingResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export async function getAllCourtsPricing(
  date?: string
): Promise<AllCourtsPricingData> {
  const params = date ? { date } : {};
  const response = await publicApi.get<
    PublicPricingResponse<AllCourtsPricingData>
  >("/public/pricing", { params });
  return response.data.data;
}

export async function getCourtPricing(
  courtId: string,
  date?: string
): Promise<CourtPricingData> {
  const params = date ? { date } : {};
  const response = await publicApi.get<PublicPricingResponse<CourtPricingData>>(
    `/public/pricing/${courtId}`,
    { params }
  );
  return response.data.data;
}

export function formatKES(amount: number): string {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatTime12h(time24: string): string {
  if (!time24) return "";
  const [h, m] = time24.split(":").map((v) => Number(v));
  if (Number.isNaN(h) || Number.isNaN(m)) return time24;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${suffix}`;
}

type PricingRule = {
  id: string;
  name: string;
  description?: string;
  priority: number;
  isActive: boolean;
  courtIds?: string[];
  conditions?: {
    dayOfWeek?: number[];
    startTime?: string; // HH:mm
    endTime?: string; // HH:mm
    membershipTiers?: string[];
  };
  pricing: {
    type: "FIXED" | "PERCENTAGE" | "MULTIPLIER";
    value: number;
  };
};

function toTimeNumber(hhmm: string | undefined): number | undefined {
  if (!hhmm) return undefined;
  const [h, m] = hhmm.split(":").map((v) => Number(v));
  if (Number.isNaN(h) || Number.isNaN(m)) return undefined;
  return h * 60 + m;
}

function withinTimeWindow(
  startMinutes: number,
  ruleStart?: string,
  ruleEnd?: string
) {
  const rs = toTimeNumber(ruleStart);
  const re = toTimeNumber(ruleEnd);
  if (rs == null || re == null) return true; // no constraint
  if (re > rs) {
    // normal window (e.g., 09:00-17:00)
    return startMinutes >= rs && startMinutes < re;
  }
  // overnight window (e.g., 22:00-02:00)
  return startMinutes >= rs || startMinutes < re;
}

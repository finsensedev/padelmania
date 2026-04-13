import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
  sub,
} from "date-fns";

export type RangePreset =
  | "day"
  | "week"
  | "month"
  | "quarter"
  | "year"
  | "custom";

export interface DateRangeResult {
  from: Date;
  to: Date; // inclusive end boundary usage: createdAt <= to
  previous?: { from: Date; to: Date };
}

export interface RangeParams {
  range?: RangePreset;
  from?: string | Date;
  to?: string | Date;
  compare?: boolean | string | number;
}

export function resolveRange(params: RangeParams): DateRangeResult {
  const { range = "month", from, to, compare } = params;
  const now = new Date();
  let start: Date;
  let end: Date;

  const normBool = (v: any) => {
    if (v === true) return true;
    if (typeof v === "string") return /^(1|true|yes)$/i.test(v);
    if (typeof v === "number") return v === 1;
    return false;
  };
  const wantCompare = normBool(compare);

  if (range === "custom") {
    if (!from || !to) throw new Error("Custom range requires from & to params");
    start = startOfDay(new Date(from));
    end = endOfDay(new Date(to));
  } else if (range === "day") {
    start = startOfDay(now);
    end = endOfDay(now);
  } else if (range === "week") {
    start = startOfWeek(now);
    end = endOfWeek(now);
  } else if (range === "month") {
    start = startOfMonth(now);
    end = endOfMonth(now);
  } else if (range === "quarter") {
    start = startOfQuarter(now);
    end = endOfQuarter(now);
  } else if (range === "year") {
    start = startOfYear(now);
    end = endOfYear(now);
  } else {
    start = startOfMonth(now);
    end = endOfMonth(now);
  }

  let previous: DateRangeResult["previous"] = undefined;
  if (wantCompare) {
    const durationMs = end.getTime() - start.getTime() + 1; // inclusive window
    const prevEnd = new Date(start.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - durationMs + 1);
    previous = { from: startOfDay(prevStart), to: endOfDay(prevEnd) };
  }

  return { from: start, to: end, previous };
}

export function safeDiv(numerator: number, denominator: number, fallback = 0) {
  if (!denominator) return fallback;
  return numerator / denominator;
}

export function pct(part: number, total: number, fallback = 0) {
  return safeDiv(part, total, fallback) * 100;
}

export function sum(nums: (number | null | undefined)[]) {
  return nums.reduce((acc: number, v) => acc + (v != null ? Number(v) : 0), 0);
}

export function median(nums: number[]) {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

export function bucketize(value: number): string {
  if (value <= 1) return "1";
  if (value <= 3) return "2-3";
  if (value <= 5) return "4-5";
  if (value <= 10) return "6-10";
  if (value <= 20) return "11-20";
  return "21+";
}

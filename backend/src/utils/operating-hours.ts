import prisma from "../config/db";

export interface OperatingDayConfig {
  dayOfWeek: number; // 0 (Sun) - 6 (Sat)
  openTime: string; // HH:mm
  closeTime: string; // HH:mm
  isClosed?: boolean;
  notes?: string;
}

export interface OperatingHoursConfig {
  timezone: string;
  days: OperatingDayConfig[];
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const DEFAULT_DAYS: OperatingDayConfig[] = [
  { dayOfWeek: 0, openTime: "06:00", closeTime: "23:00", isClosed: false },
  { dayOfWeek: 1, openTime: "06:00", closeTime: "23:00", isClosed: false },
  { dayOfWeek: 2, openTime: "06:00", closeTime: "23:00", isClosed: false },
  { dayOfWeek: 3, openTime: "06:00", closeTime: "23:00", isClosed: false },
  { dayOfWeek: 4, openTime: "06:00", closeTime: "23:00", isClosed: false },
  { dayOfWeek: 5, openTime: "06:00", closeTime: "23:00", isClosed: false },
  { dayOfWeek: 6, openTime: "06:00", closeTime: "23:00", isClosed: false },
];

export const DEFAULT_OPERATING_HOURS: OperatingHoursConfig = {
  timezone: "Africa/Nairobi",
  days: DEFAULT_DAYS,
};

let cachedConfig: OperatingHoursConfig | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function parseMinutes(value: string | undefined): number | null {
  if (!value || !TIME_RE.test(value)) return null;
  const [hours, minutes] = value.split(":").map((v) => Number(v));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function weekdayFromToken(token?: string): number | null {
  if (!token) return null;
  const map: Record<string, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };
  return map[token.toLowerCase()] ?? null;
}

function dayLabel(dayOfWeek: number): string {
  return (
    [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ][dayOfWeek] ?? `Day ${dayOfWeek}`
  );
}

function getLocalDayAndMinutes(
  date: Date,
  timeZone: string
): {
  dayOfWeek: number;
  minutes: number;
} {
  try {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const weekdayToken = parts.find((p) => p.type === "weekday")?.value;
    const day = weekdayFromToken(weekdayToken) ?? date.getUTCDay();
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");

    return {
      dayOfWeek: day,
      minutes: hour * 60 + minute,
    };
  } catch (e) {
    console.warn("Failed to resolve local time; falling back to UTC", e);
    return {
      dayOfWeek: date.getUTCDay(),
      minutes: date.getUTCHours() * 60 + date.getUTCMinutes(),
    };
  }
}

function mergeDays(rawDays?: OperatingDayConfig[]): OperatingDayConfig[] {
  if (!Array.isArray(rawDays) || rawDays.length === 0) {
    return [...DEFAULT_DAYS];
  }

  const map = new Map<number, OperatingDayConfig>();
  for (const day of rawDays) {
    if (Number.isInteger(day.dayOfWeek)) {
      map.set(day.dayOfWeek, {
        ...day,
        isClosed: Boolean(day.isClosed),
      });
    }
  }

  for (const fallback of DEFAULT_DAYS) {
    if (!map.has(fallback.dayOfWeek)) {
      map.set(fallback.dayOfWeek, { ...fallback });
    }
  }

  return Array.from(map.values()).sort((a, b) => a.dayOfWeek - b.dayOfWeek);
}

function normalizeConfig(
  raw?: Partial<OperatingHoursConfig>
): OperatingHoursConfig {
  return {
    timezone: raw?.timezone || DEFAULT_OPERATING_HOURS.timezone,
    days: mergeDays(raw?.days),
  };
}

export function validateOperatingHoursConfig(
  config: Partial<OperatingHoursConfig>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.timezone || typeof config.timezone !== "string") {
    errors.push("timezone is required");
  }

  if (!Array.isArray(config.days) || config.days.length === 0) {
    errors.push("days must include all 7 day configurations");
  } else {
    const seen = new Set<number>();
    for (const [index, day] of config.days.entries()) {
      if (
        !Number.isInteger(day.dayOfWeek) ||
        day.dayOfWeek < 0 ||
        day.dayOfWeek > 6
      ) {
        errors.push(`Invalid dayOfWeek at index ${index}`);
        continue;
      }
      if (seen.has(day.dayOfWeek)) {
        errors.push(`Duplicate day configuration for day ${day.dayOfWeek}`);
        continue;
      }
      seen.add(day.dayOfWeek);

      if (day.isClosed) continue;

      if (!TIME_RE.test(day.openTime) || !TIME_RE.test(day.closeTime)) {
        errors.push(
          `Invalid time format for ${dayLabel(
            day.dayOfWeek
          )}. Use HH:MM 24-hour format.`
        );
        continue;
      }

      const openMinutes = parseMinutes(day.openTime);
      const closeMinutes = parseMinutes(day.closeTime);

      if (openMinutes === null || closeMinutes === null) {
        errors.push(
          `Could not parse times for ${dayLabel(
            day.dayOfWeek
          )}; please re-enter`
        );
        continue;
      }

      // Allow wrap past midnight (e.g., 06:00 -> 01:00 next day)
      if (openMinutes >= closeMinutes) {
        const closeWrapped = closeMinutes + 24 * 60;
        if (closeWrapped <= openMinutes) {
          errors.push(
            `${dayLabel(
              day.dayOfWeek
            )}: closing time must be after opening time`
          );
        }
      }
    }

    if (seen.size !== 7) {
      errors.push("Exactly 7 day entries (0-6) are required");
    }
  }

  return { valid: errors.length === 0, errors };
}

export async function getOperatingHoursConfig(): Promise<OperatingHoursConfig> {
  if (cachedConfig && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedConfig;
  }

  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: "FACILITY_OPERATING_HOURS" },
    });

    if (setting?.value) {
      cachedConfig = normalizeConfig(
        setting.value as Partial<OperatingHoursConfig>
      );
      cacheTimestamp = Date.now();
      return cachedConfig;
    }
  } catch (e) {
    console.error("Failed to fetch operating hours config", e);
  }

  cachedConfig = normalizeConfig(DEFAULT_OPERATING_HOURS);
  cacheTimestamp = Date.now();
  return cachedConfig;
}

export function clearOperatingHoursCache(): void {
  cachedConfig = null;
  cacheTimestamp = 0;
}

export function isWithinOperatingHours(
  start: Date,
  end: Date,
  config?: OperatingHoursConfig
): { valid: boolean; reason?: string } {
  const cfg = normalizeConfig(config);
  const tz = cfg.timezone || DEFAULT_OPERATING_HOURS.timezone;

  if (end <= start) {
    return { valid: false, reason: "End time must be after start time" };
  }

  const startParts = getLocalDayAndMinutes(start, tz);
  const endParts = getLocalDayAndMinutes(end, tz);

  const day = cfg.days.find((d) => d.dayOfWeek === startParts.dayOfWeek);
  if (!day) {
    return {
      valid: false,
      reason: `Operating hours not configured for ${dayLabel(
        startParts.dayOfWeek
      )}`,
    };
  }

  if (day.isClosed) {
    return {
      valid: false,
      reason: `${dayLabel(startParts.dayOfWeek)} is marked as closed`,
    };
  }

  const openMinutes = parseMinutes(day.openTime);
  const closeMinutes = parseMinutes(day.closeTime);
  if (openMinutes === null || closeMinutes === null) {
    return {
      valid: false,
      reason: `Operating hours misconfigured for ${dayLabel(
        startParts.dayOfWeek
      )}`,
    };
  }

  // Handle wrap past midnight: treat close <= open as next-day close
  const windowStart = openMinutes;
  const windowEnd =
    closeMinutes > openMinutes ? closeMinutes : closeMinutes + 24 * 60;

  const endDayOffset =
    endParts.dayOfWeek === startParts.dayOfWeek
      ? 0
      : endParts.dayOfWeek === (startParts.dayOfWeek + 1) % 7
      ? 24 * 60
      : null;

  if (endDayOffset === null) {
    return {
      valid: false,
      reason:
        "Bookings cannot span multiple calendar days based on operating hours",
    };
  }

  const startMinutes = startParts.minutes;
  const endMinutes = endParts.minutes + endDayOffset;

  if (startMinutes < windowStart || endMinutes > windowEnd) {
    return {
      valid: false,
      reason: `Selected time is outside operating hours for ${dayLabel(
        startParts.dayOfWeek
      )} (${day.openTime} - ${day.closeTime})`,
    };
  }

  return { valid: true };
}

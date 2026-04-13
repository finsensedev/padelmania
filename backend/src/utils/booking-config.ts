import prisma from "../config/db";

interface BookingSlotConfig {
  allowedDurations: number[];
  defaultDuration: number;
  minDuration: number;
  maxDuration: number;
}

const DEFAULT_CONFIG: BookingSlotConfig = {
  allowedDurations: [60, 120, 180],
  defaultDuration: 60,
  minDuration: 60,
  maxDuration: 180,
};

let cachedConfig: BookingSlotConfig | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get the system booking slot durations configuration
 */
export async function getBookingSlotConfig(): Promise<BookingSlotConfig> {
  // Return cached config if still valid
  if (cachedConfig && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedConfig;
  }

  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: "BOOKING_SLOT_DURATIONS" },
    });

    if (setting && setting.value) {
      const config = setting.value as any;
      cachedConfig = {
        allowedDurations:
          config.allowedDurations || DEFAULT_CONFIG.allowedDurations,
        defaultDuration:
          config.defaultDuration || DEFAULT_CONFIG.defaultDuration,
        minDuration: config.minDuration || DEFAULT_CONFIG.minDuration,
        maxDuration: config.maxDuration || DEFAULT_CONFIG.maxDuration,
      };
      cacheTimestamp = Date.now();
      return cachedConfig;
    }
  } catch (error) {
    console.error("Error fetching booking slot config:", error);
  }

  // Return default config if not found or error
  return DEFAULT_CONFIG;
}

/**
 * Get allowed booking durations (in minutes)
 */
export async function getAllowedDurations(): Promise<number[]> {
  const config = await getBookingSlotConfig();
  return config.allowedDurations;
}

/**
 * Check if a duration is allowed
 * @param minutes - Duration in minutes
 * @param isReschedule - If true, allows any duration (for legacy bookings)
 * @param originalDuration - Original booking duration (for reschedule validation)
 */
export async function isDurationAllowed(
  minutes: number,
  isReschedule: boolean = false,
  originalDuration?: number
): Promise<boolean> {
  // For reschedules, allow the original duration even if not in current config
  if (isReschedule && originalDuration && minutes === originalDuration) {
    return true;
  }

  const allowed = await getAllowedDurations();
  return allowed.includes(minutes);
}

/**
 * Get the default booking duration
 */
export async function getDefaultDuration(): Promise<number> {
  const config = await getBookingSlotConfig();
  return config.defaultDuration;
}

/**
 * Validate booking slot configuration
 */
export function validateSlotConfig(config: Partial<BookingSlotConfig>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (config.allowedDurations) {
    if (
      !Array.isArray(config.allowedDurations) ||
      config.allowedDurations.length === 0
    ) {
      errors.push("allowedDurations must be a non-empty array");
    } else {
      // Check all durations are valid
      for (const duration of config.allowedDurations) {
        if (!Number.isInteger(duration) || duration <= 0) {
          errors.push(
            `Invalid duration: ${duration}. Must be a positive integer.`
          );
        }
        if (duration % 30 !== 0) {
          errors.push(`Duration ${duration} must be a multiple of 30 minutes`);
        }
        if (duration < 15) {
          errors.push(`Duration ${duration} must be at least 15 minutes`);
        }
        if (duration > 24 * 60) {
          errors.push(
            `Duration ${duration} cannot exceed 24 hours (1440 minutes)`
          );
        }
      }

      // Check durations are sorted
      const sorted = [...config.allowedDurations].sort((a, b) => a - b);
      if (JSON.stringify(sorted) !== JSON.stringify(config.allowedDurations)) {
        errors.push("allowedDurations must be sorted in ascending order");
      }
    }
  }

  if (config.defaultDuration !== undefined) {
    if (!config.allowedDurations?.includes(config.defaultDuration)) {
      errors.push("defaultDuration must be one of the allowedDurations");
    }
  }

  if (config.minDuration !== undefined && config.maxDuration !== undefined) {
    if (config.minDuration > config.maxDuration) {
      errors.push("minDuration cannot be greater than maxDuration");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Clear the cached config (useful for testing or after updates)
 */
export function clearConfigCache(): void {
  cachedConfig = null;
  cacheTimestamp = 0;
}

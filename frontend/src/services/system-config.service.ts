import api from "../utils/api";

export interface BookingSlotConfig {
  allowedDurations: number[];
  defaultDuration: number;
  minDuration: number;
  maxDuration: number;
}

export interface OperatingDayConfig {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isClosed?: boolean;
  notes?: string;
}

export interface OperatingHoursConfig {
  timezone: string;
  days: OperatingDayConfig[];
}

export const DEFAULT_OPERATING_HOURS: OperatingHoursConfig = {
  timezone: "Africa/Nairobi",
  days: [
    { dayOfWeek: 0, openTime: "06:00", closeTime: "23:00", isClosed: false },
    { dayOfWeek: 1, openTime: "06:00", closeTime: "23:00", isClosed: false },
    { dayOfWeek: 2, openTime: "06:00", closeTime: "23:00", isClosed: false },
    { dayOfWeek: 3, openTime: "06:00", closeTime: "23:00", isClosed: false },
    { dayOfWeek: 4, openTime: "06:00", closeTime: "23:00", isClosed: false },
    { dayOfWeek: 5, openTime: "06:00", closeTime: "23:00", isClosed: false },
    { dayOfWeek: 6, openTime: "06:00", closeTime: "23:00", isClosed: false },
  ],
};

class SystemConfigService {
  /**
   * Get booking slot durations configuration
   */
  async getBookingSlots(): Promise<BookingSlotConfig> {
    const response = await api.get("/admin/system-config/booking-slots");
    return response.data.data;
  }

  /**
   * Update booking slot durations configuration
   */
  async updateBookingSlots(
    config: Partial<BookingSlotConfig>,
    sessionToken?: string
  ): Promise<BookingSlotConfig> {
    const response = await api.put(
      "/admin/system-config/booking-slots",
      config,
      sessionToken
        ? {
            headers: {
              "X-2FA-Session": sessionToken,
            },
          }
        : undefined
    );
    return response.data.data;
  }

  /**
   * Reset booking slot configuration to defaults
   */
  async resetBookingSlots(sessionToken?: string): Promise<BookingSlotConfig> {
    const response = await api.post(
      "/admin/system-config/booking-slots/reset",
      {},
      sessionToken
        ? {
            headers: {
              "X-2FA-Session": sessionToken,
            },
          }
        : undefined
    );
    return response.data.data;
  }

  /**
   * Get facility operating hours
   */
  async getOperatingHours(): Promise<OperatingHoursConfig> {
    const response = await api.get("/admin/system-config/operating-hours");
    return response.data.data;
  }

  /**
   * Update facility operating hours (2FA protected)
   */
  async updateOperatingHours(
    config: OperatingHoursConfig,
    sessionToken?: string
  ): Promise<OperatingHoursConfig> {
    const response = await api.put(
      "/admin/system-config/operating-hours",
      config,
      sessionToken
        ? {
            headers: {
              "X-2FA-Session": sessionToken,
            },
          }
        : undefined
    );
    return response.data.data;
  }

  /**
   * Reset operating hours to defaults (2FA protected)
   */
  async resetOperatingHours(
    sessionToken?: string
  ): Promise<OperatingHoursConfig> {
    const response = await api.post(
      "/admin/system-config/operating-hours/reset",
      {},
      sessionToken
        ? {
            headers: {
              "X-2FA-Session": sessionToken,
            },
          }
        : undefined
    );
    return response.data.data;
  }
}

export default new SystemConfigService();

/* eslint-disable react-refresh/only-export-components */
import React, { createContext } from "react";
import type { ReactNode } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "../redux/store";
import { useQuery } from "react-query";
import systemConfigService from "../services/system-config.service";
import type {
  BookingSlotConfig,
  OperatingHoursConfig,
} from "../services/system-config.service";
import { DEFAULT_OPERATING_HOURS } from "../services/system-config.service";

interface SystemConfigContextType {
  bookingSlotConfig: BookingSlotConfig;
  operatingHoursConfig: OperatingHoursConfig;
  isLoading: boolean;
  error: string | null;
  refreshConfig: () => Promise<void>;
}

export const SystemConfigContext = createContext<
  SystemConfigContextType | undefined
>(undefined);

const DEFAULT_BOOKING_CONFIG: BookingSlotConfig = {
  allowedDurations: [60, 120, 180],
  defaultDuration: 60,
  minDuration: 60,
  maxDuration: 180,
};

export const SystemConfigProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { user } = useSelector((state: RootState) => state.userState);

  const {
    data: bookingSlotConfig,
    isLoading: slotsLoading,
    error: slotsError,
    refetch: refetchSlots,
  } = useQuery<BookingSlotConfig, Error>(
    ["bookingSlotConfig"],
    async () => {
      const config = await systemConfigService.getBookingSlots();

      return config;
    },
    {
      enabled: !!user, // Only fetch when user is authenticated
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
      retry: 1,
      onError: (err) => {
        console.error("❌ Failed to fetch booking slot config:", err);
      },
      // Use placeholderData instead of initialData so it will still fetch
      placeholderData: DEFAULT_BOOKING_CONFIG,
    }
  );

  const {
    data: operatingHoursConfig,
    isLoading: hoursLoading,
    error: hoursError,
    refetch: refetchOperatingHours,
  } = useQuery<OperatingHoursConfig, Error>(
    ["operatingHoursConfig"],
    async () => {
      const config = await systemConfigService.getOperatingHours();
      return config;
    },
    {
      enabled: !!user,
      staleTime: 5 * 60 * 1000,
      cacheTime: 10 * 60 * 1000,
      retry: 1,
      onError: (err) => {
        console.error("❌ Failed to fetch operating hours:", err);
      },
      placeholderData: DEFAULT_OPERATING_HOURS,
    }
  );

  const refreshConfig = async () => {
    await Promise.all([refetchSlots(), refetchOperatingHours()]);
  };

  return (
    <SystemConfigContext.Provider
      value={{
        bookingSlotConfig: bookingSlotConfig || DEFAULT_BOOKING_CONFIG,
        operatingHoursConfig: operatingHoursConfig || DEFAULT_OPERATING_HOURS,
        isLoading: slotsLoading || hoursLoading,
        error: slotsError?.message || hoursError?.message || null,
        refreshConfig,
      }}
    >
      {children}
    </SystemConfigContext.Provider>
  );
};

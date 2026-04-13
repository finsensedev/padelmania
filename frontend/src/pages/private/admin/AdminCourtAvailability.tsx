/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useContext, useMemo, useState } from "react";
import { useQuery } from "react-query";
import api from "src/utils/api";
import { Input } from "src/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { Badge } from "src/components/ui/badge";
import { Info } from "lucide-react";
import { addDays, format, startOfDay } from "date-fns";
import { SystemConfigContext } from "src/contexts/SystemConfigProvider";
import { DEFAULT_OPERATING_HOURS } from "src/services/system-config.service";

type Court = {
  id: string;
  name: string;
  type?: string;
  surface?: string;
  isActive: boolean;
};

type Booking = {
  id: string;
  bookingCode: string;
  courtId: string;
  startTime: string;
  endTime: string;
  duration: number;
  status:
    | "PENDING"
    | "CONFIRMED"
    | "CANCELLED"
    | "COMPLETED"
    | "CHECKED_IN"
    | "MAINTENANCE";
  totalAmount: number;
  numberOfPlayers: number;
  user?: {
    firstName: string;
    lastName: string;
    email: string;
  };
  equipmentRentals?: Array<{
    id: string;
    quantity: number;
    equipment: {
      id: string;
      name: string;
      type: "RACKET" | "BALLS";
      rentalPrice: number;
    };
  }>;
  priceBreakdown?: {
    totalAmount?: number;
    courtSubtotal?: number;
    equipmentSubtotal?: number;
  };
};

type TimeSlot = {
  hour: number;
  minutes: number; // 0 or 30 for half-hour slots
  time: string;
  booking?: Booking;
  isAvailable: boolean;
  rate: number;
  appliedRule?: string | null;
  isPeak?: boolean;
  isMaintenance?: boolean;
};

type AvailabilityData = {
  court: Court & { pricingRules?: number };
  date: string;
  timeSlots: TimeSlot[];
};

const formatTimeLabel = (time24: string) => {
  if (!time24) return "";
  const [h, m] = time24.split(":").map((v) => Number(v));
  if (Number.isNaN(h) || Number.isNaN(m)) return time24;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${suffix}`;
};

function AdminCourtAvailability() {
  const systemConfig = useContext(SystemConfigContext);
  const operatingHoursConfig =
    systemConfig?.operatingHoursConfig || DEFAULT_OPERATING_HOURS;

  const [selectedCourt, setSelectedCourt] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );

  const selectedDateObj = useMemo(() => {
    const [y, m, d] = selectedDate.split("-").map(Number);
    if (!y || !m || !d) return startOfDay(new Date());
    // Use UTC constructor to avoid local timezone shifting the intended day
    return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  }, [selectedDate]);

  const timeZone =
    operatingHoursConfig.timezone || DEFAULT_OPERATING_HOURS.timezone;

  // Resolve current offset for facility timezone so past/future checks use Nairobi time
  // Helpers to interpret times in the facility timezone without relying on the browser timezone
  const getTzParts = useCallback(
    (date: Date) => {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const parts = formatter.formatToParts(date);
      const filled: Record<string, string> = {};
      for (const p of parts) {
        if (p.type !== "literal") filled[p.type] = p.value;
      }
      return {
        year: Number(filled.year),
        month: Number(filled.month),
        day: Number(filled.day),
        hour: Number(filled.hour),
        minute: Number(filled.minute),
      };
    },
    [timeZone]
  );

  const nowTz = useMemo(() => getTzParts(new Date()), [getTzParts]);

  const selectedDayMeta = useMemo(() => {
    const date = selectedDateObj;
    const day = date.getUTCDay();
    const dayConfig = operatingHoursConfig.days.find(
      (d) => d.dayOfWeek === day
    );
    const dayLabel = new Date(date).toLocaleDateString("en-KE", {
      weekday: "long",
      timeZone,
    });

    if (!dayConfig) {
      return {
        label: dayLabel,
        text: "Operating hours not configured",
      };
    }

    if (dayConfig.isClosed) {
      return {
        label: dayLabel,
        text: `${dayLabel}: Closed`,
      };
    }

    return {
      label: dayLabel,
      text: `${dayLabel}: ${formatTimeLabel(
        dayConfig.openTime
      )} - ${formatTimeLabel(dayConfig.closeTime)} (${
        operatingHoursConfig.timezone
      })`,
    };
  }, [operatingHoursConfig, selectedDateObj, timeZone]);

  const selectedDayWindow = useMemo(() => {
    const date = selectedDateObj;
    const dayOfWeek = date.getUTCDay();
    const dayConfig = operatingHoursConfig.days.find(
      (d) => d.dayOfWeek === dayOfWeek
    );
    if (!dayConfig || dayConfig.isClosed)
      return { open: 0, close: 0, wraps: false };

    const [oh, om] = dayConfig.openTime.split(":").map(Number);
    const [ch, cm] = dayConfig.closeTime.split(":").map(Number);
    const open = oh * 60 + om;
    const closeRaw = ch * 60 + cm;
    const wraps = closeRaw <= open;
    const close = wraps ? closeRaw + 24 * 60 : closeRaw;
    return { open, close, wraps };
  }, [operatingHoursConfig, selectedDateObj]);

  const nextDateStr = useMemo(() => {
    const next = addDays(selectedDateObj, 1);
    return format(next, "yyyy-MM-dd");
  }, [selectedDateObj]);

  // Fetch courts query
  const {
    data: courts = [],
    isLoading: courtsLoading,
    error: courtsError,
  } = useQuery<Court[]>({
    queryKey: ["courts"],
    queryFn: async () => {
      const res = await api.get("/court");
      const data = res?.data?.data ?? res?.data ?? [];
      const activeCourts = Array.isArray(data)
        ? data.filter((c: Court) => c.isActive)
        : [];

      // Set first court as selected if none selected
      if (activeCourts.length > 0 && !selectedCourt) {
        setSelectedCourt(activeCourts[0].id);
      }

      return activeCourts;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch availability query
  const {
    data: availabilityData,
    isLoading: availabilityLoading,
    error: availabilityError,
  } = useQuery<AvailabilityData>({
    queryKey: ["availability", selectedCourt, selectedDate],
    queryFn: async () => {
      const res = await api.get(
        `/court/${selectedCourt}/availability?date=${selectedDate}`
      );
      // Handle both possible response structures
      return res.data.data || res.data;
    },
    enabled: !!selectedCourt && !!selectedDate,
    staleTime: 1 * 60 * 1000, // 1 minute
  });

  const {
    data: nextDayAvailability,
    isLoading: nextDayLoading,
    error: nextDayError,
  } = useQuery<AvailabilityData>({
    queryKey: ["availability", selectedCourt, nextDateStr, "next"],
    queryFn: async () => {
      const res = await api.get(
        `/court/${selectedCourt}/availability?date=${nextDateStr}`
      );
      return res.data.data || res.data;
    },
    enabled:
      !!selectedCourt &&
      !!selectedDate &&
      !!nextDateStr &&
      selectedDayWindow.wraps,
    staleTime: 1 * 60 * 1000,
  });

  const formatKES = (v: number) =>
    new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: "KES",
      maximumFractionDigits: 0,
    }).format(v);

  // Calculate minutes until midnight (00:00) for a given slot
  const getMinutesUntilMidnight = (slot: TimeSlot): number => {
    const MIDNIGHT_MINUTES = 24 * 60; // 1440 minutes
    const slotStartMinutes = slot.hour * 60 + (slot.minutes || 0);
    return MIDNIGHT_MINUTES - slotStartMinutes;
  };

  // Check if slot is close to midnight (< 120 minutes)
  const isNearMidnight = (slot: TimeSlot): boolean => {
    const minutesLeft = getMinutesUntilMidnight(slot);
    return minutesLeft <= 120 && minutesLeft > 0;
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<
      string,
      "default" | "secondary" | "destructive" | "outline"
    > = {
      PENDING: "outline",
      CONFIRMED: "default",
      CANCELLED: "destructive",
      COMPLETED: "secondary",
      CHECKED_IN: "default",
      MAINTENANCE: "outline",
    };
    return <Badge variant={variants[status] || "outline"}>{status}</Badge>;
  };

  const getEquipment = (booking: Booking) => {
    if (!booking.equipmentRentals || booking.equipmentRentals.length === 0) {
      return { rackets: 0, packs: 0 };
    }

    const rackets = booking.equipmentRentals
      .filter((r) => r.equipment.type === "RACKET")
      .reduce((sum, r) => sum + r.quantity, 0);

    const packs = booking.equipmentRentals
      .filter((r) => r.equipment.type === "BALLS")
      .reduce((sum, r) => sum + r.quantity, 0);

    return { rackets, packs };
  };

  // Calculate accurate booking total based on priceBreakdown or totalAmount
  const calculateBookingTotal = (booking: Booking): number => {
    // IMPORTANT: Always use booking's totalAmount as the source of truth
    // The priceBreakdown can be stale if pricing rules changed after booking
    if (booking.totalAmount && Number(booking.totalAmount) > 0) {
      return Number(booking.totalAmount);
    }

    // Fallback to priceBreakdown if totalAmount is not available
    if (
      booking.priceBreakdown?.totalAmount &&
      Number(booking.priceBreakdown.totalAmount) > 0
    ) {
      return Number(booking.priceBreakdown.totalAmount);
    }

    // Final fallback to 0 if neither are available
    return 0;
  };

  // Calculate total revenue from booked slots
  const calculateTotalRevenue = () => {
    if (!availabilityData?.timeSlots) return 0;

    // Use a Set to track unique booking IDs and avoid counting the same booking multiple times
    const uniqueBookings = new Map<string, number>();

    availabilityData.timeSlots
      .filter((slot) => slot.booking && slot.booking.status === "CONFIRMED")
      .forEach((slot) => {
        if (slot.booking && !uniqueBookings.has(slot.booking.id)) {
          uniqueBookings.set(
            slot.booking.id,
            calculateBookingTotal(slot.booking)
          );
        }
      });

    return Array.from(uniqueBookings.values()).reduce(
      (sum, amount) => sum + amount,
      0
    );
  };

  const mergedSlots = useMemo(() => {
    const baseSlots = availabilityData?.timeSlots || [];
    const wraps = selectedDayWindow.wraps;
    const dayOpen = selectedDayWindow.open;

    // Base entries: if the window wraps, push early-morning slots (hour < open) to the end
    const baseEntries = baseSlots
      .map((slot) => {
        const base = slot.hour * 60 + (slot.minutes || 0);
        const normalized = wraps && base < dayOpen ? base + 24 * 60 : base;
        return { slot, isNextDay: false, normalized };
      })
      .sort((a, b) => a.normalized - b.normalized);

    // When the backend already returns wrap-midnight slots in the same payload, skip next-day merge to avoid duplicates
    if (wraps) {
      return baseEntries;
    }

    // Non-wrapping days: no next-day carry, but keep structure for safety
    const nextSlotsRaw = nextDayAvailability?.timeSlots || [];
    const carryMinutes = selectedDayWindow.close - 24 * 60; // minutes to carry into next day

    const nextEntries = nextSlotsRaw
      .map((slot) => ({
        slot,
        isNextDay: true,
        normalized: slot.hour * 60 + (slot.minutes || 0),
      }))
      .filter((entry) => entry.normalized < carryMinutes)
      .map((entry) => ({ ...entry, normalized: entry.normalized + 24 * 60 }))
      .sort((a, b) => a.normalized - b.normalized);

    return [...baseEntries, ...nextEntries];
  }, [
    availabilityData?.timeSlots,
    nextDayAvailability?.timeSlots,
    selectedDayWindow,
  ]);

  // Determine error message
  const error = courtsError || availabilityError || nextDayError;
  const errorMessage = error
    ? (error as any)?.response?.data?.message || "Failed to load data"
    : null;

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 bg-background h-full overflow-auto">
      <div className="flex items-center w-full justify-between">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          Court Availability
        </h1>
      </div>

      {/* Filters */}
      <Card className="w-full">
        <CardHeader className="px-4 sm:px-6">
          <CardTitle className="text-lg sm:text-xl">
            Select Court & Date
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Court</label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={selectedCourt}
                onChange={(e) => setSelectedCourt(e.target.value)}
                disabled={courtsLoading}
              >
                <option value="">
                  {courtsLoading ? "Loading courts..." : "Select a court"}
                </option>
                {courts.map((court) => (
                  <option key={court.id} value={court.id}>
                    {court.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Date</label>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
              />
            </div>
          </div>

          {availabilityData?.court && (
            <div className="mt-4 p-3 sm:p-4 bg-muted/50 rounded-md border-l-4 border-l-primary/60">
              <h3 className="font-medium mb-2 text-sm sm:text-base">
                {availabilityData.court.name}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 text-xs sm:text-sm">
                <div>
                  <span className="text-muted-foreground">Active Rules: </span>
                  <span className="font-medium">
                    {availabilityData.court.pricingRules || 0}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Status: </span>
                  <Badge
                    variant={
                      availabilityData.court.isActive ? "default" : "secondary"
                    }
                    className="text-xs"
                  >
                    {availabilityData.court.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Availability Grid */}
      {selectedCourt && (
        <Card className="w-full">
          <CardHeader className="px-4 sm:px-6">
            <CardTitle className="text-base sm:text-lg leading-tight">
              Availability for{" "}
              {new Date(selectedDate).toLocaleDateString("en-KE", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </CardTitle>
            <div className="mt-2 text-xs text-muted-foreground flex items-start gap-1.5">
              <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>{selectedDayMeta.text}</span>
            </div>
          </CardHeader>
          <CardContent className="px-2 sm:px-6">
            {availabilityLoading || nextDayLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-muted-foreground text-sm">
                  Loading availability...
                </div>
              </div>
            ) : errorMessage ? (
              <div className="bg-destructive/15 text-destructive px-3 sm:px-4 py-2.5 sm:py-3 rounded-md text-xs sm:text-sm mx-2 sm:mx-0">
                {errorMessage}
              </div>
            ) : availabilityData ? (
              (() => {
                const displayedBookingCodes = new Set<string>();

                return (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3">
                    {mergedSlots.map(({ slot, isNextDay, normalized }) => {
                      // Check if slot is in the past using facility timezone day/minute comparisons
                      const slotDateBase = isNextDay
                        ? addDays(selectedDateObj, 1)
                        : selectedDateObj;

                      const slotYear = slotDateBase.getUTCFullYear();
                      const slotMonth = slotDateBase.getUTCMonth() + 1;
                      const slotDay = slotDateBase.getUTCDate();

                      const slotKey =
                        slotYear * 10000 + slotMonth * 100 + slotDay;
                      const nowKey =
                        nowTz.year * 10000 + nowTz.month * 100 + nowTz.day;

                      // Wrap-midnight slots (00:00–01:00) belong to next calendar day for comparison
                      const slotHour = slot.hour;
                      const isWrapSlot =
                        slotHour < 6 && selectedDayWindow.wraps;
                      const adjustedSlotKey = isWrapSlot
                        ? slotKey + 1
                        : slotKey;

                      const slotEndMinutes =
                        slot.hour * 60 + (slot.minutes || 0) + 30;
                      const nowMinutes = nowTz.hour * 60 + nowTz.minute;

                      const isPast =
                        adjustedSlotKey < nowKey ||
                        (adjustedSlotKey === nowKey &&
                          slotEndMinutes <= nowMinutes);

                      return (
                        <Card
                          key={`${normalized}-${slot.hour}-${
                            slot.minutes || 0
                          }-${isNextDay ? "next" : "base"}`}
                          className={`p-3 transition-all hover:shadow-md cursor-pointer ${
                            isPast
                              ? "bg-muted-foreground/30 border border-muted-foreground opacity-80"
                              : slot.isAvailable
                              ? "bg-green-50 border-green-200 dark:bg-green-950/10 dark:border-green-900"
                              : slot.booking?.status === "MAINTENANCE"
                              ? "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-900"
                              : "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-900"
                          }`}
                        >
                          <div className="flex flex-col gap-2">
                            {/* Time */}
                            <div className="text-lg font-mono font-bold">
                              {slot.time}
                            </div>

                            {/* Status badges */}
                            <div className="flex flex-wrap gap-1">
                              {isPast ? (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                                >
                                  Past
                                </Badge>
                              ) : (
                                <Badge
                                  variant={
                                    slot.isAvailable
                                      ? "default"
                                      : slot.booking?.status === "MAINTENANCE"
                                      ? "outline"
                                      : "secondary"
                                  }
                                  className="text-[10px]"
                                >
                                  {slot.isAvailable
                                    ? "Free"
                                    : slot.booking?.status === "MAINTENANCE"
                                    ? "Maint"
                                    : "Booked"}
                                </Badge>
                              )}
                              {slot.isPeak && !isPast && (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px]"
                                >
                                  Peak
                                </Badge>
                              )}
                              {isNearMidnight(slot) &&
                                slot.isAvailable &&
                                !isPast && (
                                  <Badge
                                    variant="outline"
                                    className="text-[9px] bg-orange-50 border-orange-300 text-orange-700 dark:bg-orange-950/20"
                                  >
                                    ⏰ {getMinutesUntilMidnight(slot)}m
                                  </Badge>
                                )}
                            </div>

                            {/* Price */}
                            <div className="text-sm font-mono font-semibold text-muted-foreground">
                              {formatKES(slot.rate)}
                            </div>

                            {/* Rule name (truncated) */}
                            {slot.appliedRule && (
                              <div className="text-[10px] text-muted-foreground truncate">
                                {slot.appliedRule}
                              </div>
                            )}
                            {/* Booking info if booked */}
                            {slot.booking &&
                              slot.booking.status !== "MAINTENANCE" &&
                              (() => {
                                const bookingCode = slot.booking!.bookingCode;
                                const isFirstSlot =
                                  !displayedBookingCodes.has(bookingCode);

                                if (isFirstSlot) {
                                  displayedBookingCodes.add(bookingCode);
                                  return (
                                    <div className="pt-2 border-t text-[10px] space-y-1">
                                      <div className="font-medium truncate">
                                        {slot.booking!.user?.firstName}{" "}
                                        {slot.booking!.user?.lastName}
                                      </div>
                                      <div className="text-muted-foreground">
                                        {bookingCode}
                                      </div>
                                      {(() => {
                                        const { rackets, packs } = getEquipment(
                                          slot.booking!
                                        );
                                        return rackets > 0 || packs > 0 ? (
                                          <div className="flex flex-wrap gap-1 mt-1">
                                            {rackets > 0 && (
                                              <Badge
                                                variant="outline"
                                                className="text-[9px] px-1 h-4"
                                              >
                                                <svg
                                                  className="w-4 fill-success"
                                                  viewBox="0 0 850 885"
                                                  fill="none"
                                                  xmlns="http://www.w3.org/2000/svg"
                                                >
                                                  <path
                                                    fillRule="evenodd"
                                                    clipRule="evenodd"
                                                    d="M408.501 1.4716C372.368 8.0106 350.483 35.1596 347.508 77.1366C347.027 83.9186 346.792 90.5866 346.984 91.9556C347.176 93.3236 347.867 104.345 348.518 116.446C350.003 144.039 349.119 152.881 343.769 163.944C338.913 173.986 329.856 182.843 318.22 188.927L309.645 193.411L311.69 197.427C316.445 206.768 324.431 217.137 334.841 227.487C353.973 246.508 372.479 256.779 398.948 263.068C407.598 265.123 411.445 265.444 427.448 265.444C441.871 265.444 447.623 265.044 453.547 263.627L461.146 261.81L458.797 252.767C456.051 242.194 455.766 231.981 457.981 223.479C461.973 208.151 470.36 198.92 502.054 174.967C526.478 156.509 540.521 139.066 547.559 118.444C549.647 112.326 549.941 109.679 549.889 97.4436C549.836 84.7146 549.583 82.7886 547.106 76.2316C541.527 61.4606 533.95 50.3866 521.244 38.4336C491.475 10.4286 444.36 -5.0174 408.501 1.4716ZM297.077 44.0276C290.238 51.4136 284.389 59.7556 278.034 71.1846C275.973 74.8926 273.894 78.1676 273.416 78.4636C272.938 78.7586 267.912 78.2106 262.247 77.2446C248.127 74.8356 223.527 74.8856 209.507 77.3506C174.881 83.4396 142.759 101.569 111.933 132.42C67.246 177.143 24.295 256.19 7.051 325.444C1.31 348.499 0.0670064 358.817 0.00600644 383.944C-0.0459936 404.959 0.200011 408.66 2.33101 418.944C11.256 462.007 32.825 494.188 71.084 521.526C122.152 558.016 182.551 576.151 266.155 580.095C291.092 581.272 335.546 580.256 360.948 577.93C401.509 574.216 439.279 569.357 488.948 561.464C533.616 554.366 540.963 553.593 564.448 553.518C584.114 553.456 588.285 553.729 597.563 555.689C614.531 559.274 612.792 558.485 714.948 608.934C738.598 620.614 760.225 631.2 763.008 632.46C765.792 633.72 771.867 638.246 776.508 642.517C786.271 651.501 792.497 655.696 805.278 661.903C813.27 665.784 814.638 666.172 815.836 664.903C817.816 662.803 849.448 600.465 849.448 598.661C849.448 597.717 844.481 594.716 836.198 590.656C822.645 584.013 820.213 583.2 805.448 580.381C796.723 578.715 796.872 578.784 754.948 556.953C748.898 553.803 736.748 547.5 727.948 542.947C719.148 538.393 708.348 532.768 703.948 530.447C699.548 528.125 686.498 521.374 674.948 515.445C648.026 501.624 639.041 495.715 627.93 484.526C610.068 466.539 598.098 448.068 573.442 400.444C550.234 355.618 516.732 295.398 507.809 282.471C505.645 279.336 506.083 278.523 512.698 273.381C521.506 266.535 531.709 256.636 538.4 248.444C548.446 236.144 548.111 235.169 537.387 245.492C525.762 256.681 516.99 263.363 504.665 270.417C456.228 298.138 395.466 297.503 347.538 268.776C307.383 244.707 280.098 204.607 272.786 158.914C270.437 144.239 270.657 121.821 273.296 106.944C277.487 83.3156 286.819 61.2576 300.691 42.1936C302.792 39.3056 304.314 36.9436 304.073 36.9436C303.832 36.9436 300.684 40.1316 297.077 44.0276ZM324.509 50.9986C306.077 73.5056 295.448 103.839 295.448 133.935C295.448 145.444 296.054 150.56 299.091 164.694C300.508 171.287 300.87 171.944 303.088 171.944C308.997 171.944 319.186 163.552 323.32 155.28C327.515 146.886 327.816 143.231 327.884 99.9436C327.94 63.3516 328.161 57.6326 329.745 51.5846C330.733 47.8126 331.408 44.3686 331.245 43.9306C331.082 43.4936 328.051 46.6736 324.509 50.9986ZM185.066 97.5076C178.393 99.9536 163.403 107.847 155.003 113.338C118.181 137.407 84.739 179.046 54.525 238.444C29.935 286.785 16.386 329.702 13.326 368.944C9.04201 423.879 26.621 467.915 65.936 500.73C96.081 525.892 132.782 543.693 177.448 554.818C233.837 568.863 302.302 571.16 387.948 561.88C408.229 559.683 437.883 555.89 453.448 553.503C471.889 550.674 497.09 546.775 508.948 544.916C542.607 539.638 580.539 538.086 596.905 541.317C615.975 545.083 614.62 544.467 736.448 604.741L776.948 624.779L786.54 633.611C795.488 641.85 807.598 649.587 809.606 648.346C810.052 648.071 815.36 638.011 821.402 625.991C829.652 609.577 832.083 603.896 831.167 603.166C828.672 601.177 823.24 598.819 822.608 599.45C822.249 599.81 818.104 607.606 813.398 616.774C806.306 630.591 804.508 633.384 802.895 633.094C801.824 632.901 796.673 629.123 791.448 624.697C786.223 620.271 780.009 615.783 777.639 614.724C775.268 613.664 773.102 612.206 772.824 611.482C772.547 610.759 774.823 605.174 777.884 599.072C780.944 592.97 783.448 587.531 783.448 586.986C783.448 586.108 778.405 582.944 777.005 582.944C776.707 582.944 773.637 588.583 770.182 595.476L763.901 608.008L753.698 603.018L743.494 598.028L745.221 594.236C746.171 592.15 748.861 586.741 751.198 582.216C753.536 577.691 755.448 573.54 755.448 572.992C755.448 571.793 749.691 568.672 748.669 569.316C748.272 569.566 745.271 574.984 741.999 581.357C738.727 587.73 735.456 592.944 734.729 592.944C733.199 592.944 715.448 584.174 715.448 583.419C715.448 583.141 718.148 577.527 721.448 570.944C724.748 564.361 727.448 558.608 727.448 558.16C727.448 557.321 720.543 554.491 719.987 555.102C719.816 555.29 716.928 560.943 713.569 567.664C708.459 577.891 707.175 579.764 705.705 579.147C701.858 577.533 688.893 570.766 688.047 569.931C687.515 569.406 689.711 563.883 693.411 556.44C696.856 549.509 699.512 543.694 699.312 543.518C699.112 543.342 697.519 542.472 695.772 541.584C692.6 539.971 692.593 539.974 690.668 543.207C689.607 544.987 686.591 550.719 683.965 555.944C681.338 561.169 679.07 565.584 678.924 565.756C678.777 565.927 674.109 563.785 668.55 560.995L658.443 555.923L664.445 543.949C667.747 537.363 670.448 531.304 670.448 530.485C670.448 529.666 669.143 528.321 667.549 527.496C663.954 525.637 664.293 525.241 656.919 539.944C653.747 546.269 651.059 551.566 650.945 551.715C650.747 551.975 631.422 543.035 630.496 542.254C630.248 542.045 632.933 536.041 636.464 528.912C643.341 515.026 643.405 514.194 637.733 512.495C635.718 511.891 634.921 513.027 628.87 525.138C625.213 532.456 622.062 538.617 621.867 538.828C621.672 539.039 618.911 538.264 615.731 537.105C602.52 532.292 594.249 530.727 579.448 530.24C563.229 529.707 558.795 530.203 461.448 543.418C382.173 554.18 339.119 557.419 285.948 556.621C247.289 556.042 227.29 554.165 199.948 548.552C148.787 538.049 104.845 516.975 73.246 487.787C57.902 473.613 43.803 451.698 37.066 431.548C31.467 414.801 30.094 405.229 30.02 382.444C29.953 361.568 30.945 350.38 34.099 336.444C42.25 300.426 52.839 271.861 72.28 233.444C104.459 169.857 140.105 126.919 180.67 102.881C192.589 95.8166 192.241 96.0586 190.448 96.0726C189.623 96.0796 187.201 96.7246 185.066 97.5076ZM554.864 151.694C549.054 160.225 535.147 173.572 514.303 190.621C485.418 214.248 478.312 223.611 478.066 238.374C477.948 245.482 480.481 253.944 482.727 253.944C484.69 253.944 498.732 245.606 506.729 239.691C530.985 221.75 548.094 196.222 555.892 166.333C558.237 157.344 560.103 145.944 559.229 145.944C558.982 145.944 557.018 148.532 554.864 151.694ZM203.211 175.509C197.272 178.732 195.613 187.61 199.981 192.801C205.18 198.98 213.257 198.816 218.28 192.43C220.884 189.12 221.19 182.448 218.887 179.161C215.485 174.304 208.452 172.665 203.211 175.509ZM245.544 196.209C239.913 199.103 237.81 205.575 240.439 211.921C242.03 215.764 246.034 217.944 251.498 217.944C257.285 217.944 262.451 212.916 262.441 207.294C262.426 198.241 253.273 192.237 245.544 196.209ZM137.848 199.344C134.946 202.246 134.448 203.432 134.448 207.444C134.448 211.456 134.946 212.642 137.848 215.544C140.54 218.236 142.05 218.943 145.098 218.94C156.288 218.929 161.38 206.354 153.265 198.773C150.871 196.537 149.295 195.944 145.742 195.944C141.964 195.944 140.706 196.486 137.848 199.344ZM181.96 218.157C176.346 221.412 174.292 227.706 176.99 233.391C181.097 242.046 193.743 242.165 197.813 233.587C198.712 231.692 199.448 229.378 199.448 228.444C199.448 225.25 196.181 219.857 193.363 218.4C190.012 216.667 184.724 216.555 181.96 218.157ZM222.868 239.771C213.142 245.887 217.547 260.944 229.064 260.944C232.944 260.944 234.17 260.422 237.048 257.544C239.926 254.666 240.448 253.44 240.448 249.56C240.448 245.959 239.851 244.308 237.666 241.861C234.034 237.797 227.48 236.871 222.868 239.771ZM115.848 242.344C111.988 246.204 111.339 250.9 113.965 255.977C119.341 266.372 135.448 262.137 135.448 250.328C135.448 246.448 134.926 245.222 132.048 242.344C129.146 239.442 127.96 238.944 123.948 238.944C119.936 238.944 118.75 239.442 115.848 242.344ZM264.762 260.894C260.733 263.351 259.448 265.762 259.448 270.862C259.448 273.878 260.15 275.687 262.198 277.947C269.136 285.604 280.793 282.247 282.14 272.205C283.475 262.252 273.346 255.66 264.762 260.894ZM159.077 262.014C152.577 267.144 152.365 275.172 158.591 280.411C169.058 289.218 183.445 274.552 174.661 264.03C172.353 261.265 171.02 260.61 166.911 260.219C162.821 259.83 161.443 260.146 159.077 262.014ZM101.948 277.12C96.03 278.792 93.448 282.404 93.448 289.01C93.448 292.528 94.026 293.753 97.019 296.576C99.664 299.07 101.493 299.944 104.069 299.944C111.844 299.944 117.135 294.104 116.133 286.629C115.214 279.78 108.489 275.272 101.948 277.12ZM307.478 281.223C303.484 283.244 300.198 288.898 300.805 292.704C301.561 297.44 304.959 301.671 308.712 302.547C315.545 304.143 320.461 302.082 323.12 296.506C327.69 286.922 316.952 276.43 307.478 281.223ZM200.722 283.044C194.272 287.175 194.336 297.858 200.836 301.875C205.083 304.5 209.797 304.509 214.016 301.902C219.326 298.62 220.483 292.825 217.171 286.109C214.634 280.967 206.37 279.427 200.722 283.044ZM140.204 299.699C131.096 305.346 134.421 319.192 145.233 320.642C156.372 322.136 162.561 308.522 154.265 300.773C150.682 297.426 144.616 296.963 140.204 299.699ZM349.948 301.898C346.462 303.34 343.301 307.616 342.78 311.596C341.353 322.491 356.609 328.911 363.403 320.275C365.91 317.087 366.173 309.424 363.887 306.161C360.846 301.819 354.69 299.937 349.948 301.898ZM243.704 302.973C239.933 304.489 237.273 309.807 237.784 314.812C238.407 320.932 241.759 324.075 248.334 324.707C253.08 325.163 253.62 324.972 256.923 321.669C259.956 318.636 260.448 317.488 260.448 313.444C260.448 309.432 259.95 308.246 257.048 305.344C254.318 302.614 252.889 301.956 249.798 302.007C247.681 302.042 244.938 302.477 243.704 302.973ZM182.211 320.509C180.705 321.326 178.792 323.311 177.961 324.92C172.009 336.43 186.061 347.491 195.787 338.951C200.271 335.015 201.082 330.884 198.442 325.431C195.413 319.175 188.521 317.085 182.211 320.509ZM75.402 322.694C69.261 328.181 70.741 337.957 78.251 341.521C85.622 345.019 94.448 339.815 94.448 331.971C94.448 327.24 92.305 322.473 89.503 320.974C88.445 320.407 85.532 319.944 83.03 319.944C79.479 319.944 77.804 320.548 75.402 322.694ZM390.763 323.408C383.113 326.735 382.255 338.224 389.266 343.438C394.611 347.413 403.581 345.164 406.38 339.147C409.088 333.323 406.439 325.674 400.914 323.365C396.736 321.62 394.856 321.628 390.763 323.408ZM284.673 324.948C281.008 327.183 279.448 330.366 279.448 335.609C279.448 338.296 280.264 339.96 282.848 342.544C285.75 345.446 286.936 345.944 290.948 345.944C294.96 345.944 296.146 345.446 299.048 342.544C308.759 332.833 296.451 317.767 284.673 324.948ZM224.836 340.871C221.019 342.51 218.448 346.859 218.448 351.679C218.448 355.424 218.997 356.693 221.848 359.544C224.75 362.446 225.936 362.944 229.948 362.944C233.96 362.944 235.146 362.446 238.048 359.544C240.926 356.666 241.448 355.44 241.448 351.56C241.448 345.134 237.66 340.903 231.416 340.356C228.958 340.14 225.998 340.372 224.836 340.871ZM116.848 344.344C112.316 348.876 112.064 354.869 116.198 359.799C121.265 365.843 131.372 364.859 134.931 357.977C137.557 352.9 136.908 348.204 133.048 344.344C130.146 341.442 128.96 340.944 124.948 340.944C120.936 340.944 119.75 341.442 116.848 344.344ZM431.638 344.913C427.692 347.386 425.075 352.971 425.965 357.021C426.772 360.696 431.378 365.637 434.796 366.495C441.353 368.141 448.359 362.971 449.137 355.912C449.576 351.928 449.268 351.03 446.289 347.623C442.03 342.751 436.67 341.76 431.638 344.913ZM327.544 345.209C319.957 349.108 318.862 360.254 325.595 365.048C332.066 369.657 340.493 367.048 343.346 359.553C347.052 349.815 336.76 340.472 327.544 345.209ZM163.948 361.702C154.757 363.887 152.145 375.684 159.411 382.194C168.002 389.892 181.884 379.652 177.43 368.901C175.388 363.971 168.923 360.519 163.948 361.702ZM264.962 363.112C261.397 365.916 259.304 370.973 260.087 374.889C260.747 378.191 266.417 383.873 269.233 384.055C279.08 384.69 285.18 377.668 282.513 368.768C280.36 361.582 270.816 358.507 264.962 363.112ZM366.33 368.826C362.432 372.725 362.22 373.232 362.703 377.517C363.64 385.823 370.923 390.338 378.496 387.308C390.065 382.679 387.54 366.61 375.021 365.199C370.736 364.716 370.229 364.928 366.33 368.826ZM307.204 383.64C304.216 385.557 301.448 390.488 301.448 393.895C301.448 396.874 304.001 401.517 306.665 403.383C309.464 405.344 315.674 405.395 319.363 403.488C323.062 401.575 325.821 395.747 325.029 391.522C323.638 384.109 313.478 379.616 307.204 383.64ZM98.863 384.365C89.735 388.34 88.952 400.266 97.488 405.308C101.196 407.499 105.246 407.364 109.258 404.918C117.307 400.011 116.598 388.615 107.988 384.53C103.988 382.632 102.89 382.612 98.863 384.365ZM201.665 384.505C191.481 391.638 197.548 407.267 209.861 405.616C217.693 404.565 221.788 396.174 218.253 388.416C215.948 383.357 206.488 381.126 201.665 384.505ZM410.763 387.408C403.123 390.731 402.358 402.111 409.402 407.662C411.336 409.186 418.57 409.301 421.736 407.859C429.58 404.285 429.038 390.76 420.914 387.365C416.736 385.62 414.856 385.628 410.763 387.408ZM509.948 386.889C503.865 389.379 501.812 395.35 500.989 412.944C500.16 430.701 498.414 440.698 494.388 450.753C487.223 468.647 480.055 477.937 461.452 493.441C453.817 499.803 446.643 506.51 445.51 508.344C441.309 515.141 443.743 522.451 451.406 526.056C456.59 528.495 458.14 528.453 489.448 525.033C566.955 516.565 564.524 516.954 572.108 511.799C577.258 508.299 580.064 503.854 580.961 497.778C582.087 490.15 580.059 483.92 571.804 469.661C547.026 426.856 542.141 418.405 536.418 408.444C528.217 394.171 524.962 390.082 520.008 387.832C515.627 385.842 513.088 385.604 509.948 386.889ZM349.763 404.408C345.963 406.06 343.448 410.476 343.448 415.494C343.448 418.312 344.223 419.919 346.848 422.544C349.795 425.491 350.894 425.94 355.098 425.911C362.062 425.863 366.448 421.676 366.448 415.075C366.448 410.36 364.772 407.112 361.223 404.948C357.412 402.625 354.209 402.474 349.763 404.408ZM244.836 404.924C238.197 407.607 236.253 417.456 241.257 423.057C243.538 425.609 245.039 426.294 249.233 426.697C254.098 427.165 254.603 426.989 257.923 423.669C260.956 420.636 261.448 419.488 261.448 415.444C261.448 411.432 260.95 410.246 258.048 407.344C255.318 404.614 253.889 403.956 250.798 404.007C248.681 404.042 245.998 404.455 244.836 404.924ZM138.274 406.656C128.072 412.985 135.026 429.747 146.927 427.514C152.685 426.434 155.626 423.151 156.201 417.16C156.669 412.294 156.493 411.789 153.173 408.469C150.205 405.501 148.96 404.948 145.298 404.971C142.906 404.985 139.745 405.744 138.274 406.656ZM390.762 425.894C386.656 428.398 385.448 430.763 385.448 436.301C385.448 439.968 386.004 441.347 388.487 443.829C392.345 447.687 397.136 448.674 401.371 446.484C409.218 442.426 410.497 433.126 404.024 427.195C399.845 423.364 395.594 422.948 390.762 425.894ZM286.836 425.924C283.054 427.452 280.448 431.839 280.448 436.679C280.448 440.424 280.997 441.693 283.848 444.544C286.618 447.314 288.014 447.944 291.383 447.944C296.207 447.944 299.96 445.788 301.999 441.845C307.047 432.083 297.195 421.738 286.836 425.924ZM179.749 427.902C170.816 433.349 175.582 448.944 186.179 448.944C196.902 448.944 202.054 436.396 194.451 428.794C190.937 425.279 184.674 424.899 179.749 427.902ZM225.734 446.657C224.517 446.886 222.18 448.326 220.542 449.856C212.555 457.318 217.655 469.929 228.663 469.94C233.467 469.945 239.117 465.227 240.01 460.465C241.459 452.743 233.631 445.172 225.734 446.657ZM327.421 447.648C322.012 451.376 320.39 456.476 322.788 462.216C326.643 471.442 341.699 470.939 344.306 461.496C347.2 451.015 335.937 441.778 327.421 447.648ZM118.948 448.347C113.932 450.561 111.948 453.575 111.948 458.983C111.948 462.959 112.465 464.352 114.873 466.866C122.465 474.791 134.448 469.941 134.448 458.944C134.448 453.094 131.838 449.424 126.653 447.984C122.18 446.742 122.631 446.721 118.948 448.347ZM369.211 468.509C365.798 470.361 363.448 474.771 363.448 479.323C363.448 484.651 368.841 489.944 374.269 489.944C376.516 489.944 379.426 489.456 380.736 488.859C385.687 486.603 388.225 478.133 385.484 473.012C382.673 467.758 374.674 465.545 369.211 468.509ZM161.746 468.609C160.535 468.863 158.172 470.633 156.496 472.542C151.336 478.419 152.794 487.003 159.547 490.495C167.631 494.675 176.448 488.928 176.448 479.479C176.448 472.762 168.824 467.126 161.746 468.609ZM262.402 470.694C258.911 473.813 257.586 479.651 259.338 484.194C262.112 491.389 273.302 493.029 278.666 487.027C280.851 484.58 281.448 482.929 281.448 479.328C281.448 475.448 280.926 474.222 278.048 471.344C275.17 468.466 273.944 467.944 270.064 467.944C266.476 467.944 264.811 468.541 262.402 470.694ZM303.983 492.048C300.822 494.823 300.448 495.68 300.448 500.148C300.448 504.496 300.889 505.585 303.848 508.544C306.432 511.128 308.096 511.944 310.783 511.944C316.026 511.944 319.209 510.384 321.444 506.719C328.53 495.096 314.212 483.066 303.983 492.048ZM199.31 492.199C192.046 498.381 194.942 510.82 204.043 512.528C215.847 514.742 223.313 500.575 214.494 492.694C210.428 489.061 203.272 488.827 199.31 492.199ZM242.756 511.954C238.263 513.763 235.582 520.807 237.357 526.141C240.04 534.208 250.983 536.386 256.698 529.99C258.844 527.588 259.448 525.913 259.448 522.362C259.448 519.86 258.985 516.947 258.418 515.889C256.21 511.762 248.217 509.754 242.756 511.954ZM225.648 737.144C224.988 737.804 224.448 738.669 224.448 739.065C224.448 739.68 196.156 806.698 193.471 812.444C192.957 813.544 187.836 825.469 182.091 838.944C176.346 852.419 169.801 867.627 167.547 872.739C165.292 877.851 163.448 882.475 163.448 883.014C163.448 883.625 169.564 883.89 179.69 883.719L195.932 883.444L202.397 867.194L208.861 850.944H240.186C269.118 850.944 271.558 851.078 272.127 852.694C272.466 853.656 273.521 856.244 274.473 858.444C275.424 860.644 277.875 866.719 279.92 871.944C281.965 877.169 284.1 882.007 284.665 882.694C286.23 884.597 317.448 884.474 317.448 882.565C317.448 881.806 316.365 878.769 315.041 875.815C311.048 866.907 300.33 841.987 288.432 813.944C282.247 799.369 276.398 785.644 275.433 783.444C274.468 781.244 269.52 769.656 264.437 757.694L255.195 735.944H241.022C231.331 735.944 226.468 736.324 225.648 737.144ZM5.19801 737.51C4.78601 737.932 4.44801 771.064 4.44801 811.136V883.995L20.198 883.719L35.948 883.444L36.217 861.847L36.486 840.251L54.717 839.649C82.215 838.742 94.794 834.657 106.449 822.848C115.728 813.447 119.902 802.154 119.719 786.944C119.545 772.531 113.174 757.869 103.622 749.899C99.021 746.06 87.534 740.512 80.948 738.949C75.226 737.59 6.39701 736.283 5.19801 737.51ZM372.946 738.096C372.662 738.837 372.547 771.844 372.689 811.444L372.948 883.444L401.948 883.742C433.988 884.072 445.511 883.174 457.163 879.437C471.176 874.943 486.724 863.617 494.662 852.119C502.168 841.245 507.448 824.219 507.448 810.885C507.448 775.395 484.325 747.088 448.948 739.272C439.059 737.087 373.717 736.076 372.946 738.096ZM568.691 737.767C567.698 738.402 567.488 753.721 567.691 811.007L567.948 883.444L623.726 883.702L679.503 883.961L679.226 869.702L678.948 855.444L639.198 855.183L599.448 854.921V839.433V823.944H633.948H668.448V809.944V795.944H633.948H599.448V780.956V765.967L638.698 765.706L677.948 765.444V751.444V737.444L623.948 737.204C594.248 737.073 569.383 737.326 568.691 737.767ZM740.691 737.758C739.698 738.4 739.488 753.725 739.691 811.007L739.948 883.444L792.198 883.703L844.448 883.962V869.465V854.969L808.198 854.706L771.948 854.444L771.448 795.944L770.948 737.444L756.448 737.195C748.473 737.057 741.383 737.311 740.691 737.758ZM36.448 788.525V811.106L54.198 810.771C70.242 810.467 72.347 810.222 76.103 808.217C83.544 804.247 87.462 797.276 87.426 788.072C87.384 777.176 80.995 769.299 70.348 767.016C67.599 766.426 58.847 765.944 50.899 765.944H36.448V788.525ZM404.906 767.194C404.642 767.882 404.543 787.794 404.687 811.444L404.948 854.444L419.448 854.731C436.218 855.062 445.119 853.545 452.948 849.022C464.215 842.511 471.735 830.988 473.416 817.654C476.576 792.605 462.276 771.189 439.562 766.949C431.499 765.445 405.506 765.628 404.906 767.194ZM238.528 778.194C237.757 780.185 235.327 786.143 223.652 814.653C222.028 818.618 220.943 822.106 221.24 822.403C221.538 822.701 230.309 822.944 240.731 822.944C258.352 822.944 259.649 822.82 259.219 821.178C258.088 816.851 240.867 775.961 240.173 775.953C239.747 775.948 239.007 776.957 238.528 778.194Z"
                                                    // fill="black"
                                                  />
                                                </svg>{" "}
                                                {rackets}
                                              </Badge>
                                            )}
                                            {packs > 0 && (
                                              <Badge
                                                variant="outline"
                                                className="text-[9px] px-1 h-4"
                                              >
                                                🎾
                                                {packs}
                                              </Badge>
                                            )}
                                          </div>
                                        ) : null;
                                      })()}
                                      <div className="font-mono font-semibold">
                                        {formatKES(
                                          calculateBookingTotal(slot.booking!)
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1 mt-1">
                                        {getStatusBadge(slot.booking!.status)}
                                      </div>
                                    </div>
                                  );
                                }

                                return (
                                  <div className="pt-2 border-t text-[10px] text-muted-foreground italic">
                                    ↳ {bookingCode}
                                  </div>
                                );
                              })()}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                );
              })()
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* Summary Stats */}
      {selectedCourt && !availabilityLoading && availabilityData && (
        <div className="grid w-full grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-4 sm:p-6">
              <div className="text-xl sm:text-2xl font-bold text-green-600">
                {availabilityData.timeSlots?.filter((s) => s.isAvailable)
                  .length || 0}
              </div>
              <div className="text-xs sm:text-sm text-muted-foreground mt-1">
                Available Slots
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-red-500">
            <CardContent className="p-4 sm:p-6">
              <div className="text-xl sm:text-2xl font-bold text-red-600">
                {availabilityData.timeSlots?.filter(
                  (s) => !s.isAvailable && s.booking?.status !== "MAINTENANCE"
                ).length || 0}
              </div>
              <div className="text-xs sm:text-sm text-muted-foreground mt-1">
                Booked Slots
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-yellow-500">
            <CardContent className="p-4 sm:p-6">
              <div className="text-xl sm:text-2xl font-bold text-yellow-600">
                {availabilityData.timeSlots?.filter(
                  (s) => s.booking?.status === "MAINTENANCE"
                ).length || 0}
              </div>
              <div className="text-xs sm:text-sm text-muted-foreground mt-1">
                Maintenance
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-primary col-span-2 lg:col-span-1">
            <CardContent className="p-4 sm:p-6">
              <div className="text-xl sm:text-2xl font-bold font-mono text-primary">
                {formatKES(calculateTotalRevenue())}
              </div>
              <div className="text-xs sm:text-sm text-muted-foreground mt-1">
                Total Revenue
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

export default AdminCourtAvailability;

import { useState, useEffect, useMemo, useRef } from "react";
import { format } from "date-fns";
import { Calendar, Clock, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "src/components/ui/button";
import { Label } from "src/components/ui/label";
import { useMutation, useQuery, useQueryClient } from "react-query";
import api from "src/utils/api";
import bookingService from "src/services/booking.service";
import useNotification from "src/hooks/useNotification";
import useModal from "src/hooks/useModal";

interface Booking {
  id: string;
  bookingCode: string;
  court?: {
    id?: string;
    name: string;
    type: string;
  };
  courtId?: string;
  startTime: string;
  endTime: string;
  duration: number;
  status: string;
  totalAmount: number;
  pricing?: {
    totalAmount: number;
    courtSubtotal: number;
    equipmentSubtotal: number;
    voucherDiscount?: number | null;
    giftCardApplied?: number | null;
    pricePerHour: number;
  };
  rackets?: {
    quantity: number;
    amount: number;
  };
}

interface Court {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
}

interface TimeSlot {
  time: string;
  hour: number;
  minutes: number;
  isAvailable: boolean;
  rate: number;
  isSelectable?: boolean;
  disabledReason?: string | null;
  totalBlockPrice?: number;
  averagePricePerHour?: number;
  isPartOfOriginalBooking?: boolean;
  isOriginalStartSlot?: boolean;
  blockCrossesOriginalPrice?: boolean;
  blockMaxRate?: number;
}

interface RescheduleBookingModalProps {
  booking: Booking;

  onSuccess?: () => void;
}

export default function RescheduleBookingModal({
  booking,

  onSuccess,
}: RescheduleBookingModalProps) {
  const { toaster } = useNotification();
  const queryClient = useQueryClient();
  const { popModal } = useModal();
  const notifiedRef = useRef(false);

  // Parse original booking details (use local timezone, not UTC)
  const bookingStartDate = new Date(booking.startTime);
  const originalDate = format(bookingStartDate, "yyyy-MM-dd");
  const originalCourtId = booking.court?.id || booking.courtId || "";
  // Get the hour from the formatted time to avoid timezone issues
  const originalStartHour = parseInt(format(bookingStartDate, "HH"));

  // Calculate original price per hour for price-lock validation
  const originalPricePerHour = useMemo(() => {
    const hours = booking.duration > 0 ? booking.duration / 60 : 0;
    if (hours <= 0) return 0;

    const normalized = (value: unknown | null | undefined) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : undefined;
    };

    const directPricePerHour = normalized(booking.pricing?.pricePerHour);
    if (directPricePerHour != null) {
      return directPricePerHour;
    }

    const courtSubtotal = normalized(booking.pricing?.courtSubtotal);
    if (courtSubtotal != null) {
      return courtSubtotal / hours;
    }

    const equipmentSubtotal =
      normalized(booking.pricing?.equipmentSubtotal) ??
      normalized(booking.rackets?.amount) ??
      0;

    const inferredCourtSubtotal =
      normalized(booking.totalAmount) != null
        ? Number(booking.totalAmount) - equipmentSubtotal
        : undefined;

    if (inferredCourtSubtotal != null && inferredCourtSubtotal > 0) {
      return inferredCourtSubtotal / hours;
    }

    const fallbackTotal = normalized(booking.totalAmount) ?? 0;
    return fallbackTotal / hours;
  }, [booking]);

  const [selectedDate, setSelectedDate] = useState<string>(originalDate);
  const [selectedCourtId, setSelectedCourtId] =
    useState<string>(originalCourtId);
  // Duration is fixed based on original booking/payment - cannot be changed during reschedule
  const selectedDurationHours = booking.duration / 60;
  const rescheduleCutoff = bookingStartDate.getTime() - 24 * 60 * 60 * 1000;
  const canReschedule = Date.now() < rescheduleCutoff;

  // Initialize with the original booking's start hour
  const [selectedStartHour, setSelectedStartHour] = useState<number | null>(
    originalStartHour
  );
  const [hasUserAdjustedSlot, setHasUserAdjustedSlot] = useState(false);

  // Check if we're viewing the original date and court
  const isOriginalDateAndCourt =
    selectedDate === originalDate && selectedCourtId === originalCourtId;

  // Debug logging

  // Fetch courts
  const { data: courts = [] } = useQuery<Court[]>({
    queryKey: ["courts"],
    queryFn: async () => {
      const response = await api.get("/court");
      const courtsData = response.data.data || response.data;
      // Filter only active courts
      const activeCourts = Array.isArray(courtsData)
        ? courtsData.filter((c: Court) => c.isActive)
        : [];
      return activeCourts;
    },
  });

  // Fetch availability for selected court and date
  const { data: availability = [], isLoading: loadingSlots } = useQuery<
    TimeSlot[]
  >({
    queryKey: ["court-availability", selectedCourtId, selectedDate],
    queryFn: async () => {
      if (!selectedCourtId || !selectedDate) return [];
      const response = await api.get(
        `/court/${selectedCourtId}/availability?date=${selectedDate}`
      );
      const responseData = response.data.data || response.data;
      // The API returns { court, date, timeSlots }, we need the timeSlots array
      const timeSlots = responseData.timeSlots || responseData;
      // Ensure we always return an array
      return Array.isArray(timeSlots) ? timeSlots : [];
    },
    enabled: !!selectedCourtId && !!selectedDate,
  });

  // Calculate available time slots based on duration (memoized to prevent re-renders)
  // Show ALL slots but mark which ones are selectable vs disabled (with reasons)
  const processedSlots = useMemo(() => {
    const priceTolerance = 1; // Allow 1 KES difference for rounding

    if (!Array.isArray(availability)) return [];

    const originalHours = new Set<number>();
    if (isOriginalDateAndCourt) {
      for (let i = 0; i < selectedDurationHours; i++) {
        originalHours.add(originalStartHour + i);
      }
    }

    return availability
      .map((slot) => {
        const isPartOfOriginalBooking = originalHours.has(slot.hour);
        const isOriginalStartSlot =
          isPartOfOriginalBooking && slot.hour === originalStartHour;

        const startIdx = availability.findIndex((s) => s.hour === slot.hour);
        if (startIdx === -1) {
          return {
            ...slot,
            isSelectable: false,
            disabledReason: "Invalid slot",
            isPartOfOriginalBooking,
            isOriginalStartSlot,
          };
        }

        let hasConsecutiveSlots = true;
        let consecutiveDisabledReason = "";

        for (let i = 0; i < selectedDurationHours; i++) {
          const nextSlot = availability[startIdx + i];
          if (!nextSlot) {
            hasConsecutiveSlots = false;
            consecutiveDisabledReason = "Not enough time remaining";
            break;
          }
          const nextSlotIsOriginal = originalHours.has(nextSlot.hour);
          if (!nextSlot.isAvailable && !nextSlotIsOriginal) {
            hasConsecutiveSlots = false;
            consecutiveDisabledReason = "Time slot unavailable";
            break;
          }
        }

        let totalBlockPrice = 0;
        const blockRates: number[] = [];
        for (let i = 0; i < selectedDurationHours; i++) {
          const hourSlot = availability[startIdx + i];
          if (hourSlot) {
            totalBlockPrice += hourSlot.rate;
            blockRates.push(hourSlot.rate);
          }
        }

        const averagePricePerHour = totalBlockPrice / selectedDurationHours;
        const blockMaxRate = blockRates.length
          ? Math.max(...blockRates)
          : undefined;

        const priceDifference = Math.abs(
          averagePricePerHour - originalPricePerHour
        );

        const blockCrossesOriginalPrice =
          hasConsecutiveSlots &&
          priceDifference > priceTolerance &&
          Math.abs(slot.rate - originalPricePerHour) <= priceTolerance &&
          blockRates.some(
            (rate) => Math.abs(rate - originalPricePerHour) > priceTolerance
          );

        let isSelectable = hasConsecutiveSlots;
        let disabledReason: string | null = hasConsecutiveSlots
          ? null
          : consecutiveDisabledReason;

        if (
          isSelectable &&
          !isOriginalStartSlot &&
          priceDifference > priceTolerance
        ) {
          const priceLabel =
            averagePricePerHour > originalPricePerHour ? "higher" : "lower";
          isSelectable = false;
          if (blockCrossesOriginalPrice && blockMaxRate) {
            disabledReason = `Block includes ${Math.round(
              blockMaxRate
            )} KES/hour slots`;
          } else {
            disabledReason = `Different price (${Math.round(
              averagePricePerHour
            )} KES/hour average - ${priceLabel} than your original ${Math.round(
              originalPricePerHour
            )} KES/hour)`;
          }
        }

        if (isSelectable && !slot.isAvailable && !isPartOfOriginalBooking) {
          isSelectable = false;
          disabledReason = "Already booked";
        }

        if (
          isOriginalStartSlot ||
          (isPartOfOriginalBooking &&
            hasConsecutiveSlots &&
            priceDifference <= priceTolerance)
        ) {
          isSelectable = true;
          disabledReason = null;
        }

        return {
          ...slot,
          isSelectable,
          disabledReason,
          totalBlockPrice,
          averagePricePerHour,
          isPartOfOriginalBooking,
          isOriginalStartSlot,
          blockCrossesOriginalPrice,
          blockMaxRate,
        };
      })
      .filter((slot) => slot.isAvailable || slot.isPartOfOriginalBooking);
  }, [
    availability,
    selectedDurationHours,
    originalPricePerHour,
    isOriginalDateAndCourt,
    originalStartHour,
  ]);

  // Filter to only selectable slots for the "no slots" message
  const selectableSlots = processedSlots.filter((slot) => slot.isSelectable);

  useEffect(() => {
    if (!canReschedule && !notifiedRef.current) {
      toaster("You can only reschedule up to 24 hours before the start time.", {
        variant: "error",
      });
      notifiedRef.current = true;
    }
  }, [canReschedule, toaster]);

  // Effect: Ensure original hour is selected when viewing original date/court and slots load
  useEffect(() => {
    if (hasUserAdjustedSlot) return;
    if (isOriginalDateAndCourt && processedSlots.length > 0) {
      const originalSlotAvailable = processedSlots.some(
        (slot) => slot.hour === originalStartHour && slot.isSelectable
      );
      if (originalSlotAvailable && selectedStartHour !== originalStartHour) {
        setSelectedStartHour(originalStartHour);
      }
    }
  }, [
    processedSlots,
    isOriginalDateAndCourt,
    originalStartHour,
    selectedStartHour,
    hasUserAdjustedSlot,
  ]);

  const rescheduleMutation = useMutation({
    mutationFn: async () => {
      if (!canReschedule) {
        throw new Error("RESCHEDULE_CUTOFF");
      }
      if (!selectedStartHour) throw new Error("Please select a start time");

      const [year, month, day] = selectedDate.split("-").map(Number);
      const startTime = new Date(year, month - 1, day, selectedStartHour, 0, 0);
      const endTime = new Date(startTime);
      endTime.setHours(startTime.getHours() + selectedDurationHours);

      return bookingService.reschedule(booking.id, {
        courtId: selectedCourtId,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["my-bookings"]);
      queryClient.invalidateQueries(["bookings"]);
      queryClient.invalidateQueries(["officer-bookings"]);
      toaster("Booking rescheduled successfully", { variant: "success" });
      onSuccess?.();
      popModal();
    },
    onError: (error: unknown) => {
      if ((error as Error).message === "RESCHEDULE_CUTOFF") {
        if (!notifiedRef.current) {
          toaster(
            "You can only reschedule up to 24 hours before the start time.",
            { variant: "error" }
          );
          notifiedRef.current = true;
        }
        return;
      }
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message || "Failed to reschedule booking";
      toaster(message, { variant: "error" });
    },
  });

  const formatTime = (hour: number) => {
    return `${hour.toString().padStart(2, "0")}:00`;
  };

  const handleClose = () => {
    popModal();
  };

  return (
    <div
      className="bg-background rounded-none sm:rounded-lg border-border border-0 sm:border max-w-full sm:max-w-6xl w-full h-full sm:h-auto sm:max-h-[90vh] overflow-y-auto"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="border-b border-border p-6">
        <h2 className="text-2xl font-bold">Reschedule Booking</h2>
        <p className="text-muted-foreground mt-1">
          Booking #{booking.bookingCode}
        </p>
      </div>
      {/* Content */}
      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Column 1: Booking Details & Selection */}
          <div className="space-y-6">
            {/* Current Booking Info */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <p className="text-sm font-medium">Current Booking:</p>
              <div className="grid grid-cols-1 gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>
                    {format(new Date(booking.startTime), "MMM d, yyyy")}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>
                    {format(new Date(booking.startTime), "HH:mm")} -{" "}
                    {format(new Date(booking.endTime), "HH:mm")} (
                    {selectedDurationHours}{" "}
                    {selectedDurationHours === 1 ? "hour" : "hours"})
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Court: {booking.court?.name || "Unknown"}
                </p>
              </div>
            </div>

            {/* New Booking Selection */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="date">Select Date</Label>
                <input
                  id="date"
                  type="date"
                  className="w-full mt-2 px-3 py-2 border border-border  rounded-md bg-background"
                  value={selectedDate}
                  onChange={(e) => {
                    setSelectedDate(e.target.value);
                    setSelectedStartHour(null);
                    setHasUserAdjustedSlot(false);
                  }}
                  min={format(new Date(), "yyyy-MM-dd")}
                />
              </div>

              <div>
                <Label htmlFor="court">Select Court</Label>
                <select
                  id="court"
                  className="w-full mt-2 px-3 py-2 border  border-border rounded-md bg-background"
                  value={selectedCourtId}
                  onChange={(e) => {
                    setSelectedCourtId(e.target.value);
                    setSelectedStartHour(null);
                    setHasUserAdjustedSlot(false);
                  }}
                >
                  <option value="">Select a court</option>
                  {courts.map((court) => (
                    <option key={court.id} value={court.id}>
                      {court.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Summary on desktop - hidden on mobile */}
            {selectedStartHour !== null &&
              (selectedStartHour !== originalStartHour ||
                !isOriginalDateAndCourt) && (
                <div className="hidden lg:block bg-primary/10 rounded-lg p-4">
                  <p className="text-sm font-medium">New Booking Summary:</p>
                  <div className="mt-2 space-y-1 text-sm">
                    <p>
                      <span className="text-muted-foreground">Date:</span>{" "}
                      {format(new Date(selectedDate), "MMM d, yyyy")}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Time:</span>{" "}
                      {formatTime(selectedStartHour)} -{" "}
                      {formatTime(selectedStartHour + selectedDurationHours)}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Court:</span>{" "}
                      {courts.find((c) => c.id === selectedCourtId)?.name}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Price:</span>{" "}
                      {Math.round(
                        originalPricePerHour * selectedDurationHours
                      ).toLocaleString()}{" "}
                      KES
                      <span className="text-xs ml-1">
                        ({Math.round(originalPricePerHour)} KES/hour)
                      </span>
                    </p>
                  </div>
                </div>
              )}
          </div>

          {/* Column 2: Time Slots */}
          <div className="space-y-4">
            <Label>Available Time Slots</Label>

            <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2 mb-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded border-2 border-primary bg-primary"></div>
                <span>Selected</span>
              </div>
              {selectedDurationHours > 1 && (
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded border-2 border-primary bg-primary/20"></div>
                  <span>Included in block</span>
                </div>
              )}
              {isOriginalDateAndCourt && (
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded border-2 border-primary/60 bg-primary/10"></div>
                  <span>Original slot</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded border-2 border-border bg-muted"></div>
                <span>Already booked</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded border-2 border-accent bg-accent/20"></div>
                <span>Block crosses higher rate</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded border-2 border-destructive/30 bg-destructive/10 opacity-60"></div>
                <span>Different price</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              {selectedDurationHours > 1
                ? `Click any time slot to book a ${selectedDurationHours}-hour block starting at that time.`
                : "Click a time slot to select it."}
            </p>
            {loadingSlots ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : selectableSlots.length === 0 ? (
              <div className="text-center py-8 px-4 space-y-4">
                <div>
                  <p className="text-muted-foreground font-medium">
                    No available slots at {Math.round(originalPricePerHour)}{" "}
                    KES/hour
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Try selecting a different date or court.
                  </p>
                </div>

                {/* Show pricing mismatch explanation if disabled slots exist */}
                {processedSlots.length > 0 &&
                  (() => {
                    // Find a disabled slot to show its average price
                    const disabledSlot = processedSlots.find(
                      (s) => !s.isSelectable && s.averagePricePerHour
                    );
                    const exampleAvgPrice =
                      disabledSlot?.averagePricePerHour ||
                      processedSlots[0]?.rate ||
                      0;

                    return (
                      <div className="bg-accent/10 border border-accent/30 rounded-lg p-4 text-left">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="h-5 w-5 text-accent flex-shrink-0 mt-0.5" />
                          <div className="text-sm">
                            <p className="font-medium text-foreground">
                              Price Change
                            </p>
                            <p className="text-muted-foreground mt-1">
                              The available {selectedDurationHours}-hour time
                              slots cost an average of{" "}
                              {Math.round(exampleAvgPrice)} KES/hour, but your
                              booking was made at{" "}
                              {Math.round(originalPricePerHour)} KES/hour.
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
              </div>
            ) : (
              <div className="flex flex-wrap gap-3 mt-2 justify-center">
                {processedSlots.map((slot) => {
                  const isSelected = selectedStartHour === slot.hour;
                  const isInSelectedRange =
                    selectedStartHour !== null &&
                    slot.hour >= selectedStartHour &&
                    slot.hour < selectedStartHour + selectedDurationHours;
                  const isOriginalSlot =
                    isOriginalDateAndCourt && slot.hour === originalStartHour;
                  const isPartOfSelectedBlock =
                    isInSelectedRange ||
                    (isOriginalDateAndCourt && slot.isPartOfOriginalBooking);
                  const isDisabled =
                    !slot.isSelectable && !isPartOfSelectedBlock;
                  const isMixedRateBlock =
                    isDisabled && slot.blockCrossesOriginalPrice;
                  const isAlreadyBooked =
                    isDisabled && slot.disabledReason === "Already booked";

                  return (
                    <div key={slot.hour} className="relative">
                      <button
                        onClick={() => {
                          if (slot.isSelectable) {
                            setSelectedStartHour(slot.hour);
                            setHasUserAdjustedSlot(true);
                          }
                        }}
                        disabled={isDisabled}
                        title={
                          isDisabled
                            ? slot.disabledReason || "Unavailable"
                            : undefined
                        }
                        className={`
                            w-28 h-26 relative p-3 rounded-lg border-2 transition-all text-left flex flex-col justify-between
                            ${
                              isAlreadyBooked
                                ? "border-border bg-muted text-muted-foreground opacity-70 cursor-not-allowed"
                                : isMixedRateBlock
                                ? "border-accent bg-accent/20 text-foreground opacity-80 cursor-not-allowed"
                                : isDisabled
                                ? "border-destructive/30 bg-destructive/10 opacity-60 cursor-not-allowed"
                                : isSelected
                                ? "border-primary bg-primary text-primary-foreground shadow-lg scale-105"
                                : isInSelectedRange
                                ? "border-primary bg-primary/20 text-primary"
                                : isOriginalSlot
                                ? "border-primary/60 bg-primary/10"
                                : "border-border bg-background hover:border-primary/50 hover:bg-accent cursor-pointer"
                            }
                          `}
                      >
                        <div className="font-semibold text-sm">
                          {formatTime(slot.hour)}
                        </div>

                        {/* Show price for disabled slots */}
                        {isDisabled && !isAlreadyBooked && (
                          <div
                            className={`text-[10px] mt-1 line-clamp-2 ${
                              isMixedRateBlock
                                ? "text-accent"
                                : "text-destructive"
                            }`}
                          >
                            {Math.round(slot.rate)} KES/hr
                          </div>
                        )}

                        {isAlreadyBooked && (
                          <div className="text-[10px] mt-1 text-muted-foreground">
                            Unavailable
                          </div>
                        )}

                        {isMixedRateBlock && slot.blockMaxRate && (
                          <div className="text-[10px] mt-1 text-accent">
                            Block includes {Math.round(slot.blockMaxRate)}{" "}
                            KES/hr slots
                          </div>
                        )}

                        {selectedDurationHours > 1 &&
                          isInSelectedRange &&
                          !isSelected && (
                            <div className="text-xs mt-1 opacity-90">
                              Included
                            </div>
                          )}

                        {selectedDurationHours > 1 && isSelected && (
                          <div className="text-xs mt-1 opacity-90">
                            {selectedDurationHours}h block
                          </div>
                        )}

                        {/* Disabled indicator */}
                        {isDisabled && (
                          <div
                            className={`absolute top-1 right-1 text-white text-[10px] px-1.5 py-0.5 rounded ${
                              isAlreadyBooked
                                ? "bg-muted-foreground"
                                : isMixedRateBlock
                                ? "bg-accent"
                                : "bg-destructive"
                            }`}
                          >
                            {isAlreadyBooked
                              ? "🔒"
                              : isMixedRateBlock
                              ? "!"
                              : "✕"}
                          </div>
                        )}

                        {isOriginalSlot && !isSelected && !isDisabled && (
                          <div className="absolute top-1 right-1 bg-primary text-white text-[10px] px-1.5 py-0.5 rounded">
                            Original
                          </div>
                        )}

                        {isInSelectedRange &&
                          !isSelected &&
                          !isOriginalSlot &&
                          !isDisabled && (
                            <div className="absolute top-1 right-1">
                              <div className="w-2 h-2 rounded-full bg-primary"></div>
                            </div>
                          )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Summary on mobile - hidden on desktop */}
            {selectedStartHour !== null &&
              (selectedStartHour !== originalStartHour ||
                !isOriginalDateAndCourt) && (
                <div className="lg:hidden bg-primary/10 rounded-lg p-4">
                  <p className="text-sm font-medium">New Booking Summary:</p>
                  <div className="mt-2 space-y-1 text-sm">
                    <p>
                      <span className="text-muted-foreground">Date:</span>{" "}
                      {format(new Date(selectedDate), "MMM d, yyyy")}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Time:</span>{" "}
                      {formatTime(selectedStartHour)} -{" "}
                      {formatTime(selectedStartHour + selectedDurationHours)}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Court:</span>{" "}
                      {courts.find((c) => c.id === selectedCourtId)?.name}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Price:</span>{" "}
                      {Math.round(
                        originalPricePerHour * selectedDurationHours
                      ).toLocaleString()}{" "}
                      KES
                      <span className="text-xs ml-1">
                        ({Math.round(originalPricePerHour)} KES/hour)
                      </span>
                    </p>
                  </div>
                </div>
              )}
          </div>
        </div>
      </div>{" "}
      {/* Footer */}
      <div className="border-t border-border p-6 flex items-center justify-end gap-3">
        <Button
          variant="outline"
          onClick={handleClose}
          disabled={rescheduleMutation.isLoading}
        >
          Cancel
        </Button>
        <Button
          onClick={() => rescheduleMutation.mutate()}
          disabled={
            !selectedStartHour ||
            rescheduleMutation.isLoading ||
            !canReschedule ||
            // Disable if same slot is selected (no change)
            (selectedStartHour === originalStartHour && isOriginalDateAndCourt)
          }
        >
          {rescheduleMutation.isLoading && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          Confirm Reschedule
        </Button>
      </div>
    </div>
  );
}

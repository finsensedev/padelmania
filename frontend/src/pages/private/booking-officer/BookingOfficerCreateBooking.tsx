/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useContext,
} from "react";
import {
  format,
  addDays,
  differenceInCalendarDays,
  addMonths,
  setHours,
  setMinutes,
  setSeconds,
  setMilliseconds,
  startOfDay,
  isBefore,
} from "date-fns";
import { useQuery, useQueryClient } from "react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useFormik } from "formik";
import * as Yup from "yup";
import api from "src/utils/api";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "src/components/ui/card";
import { Button } from "src/components/ui/button";
import { Badge } from "src/components/ui/badge";
import { Label } from "src/components/ui/label";

import {
  CreditCard,
  Loader2,
  Info,
  ChevronDown,
  Minus,
  Plus,
} from "lucide-react";
import useNotification from "src/hooks/useNotification";
import useModal from "src/hooks/useModal";
import { usePermissions } from "src/hooks/usePermissions";
import { SocketContext } from "src/contexts/SocketProvider";
import { useSystemConfig } from "src/hooks/useSystemConfig";
import LayoutContainer from "src/components/booking-officer/LayoutContainer";
import {
  DEFAULT_OPERATING_HOURS,
  type OperatingDayConfig,
  type OperatingHoursConfig,
} from "src/services/system-config.service";

interface Court {
  id: string;
  name: string;
  type: string;
  surface: string;
  location: string;
  amenities: string[];
  isActive: boolean;
}

interface TimeSlot {
  time: string;
  hour: number;
  minutes: number;
  isAvailable: boolean;
  rate: number;
  isPeak?: boolean;
  heldUntil?: string;
  isMaintenance?: boolean;
  isNextDay?: boolean;
}

type SelectedBooking = {
  court: Court;
  durationMin: number;
  slots: TimeSlot[];
};

export default function BookingOfficerCreateBooking() {
  const { toaster } = useNotification();
  const { has } = usePermissions();
  const canCreate = has("bookings.create");
  const queryClient = useQueryClient();
  const { bookingSlotConfig, operatingHoursConfig } = useSystemConfig();

  // UI State
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedStartHour, setSelectedStartHour] = useState<string | null>(
    null
  );
  const [selectedCourtBookings, setSelectedCourtBookings] = useState<
    SelectedBooking[]
  >([]);
  const [frozenCourtBookings, setFrozenCourtBookings] = useState<
    SelectedBooking[]
  >([]);
  const [numberOfPlayers] = useState(4);
  const [racketUnitPrice, setRacketUnitPrice] = useState(300);
  const [ballsUnitPrice, setBallsUnitPrice] = useState(1000);
  const [ballOptions, setBallOptions] = useState<any[]>([]);
  const [selectedBallTypeId, setSelectedBallTypeId] = useState<string | null>(
    null
  );
  const selectedBallOption = useMemo(
    () =>
      ballOptions.find((option: any) => option.id === selectedBallTypeId) ||
      null,
    [ballOptions, selectedBallTypeId]
  );
  const [isInitiatingPayment, setIsInitiatingPayment] = useState(false);
  const [isWaitingPayment, setIsWaitingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const paymentHandledRef = useRef(false);
  const [initiatedPayment, setInitiatedPayment] = useState<{
    paymentId?: string;
  } | null>(null);
  const [isPollingPayment, setIsPollingPayment] = useState(false);
  const { socket, isConnected } = useContext(SocketContext);
  const [nowTick, setNowTick] = useState<number>(Date.now());
  const { pushModal, popModal } = useModal();
  const [isSummaryCollapsed, setIsSummaryCollapsed] = useState(false);

  // Validation Schema
  const validationSchema = useMemo(
    () =>
      Yup.object({
        phoneNumber: Yup.string()
          .required("Customer's phone number is required")
          .matches(
            /^(?:0?(?:7|1)\d{8}|(?:\+?254)(?:7|1)\d{8})$/,
            "Enter a valid Kenyan phone number (07XX, 01XX, or 2547XX, 2541XX)"
          ),
        racketQty: Yup.number()
          .min(0, "Cannot be negative")
          .max(8, "Maximum 8 rackets")
          .integer("Must be a whole number")
          .required("Required"),
        ballsQty: Yup.number()
          .min(0, "Cannot be negative")
          .max(5, "Maximum 5 packs")
          .integer("Must be a whole number")
          .required("Required"),
      }),
    []
  );

  // Formik Form
  const formik = useFormik({
    initialValues: {
      phoneNumber: "",
      racketQty: 0,
      ballsQty: 0,
    },
    validationSchema,
    validateOnChange: true,
    validateOnBlur: true,
    onSubmit: async (values) => {
      await handleInitiatePayment(values);
    },
  });

  // Helper Functions
  const calculateDurationPrice = useCallback((slots: TimeSlot[]): number => {
    return slots.reduce((total, slot) => total + slot.rate, 0);
  }, []);

  const formatCurrency = useCallback(
    (amount: number) =>
      new Intl.NumberFormat("en-KE", {
        style: "currency",
        currency: "KES",
        maximumFractionDigits: 0,
      }).format(amount),
    []
  );

  const getDateDisplay = (date: Date) => {
    const diff = differenceInCalendarDays(
      startOfDay(date),
      startOfDay(new Date())
    );
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    return format(date, "EEE, MMM d");
  };

  const effectiveOperatingHours: OperatingHoursConfig =
    operatingHoursConfig || DEFAULT_OPERATING_HOURS;

  const dayWindow = useCallback(
    (
      date: Date
    ): { day: OperatingDayConfig | null; open: number; close: number } => {
      const dayOfWeek = date.getDay();
      const day =
        effectiveOperatingHours.days.find((d) => d.dayOfWeek === dayOfWeek) ||
        null;
      if (!day || day.isClosed) return { day: null, open: 0, close: 0 };
      const [oh, om] = day.openTime.split(":").map(Number);
      const [ch, cm] = day.closeTime.split(":").map(Number);
      const open = oh * 60 + om;
      const closeRaw = ch * 60 + cm;
      const close = closeRaw <= open ? closeRaw + 24 * 60 : closeRaw;
      return { day, open, close };
    },
    [effectiveOperatingHours]
  );

  // Derived State
  const effectiveCourtBookings =
    frozenCourtBookings.length > 0
      ? frozenCourtBookings
      : selectedCourtBookings;
  const firstBookingDurationMin = effectiveCourtBookings[0]?.durationMin || 0;
  const firstBookingDurationHours = firstBookingDurationMin / 60;

  const baseSlotAmount = useMemo(() => {
    return effectiveCourtBookings.reduce(
      (sum, booking) => sum + calculateDurationPrice(booking.slots),
      0
    );
  }, [effectiveCourtBookings, calculateDurationPrice]);

  const racketsAmount = useMemo(() => {
    if (effectiveCourtBookings.length === 0) return 0;
    return (
      formik.values.racketQty * racketUnitPrice * firstBookingDurationHours
    );
  }, [
    effectiveCourtBookings.length,
    formik.values.racketQty,
    racketUnitPrice,
    firstBookingDurationHours,
  ]);

  const ballsAmount = useMemo(() => {
    if (effectiveCourtBookings.length === 0) return 0;
    return formik.values.ballsQty * ballsUnitPrice;
  }, [effectiveCourtBookings.length, formik.values.ballsQty, ballsUnitPrice]);

  const totalAmount = useMemo(() => {
    return baseSlotAmount + racketsAmount + ballsAmount;
  }, [baseSlotAmount, racketsAmount, ballsAmount]);

  const selectedDateStr = useMemo(
    () => format(selectedDate, "yyyy-MM-dd"),
    [selectedDate]
  );

  const selectableDates = useMemo(() => {
    const today = startOfDay(new Date());
    const end = startOfDay(addMonths(today, 1));
    const dates: Date[] = [];
    for (let cursor = today; cursor < end; cursor = addDays(cursor, 1)) {
      const { day } = dayWindow(cursor);
      if (day) dates.push(cursor);
    }
    return dates;
  }, [dayWindow]);

  useEffect(() => {
    if (selectableDates.length === 0) return;
    const selectedKey = startOfDay(selectedDate).getTime();
    const hasSelected = selectableDates.some(
      (d) => startOfDay(d).getTime() === selectedKey
    );
    if (!hasSelected) {
      setSelectedDate(selectableDates[0]);
      setSelectedStartHour(null);
      setSelectedCourtBookings([]);
    }
  }, [selectableDates, selectedDate]);

  // Courts
  const { data: courts = [], isLoading: courtsLoading } = useQuery<Court[]>({
    queryKey: ["officer-create-courts"],
    queryFn: async () => {
      const res = await api.get("/court");
      return (res.data?.data || res.data || []).filter(
        (c: Court) => c.isActive
      );
    },
    enabled: canCreate,
    onError: () => toaster("Failed to load courts", { variant: "error" }),
  });

  // Availability (all courts for date)
  const { data: availabilityByCourt = {}, isLoading: availabilityLoading } =
    useQuery<Record<string, TimeSlot[]>>({
      queryKey: ["officer-create-availability", selectedDateStr, "v2"],
      queryFn: async () => {
        const courtsResp = await api.get("/court");
        const allCourts: Court[] = (
          courtsResp.data?.data ||
          courtsResp.data ||
          []
        ).filter((c: Court) => c.isActive);
        const pairs = await Promise.all(
          allCourts.map(async (c) => {
            try {
              const response = await api.get(
                `/court/${c.id}/availability?date=${selectedDateStr}`
              );
              const data = response.data?.data || response.data;
              const slots = (data?.timeSlots || []).map((slot: any) => ({
                time: slot.time,
                hour: slot.hour,
                minutes: slot.minutes || 0,
                isAvailable: !!slot.isAvailable,
                rate: Number(slot.rate || 0),
                isPeak: slot.isPeak,
                heldUntil: slot.heldUntil,
                isMaintenance: slot.isMaintenance,
                isNextDay: slot.isNextDay,
              }));
              return [c.id, slots] as const;
            } catch {
              return [c.id, []] as const;
            }
          })
        );
        const map: Record<string, TimeSlot[]> = {};
        for (const [id, slots] of pairs) map[id] = slots;
        return map;
      },
      enabled: canCreate && !isWaitingPayment,
    });

  // Dynamic racket and balls unit price
  const firstSelectedSlot = selectedCourtBookings[0]?.slots[0];
  useQuery(
    [
      "officer-equipment-unit-price",
      selectedCourtBookings[0]?.court.id,
      selectedDateStr,
      firstSelectedSlot?.time,
    ],
    async () => {
      const firstBooking = selectedCourtBookings[0];
      if (!firstBooking) return null;

      const startTime = setHours(
        setMinutes(setSeconds(setMilliseconds(selectedDate, 0), 0), 0),
        firstBooking.slots[0].hour
      );
      const endTime = new Date(
        startTime.getTime() + firstBooking.durationMin * 60 * 1000
      );

      const res = await api.post("/court/pricing/calculate", {
        courtId: firstBooking.court.id,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      });
      return res.data?.data || res.data;
    },
    {
      enabled:
        selectedCourtBookings.length > 0 && !isWaitingPayment && canCreate,
      onSuccess: (data: any) => {
        if (!data) return;
        const racketUnit = data.racketUnitFinal ?? data.racketUnitBase ?? 300;

        // Handle ball options
        const options = data.ballOptions || [];
        setBallOptions(options);

        // Auto-select first ball type if not already selected
        if (options.length > 0 && !selectedBallTypeId) {
          setSelectedBallTypeId(options[0].id);
          setBallsUnitPrice(
            options[0].unitFinal || options[0].unitBase || 1000
          );
        } else if (selectedBallTypeId) {
          // Update price for currently selected ball type
          const selectedOption = options.find(
            (opt: any) => opt.id === selectedBallTypeId
          );
          if (selectedOption) {
            setBallsUnitPrice(
              selectedOption.unitFinal || selectedOption.unitBase || 1000
            );
          }
        } else {
          // Fallback to legacy single price
          const ballsUnit = data.ballsUnitFinal ?? data.ballsUnitBase ?? 1000;
          setBallsUnitPrice(
            Number.isFinite(ballsUnit) && ballsUnit > 0 ? ballsUnit : 1000
          );
        }

        setRacketUnitPrice(
          Number.isFinite(racketUnit) && racketUnit > 0 ? racketUnit : 300
        );
      },
      onError: () => {
        setRacketUnitPrice(300);
        setBallsUnitPrice(1000);
        setBallOptions([]);
      },
    }
  );

  // Tick for countdown of held slots
  const anyHeldActive = useMemo(() => {
    return Object.values(availabilityByCourt).some((arr) =>
      (arr || []).some(
        (s) => s.heldUntil && new Date(s.heldUntil).getTime() > Date.now()
      )
    );
  }, [availabilityByCourt]);

  useEffect(() => {
    if (!anyHeldActive) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [anyHeldActive]);

  const availableStartHours = useMemo(() => {
    const timeSlotsMap = new Map<string, number>();
    const now = new Date();
    const isToday = differenceInCalendarDays(selectedDate, now) === 0;
    const minDuration = bookingSlotConfig?.allowedDurations?.[0] || 60;
    const { day, open, close } = dayWindow(selectedDate);
    if (!day) return [] as string[];
    const wraps = close > 24 * 60;
    const latestStartMinutes = close - minDuration;
    const nowMinusTolerance = new Date(now.getTime() - 5 * 60 * 1000);
    const allowedDurations = bookingSlotConfig?.allowedDurations || [60];
    const startOfSelected = startOfDay(selectedDate);

    const normalizeMinutes = (hour: number, minutes: number) => {
      const base = hour * 60 + (minutes || 0);
      return wraps && base < open ? base + 24 * 60 : base;
    };

    const hasContinuousAvailability = (
      slotLookup: Map<number, TimeSlot>,
      startMinutes: number
    ) => {
      return allowedDurations.some((duration) => {
        if (startMinutes < open || startMinutes + duration > close)
          return false;
        const steps = duration / 30;
        for (let i = 0; i < steps; i++) {
          const slot = slotLookup.get(startMinutes + i * 30);
          const isHeld =
            slot?.heldUntil && new Date(slot.heldUntil).getTime() > nowTick;
          if (!slot || !slot.isAvailable || isHeld || slot.isMaintenance) {
            return false;
          }
        }
        return true;
      });
    };

    for (const courtSlots of Object.values(availabilityByCourt)) {
      const slotLookup = new Map<number, TimeSlot>();
      (courtSlots || []).forEach((slot) => {
        const normalized = normalizeMinutes(slot.hour, slot.minutes || 0);
        slotLookup.set(normalized, slot);
      });

      for (const slot of courtSlots || []) {
        const isHeld =
          slot.heldUntil && new Date(slot.heldUntil).getTime() > nowTick;
        if (!slot.isAvailable || isHeld || slot.isMaintenance) continue;

        const slotStartMinutes = normalizeMinutes(slot.hour, slot.minutes || 0);
        if (
          slotStartMinutes < open ||
          slotStartMinutes > latestStartMinutes ||
          slot.minutes === undefined
        )
          continue;

        if (slot.minutes !== 0 && slot.minutes !== 30) continue;

        if (isToday) {
          const slotStartDate = new Date(
            startOfSelected.getTime() + slotStartMinutes * 60 * 1000
          );
          if (isBefore(slotStartDate, nowMinusTolerance)) continue;
        }

        if (hasContinuousAvailability(slotLookup, slotStartMinutes)) {
          timeSlotsMap.set(slot.time, slotStartMinutes);
        }
      }
    }

    return Array.from(timeSlotsMap.entries())
      .sort((a, b) => a[1] - b[1])
      .map(([time]) => time);
  }, [
    availabilityByCourt,
    nowTick,
    selectedDate,
    bookingSlotConfig,
    dayWindow,
  ]);

  useEffect(() => {
    if (
      selectedStartHour != null &&
      !availableStartHours.includes(selectedStartHour)
    ) {
      setSelectedStartHour(null);
      setSelectedCourtBookings([]);
    }
  }, [availableStartHours, selectedStartHour]);

  const computeConsecutiveSlots = useCallback(
    (courtId: string, startTime: string, durationMin: number): TimeSlot[] => {
      const courtSlots = availabilityByCourt[courtId] || [];
      const { open, close } = dayWindow(selectedDate);
      if (close === 0 && open === 0) return [];

      const wraps = close > 24 * 60;
      const normalizeMinutes = (hour: number, minutes: number) => {
        const base = hour * 60 + (minutes || 0);
        return wraps && base < open ? base + 24 * 60 : base;
      };

      const slotByMinutes = new Map<number, TimeSlot>();
      courtSlots.forEach((slot) => {
        const normalized = normalizeMinutes(slot.hour, slot.minutes || 0);
        slotByMinutes.set(normalized, slot);
      });

      const startSlot = courtSlots.find((s) => s.time === startTime);
      if (!startSlot) return [];

      const neededSlots = Math.ceil(durationMin / 30);
      const startMinutes = normalizeMinutes(startSlot.hour, startSlot.minutes);
      const resultSlots: TimeSlot[] = [];

      for (let i = 0; i < neededSlots; i++) {
        const targetMinutes = startMinutes + i * 30;
        const slot = slotByMinutes.get(targetMinutes);
        const isHeld =
          slot?.heldUntil && new Date(slot.heldUntil).getTime() > nowTick;
        if (!slot || !slot.isAvailable || isHeld || slot.isMaintenance) {
          return [];
        }
        resultSlots.push(slot);
      }
      return resultSlots;
    },
    [availabilityByCourt, nowTick, dayWindow, selectedDate]
  );

  const isBookingWithinOperatingHours = useCallback(
    (startTime: string, durationMinutes: number, date: Date): boolean => {
      const { day, open, close } = dayWindow(date);
      if (!day) return false;
      const wraps = close > 24 * 60;
      const [h, m] = startTime.split(":").map(Number);
      const baseStart = h * 60 + m;
      const startMinutes =
        wraps && baseStart < open ? baseStart + 24 * 60 : baseStart;
      const endMinutes = startMinutes + durationMinutes;
      return startMinutes >= open && endMinutes <= close;
    },
    [dayWindow]
  );

  const getDurationOptionsForCourt = useCallback(
    (courtId: string): number[] => {
      if (selectedStartHour == null || !bookingSlotConfig) return [];

      const courtSlots = availabilityByCourt[courtId] || [];
      const startIdx = courtSlots.findIndex(
        (x) => x.time === selectedStartHour
      );
      if (startIdx === -1) return [];

      let consecutiveSlots = 0;
      for (let i = startIdx; i < courtSlots.length; i++) {
        const s = courtSlots[i];
        const isHeld =
          s?.heldUntil && new Date(s.heldUntil).getTime() > nowTick;
        if (s && s.isAvailable && !isHeld && !s.isMaintenance) {
          consecutiveSlots++;
        } else {
          break;
        }
      }
      const maxMinutes = consecutiveSlots * 30;

      return bookingSlotConfig.allowedDurations.filter(
        (duration) =>
          duration <= maxMinutes &&
          isBookingWithinOperatingHours(
            selectedStartHour,
            duration,
            selectedDate
          )
      );
    },
    [
      availabilityByCourt,
      selectedStartHour,
      bookingSlotConfig,
      isBookingWithinOperatingHours,
      selectedDate,
      nowTick,
    ]
  );

  const suggestedCourts = useMemo(() => {
    if (selectedStartHour == null) return [] as Court[];
    return courts.filter((c) => {
      const arr = availabilityByCourt[c.id] || [];
      const slot = arr.find((x) => x.time === selectedStartHour);
      const isHeld =
        slot?.heldUntil && new Date(slot.heldUntil).getTime() > nowTick;
      return !!slot && slot.isAvailable && !isHeld && !slot.isMaintenance;
    });
  }, [courts, availabilityByCourt, selectedStartHour, nowTick]);

  const handleDateChange = (date: Date) => {
    setSelectedDate(date);
    setSelectedStartHour(null);
    setSelectedCourtBookings([]);
  };

  const handleCourtDurationSelect = (court: Court, duration: number) => {
    if (frozenCourtBookings.length > 0) return;

    const startTime = selectedStartHour;
    if (!startTime) return;

    const existingBookingIndex = selectedCourtBookings.findIndex(
      (b) => b.court.id === court.id
    );

    if (
      existingBookingIndex !== -1 &&
      selectedCourtBookings[existingBookingIndex].durationMin === duration
    ) {
      setSelectedCourtBookings((prev) =>
        prev.filter((b) => b.court.id !== court.id)
      );
      return;
    }

    const slots = computeConsecutiveSlots(court.id, startTime, duration);
    if (slots.length > 0) {
      const newBooking: SelectedBooking = {
        court,
        durationMin: duration,
        slots,
      };
      setSelectedCourtBookings((prev) => {
        const otherBookings = prev.filter((b) => b.court.id !== court.id);
        return [...otherBookings, newBooking];
      });
    }
  };

  const finalizeSuccess = useCallback(
    (bookingCode?: string) => {
      if (paymentHandledRef.current) return;
      paymentHandledRef.current = true;
      setIsWaitingPayment(false);
      setIsPollingPayment(false);
      toaster("Booking created & payment confirmed", { variant: "success" });

      const bookings =
        frozenCourtBookings.length > 0
          ? frozenCourtBookings
          : selectedCourtBookings;

      const DetailRow = ({ label, value }: { label: string; value: any }) => (
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-medium text-right ml-4 break-all">{value}</span>
        </div>
      );

      pushModal(
        <div
          className="p-0 w-full max-w-md bg-background rounded border border-border"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="px-6 pt-6 pb-4 border-b bg-emerald-500/10 dark:bg-emerald-500/20 flex items-start gap-3"
            onClick={() => {}}
          >
            <div className="h-10 w-10 flex items-center justify-center rounded-full bg-emerald-500 text-white font-semibold">
              ✓
            </div>
            <div>
              <h2 className="text-xl font-semibold leading-tight">
                Booking Confirmed
              </h2>
              <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
                Payment received successfully.
              </p>
            </div>
          </div>
          <div className="px-6 py-5 space-y-5">
            {bookingCode && (
              <div className="space-y-1">
                <p className="text-[11px] uppercase font-semibold tracking-wide text-muted-foreground">
                  Booking Code
                </p>
                <div className="flex items-center gap-2">
                  <div className="px-3 py-2 rounded border bg-muted/40 font-mono text-sm">
                    {bookingCode}
                  </div>
                  <button
                    onClick={() => navigator.clipboard.writeText(bookingCode)}
                    className="text-xs px-2 py-1 rounded border bg-background hover:bg-muted transition"
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}
            <div className="space-y-3">
              <p className="text-[11px] uppercase font-semibold tracking-wide text-muted-foreground">
                Details
              </p>
              <div className="space-y-2">
                <DetailRow
                  label="Court(s)"
                  value={bookings.map((b) => b.court.name).join(", ")}
                />
                <DetailRow
                  label="Date"
                  value={format(selectedDate, "EEE, MMM d yyyy")}
                />
                {bookings.map((booking, idx) => (
                  <DetailRow
                    key={idx}
                    label={`${booking.court.name} Time`}
                    value={`${booking.slots[0].time} - ${format(
                      new Date(
                        new Date(selectedDate).setHours(
                          booking.slots[0].hour,
                          booking.slots[0].minutes
                        ) +
                          booking.durationMin * 60000
                      ),
                      "HH:mm"
                    )}`}
                  />
                ))}
                <DetailRow
                  label="Rackets"
                  value={
                    formik.values.racketQty > 0
                      ? `${formik.values.racketQty} @ ${formatCurrency(
                          racketUnitPrice
                        )} per hour`
                      : "None"
                  }
                />
                <DetailRow
                  label="Ball Packs"
                  value={
                    formik.values.ballsQty > 0
                      ? `${formik.values.ballsQty} @ ${formatCurrency(
                          ballsUnitPrice
                        )} each`
                      : "None"
                  }
                />
                <DetailRow
                  label="Court Total"
                  value={formatCurrency(baseSlotAmount)}
                />
                {racketsAmount > 0 && (
                  <DetailRow
                    label="Rackets Total"
                    value={formatCurrency(racketsAmount)}
                  />
                )}
                {ballsAmount > 0 && (
                  <DetailRow
                    label="Ball Packs Total"
                    value={formatCurrency(ballsAmount)}
                  />
                )}
                <div className="pt-2 border-t">
                  <DetailRow
                    label="Grand Total"
                    value={formatCurrency(totalAmount)}
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                className="sm:flex-1 bg-green-500/10 text-green-700 hover:bg-green-500/20 dark:bg-green-500/20 dark:text-green-400 dark:hover:bg-green-500/30"
                onClick={() => {
                  try {
                    const baseUrl = (window.location.origin || "").replace(
                      /\/$/,
                      ""
                    );
                    const courtsList = bookings
                      .map((b) => b.court.name)
                      .join(", ");
                    const shareLines = [
                      "Padel Mania Booking Confirmed",
                      bookingCode ? `Code: ${bookingCode}` : "",
                      `Court(s): ${courtsList}`,
                      `Date: ${format(selectedDate, "EEE, MMM d yyyy")}`,
                      `Players: ${numberOfPlayers}`,
                      formik.values.racketQty > 0
                        ? `Rackets: ${
                            formik.values.racketQty
                          } @ ${formatCurrency(racketUnitPrice)} per hour`
                        : "",
                      formik.values.ballsQty > 0
                        ? `Ball Packs: ${
                            formik.values.ballsQty
                          } @ ${formatCurrency(ballsUnitPrice)} each`
                        : "",
                      `Total: ${formatCurrency(totalAmount)}`,
                      baseUrl ? `${baseUrl}/customer/bookings` : "",
                    ]
                      .filter(Boolean)
                      .join("\n");
                    const url = `https://wa.me/?text=${encodeURIComponent(
                      shareLines
                    )}`;
                    window.open(url, "_blank", "noopener,noreferrer");
                  } catch {
                    /* noop */
                  }
                }}
              >
                Share WhatsApp
              </Button>
              <Button
                variant="outline"
                className="sm:flex-1"
                onClick={() => {
                  try {
                    const courtsList = bookings
                      .map((b) => b.court.name)
                      .join(", ");
                    const receipt = `Booking ${bookingCode}\nCourt(s): ${courtsList}\nDate: ${format(
                      selectedDate,
                      "PPP"
                    )}\nPlayers: ${numberOfPlayers}\nRackets: ${
                      formik.values.racketQty
                    }\nBall Packs: ${
                      formik.values.ballsQty
                    }\nTotal: ${formatCurrency(totalAmount)}`;
                    const w = window.open("", "print", "width=400,height=600");
                    if (w) {
                      w.document.write(
                        `<pre style="font: 14px/1.4 monospace; white-space: pre-wrap;">${receipt}</pre>`
                      );
                      w.document.close();
                      w.focus();
                      w.print();
                    }
                  } catch {
                    /* noop */
                  }
                }}
              >
                Print
              </Button>

              <Button
                variant="secondary"
                className="sm:flex-1"
                onClick={() => popModal()}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      );
    },
    [
      frozenCourtBookings,
      selectedCourtBookings,
      selectedDate,
      racketUnitPrice,
      ballsUnitPrice,
      numberOfPlayers,
      baseSlotAmount,
      racketsAmount,
      ballsAmount,
      totalAmount,
      popModal,
      pushModal,
      toaster,
      formatCurrency,
      formik.values,
    ]
  );

  const finalizeFailure = useCallback(
    (msg: string) => {
      if (paymentHandledRef.current) return;
      paymentHandledRef.current = true;
      setIsWaitingPayment(false);
      setIsPollingPayment(false);
      setInitiatedPayment(null);
      setFrozenCourtBookings([]);
      setPaymentError(msg);
      toaster(msg, { variant: "error" });
      queryClient.invalidateQueries({
        queryKey: ["officer-create-availability", selectedDateStr, "v2"],
      });
    },
    [queryClient, selectedDateStr, toaster]
  );

  const handleInitiatePayment = async (values: typeof formik.values) => {
    if (effectiveCourtBookings.length === 0) {
      toaster("Select court, time and duration for the customer first", {
        variant: "error",
      });
      return;
    }

    setIsInitiatingPayment(true);
    setPaymentError(null);
    paymentHandledRef.current = false;

    try {
      const bookingsToProcess = selectedCourtBookings;
      setFrozenCourtBookings(bookingsToProcess);

      const reservations = bookingsToProcess.map((booking, index) => {
        // For slots past midnight (isNextDay), use the next day
        const baseDate = booking.slots[0].isNextDay
          ? addDays(selectedDate, 1)
          : selectedDate;
        const startTime = setMinutes(
          setHours(
            setSeconds(setMilliseconds(baseDate, 0), 0),
            booking.slots[0].hour
          ),
          booking.slots[0].minutes || 0
        );
        const endTime = new Date(
          startTime.getTime() + booking.durationMin * 60 * 1000
        );
        const slotAmount = calculateDurationPrice(booking.slots);

        const isFirst = index === 0;
        const currentRacketsAmount = isFirst ? racketsAmount : 0;
        const currentBallsAmount = isFirst ? ballsAmount : 0;

        return {
          courtId: booking.court.id,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          duration: booking.durationMin,
          numberOfPlayers,
          racketQty: isFirst ? values.racketQty : 0,
          racketUnitPrice: isFirst ? racketUnitPrice : 0,
          racketsAmount: currentRacketsAmount,
          ballsQty: isFirst ? values.ballsQty : 0,
          ballTypeId:
            isFirst && selectedBallTypeId ? selectedBallTypeId : undefined,
          ballTypeName:
            isFirst && selectedBallOption?.name
              ? selectedBallOption.name
              : undefined,
          ballsUnitPrice: isFirst ? ballsUnitPrice : 0,
          ballsAmount: currentBallsAmount,
          slotAmount,
          totalAmount: slotAmount + currentRacketsAmount + currentBallsAmount,
          createdByOfficer: true,
        };
      });

      const { data } = await api.post("/payments/stk-push", {
        phoneNumber: values.phoneNumber,
        amount: totalAmount,
        reservations,
      });
      const resp = data?.data || data;
      setInitiatedPayment({ paymentId: resp?.paymentId });
      toaster(
        resp?.CustomerMessage || "Payment request sent to customer's phone",
        { variant: "success" }
      );
      setIsWaitingPayment(true);
      setIsPollingPayment(true);
    } catch (e: any) {
      const errorMsg =
        e?.response?.data?.message || "Failed to initiate payment";
      toaster(errorMsg, { variant: "error" });
      setPaymentError(errorMsg);
      setFrozenCourtBookings([]);
    } finally {
      setIsInitiatingPayment(false);
    }
  };

  // Socket: payment updates
  useEffect(() => {
    if (!socket || !isConnected || !initiatedPayment?.paymentId) return;
    const onPaymentUpdate = (payload: any) => {
      try {
        if (!payload) return;
        if (payload.paymentId !== initiatedPayment.paymentId) return;
        if (payload.status === "COMPLETED") {
          finalizeSuccess(payload.bookingCode);
        } else if (["FAILED", "CANCELLED"].includes(payload.status)) {
          finalizeFailure(
            payload.status === "CANCELLED"
              ? "Payment cancelled"
              : "Payment failed"
          );
        }
      } catch {
        /* noop */
      }
    };
    socket.on("payments:update", onPaymentUpdate);
    return () => {
      socket.off("payments:update", onPaymentUpdate);
    };
  }, [
    socket,
    isConnected,
    initiatedPayment?.paymentId,
    finalizeSuccess,
    finalizeFailure,
  ]);

  // Polling fallback if no real-time
  useEffect(() => {
    if (!initiatedPayment?.paymentId || !isPollingPayment) return;
    if (socket && isConnected) return;
    let attempts = 0;
    let stopped = false;
    const poll = async () => {
      if (stopped || paymentHandledRef.current) return;
      attempts += 1;
      try {
        const statusResp = await api.get(
          `/payments/${initiatedPayment.paymentId}`
        );
        const p = statusResp.data?.data || statusResp.data;
        if (p?.status === "COMPLETED") {
          finalizeSuccess(p?.bookingCode);
          stopped = true;
          return;
        }
        if (["FAILED", "CANCELLED"].includes(p?.status)) {
          finalizeFailure(
            p?.status === "CANCELLED" ? "Payment cancelled" : "Payment failed"
          );
          stopped = true;
          return;
        }
      } catch {
        /* ignore */
      }
      if (attempts < 15 && !stopped && !paymentHandledRef.current) {
        setTimeout(poll, 4000);
      } else if (!stopped && !paymentHandledRef.current) {
        finalizeFailure("Payment timeout");
      }
    };
    const t = setTimeout(poll, 4000);
    return () => {
      stopped = true;
      clearTimeout(t);
    };
  }, [
    initiatedPayment?.paymentId,
    isPollingPayment,
    socket,
    isConnected,
    finalizeSuccess,
    finalizeFailure,
  ]);

  // Auto-refresh availability after earliest hold expiry
  useEffect(() => {
    if (isWaitingPayment) return;
    const allTimes = Object.values(availabilityByCourt).flatMap((arr) =>
      (arr || []).map((s) =>
        s.heldUntil ? new Date(s.heldUntil).getTime() : null
      )
    );
    const upcoming = allTimes
      .filter((t): t is number => !!t && t > Date.now())
      .sort((a, b) => a - b);
    if (upcoming.length === 0) return;
    const msUntil = upcoming[0] - Date.now() + 500;
    const timeout = setTimeout(() => {
      queryClient.invalidateQueries({
        queryKey: ["officer-create-availability", selectedDateStr, "v2"],
      });
    }, Math.max(0, msUntil));
    return () => clearTimeout(timeout);
  }, [availabilityByCourt, queryClient, selectedDateStr, isWaitingPayment]);

  // Socket: availability updates
  useEffect(() => {
    if (!socket || !isConnected) return;
    const handler = (payload: any) => {
      try {
        if (payload?.date === selectedDateStr) {
          queryClient.invalidateQueries({
            queryKey: ["officer-create-availability", selectedDateStr, "v2"],
          });
        }
      } catch {
        /* noop */
      }
    };
    socket.on("court:availability:updated", handler);
    return () => {
      socket.off("court:availability:updated", handler);
    };
  }, [socket, isConnected, selectedDateStr, queryClient]);

  if (!canCreate) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        You do not have permission to create bookings.
      </div>
    );
  }

  return (
    <LayoutContainer className="py-4 md:py-6 space-y-4 md:space-y-6">
      <motion.div
        className="flex items-center justify-between"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">
            Create Booking (Walk-in)
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-1">
            Customer will receive a payment request on their phone.
          </p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <Card>
          <CardHeader className="px-4 md:px-6">
            <CardTitle className="text-base md:text-lg">Select Date</CardTitle>
            <CardDescription className="text-xs md:text-sm">
              Up to 1 month ahead
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 md:px-6">
            {selectableDates.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No open days are available in the next month.
              </div>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent">
                {selectableDates.map((date, idx) => {
                  const dateKey = format(date, "yyyy-MM-dd");
                  const isSelected = dateKey === selectedDateStr;
                  return (
                    <motion.div
                      key={dateKey}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.2, delay: idx * 0.02 }}
                    >
                      <Button
                        variant={isSelected ? "default" : "outline"}
                        className="min-w-[80px] md:min-w-[90px] flex-col h-auto py-2 md:py-3"
                        onClick={() => handleDateChange(date)}
                      >
                        <span className="text-[10px] md:text-xs">
                          {getDateDisplay(date)}
                        </span>
                        <span className="text-base md:text-lg font-bold">
                          {format(date, "d")}
                        </span>
                        <span className="text-[10px] md:text-xs">
                          {format(date, "MMM")}
                        </span>
                      </Button>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid xl:grid-cols-3 gap-4 md:gap-6">
        <div className="xl:col-span-2 space-y-4 md:space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
          >
            <Card>
              <CardHeader className="px-4 md:px-6">
                <CardTitle className="text-base md:text-lg">
                  Select Start Time
                </CardTitle>
                <CardDescription className="text-xs md:text-sm">
                  Choose when the customer wants to play
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 md:px-6">
                {availabilityLoading || courtsLoading ? (
                  <div className="h-12 bg-muted animate-pulse rounded" />
                ) : availableStartHours.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-muted-foreground">
                      No available start times for this date.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <select
                      className="w-full px-4 py-3 text-base border border-border rounded-lg bg-background focus:outline-none focus:ring-ring touch-manipulation"
                      value={selectedStartHour ?? ""}
                      onChange={(e) => {
                        setSelectedStartHour(e.target.value || null);
                        setSelectedCourtBookings([]);
                      }}
                    >
                      <option value="" disabled>
                        Select a time
                      </option>
                      {availableStartHours.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {selectedStartHour != null && (
            <Card>
              <CardHeader>
                <CardTitle>Available Courts</CardTitle>
                <CardDescription>
                  Select one or more courts for the customer with their desired
                  duration.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {suggestedCourts.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-muted-foreground">
                      No courts available at {selectedStartHour}.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {suggestedCourts.map((court) => {
                      const selectedBooking = selectedCourtBookings.find(
                        (b) => b.court.id === court.id
                      );
                      const durationOptions = getDurationOptionsForCourt(
                        court.id
                      );
                      return (
                        <div
                          key={court.id}
                          className={`p-4 sm:p-6 border rounded-lg transition-all touch-manipulation ${
                            selectedBooking
                              ? "border-primary bg-primary/5 shadow-md"
                              : "border-border hover:border-primary/50 hover:shadow-sm"
                          }`}
                        >
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-lg">
                                {court.name}
                              </h3>
                              <Badge variant="outline">{court.surface}</Badge>
                            </div>
                            <div className="text-xs text-muted-foreground flex items-center gap-2">
                              <span>{court.location}</span>
                            </div>
                            <div>
                              <Label className="text-muted-foreground font-medium">
                                Durations available
                              </Label>
                              <div className="flex flex-wrap gap-2 mt-3">
                                {durationOptions.length === 0 ? (
                                  <span className="text-sm text-muted-foreground italic py-2">
                                    No continuous availability.
                                  </span>
                                ) : (
                                  durationOptions.map((m) => {
                                    const isSelected =
                                      selectedBooking?.durationMin === m;
                                    const previewSlots =
                                      computeConsecutiveSlots(
                                        court.id,
                                        selectedStartHour,
                                        m
                                      );
                                    if (previewSlots.length === 0) return null;
                                    const price =
                                      calculateDurationPrice(previewSlots);
                                    return (
                                      <Button
                                        key={m}
                                        size="default"
                                        variant={
                                          isSelected ? "default" : "outline"
                                        }
                                        className="min-h-[44px] px-4 py-2 touch-manipulation"
                                        onClick={() =>
                                          handleCourtDurationSelect(court, m)
                                        }
                                        disabled={isWaitingPayment}
                                      >
                                        {m} min · {formatCurrency(price)}
                                      </Button>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Booking Summary */}
        <div className="xl:col-span-1">
          <Card className="sticky top-6">
            <CardHeader
              className="cursor-pointer select-none hover:bg-muted/50 transition-colors"
              onClick={() => setIsSummaryCollapsed(!isSummaryCollapsed)}
            >
              <div className="flex items-center justify-between">
                <CardTitle>Booking Summary</CardTitle>
                <motion.button
                  type="button"
                  className="p-1 rounded-md hover:bg-muted transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsSummaryCollapsed(!isSummaryCollapsed);
                  }}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <motion.div
                    animate={{ rotate: isSummaryCollapsed ? 0 : 180 }}
                    transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                  >
                    <ChevronDown className="h-5 w-5" />
                  </motion.div>
                </motion.button>
              </div>
            </CardHeader>

            <CardContent>
              {effectiveCourtBookings.length > 0 ? (
                <>
                  <motion.div
                    initial={false}
                    animate={{
                      height: isSummaryCollapsed ? 0 : "auto",
                      opacity: isSummaryCollapsed ? 0 : 1,
                    }}
                    transition={{
                      height: {
                        duration: 0.3,
                        ease: [0.4, 0, 0.2, 1],
                      },
                      opacity: {
                        duration: 0.25,
                        ease: "easeInOut",
                      },
                    }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-4 px-1">
                      {/* Selected Courts */}
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1, duration: 0.3 }}
                        className="space-y-3"
                      >
                        <Label className="text-muted-foreground font-medium">
                          Selected Court(s)
                        </Label>
                        {effectiveCourtBookings.map((booking, index) => (
                          <motion.div
                            key={booking.court.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.15 + index * 0.05 }}
                            className="p-3 bg-muted/50 rounded-lg border border-border"
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-medium">
                                  {booking.court.name}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {booking.slots[0].time} -{" "}
                                  {format(
                                    new Date(
                                      new Date(selectedDate).setHours(
                                        booking.slots[0].hour,
                                        booking.slots[0].minutes
                                      ) +
                                        booking.durationMin * 60000
                                    ),
                                    "HH:mm"
                                  )}
                                </p>
                              </div>
                              <p className="font-medium text-sm">
                                {formatCurrency(
                                  calculateDurationPrice(booking.slots)
                                )}
                              </p>
                            </div>
                          </motion.div>
                        ))}
                      </motion.div>

                      {/* Date */}
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2, duration: 0.3 }}
                        className="pb-3 border-b border-border"
                      >
                        <Label className="text-muted-foreground font-medium">
                          Date
                        </Label>
                        <p className="font-medium mt-1">
                          {getDateDisplay(selectedDate)}
                        </p>
                      </motion.div>

                      {/* Equipment Selectors */}
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.25, duration: 0.3 }}
                        className="space-y-4"
                      >
                        <div>
                          <Label className="text-muted-foreground flex items-center justify-between mb-2">
                            <span className="font-medium">
                              Customer's racket rental
                            </span>
                            <span className="text-xs">
                              {formatCurrency(racketUnitPrice)} per racket/hr
                            </span>
                          </Label>
                          <div className="flex items-center gap-3">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-10 w-10 rounded-full"
                              onClick={() =>
                                formik.setFieldValue(
                                  "racketQty",
                                  Math.max(0, formik.values.racketQty - 1)
                                )
                              }
                              disabled={
                                isWaitingPayment ||
                                formik.values.racketQty === 0
                              }
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <div className="flex-1 text-center">
                              <div className="text-2xl font-bold">
                                {formik.values.racketQty}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {formik.values.racketQty === 0
                                  ? "No rental"
                                  : `racket${
                                      formik.values.racketQty > 1 ? "s" : ""
                                    }`}
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-10 w-10 rounded-full"
                              onClick={() =>
                                formik.setFieldValue(
                                  "racketQty",
                                  Math.min(8, formik.values.racketQty + 1)
                                )
                              }
                              disabled={
                                isWaitingPayment ||
                                formik.values.racketQty === 8
                              }
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        <div>
                          <Label className="text-muted-foreground flex items-center justify-between mb-2">
                            <span className="font-medium">
                              Ball packs (3 balls per pack)
                            </span>
                            <span className="text-xs">
                              {formatCurrency(ballsUnitPrice)} per pack
                            </span>
                          </Label>

                          {/* Ball Type Selection */}
                          {ballOptions.length > 1 && (
                            <div className="mb-3 space-y-2">
                              <Label className="text-xs text-muted-foreground">
                                Select Ball Type
                              </Label>
                              <div className="flex flex-col sm:grid sm:grid-cols-2 gap-2">
                                {ballOptions.map((option: any) => {
                                  const isSelected =
                                    selectedBallTypeId === option.id;
                                  return (
                                    <Button
                                      key={option.id}
                                      type="button"
                                      variant={isSelected ? "default" : "ghost"}
                                      className={`h-auto py-2.5 sm:py-3 px-3 sm:px-4 flex flex-col items-start gap-0.5 sm:gap-1 border-0 text-left w-full ${
                                        isSelected
                                          ? ""
                                          : "bg-muted hover:bg-muted/80"
                                      }`}
                                      onClick={() => {
                                        setSelectedBallTypeId(option.id);
                                        setBallsUnitPrice(
                                          option.unitFinal ||
                                            option.unitBase ||
                                            1000
                                        );
                                      }}
                                      disabled={isWaitingPayment}
                                    >
                                      <span className="text-xs sm:text-sm font-medium">
                                        {option.name}
                                      </span>
                                      <span
                                        className={`text-[10px] sm:text-xs ${
                                          isSelected
                                            ? "opacity-90"
                                            : "text-muted-foreground"
                                        }`}
                                      >
                                        {formatCurrency(
                                          option.unitFinal || option.unitBase
                                        )}{" "}
                                        per pack
                                      </span>
                                    </Button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          <div className="flex items-center gap-3">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-10 w-10 rounded-full"
                              onClick={() =>
                                formik.setFieldValue(
                                  "ballsQty",
                                  Math.max(0, formik.values.ballsQty - 1)
                                )
                              }
                              disabled={
                                isWaitingPayment || formik.values.ballsQty === 0
                              }
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <div className="flex-1 text-center">
                              <div className="text-2xl font-bold">
                                {formik.values.ballsQty}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {formik.values.ballsQty === 0
                                  ? "No balls"
                                  : `pack${
                                      formik.values.ballsQty > 1 ? "s" : ""
                                    }`}
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-10 w-10 rounded-full"
                              onClick={() =>
                                formik.setFieldValue(
                                  "ballsQty",
                                  Math.min(5, formik.values.ballsQty + 1)
                                )
                              }
                              disabled={
                                isWaitingPayment || formik.values.ballsQty === 5
                              }
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </motion.div>

                      {/* Price Breakdown */}
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3, duration: 0.3 }}
                        className="border-t border-border space-y-2"
                      >
                        <div className="flex py-3 justify-between text-sm">
                          <span className="text-muted-foreground">
                            Court(s) Subtotal
                          </span>
                          <span className="font-medium">
                            {formatCurrency(baseSlotAmount)}
                          </span>
                        </div>
                        <AnimatePresence>
                          {racketsAmount > 0 && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="flex justify-between text-sm overflow-hidden"
                            >
                              <span className="text-muted-foreground">
                                Rackets
                              </span>
                              <span className="font-medium">
                                {formatCurrency(racketsAmount)}
                              </span>
                            </motion.div>
                          )}
                        </AnimatePresence>
                        <AnimatePresence>
                          {ballsAmount > 0 && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="flex justify-between text-sm overflow-hidden"
                            >
                              <span className="text-muted-foreground">
                                Balls
                              </span>
                              <span className="font-medium">
                                {formatCurrency(ballsAmount)}
                              </span>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    </div>
                  </motion.div>

                  <div className="flex flex-col gap-4 pb-6">
                    {/* Always Visible: Total */}
                    <motion.div
                      layout
                      className="pt-3 border-t-2 border-border"
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-lg font-semibold">Total</span>
                        <motion.span
                          key={totalAmount}
                          initial={{ scale: 1.1 }}
                          animate={{ scale: 1 }}
                          transition={{ duration: 0.2 }}
                          className="text-2xl font-bold text-primary"
                        >
                          {formatCurrency(totalAmount)}
                        </motion.span>
                      </div>
                    </motion.div>

                    {/* Payment Section */}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        formik.handleSubmit();
                      }}
                      className="space-y-3"
                    >
                      <motion.div
                        layout
                        className="space-y-3 p-4 border border-border rounded-lg bg-muted/30"
                      >
                        <Label
                          htmlFor="phoneNumber"
                          className="text-muted-foreground flex items-center gap-2 text-xs"
                        >
                          <Info className="h-3 w-3" /> Customer's M-PESA Number
                        </Label>
                        <input
                          id="phoneNumber"
                          name="phoneNumber"
                          type="text"
                          className={`w-full px-3 py-2 border rounded bg-background text-sm ${
                            formik.touched.phoneNumber &&
                            formik.errors.phoneNumber
                              ? "border-red-500"
                              : "border-border"
                          }`}
                          placeholder="Customer's number: 07XX or 2547XX"
                          value={formik.values.phoneNumber}
                          onChange={formik.handleChange}
                          onBlur={formik.handleBlur}
                          disabled={isWaitingPayment}
                        />
                        {formik.touched.phoneNumber &&
                          formik.errors.phoneNumber && (
                            <div className="text-xs text-red-700 bg-red-500/10 border border-red-500/30 rounded p-2 dark:text-red-400 dark:bg-red-500/20 dark:border-red-500/40">
                              {formik.errors.phoneNumber}
                            </div>
                          )}
                        {paymentError && (
                          <div className="text-sm text-destructive bg-destructive/20 border border-destructive/30 rounded p-2">
                            {paymentError}
                          </div>
                        )}
                        <Button
                          type="submit"
                          className="w-full"
                          disabled={
                            isInitiatingPayment ||
                            isWaitingPayment ||
                            effectiveCourtBookings.length === 0 ||
                            !formik.isValid
                          }
                        >
                          {isInitiatingPayment ? (
                            <span className="inline-flex items-center">
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />{" "}
                              Sending Payment Request...
                            </span>
                          ) : isWaitingPayment ? (
                            <span className="inline-flex items-center">
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />{" "}
                              Waiting for Payment...
                            </span>
                          ) : (
                            <span className="inline-flex items-center">
                              <CreditCard className="mr-2 h-4 w-4" /> Send
                              Payment Request
                            </span>
                          )}
                        </Button>
                        {isWaitingPayment && (
                          <p className="text-[10px] text-muted-foreground">
                            Instruct the customer to check their phone and enter
                            their M-PESA PIN to complete payment.
                          </p>
                        )}
                      </motion.div>
                    </form>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground py-4">
                  Select court and time for the customer to proceed.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </LayoutContainer>
  );
}

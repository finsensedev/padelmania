/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useContext,
  useRef,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  format,
  addDays,
  setHours,
  setMinutes,
  setSeconds,
  setMilliseconds,
  startOfDay,
  addMonths,
  differenceInCalendarDays,
  isBefore,
} from "date-fns";
import {
  Users,
  CreditCard,
  Info,
  Phone,
  Share2,
  Loader2,
  Gift,
  Check,
  X,
  UserPlus,
  ChevronDown,
  Minus,
  Plus,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useQueryClient } from "react-query";
import { useFormik } from "formik";
import * as Yup from "yup";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { Button } from "src/components/ui/button";

import { Label } from "src/components/ui/label";
import { RadioGroup, RadioGroupItem } from "src/components/ui/radio-group";
import api from "src/utils/api";

import paymentService from "src/services/payment.service";
import type { BookingRecord } from "src/services/booking.service";
import { useSelector } from "react-redux";
import useNotification from "src/hooks/useNotification";
import useModal from "src/hooks/useModal";
import { SocketContext } from "src/contexts/SocketProvider";
import { useSystemConfig } from "src/hooks/useSystemConfig";
import voucherService, {
  type VoucherValidation,
} from "src/services/voucher.service";
import giftcardService, {
  type GiftCardQuote,
} from "src/services/giftcard.service";
import BookingInviteModal from "src/components/customer/BookingInviteModal";
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
  images: string[];
  isActive: boolean;
}

interface TimeSlot {
  time: string;
  hour: number;
  minutes: number; // 0 or 30 for half-hour slots
  isNextDay?: boolean; // true if this slot is on the next calendar day (for wrap-past-midnight hours)
  isAvailable: boolean;
  rate: number;
  isPeak?: boolean;
  appliedRule?: string;
  booking?: any;
  heldUntil?: string; // ISO string when slot hold (pending payment) expires
  isMaintenance?: boolean; // backend explicit maintenance blackout flag
}

type SelectedBooking = {
  court: Court;
  durationMin: number;
  slots: TimeSlot[];
};

type VoucherState = VoucherValidation & { quotedAmount: number };

function BookCourt() {
  const navigate = useNavigate();
  const { toaster } = useNotification();
  const queryClient = useQueryClient();
  const { bookingSlotConfig, operatingHoursConfig } = useSystemConfig();
  const [isSummaryCollapsed, setIsSummaryCollapsed] = useState(false);

  // --- State Management ---
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedStartHour, setSelectedStartHour] = useState<string | null>(
    null,
  );

  const effectiveOperatingHours: OperatingHoursConfig =
    operatingHoursConfig || DEFAULT_OPERATING_HOURS;

  const dayWindow = useCallback(
    (
      date: Date,
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
    [effectiveOperatingHours],
  );
  const [selectedCourtBookings, setSelectedCourtBookings] = useState<
    SelectedBooking[]
  >([]);
  const [frozenCourtBookings, setFrozenCourtBookings] = useState<
    SelectedBooking[]
  >([]);
  const [frozenRacketQty, setFrozenRacketQty] = useState<number | null>(null);
  const [frozenBallsQty, setFrozenBallsQty] = useState<number | null>(null);
  const [racketUnitPrice, setRacketUnitPrice] = useState<number>(300);
  const [ballsUnitPrice, setBallsUnitPrice] = useState<number>(1000);
  const [ballOptions, setBallOptions] = useState<any[]>([]);
  const [selectedBallTypeId, setSelectedBallTypeId] = useState<string | null>(
    null,
  );
  const selectedBallOption = useMemo(
    () =>
      ballOptions.find((option: any) => option.id === selectedBallTypeId) ||
      null,
    [ballOptions, selectedBallTypeId],
  );
  const [createdBooking, setCreatedBooking] = useState<any>(null);
  const [initiatedPayment, setInitiatedPayment] = useState<{
    paymentId?: string;
  } | null>(null);
  const [isPollingPayment, setIsPollingPayment] = useState(false);
  const [isWaitingPayment, setIsWaitingPayment] = useState(false);

  // Player invitations
  const [invitedEmails, setInvitedEmails] = useState<string[]>([]);

  const [isInitiatingPayment, setIsInitiatingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const paymentHandledRef = useRef(false);
  const { pushModal } = useModal();
  const { socket, isConnected } = useContext(SocketContext);
  const user = useSelector((state: any) => state.userState?.user);
  const prevUserPhoneRef = useRef<string | null | undefined>(user?.phone);
  const [giftCardQuote, setGiftCardQuote] = useState<GiftCardQuote | null>(
    null,
  );
  const [giftCardError, setGiftCardError] = useState<string | null>(null);
  const [isQuotingGiftCard, setIsQuotingGiftCard] = useState(false);
  const [voucherValidation, setVoucherValidation] =
    useState<VoucherState | null>(null);
  const [voucherError, setVoucherError] = useState<string | null>(null);
  const [isValidatingVoucher, setIsValidatingVoucher] = useState(false);

  // Validation Schema
  const validationSchema = useMemo(
    () =>
      Yup.object({
        phoneNumber: Yup.string().when("phoneOption", {
          is: "custom",
          then: (schema) =>
            schema
              .required("Phone number is required")
              .matches(
                /^(?:0?(?:7|1)\d{8}|(?:\+?254)(?:7|1)\d{8})$/,
                "Enter a valid Kenyan phone number (07XX, 01XX, or 2547XX, 2541XX)",
              ),
          otherwise: (schema) => schema.notRequired(),
        }),
        phoneOption: Yup.string()
          .oneOf(["registered", "custom"])
          .required("Phone option is required"),
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
        voucherCode: Yup.string(),
        useGiftCard: Yup.boolean(),
      }),
    [],
  );

  // Formik Form
  const formik = useFormik({
    initialValues: {
      phoneNumber: "",
      phoneOption: (user?.phone ? "registered" : "custom") as
        | "registered"
        | "custom",
      racketQty: 0,
      ballsQty: 0,
      voucherCode: "",
      useGiftCard: false,
    },
    validationSchema,
    validateOnChange: true,
    validateOnBlur: true,
    onSubmit: async () => {
      await handleInitiatePayment();
    },
  });

  // --- Helper Functions (defined before use) ---
  const calculateDurationPrice = useCallback((slots: TimeSlot[]): number => {
    return slots.reduce((total, slot) => total + slot.rate, 0);
  }, []);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: "KES",
      maximumFractionDigits: 0,
    }).format(amount);

  const getDateDisplay = (date: Date) => {
    const diff = differenceInCalendarDays(
      startOfDay(date),
      startOfDay(new Date()),
    );
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    return format(date, "EEE, MMM d");
  };

  // --- Derived State & Memos ---
  const effectiveCourtBookings =
    frozenCourtBookings.length > 0
      ? frozenCourtBookings
      : selectedCourtBookings;
  const effectiveRacketQty = frozenRacketQty ?? formik.values.racketQty;
  const effectiveBallsQty = frozenBallsQty ?? formik.values.ballsQty;
  const firstBookingDurationMin = effectiveCourtBookings[0]?.durationMin || 0;
  const firstBookingDurationHours = firstBookingDurationMin / 60;

  const baseSlotAmount = useMemo(() => {
    return effectiveCourtBookings.reduce(
      (sum, booking) => sum + calculateDurationPrice(booking.slots),
      0,
    );
  }, [effectiveCourtBookings, calculateDurationPrice]);

  const racketsAmount = useMemo(() => {
    if (effectiveCourtBookings.length === 0) return 0;
    return effectiveRacketQty * racketUnitPrice * firstBookingDurationHours;
  }, [
    effectiveCourtBookings.length,
    effectiveRacketQty,
    racketUnitPrice,
    firstBookingDurationHours,
  ]);

  const ballsAmount = useMemo(() => {
    if (effectiveCourtBookings.length === 0) return 0;
    return effectiveBallsQty * ballsUnitPrice;
  }, [effectiveCourtBookings.length, effectiveBallsQty, ballsUnitPrice]);

  const baseTotal = useMemo(() => {
    return baseSlotAmount + racketsAmount + ballsAmount;
  }, [baseSlotAmount, racketsAmount, ballsAmount]);

  const voucherDiscount = useMemo(() => {
    if (!voucherValidation) return 0;
    const discount = Number(voucherValidation.discount || 0);
    if (!Number.isFinite(discount) || discount <= 0) return 0;
    return Math.min(discount, baseTotal);
  }, [voucherValidation, baseTotal]);

  const totalAfterDiscount = useMemo(
    () => Math.max(0, baseTotal - voucherDiscount),
    [baseTotal, voucherDiscount],
  );

  const totalAfterGiftCard = useMemo(() => {
    const applied = giftCardQuote?.applied || 0;
    return Math.max(0, totalAfterDiscount - applied);
  }, [totalAfterDiscount, giftCardQuote]);

  const selectedPhone = useMemo(
    () =>
      formik.values.phoneOption === "registered"
        ? user?.phone || ""
        : formik.values.phoneNumber,
    [formik.values.phoneOption, formik.values.phoneNumber, user?.phone],
  );

  const trimmedVoucherCode = useMemo(
    () => formik.values.voucherCode.trim(),
    [formik.values.voucherCode],
  );

  const voucherAppliedForCurrentQuote = useMemo(
    () =>
      !!(
        voucherValidation &&
        trimmedVoucherCode &&
        voucherValidation.code?.toUpperCase() ===
          trimmedVoucherCode.toUpperCase() &&
        Math.round(voucherValidation.quotedAmount) === Math.round(baseTotal)
      ),
    [voucherValidation, trimmedVoucherCode, baseTotal],
  );

  // --- Phone Number Logic ---
  useEffect(() => {
    const phoneJustLoaded = !prevUserPhoneRef.current && user?.phone;
    if (
      phoneJustLoaded &&
      formik.values.phoneOption === "custom" &&
      !formik.values.phoneNumber
    ) {
      formik.setFieldValue("phoneOption", "registered");
    }
    prevUserPhoneRef.current = user?.phone;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.phone, formik.values.phoneOption, formik.values.phoneNumber]);

  useEffect(() => {
    if (formik.values.phoneOption === "registered") {
      formik.setFieldValue("phoneNumber", user?.phone || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formik.values.phoneOption, user?.phone]);

  // --- State Reset & Cleanup ---
  const clearAllStates = useCallback(() => {
    setSelectedCourtBookings([]);
    setSelectedDate(new Date());
    setSelectedStartHour(null);
    setFrozenCourtBookings([]);
    setFrozenRacketQty(null);
    setFrozenBallsQty(null);
    formik.resetForm({
      values: {
        phoneNumber: "",
        phoneOption: (user?.phone ? "registered" : "custom") as
          | "registered"
          | "custom",
        racketQty: 0,
        ballsQty: 0,
        voucherCode: "",
        useGiftCard: false,
      },
    });
    setCreatedBooking(null);
    setInitiatedPayment(null);
    setIsPollingPayment(false);
    setIsWaitingPayment(false);
    setIsInitiatingPayment(false);
    setPaymentError(null);
    setVoucherValidation(null);
    setVoucherError(null);
    setGiftCardQuote(null);
    setGiftCardError(null);
    setInvitedEmails([]);
    paymentHandledRef.current = false;

    // Invalidate queries to refresh availability
    queryClient.invalidateQueries(["availability:all"]);
    queryClient.invalidateQueries(["courts"]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.phone]);

  // Handle sending invitations after booking is confirmed (called AFTER payment)
  const handleSendInvites = useCallback(
    async (emails: string[], bookingId: string) => {
      try {
        await api.post(`/booking/${bookingId}/invite`, { emails });
        toaster(`Successfully invited ${emails.length} player(s)!`, {
          variant: "success",
        });
      } catch (error: any) {
        const msg =
          error?.response?.data?.message || "Failed to send invitations";
        toaster(msg, { variant: "error" });
        throw error;
      }
    },
    [toaster],
  );

  const finalizePayment = useCallback(
    async (bookingId?: string) => {
      if (paymentHandledRef.current) {
        if (bookingId && !createdBooking) {
          try {
            const result = await api.get(`/booking/${bookingId}/status`);
            setCreatedBooking(result.data?.data || result.data);
          } catch {
            /* noop */
          }
        }
        return;
      }
      paymentHandledRef.current = true;

      // Immediately clear frozen states and selections to make UI interactive and hide summary
      setIsPollingPayment(false);
      setIsWaitingPayment(false);
      setIsInitiatingPayment(false);
      setFrozenCourtBookings([]);
      setFrozenRacketQty(null);
      setFrozenBallsQty(null);
      setSelectedCourtBookings([]); // Clear the summary section
      setPaymentError(null);

      // Refresh availability data immediately
      queryClient.invalidateQueries(["availability:all"]);

      let booking = createdBooking;
      if (bookingId && !booking) {
        try {
          const result = await api.get(`/booking/${bookingId}/status`);
          booking = result.data?.data || result.data;
          setCreatedBooking(booking);
        } catch {
          /* swallow */
        }
      }

      // Send invitations if any emails were added
      if (invitedEmails.length > 0 && (booking?.id || bookingId)) {
        try {
          await handleSendInvites(invitedEmails, booking?.id || bookingId);
          toaster(
            `Payment confirmed! Invitations sent to ${invitedEmails.length} player(s).`,
            {
              variant: "success",
            },
          );
        } catch (error: any) {
          console.error("Failed to send invitations:", error);
          // Don't block the success flow, just log the error
          toaster(
            booking
              ? "Booking created but failed to send some invitations"
              : "Payment confirmed but failed to send invitations",
            { variant: "warning" },
          );
        }
      } else {
        toaster(
          booking
            ? "Payment confirmed and booking created"
            : "Payment confirmed.",
          { variant: "success" },
        );
      }

      setTimeout(() => {
        pushModal(
          <ConfirmedAndThanksModal
            booking={booking as BookingRecord}
            onClose={clearAllStates}
          />,
        );
      }, 400);
    },
    [
      createdBooking,
      pushModal,
      clearAllStates,
      toaster,
      invitedEmails,
      handleSendInvites,
      queryClient,
    ],
  );

  // --- Data Fetching (React Query) ---
  const { data: courts = [], isLoading: courtsLoading } = useQuery<Court[]>({
    queryKey: ["courts"],
    queryFn: async () => {
      const response = await api.get("/court");
      return response.data.data.filter((court: Court) => court.isActive);
    },
    onError: () => toaster("Failed to load courts", { variant: "error" }),
  });

  const selectedDateStr = useMemo(
    () => format(selectedDate, "yyyy-MM-dd"),
    [selectedDate],
  );

  const { data: availabilityByCourt = {}, isLoading: availabilityLoading } =
    useQuery<Record<string, TimeSlot[]>>({
      queryKey: ["availability:all", selectedDateStr, "v1"],
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
                `/court/${c.id}/availability?date=${selectedDateStr}`,
              );
              const data = response.data?.data || response.data;
              const slots = (data?.timeSlots || []).map((slot: any) => ({
                ...slot,
                minutes: slot.minutes || 0,
                isNextDay: !!slot.isNextDay, // preserve next-day flag for midnight slots
                isAvailable: !!slot.isAvailable,
                rate: Number(slot.rate || 0),
              }));
              return [c.id, slots] as const;
            } catch {
              return [c.id, []] as const;
            }
          }),
        );
        return Object.fromEntries(pairs);
      },
      onError: () =>
        toaster("Failed to load availability", { variant: "error" }),
    });

  // Dynamic pricing for rackets and balls based on the first selected slot
  const firstSelectedSlot = selectedCourtBookings[0]?.slots[0];
  useQuery(
    [
      "equipment-unit-price",
      selectedCourtBookings[0]?.court.id,
      selectedDateStr,
      firstSelectedSlot?.time,
    ],
    async () => {
      const firstBooking = selectedCourtBookings[0];
      if (!firstBooking) return null;

      // Account for isNextDay flag for slots past midnight
      const baseDate = firstBooking.slots[0].isNextDay
        ? new Date(selectedDate.getTime() + 24 * 60 * 60 * 1000)
        : selectedDate;
      const startTime = setHours(
        setMinutes(setSeconds(setMilliseconds(baseDate, 0), 0), 0),
        firstBooking.slots[0].hour,
      );
      const endTime = new Date(
        startTime.getTime() + firstBooking.durationMin * 60 * 1000,
      );

      const res = await api.post("/court/pricing/calculate", {
        courtId: firstBooking.court.id,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        userId: user?.id || undefined,
      });
      return res.data?.data || res.data;
    },
    {
      enabled: selectedCourtBookings.length > 0 && !isWaitingPayment,
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
            options[0].unitFinal || options[0].unitBase || 1000,
          );
        } else if (selectedBallTypeId) {
          // Update price for currently selected ball type
          const selectedOption = options.find(
            (opt: any) => opt.id === selectedBallTypeId,
          );
          if (selectedOption) {
            setBallsUnitPrice(
              selectedOption.unitFinal || selectedOption.unitBase || 1000,
            );
          }
        } else {
          // Fallback to legacy single price
          const ballsUnit = data.ballsUnitFinal ?? data.ballsUnitBase ?? 1000;
          setBallsUnitPrice(
            Number.isFinite(ballsUnit) && ballsUnit > 0 ? ballsUnit : 1000,
          );
        }

        setRacketUnitPrice(
          Number.isFinite(racketUnit) && racketUnit > 0 ? racketUnit : 300,
        );
      },
      onError: () => {
        setRacketUnitPrice(300);
        setBallsUnitPrice(1000);
        setBallOptions([]);
      },
      staleTime: 60_000,
    },
  );

  // --- Real-time Updates & Timers ---
  const [nowTick, setNowTick] = useState<number>(Date.now());
  const anyHeldActive = useMemo(
    () =>
      Object.values(availabilityByCourt).some((arr) =>
        (arr || []).some(
          (s) => s.heldUntil && new Date(s.heldUntil).getTime() > Date.now(),
        ),
      ),
    [availabilityByCourt],
  );

  useEffect(() => {
    if (!anyHeldActive) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [anyHeldActive]);

  useEffect(() => {
    const allHeldTimes = Object.values(availabilityByCourt)
      .flat()
      .map((s) => (s.heldUntil ? new Date(s.heldUntil).getTime() : null))
      .filter((t): t is number => !!t && t > Date.now())
      .sort((a, b) => a - b);
    if (allHeldTimes.length === 0) return;
    const msUntil = allHeldTimes[0] - Date.now() + 500;
    const timerId = setTimeout(
      () => {
        queryClient.invalidateQueries([
          "availability:all",
          selectedDateStr,
          "v1",
        ]);
      },
      Math.max(0, msUntil),
    );
    return () => clearTimeout(timerId);
  }, [availabilityByCourt, queryClient, selectedDateStr]);

  // --- Core Logic & Helpers ---
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

      // Map normalized minutes to slots for wrap-friendly lookup
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
          return []; // Not enough consecutive available slots
        }
        resultSlots.push(slot);
      }
      return resultSlots;
    },
    [availabilityByCourt, nowTick, dayWindow, selectedDate],
  );

  const isBookingWithinOperatingHours = useCallback(
    (startTime: string, durationMinutes: number, date: Date): boolean => {
      const { day, open, close } = dayWindow(date);
      if (!day) return false; // Closed or missing config
      const wraps = close > 24 * 60;
      const [h, m] = startTime.split(":").map(Number);
      const baseStart = h * 60 + m;
      const startMinutes =
        wraps && baseStart < open ? baseStart + 24 * 60 : baseStart;
      const endMinutes = startMinutes + durationMinutes;
      return startMinutes >= open && endMinutes <= close;
    },
    [dayWindow],
  );

  const isValidPhone = (phone: string) =>
    /^(?:0?(?:7|1)\d{8}|(?:\+?254)(?:7|1)\d{8})$/.test((phone || "").trim());

  const handleDateChange = (date: Date) => {
    setSelectedDate(date);
    setSelectedStartHour(null);
    setSelectedCourtBookings([]);
  };

  const handleCourtDurationSelect = (court: Court, duration: number) => {
    // If we are frozen for payment, do nothing.
    if (frozenCourtBookings.length > 0) return;

    const startTime = selectedStartHour;
    if (!startTime) return;

    const existingBookingIndex = selectedCourtBookings.findIndex(
      (b) => b.court.id === court.id,
    );

    // If this duration is already selected for this court, deselect it.
    if (
      existingBookingIndex !== -1 &&
      selectedCourtBookings[existingBookingIndex].durationMin === duration
    ) {
      setSelectedCourtBookings((prev) =>
        prev.filter((b) => b.court.id !== court.id),
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
        // Replace existing booking for this court, or add new.
        const otherBookings = prev.filter((b) => b.court.id !== court.id);
        return [...otherBookings, newBooking];
      });
    }
  };

  // --- Payment & Discount Logic ---
  const handleInitiatePayment = async () => {
    setPaymentError(null);
    if (effectiveCourtBookings.length === 0) {
      toaster("Please select a court and duration first.", {
        variant: "error",
      });
      return;
    }
    if (!selectedPhone || !isValidPhone(selectedPhone)) {
      toaster("Please enter a valid M-Pesa phone number.", {
        variant: "error",
      });
      return;
    }
    if (trimmedVoucherCode && !voucherAppliedForCurrentQuote) {
      const applied = await handleVoucherApply({ silent: true });
      if (!applied) {
        toaster("Update or remove the voucher before paying.", {
          variant: "error",
        });
        return;
      }
    }

    setIsInitiatingPayment(true);
    paymentHandledRef.current = false;

    try {
      // Use selectedCourtBookings directly (before freezing)
      const bookingsToProcess = selectedCourtBookings;

      // Freeze state for payment AFTER capturing the current state
      setFrozenCourtBookings(bookingsToProcess);
      setFrozenRacketQty(formik.values.racketQty);
      setFrozenBallsQty(formik.values.ballsQty);

      const reservations = bookingsToProcess.map((booking, index) => {
        console.log(`Processing booking ${index}:`, booking);
        // FIX: Include both hour AND minutes from the slot to prevent time offset bugs
        // Also account for isNextDay flag for slots past midnight
        const baseDate = booking.slots[0].isNextDay
          ? new Date(selectedDate.getTime() + 24 * 60 * 60 * 1000) // next day
          : selectedDate;
        const startTime = setMinutes(
          setHours(
            setSeconds(setMilliseconds(baseDate, 0), 0),
            booking.slots[0].hour,
          ),
          booking.slots[0].minutes || 0,
        );
        const endTime = new Date(
          startTime.getTime() + booking.durationMin * 60 * 1000,
        );
        const slotAmount = calculateDurationPrice(booking.slots);

        // Apply rackets/balls only to the first reservation item
        const isFirst = index === 0;
        const currentRacketsAmount = isFirst ? racketsAmount : 0;
        const currentBallsAmount = isFirst ? ballsAmount : 0;

        const reservation = {
          courtId: booking.court.id,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          duration: booking.durationMin,
          slotAmount,
          racketQty: isFirst ? formik.values.racketQty : 0,
          racketUnitPrice,
          racketsAmount: currentRacketsAmount,
          ballsQty: isFirst ? formik.values.ballsQty : 0,
          ballTypeId:
            isFirst && selectedBallTypeId ? selectedBallTypeId : undefined,
          ballTypeName:
            isFirst && selectedBallOption?.name
              ? selectedBallOption.name
              : undefined,
          ballsUnitPrice,
          ballsAmount: currentBallsAmount,
          totalAmount: slotAmount + currentRacketsAmount + currentBallsAmount,
        };

        return reservation;
      });

      const payload = {
        phoneNumber: selectedPhone,
        amount: baseTotal, // Send the final calculated total
        reservations,
        voucherCode: formik.values.voucherCode?.trim() || undefined,
        useGiftCard: !!formik.values.useGiftCard,
      };

      const { data } = await api.post("/payments/stk-push", payload);
      const resp = (data?.data || data) as {
        paymentId?: string;
        CustomerMessage?: string;
        giftCardOnly?: boolean;
        bookingId?: string;
      };

      if (resp?.giftCardOnly) {
        setIsInitiatingPayment(false);
        await finalizePayment(resp.bookingId);
        return;
      }

      setInitiatedPayment({ paymentId: resp?.paymentId });
      setIsPollingPayment(true);
      setIsWaitingPayment(true);
      toaster(resp?.CustomerMessage || "STK push sent. Check your phone.", {
        variant: "success",
      });
    } catch (error: any) {
      const msg =
        error?.response?.data?.message || "Failed to initiate payment";
      toaster(msg, { variant: "error" });
      setPaymentError(msg);
      // Unfreeze state on failure
      setFrozenCourtBookings([]);
      setFrozenRacketQty(null);
      setFrozenBallsQty(null);
      setIsInitiatingPayment(false);
    }
  };

  // Handle adding emails to invitation list (called from modal BEFORE payment)
  const handleAddInvitationEmails = async (emails: string[]) => {
    // Filter out empty strings and ensure uniqueness
    const validEmails = emails.filter((e) => e.trim() !== "");
    const uniqueEmails = Array.from(new Set(validEmails));

    setInvitedEmails(uniqueEmails);
    toaster(`${uniqueEmails.length} player(s) in invitation list!`, {
      variant: "success",
    });
  };

  const handleVoucherApply = useCallback(
    async (options?: { silent?: boolean }) => {
      const normalizedCode = trimmedVoucherCode.toUpperCase();
      if (!normalizedCode) {
        setVoucherValidation(null);
        setVoucherError(null);
        return false;
      }
      if (baseTotal <= 0) {
        const msg = "Voucher cannot be applied to this booking.";
        setVoucherValidation(null);
        setVoucherError(msg);
        if (!options?.silent) toaster(msg, { variant: "error" });
        return false;
      }

      setIsValidatingVoucher(true);
      setVoucherError(null);
      try {
        const validation = await voucherService.validate(
          normalizedCode,
          baseTotal,
        );
        if (validation?.valid) {
          setVoucherValidation({ ...validation, quotedAmount: baseTotal });
          formik.setFieldValue(
            "voucherCode",
            validation.code || normalizedCode,
          );
          if (!options?.silent)
            toaster("Voucher applied.", { variant: "success" });
          return true;
        }
        const message = validation?.message || "Voucher not applicable.";
        setVoucherValidation(null);
        setVoucherError(message);
        if (!options?.silent) toaster(message, { variant: "error" });
        return false;
      } catch (error: any) {
        const message =
          error?.response?.data?.message || "Failed to validate voucher.";
        setVoucherValidation(null);
        setVoucherError(message);
        if (!options?.silent) toaster(message, { variant: "error" });
        return false;
      } finally {
        setIsValidatingVoucher(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trimmedVoucherCode, baseTotal, toaster],
  );

  useEffect(() => {
    if (
      !voucherValidation ||
      !trimmedVoucherCode ||
      voucherValidation.code?.toUpperCase() !==
        trimmedVoucherCode.toUpperCase() ||
      isValidatingVoucher
    ) {
      return;
    }
    if (Math.round(voucherValidation.quotedAmount) !== Math.round(baseTotal)) {
      void handleVoucherApply({ silent: true });
    }
  }, [
    baseTotal,
    voucherValidation,
    trimmedVoucherCode,
    isValidatingVoucher,
    handleVoucherApply,
  ]);

  const fetchGiftCardQuote = useCallback(
    async (amount: number) => {
      if (!formik.values.useGiftCard || !user?.id || amount <= 0) {
        setGiftCardQuote(null);
        setGiftCardError(null);
        return;
      }
      setIsQuotingGiftCard(true);
      setGiftCardError(null);
      try {
        const quote = await giftcardService.quote(amount);
        setGiftCardQuote(quote);
        if (quote.balance === 0)
          setGiftCardError("No gift card balance available.");
      } catch (error: any) {
        const message =
          error?.response?.data?.message ||
          "Failed to check gift card balance.";
        setGiftCardQuote(null);
        setGiftCardError(message);
      } finally {
        setIsQuotingGiftCard(false);
      }
    },
    [formik.values.useGiftCard, user?.id],
  );

  useEffect(() => {
    const amount = Math.max(0, Math.round(totalAfterDiscount));
    void fetchGiftCardQuote(amount);
  }, [formik.values.useGiftCard, totalAfterDiscount, fetchGiftCardQuote]);

  // --- Payment Polling & Socket Listeners ---
  useEffect(() => {
    if (!initiatedPayment?.paymentId) return;

    const handlePaymentResult = (
      status: string,
      bookingId?: string,
      reason?: string,
    ) => {
      if (status === "COMPLETED") {
        void finalizePayment(bookingId);
      } else {
        // FAILED or CANCELLED
        setIsPollingPayment(false);
        setIsWaitingPayment(false);
        setIsInitiatingPayment(false);
        setInitiatedPayment(null);
        setFrozenCourtBookings([]);
        setFrozenRacketQty(null);
        setFrozenBallsQty(null);
        const isCancelled = status === "CANCELLED";
        const msg = `${isCancelled ? "Payment cancelled" : "Payment failed"}${
          reason ? `: ${reason}` : ""
        }`;
        toaster(msg, { variant: "error" });
        setPaymentError(msg);
      }
    };

    if (isConnected && socket) {
      const onPaymentUpdate = (payload: any) => {
        if (payload?.paymentId === initiatedPayment.paymentId) {
          handlePaymentResult(
            payload.status,
            payload.bookingId,
            payload.reason || payload.note,
          );
        }
      };
      socket.on("payments:update", onPaymentUpdate);
      return () => {
        socket.off("payments:update", onPaymentUpdate);
      };
    }

    // Fallback polling
    let attempts = 0;
    const maxAttempts = 15;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      attempts++;
      try {
        const payment = await paymentService.getPaymentById(
          initiatedPayment.paymentId!,
        );
        if (
          payment?.status === "COMPLETED" ||
          payment?.status === "FAILED" ||
          payment?.status === "CANCELLED"
        ) {
          stopped = true;
          handlePaymentResult(payment.status, payment.bookingId);
          return;
        }
      } catch {
        /* ignore */
      }
      if (attempts >= maxAttempts) {
        stopped = true;
        handlePaymentResult("FAILED", undefined, "timed out");
      } else {
        setTimeout(tick, 4000);
      }
    };
    const timer = setTimeout(tick, 4000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [
    initiatedPayment?.paymentId,
    isPollingPayment,
    isConnected,
    socket,
    finalizePayment,
    toaster,
  ]);

  useEffect(() => {
    if (!socket || !isConnected) return;
    const handler = (payload: any) => {
      if (payload?.date === selectedDateStr) {
        queryClient.invalidateQueries([
          "availability:all",
          selectedDateStr,
          "v1",
        ]);
      }
    };
    socket.on("court:availability:updated", handler);
    return () => {
      socket.off("court:availability:updated", handler);
    };
  }, [socket, isConnected, selectedDateStr, queryClient]);

  // --- UI Data Computations ---
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
      (d) => startOfDay(d).getTime() === selectedKey,
    );
    if (!hasSelected) {
      setSelectedDate(selectableDates[0]);
      setSelectedStartHour(null);
      setSelectedCourtBookings([]);
    }
  }, [selectableDates, selectedDate]);

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
      startMinutes: number,
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
      // Build a lookup by normalized minutes to make wrap-friendly checks
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
            startOfSelected.getTime() + slotStartMinutes * 60 * 1000,
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

  const suggestedCourts = useMemo(() => {
    if (selectedStartHour == null) return [];
    return courts.filter((c) => {
      const s = (availabilityByCourt[c.id] || []).find(
        (x) => x.time === selectedStartHour,
      );
      const isHeld = s?.heldUntil && new Date(s.heldUntil).getTime() > nowTick;
      return s && s.isAvailable && !isHeld && !s.isMaintenance;
    });
  }, [courts, availabilityByCourt, selectedStartHour, nowTick]);

  const getDurationOptionsForCourt = useCallback(
    (courtId: string): number[] => {
      if (selectedStartHour == null || !bookingSlotConfig) return [];

      const courtSlots = availabilityByCourt[courtId] || [];
      const startIdx = courtSlots.findIndex(
        (x) => x.time === selectedStartHour,
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
            selectedDate,
          ),
      );
    },
    [
      availabilityByCourt,
      selectedStartHour,
      nowTick,
      bookingSlotConfig,
      isBookingWithinOperatingHours,
      selectedDate,
    ],
  );

  const discountControls = (
    <div className="space-y-3">
      <div className="space-y-2">
        <label className="block text-sm font-medium">Voucher code</label>
        <div className="flex flex-row">
          <input
            name="voucherCode"
            value={formik.values.voucherCode}
            onChange={(e) => {
              formik.handleChange(e);
              setVoucherError(null);
              setVoucherValidation(null);
            }}
            onBlur={formik.handleBlur}
            className="border border-border focus:outline-none focus:ring-2 focus:ring-ring rounded px-3 py-2 w-full"
            placeholder="Enter code (optional)"
            disabled={isValidatingVoucher || isWaitingPayment}
          />
          <Button
            className="ml-2"
            variant="default"
            type="button"
            onClick={() => void handleVoucherApply()}
            disabled={
              isValidatingVoucher ||
              !trimmedVoucherCode ||
              voucherAppliedForCurrentQuote ||
              isWaitingPayment
            }
          >
            {isValidatingVoucher ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Apply"
            )}
          </Button>
        </div>
        {voucherError && (
          <div className="text-sm text-destructive flex items-center gap-1">
            <X className="h-4 w-4" />
            {voucherError}
          </div>
        )}
        {voucherValidation && (
          <div className="text-sm text-emerald-600 flex items-center gap-2">
            <Check className="h-4 w-4" />
            {voucherValidation.type === "PERCENTAGE"
              ? `${voucherValidation.value}% off`
              : `${formatCurrency(voucherValidation.discount)} off`}
            <button
              type="button"
              className="text-xs text-emerald-700 underline"
              onClick={() => {
                setVoucherValidation(null);
                formik.setFieldValue("voucherCode", "");
              }}
            >
              Remove
            </button>
          </div>
        )}
      </div>
      <div className="space-y-2">
        <label className="inline-flex items-center space-x-2 text-sm">
          <input
            type="checkbox"
            name="useGiftCard"
            checked={formik.values.useGiftCard}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            disabled={!user?.id || isWaitingPayment}
          />
          <span className="flex items-center gap-1">
            <Gift className="h-4 w-4 text-primary" /> Use gift card balance
          </span>
        </label>
        {isQuotingGiftCard && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking...
          </div>
        )}
        {giftCardQuote?.applied ? (
          <div className="space-y-1">
            <div className="text-sm text-emerald-600 flex items-center gap-2">
              <Check className="h-4 w-4" /> Applied{" "}
              {formatCurrency(giftCardQuote.applied)}
              {giftCardQuote.code && (
                <span className="text-xs font-mono bg-emerald-50 dark:bg-emerald-950/20 px-2 py-0.5 rounded">
                  {giftCardQuote.code}
                </span>
              )}
            </div>
            {giftCardQuote.balance !== undefined && (
              <div className="text-xs text-muted-foreground ml-6">
                Gift card balance after payment:{" "}
                {formatCurrency(
                  Math.max(0, giftCardQuote.balance - giftCardQuote.applied),
                )}
              </div>
            )}
          </div>
        ) : null}
        {giftCardError && (
          <div className="text-sm text-amber-600 flex items-center gap-2">
            <Info className="h-4 w-4" /> {giftCardError}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="p-4 sm:p-6 space-y-6 bg-background min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
            Book a Court
          </h1>
          <p className="text-muted-foreground mt-1">
            Follow the steps to book your session
          </p>
          <div className="mt-3 p-3 rounded-md bg-accent/10 border border-accent/30 text-foreground text-sm leading-relaxed">
            <strong className="font-medium">How booking works:</strong> Your
            booking is created only after a successful payment. When you start
            payment, we temporarily hold your selected slot(s).
          </div>
        </div>
        <Button
          variant="outline"
          onClick={() => navigate("/customer/bookings")}
          className="w-full sm:w-auto"
        >
          View My Bookings
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="xl:col-span-2 space-y-6">
          {/* Step 1: Date Selection */}
          <Card>
            <CardHeader>
              <CardTitle>Select Date</CardTitle>
              <CardDescription>
                Choose your preferred playing date
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selectableDates.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No open days are available in the next month.
                </div>
              ) : (
                <div className="flex gap-2 overflow-x-auto pb-2 -mx-2 px-2 scrollbar-thin scrollbar-thumb-muted-foreground/30 scrollbar-track-muted/30">
                  {selectableDates.map((date) => {
                    const dateKey = format(date, "yyyy-MM-dd");
                    const isSelected = dateKey === selectedDateStr;
                    return (
                      <Button
                        key={dateKey}
                        variant={isSelected ? "default" : "outline"}
                        className="min-w-[90px] sm:min-w-[100px] flex-col h-auto py-3 px-3 flex-shrink-0 touch-manipulation"
                        onClick={() => handleDateChange(date)}
                      >
                        <span className="text-xs">{getDateDisplay(date)}</span>
                        <span className="text-lg font-bold">
                          {format(date, "d")}
                        </span>
                        <span className="text-xs">{format(date, "MMM")}</span>
                      </Button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Step 2: Start Time */}
          <Card>
            <CardHeader>
              <CardTitle>Select Start Time</CardTitle>
              <CardDescription>
                Pick a start time to see available courts
              </CardDescription>
            </CardHeader>
            <CardContent>
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

          {/* Step 3: Courts and Durations */}
          {selectedStartHour != null && (
            <Card>
              <CardHeader>
                <CardTitle>Available Courts</CardTitle>
                <CardDescription>
                  Pick one or more courts with your preferred duration.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(() => {
                  const courtsWithAvailability = suggestedCourts.filter(
                    (court) => getDurationOptionsForCourt(court.id).length > 0,
                  );

                  if (courtsWithAvailability.length === 0) {
                    return (
                      <div className="text-center py-8 space-y-3">
                        <p className="text-sm text-muted-foreground">
                          No courts with continuous availability at{" "}
                          {selectedStartHour}.
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Please select a different time or date.
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-4">
                      {courtsWithAvailability.map((court) => {
                        const selectedBooking = selectedCourtBookings.find(
                          (b) => b.court.id === court.id,
                        );
                        const durationOptions = getDurationOptionsForCourt(
                          court.id,
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
                              <h3 className="font-semibold text-lg">
                                {court.name}
                              </h3>
                              {/* ... court details ... */}
                              <div>
                                <Label className="text-muted-foreground font-medium">
                                  Durations available
                                </Label>
                                <div className="flex flex-wrap gap-2 mt-3">
                                  {durationOptions.map((m) => {
                                    const isSelected =
                                      selectedBooking?.durationMin === m;
                                    const previewSlots =
                                      computeConsecutiveSlots(
                                        court.id,
                                        selectedStartHour,
                                        m,
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
                                  })}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Booking Summary */}
        <div className="xl:col-span-1">
          <Card className="sticky py-0 mt-0">
            <CardHeader
              className="cursor-pointer pt-3 pb-1 select-none hover:bg-muted/50 transition-colors"
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

            <CardContent className="">
              {effectiveCourtBookings.length > 0 ? (
                <>
                  {/* Collapsible Details Section */}
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
                                      new Date(
                                        booking.slots[0].isNextDay
                                          ? selectedDate.getTime() +
                                              24 * 60 * 60 * 1000
                                          : selectedDate.getTime(),
                                      ).setHours(
                                        booking.slots[0].hour,
                                        booking.slots[0].minutes,
                                      ) +
                                        booking.durationMin * 60000,
                                    ),
                                    "HH:mm",
                                  )}
                                </p>
                              </div>
                              <p className="font-medium text-sm">
                                {formatCurrency(
                                  calculateDurationPrice(booking.slots),
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
                            <span className="font-medium">Racket rental</span>
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
                                  Math.max(0, formik.values.racketQty - 1),
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
                                  Math.min(8, formik.values.racketQty + 1),
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
                              Pack (3 balls per pack)
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
                                            1000,
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
                                          option.unitFinal || option.unitBase,
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
                                  Math.max(0, formik.values.ballsQty - 1),
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
                                  Math.min(5, formik.values.ballsQty + 1),
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
                        className=" border-t border-border space-y-2"
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
                        <AnimatePresence>
                          {voucherDiscount > 0 && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="flex justify-between text-sm text-primary overflow-hidden"
                            >
                              <span>Voucher discount</span>
                              <span className="font-medium">
                                -{formatCurrency(voucherDiscount)}
                              </span>
                            </motion.div>
                          )}
                        </AnimatePresence>
                        <AnimatePresence>
                          {giftCardQuote?.applied ? (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="flex justify-between text-sm text-primary overflow-hidden"
                            >
                              <span>Gift card</span>
                              <span className="font-medium">
                                -{formatCurrency(giftCardQuote.applied)}
                              </span>
                            </motion.div>
                          ) : null}
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
                          key={totalAfterGiftCard}
                          initial={{ scale: 1.1 }}
                          animate={{ scale: 1 }}
                          transition={{ duration: 0.2 }}
                          className="text-2xl font-bold text-primary"
                        >
                          {formatCurrency(totalAfterGiftCard)}
                        </motion.span>
                      </div>
                    </motion.div>

                    {/* Always Visible: Player Invitation */}
                    <motion.div
                      layout
                      className="space-y-3 p-4 border border-border rounded-lg bg-muted/30"
                    >
                      <Label className="text-muted-foreground flex items-center gap-2 font-medium">
                        <Users className="h-4 w-4" /> Invite Players
                      </Label>
                      <div className="flex items-center gap-3 flex-wrap">
                        {/* Player 1 - Current User */}
                        <div className="flex flex-col items-center gap-1 flex-shrink-0">
                          <div className="w-14 h-14 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center text-primary font-bold text-lg shadow-md overflow-hidden">
                            {user?.firstName?.[0] || "M"}
                          </div>
                          <span className="text-xs text-muted-foreground truncate max-w-[60px]">
                            You
                          </span>
                        </div>

                        {/* Show up to 3 invite slots/avatars */}
                        {[0, 1, 2].map((index) => {
                          const hasInvite = invitedEmails[index];
                          return (
                            <motion.div
                              key={index}
                              className="flex flex-col items-center gap-1 flex-shrink-0"
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ delay: index * 0.05 }}
                            >
                              <motion.button
                                onClick={() =>
                                  pushModal(
                                    <BookingInviteModal
                                      onSendInvites={handleAddInvitationEmails}
                                      maxInvites={10}
                                      existingEmails={invitedEmails}
                                    />,
                                  )
                                }
                                disabled={
                                  isWaitingPayment || isInitiatingPayment
                                }
                                className={`w-14 h-14 rounded-full border-2 border-dashed flex items-center justify-center transition-all overflow-hidden ${
                                  hasInvite
                                    ? "bg-success/10 border-success"
                                    : "border-border hover:border-primary hover:bg-primary/5"
                                } disabled:opacity-50 disabled:cursor-not-allowed`}
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.95 }}
                              >
                                <AnimatePresence mode="wait">
                                  {hasInvite ? (
                                    <motion.div
                                      key="check"
                                      initial={{ scale: 0, rotate: -180 }}
                                      animate={{ scale: 1, rotate: 0 }}
                                      exit={{ scale: 0, rotate: 180 }}
                                    >
                                      <Check className="h-6 w-6 text-success" />
                                    </motion.div>
                                  ) : (
                                    <motion.div
                                      key="plus"
                                      initial={{ scale: 0 }}
                                      animate={{ scale: 1 }}
                                      exit={{ scale: 0 }}
                                    >
                                      <UserPlus className="h-5 w-5 text-muted-foreground" />
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </motion.button>
                              <span className="text-xs text-muted-foreground">
                                {hasInvite ? "Invited" : `Player ${index + 2}`}
                              </span>
                            </motion.div>
                          );
                        })}

                        {/* Show +X indicator if there are more than 3 invites */}
                        {invitedEmails.length > 3 && (
                          <motion.div
                            className="flex flex-col items-center gap-1 flex-shrink-0"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                          >
                            <motion.button
                              onClick={() =>
                                pushModal(
                                  <BookingInviteModal
                                    onSendInvites={handleAddInvitationEmails}
                                    maxInvites={10}
                                    existingEmails={invitedEmails}
                                  />,
                                )
                              }
                              disabled={isWaitingPayment || isInitiatingPayment}
                              className="w-14 h-14 rounded-full border-2 bg-success/10 border-success flex items-center justify-center transition-all overflow-hidden font-bold text-success disabled:opacity-50 disabled:cursor-not-allowed"
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.95 }}
                            >
                              +{invitedEmails.length - 3}
                            </motion.button>
                            <span className="text-xs text-muted-foreground">
                              More
                            </span>
                          </motion.div>
                        )}
                      </div>
                      <AnimatePresence>
                        {invitedEmails.length > 0 && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="pt-2 border-t border-border overflow-hidden"
                          >
                            <p className="text-xs text-muted-foreground mb-2">
                              Invited players:
                            </p>
                            <div className="space-y-1">
                              {invitedEmails.map((email, idx) => (
                                <motion.div
                                  key={idx}
                                  initial={{ opacity: 0, x: -20 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  exit={{ opacity: 0, x: 20 }}
                                  className="flex items-center justify-between text-xs bg-muted/50 p-2 rounded"
                                >
                                  <span className="text-foreground truncate">
                                    {email}
                                  </span>
                                  <motion.button
                                    onClick={() => {
                                      setInvitedEmails(
                                        invitedEmails.filter(
                                          (_, i) => i !== idx,
                                        ),
                                      );
                                    }}
                                    className="ml-2 text-destructive hover:text-destructive/80"
                                    disabled={
                                      isWaitingPayment || isInitiatingPayment
                                    }
                                    whileHover={{ scale: 1.2 }}
                                    whileTap={{ scale: 0.9 }}
                                  >
                                    <X className="h-3 w-3" />
                                  </motion.button>
                                </motion.div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <p className="text-xs text-muted-foreground">
                        💡 Invite friends to join your game! They'll receive an
                        email with all the details.
                      </p>
                    </motion.div>

                    {/* Always Visible: Phone Selection */}
                    <motion.div
                      layout
                      className="space-y-3 p-4 border border-border rounded-lg bg-muted/30"
                    >
                      <Label className="font-medium flex items-center gap-2">
                        <Phone className="h-4 w-4" /> M-Pesa Phone
                      </Label>
                      <RadioGroup
                        value={formik.values.phoneOption}
                        onValueChange={(v) => {
                          const opt = v as "registered" | "custom";
                          formik.setFieldValue("phoneOption", opt);
                          if (opt === "registered") {
                            formik.setFieldValue(
                              "phoneNumber",
                              user?.phone || "",
                            );
                          } else if (opt === "custom") {
                            if (
                              formik.values.phoneNumber === (user?.phone || "")
                            )
                              formik.setFieldValue("phoneNumber", "");
                          }
                        }}
                        disabled={isWaitingPayment}
                      >
                        <label
                          className={`flex items-start gap-3 p-3 border border-border rounded-lg transition-all ${
                            !user?.phone
                              ? "opacity-60"
                              : "cursor-pointer hover:bg-muted/50"
                          }`}
                        >
                          <RadioGroupItem
                            value="registered"
                            id="phone-registered"
                            disabled={!user?.phone}
                          />
                          <div className="flex flex-col space-y-1">
                            <span className="font-medium">
                              Use registered number
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {user?.phone || "No number on profile"}
                            </span>
                          </div>
                        </label>
                        <label className="flex items-start gap-3 p-3 border border-border rounded-lg cursor-pointer hover:bg-muted/50 transition-all">
                          <RadioGroupItem value="custom" id="phone-custom" />
                          <div className="flex-1">
                            <span className="font-medium">
                              Different number
                            </span>
                            <AnimatePresence>
                              {formik.values.phoneOption === "custom" && (
                                <motion.input
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: "auto" }}
                                  exit={{ opacity: 0, height: 0 }}
                                  name="phoneNumber"
                                  value={formik.values.phoneNumber}
                                  onChange={formik.handleChange}
                                  onBlur={formik.handleBlur}
                                  placeholder="07XXXXXXXX"
                                  className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                                />
                              )}
                            </AnimatePresence>
                          </div>
                        </label>
                      </RadioGroup>
                      <AnimatePresence>
                        {isWaitingPayment && (
                          <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="p-3 bg-primary/10 border border-primary/30 rounded-lg"
                          >
                            <p className="text-sm text-foreground font-medium">
                              Check your phone for the M-Pesa prompt and enter
                              your PIN.
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <AnimatePresence>
                        {paymentError && (
                          <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg"
                          >
                            {paymentError}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>

                    {/* Always Visible: Discount Controls & Payment */}
                    <motion.div layout className="space-y-3">
                      {discountControls}
                      <Button
                        className="w-full h-12 text-base font-semibold"
                        size="lg"
                        onClick={handleInitiatePayment}
                        disabled={isInitiatingPayment || isWaitingPayment}
                      >
                        {isInitiatingPayment ? (
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        ) : isWaitingPayment ? (
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        ) : (
                          <CreditCard className="mr-2 h-5 w-5" />
                        )}
                        {isInitiatingPayment
                          ? "Sending STK..."
                          : isWaitingPayment
                            ? "Confirming..."
                            : "Pay with M-Pesa"}
                      </Button>
                    </motion.div>
                  </div>
                </>
              ) : (
                <div className="text-center py-12">
                  <Users className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    Select a court and duration to see details.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default BookCourt;

const ConfirmedAndThanksModal = ({
  onClose,
  booking,
}: {
  onClose?: () => void;
  booking?: BookingRecord | null;
}) => {
  const { popModal } = useModal();
  const navigate = useNavigate();
  const user = useSelector((state: any) => state.userState?.user);

  const handleClose = () => {
    onClose?.();
    popModal();
  };

  const buildShareMessage = (): string => {
    if (booking?.startTime && booking?.endTime) {
      try {
        const start = new Date(booking.startTime);
        const end = new Date(booking.endTime);
        const day = format(start, "EEE, dd MMM yyyy");
        const time = `${format(start, "p")} – ${format(end, "p")}`;
        const court = booking.court?.name || "the court";

        // Get user's first name, default to "there" if not available
        const userName = user?.firstName || "there";

        // Padel Mania location - Google Maps link
        const locationLink = "https://maps.app.goo.gl/ukUF3jp5HvS8bxTx7";

        return (
          `Hi ${userName}! 👋\n\n` +
          `Padel time! I just booked ${court} at Padel Mania.\n\n` +
          `Date: ${day}\n` +
          `Time: ${time}` +
          (booking.bookingCode
            ? `\nBooking code: ${booking.bookingCode}`
            : "") +
          `\n\nLocation: Padel Mania, Nairobi\n` +
          `${locationLink}\n\n` +
          `Come join me for an epic match!`
        );
      } catch {
        // fall through to generic
      }
    }
    return `Hi there! 👋\n\nPadel time! I just booked a court at Padel Mania.\n\n📍 Location: https://maps.app.goo.gl/ukUF3jp5HvS8bxTx7\n\nCome join me for an epic match! 🏓`;
  };

  const handleShare = async () => {
    const text = buildShareMessage();
    const waLink = `https://wa.me/?text=${encodeURIComponent(text)}`;
    try {
      const ns: any = navigator;
      if (ns?.share) {
        await ns.share({ text });
        return;
      }
    } catch {
      // ignore and fallback to wa link
    }
    window.open(waLink, "_blank", "noopener,noreferrer");
  };

  const handleContactSupport = () => {
    const whatsappSupportLink =
      "https://wa.me/254742754354?text=Hello%20Padel%20Mania%2C%20I%20need%20assistance";
    window.open(whatsappSupportLink, "_blank", "noopener,noreferrer");
  };

  return (
    <div
      className="bg-background border border-border shadow-2xl rounded-xl max-w-lg w-full mx-4 p-6 sm:p-8 transform transition-all duration-300 scale-100 opacity-100 relative max-h-[90vh] overflow-y-auto"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Success Icon */}
      <div className="flex justify-center mb-6">
        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center relative">
          <svg
            className="w-10 h-10 text-primary"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={3}
              d="M5 13l4 4L19 7"
            />
          </svg>
          <div className="absolute -inset-2 bg-primary/20 rounded-full opacity-30 animate-ping"></div>
        </div>
      </div>

      {/* Title */}
      <h2 className="text-3xl font-bold text-foreground text-center mb-3">
        Booking Confirmed! 🎉
      </h2>

      {/* Subtitle */}
      <p className="text-muted-foreground text-center mb-6 text-lg">
        Your court booking has been successfully confirmed and payment received.
      </p>

      {/* Success Details */}
      <div className="bg-primary/5 border border-border rounded-lg p-4 mb-6">
        <div className="flex items-center gap-2 text-primary mb-3">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
          <span className="font-semibold text-base">What's Next?</span>
        </div>
        <ul className="text-sm text-foreground space-y-2">
          <li className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-primary rounded-full"></span>
            You'll receive a confirmation email shortly
          </li>
          <li className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-primary rounded-full"></span>
            Arrive 10 minutes before your booking time
          </li>
          <li className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-primary rounded-full"></span>
            Bring your rackets and comfortable sports attire
          </li>
          <li className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-primary rounded-full"></span>
            Have fun playing padel!
          </li>
        </ul>
      </div>

      {/* Improved Action Buttons */}
      <div className="space-y-4">
        {/* Primary Actions */}
        <div className="grid grid-cols-1 gap-3">
          <Button
            className="h-12 w-full font-medium transition-all duration-200 transform hover:scale-105 touch-manipulation"
            onClick={handleClose}
          >
            <CreditCard className="mr-2 h-5 w-5" />
            Book Another Court
          </Button>
          <Button
            variant="outline"
            className="h-12 w-full border-2 hover:bg-transparent font-medium transition-all duration-200 transform hover:scale-105 touch-manipulation"
            onClick={() => {
              handleClose();
              navigate("/customer/bookings");
            }}
          >
            <Users className="mr-2 h-5 w-5" />
            My Bookings
          </Button>
        </div>

        {/* Social Actions */}
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground text-center font-medium">
            Share the excitement
          </p>
          <div className="grid grid-cols-1 gap-3">
            <Button
              className="h-12 w-full bg-[#25D366] hover:bg-[#1EBE5B] text-white font-medium transition-all duration-200 transform hover:scale-105 shadow-md hover:shadow-lg touch-manipulation"
              onClick={handleShare}
            >
              <Share2 className="mr-2 h-5 w-5" />
              Share Booking
            </Button>
            <Button
              className="h-12 w-full bg-[#075E54] hover:bg-[#064E47] text-white font-medium transition-all duration-200 transform hover:scale-105 shadow-md hover:shadow-lg touch-manipulation"
              onClick={handleContactSupport}
            >
              <svg
                className="mr-2 h-5 w-5"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.890-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488" />
              </svg>
              Contact Support
            </Button>
          </div>
        </div>
      </div>

      {/* Close button */}
      <button
        onClick={handleClose}
        className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors p-2 rounded-full hover:bg-muted group touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
        aria-label="Close modal"
      >
        <svg
          className="w-6 h-6 transition-transform group-hover:rotate-90"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  );
};

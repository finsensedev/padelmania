/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  useState,
  useCallback,
  useContext,
  useRef,
  useMemo,
  useEffect,
} from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { useSelector } from "react-redux";
import { useQueryClient, useQuery } from "react-query";
import {
  Loader2,
  Package,
  Clock,
  X,
  Minus,
  Plus,
  Gift,
  Check,
  Info,
} from "lucide-react";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { Alert, AlertDescription } from "src/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "src/components/ui/radio-group";
import useNotification from "src/hooks/useNotification";
import useModal from "src/hooks/useModal";
import api from "src/utils/api";
import { SocketContext } from "src/contexts/SocketProvider";
import bookingService from "src/services/booking.service";
import giftcardService, {
  type GiftCardQuote,
} from "src/services/giftcard.service";

interface Booking {
  id: string;
  bookingCode: string;
  startTime: string;
  endTime: string;
  duration: number;
  court: {
    id: string;
    name: string;
  };
  pricing?: {
    equipment?: Array<{
      type: string;
      name: string;
      quantity: number;
      pricePerUnit: number;
      subtotal: number;
    }>;
  };
}

interface EquipmentPricing {
  racketUnitPrice: number;
  ballsUnitPrice: number;
  ballOptions?: Array<{
    id: string;
    name: string;
    brand: string;
    unitBase: number;
    unitFinal: number;
    isActive: boolean;
  }>;
}

interface PaymentStatus {
  status: "PENDING" | "SUCCESS" | "FAILED";
}

interface AddEquipmentModalProps {
  booking: Booking;
  relatedBookings?: Booking[];
  onSuccess?: () => void;
}

const AddEquipmentModal = ({
  booking,
  relatedBookings = [],
  onSuccess,
}: AddEquipmentModalProps) => {
  const { toaster } = useNotification();
  const { popModal } = useModal();
  const queryClient = useQueryClient();
  const user = useSelector((state: any) => state.userState?.user);
  const { socket, isConnected } = useContext(SocketContext);
  const prevUserPhoneRef = useRef<string | null | undefined>(user?.phone);

  const [isInitiatingPayment, setIsInitiatingPayment] = useState(false);
  const [isPollingPayment, setIsPollingPayment] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | null>(
    null
  );
  const [createdPaymentId, setCreatedPaymentId] = useState<string | null>(null);
  const paymentHandledRef = useRef(false);
  const [giftCardQuote, setGiftCardQuote] = useState<GiftCardQuote | null>(
    null
  );
  const [giftCardError, setGiftCardError] = useState<string | null>(null);
  const [isQuotingGiftCard, setIsQuotingGiftCard] = useState(false);
  const [selectedBallTypeId, setSelectedBallTypeId] = useState<string | null>(
    null
  );

  // Calculate booking duration in hours
  const durationHours = useMemo(
    () => booking.duration / 60,
    [booking.duration]
  );

  const durationDisplay = useMemo(() => {
    if (Number.isInteger(durationHours)) return `${durationHours}`;
    return durationHours.toFixed(1);
  }, [durationHours]);

  // Get current equipment from booking and related bookings (for multi-court)
  const currentEquipment = useMemo(() => {
    const allBookings = [booking, ...relatedBookings];
    const allEquipment = allBookings.flatMap((b) => b.pricing?.equipment || []);

    const rackets = allEquipment
      .filter((e) => e.type === "RACKET")
      .reduce((sum, e) => sum + e.quantity, 0);
    const balls = allEquipment
      .filter((e) => e.type === "BALLS")
      .reduce((sum, e) => sum + e.quantity, 0);
    return { rackets, balls };
  }, [booking, relatedBookings]);

  const currentRackets = currentEquipment.rackets;
  const currentBalls = currentEquipment.balls;

  const additionalRacketCapacity = useMemo(
    () => Math.max(0, 8 - currentRackets),
    [currentRackets]
  );
  const additionalBallsCapacity = useMemo(
    () => Math.max(0, 5 - currentBalls),
    [currentBalls]
  );

  const equipmentIntroMessage = useMemo(() => {
    const isMultiCourt = relatedBookings.length > 0;
    const courtCount = isMultiCourt ? relatedBookings.length + 1 : 1;
    const multiCourtSuffix = isMultiCourt
      ? ` Equipment is shared across all ${courtCount} courts.`
      : "";

    if (currentRackets > 0 || currentBalls > 0) {
      // Check if at max capacity
      if (additionalRacketCapacity === 0 && additionalBallsCapacity === 0) {
        return `You've reached maximum capacity. All equipment controls are disabled.${multiCourtSuffix}`;
      }

      // Has some equipment, but can still add more
      const canAddRackets = additionalRacketCapacity > 0;
      const canAddBalls = additionalBallsCapacity > 0;

      if (canAddRackets && canAddBalls) {
        return `Use the + buttons below to add more equipment. Note: You can only add items, not remove them through self-service.${multiCourtSuffix}`;
      } else if (canAddRackets) {
        return `You can still add more rackets. Use the + button below. Ball packs are at maximum capacity.${multiCourtSuffix}`;
      } else if (canAddBalls) {
        return `You can still add more ball packs. Use the + button below. Rackets are at maximum capacity.${multiCourtSuffix}`;
      }
    }
    return `This booking currently has no rental equipment. Use the + buttons below to add rackets or ball packs.${multiCourtSuffix}`;
  }, [
    currentRackets,
    currentBalls,
    additionalRacketCapacity,
    additionalBallsCapacity,
    relatedBookings.length,
  ]);

  const {
    data: pricingData,
    isLoading: isLoadingPricing,
    isError: isPricingError,
  } = useQuery<EquipmentPricing>(
    ["equipment-pricing", booking.court.id, booking.startTime],
    async () => {
      const { data } = await api.get(
        `/courts/${booking.court.id}/equipment-unit-price`,
        {
          params: {
            date: new Date(booking.startTime).toISOString().split("T")[0],
            time: new Date(booking.startTime)
              .toISOString()
              .split("T")[1]
              .substring(0, 5),
          },
        }
      );

      // Handle ball options if available
      const options = data.ballOptions || [];

      let ballsPrice = data.ballsUnitPrice || 1000;

      // Use first ball type price if available
      if (options.length > 0) {
        const firstOption = options[0];
        ballsPrice = firstOption.unitFinal || firstOption.unitBase || 1000;
      }

      return {
        racketUnitPrice: data.racketUnitPrice || 200,
        ballsUnitPrice: ballsPrice,
        ballOptions: options,
      };
    },
    {
      onError: () => {
        toaster("Failed to load equipment pricing. Using default rates.", {
          variant: "warning",
        });
      },
      staleTime: 60_000,
    }
  );

  const racketUnitPrice = pricingData?.racketUnitPrice || 200;
  const [ballsUnitPrice, setBallsUnitPrice] = useState(
    pricingData?.ballsUnitPrice || 1000
  );

  // Derive ball options from pricing data
  const ballOptions = useMemo(
    () => pricingData?.ballOptions || [],
    [pricingData?.ballOptions]
  );
  const selectedBallOption = useMemo(
    () =>
      ballOptions.find((option: any) => option.id === selectedBallTypeId) ||
      null,
    [ballOptions, selectedBallTypeId]
  );

  // Auto-select first available (in-stock) ball type when options are loaded
  useEffect(() => {
    if (ballOptions.length > 0 && !selectedBallTypeId) {
      const firstAvailable = ballOptions.find(
        (opt: any) => opt.availableQty === undefined || opt.availableQty > 0
      ) || ballOptions[0];
      setSelectedBallTypeId(firstAvailable.id);
      setBallsUnitPrice(firstAvailable.unitFinal || firstAvailable.unitBase || 1000);
    }
  }, [ballOptions, selectedBallTypeId]);

  // Update balls unit price when pricing data changes
  useEffect(() => {
    if (pricingData?.ballsUnitPrice) {
      setBallsUnitPrice(pricingData.ballsUnitPrice);
    }
  }, [pricingData?.ballsUnitPrice]);

  // Validation schema
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
                "Enter a valid Kenyan phone number (07XX, 01XX, or 2547XX, 2541XX)"
              ),
          otherwise: (schema) => schema.notRequired(),
        }),
        phoneOption: Yup.string()
          .oneOf(["registered", "custom"])
          .required("Phone option is required"),
        racketQty: Yup.number()
          .min(0, "Cannot be negative")
          .max(
            additionalRacketCapacity,
            additionalRacketCapacity > 0
              ? `Maximum ${additionalRacketCapacity} more rackets allowed`
              : "You already have the maximum number of rackets"
          )
          .integer("Must be a whole number")
          .required("Required"),
        ballsQty: Yup.number()
          .min(0, "Cannot be negative")
          .max(
            additionalBallsCapacity,
            additionalBallsCapacity > 0
              ? `Maximum ${additionalBallsCapacity} more ball packs allowed`
              : "You already have the maximum number of ball packs"
          )
          .integer("Must be a whole number")
          .required("Required"),
        useGiftCard: Yup.boolean(),
      }),
    [additionalRacketCapacity, additionalBallsCapacity]
  );

  // Formik form
  const formik = useFormik({
    initialValues: {
      phoneNumber: "",
      phoneOption: (user?.phone ? "registered" : "custom") as
        | "registered"
        | "custom",
      racketQty: 0,
      ballsQty: 0,
      useGiftCard: false,
    },
    validationSchema,
    validateOnChange: true,
    validateOnBlur: true,
    onSubmit: async () => {
      await handleInitiatePayment();
    },
  });

  // Calculate amounts
  const racketsAmount = useMemo(
    () => formik.values.racketQty * racketUnitPrice * durationHours,
    [formik.values.racketQty, racketUnitPrice, durationHours]
  );

  const ballsAmount = useMemo(
    () => formik.values.ballsQty * ballsUnitPrice,
    [formik.values.ballsQty, ballsUnitPrice]
  );

  const totalAmount = useMemo(
    () => racketsAmount + ballsAmount,
    [racketsAmount, ballsAmount]
  );

  const totalAfterGiftCard = useMemo(() => {
    const applied = giftCardQuote?.applied || 0;
    return Math.max(0, totalAmount - applied);
  }, [totalAmount, giftCardQuote]);

  const canAddEquipment = useMemo(
    () => formik.values.racketQty > 0 || formik.values.ballsQty > 0,
    [formik.values.racketQty, formik.values.ballsQty]
  );

  const selectedPhone = useMemo(
    () =>
      formik.values.phoneOption === "registered"
        ? user?.phone || ""
        : formik.values.phoneNumber,
    [formik.values.phoneOption, formik.values.phoneNumber, user?.phone]
  );

  // Phone number logic
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
      formik.setFieldValue("phoneNumber", "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formik.values.phoneOption, user?.phone]);

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
        if (quote.balance === 0) {
          setGiftCardError("No gift card balance available.");
        }
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
    [formik.values.useGiftCard, user?.id]
  );

  useEffect(() => {
    const amount = Math.max(0, Math.round(totalAmount));
    void fetchGiftCardQuote(amount);
  }, [totalAmount, fetchGiftCardQuote]);

  const amountDue = totalAfterGiftCard;

  const handlePhoneOptionChange = (value: string) => {
    formik.setFieldValue("phoneOption", value);
  };

  // Format currency
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: "KES",
      maximumFractionDigits: 0,
    }).format(amount);

  // Handle payment initiation
  const handleInitiatePayment = async () => {
    setPaymentStatus(null);
    setCreatedPaymentId(null);
    setIsPollingPayment(false);

    if (!canAddEquipment || totalAmount <= 0) {
      toaster("Please select at least one equipment item", {
        variant: "error",
      });
      return;
    }

    if (
      formik.values.racketQty > additionalRacketCapacity ||
      formik.values.ballsQty > additionalBallsCapacity
    ) {
      toaster("Selected quantities exceed the remaining top-up capacity.", {
        variant: "error",
      });
      return;
    }

    if (
      !selectedPhone ||
      !/^(?:0?(?:7|1)\d{8}|(?:\+?254)(?:7|1)\d{8})$/.test(selectedPhone.trim())
    ) {
      toaster("Please provide a valid phone number", { variant: "error" });
      return;
    }

    setIsInitiatingPayment(true);
    paymentHandledRef.current = false;

    try {
      console.log("🔧 Requesting equipment quote:", {
        bookingId: booking.id,
        phoneNumber: selectedPhone,
        racketQty: formik.values.racketQty,
        ballsQty: formik.values.ballsQty,
        racketUnitPrice,
        ballsUnitPrice,
      });

      // Get equipment quote from backend
      const quoteResponse = await bookingService.addEquipment(booking.id, {
        phoneNumber: selectedPhone,
        racketQty: formik.values.racketQty,
        ballsQty: formik.values.ballsQty,
        racketUnitPrice,
        ballsUnitPrice,
        ...(selectedBallTypeId && { ballTypeId: selectedBallTypeId }),
        ...(selectedBallOption?.name && {
          ballTypeName: selectedBallOption.name,
        }),
      });

      console.log("📦 Equipment quote response:", quoteResponse);

      if (!quoteResponse.success) {
        throw new Error(
          quoteResponse.message || "Failed to get equipment quote"
        );
      }

      // Initiate STK push
      const payload = {
        phoneNumber: selectedPhone,
        amount: quoteResponse.data.totalAmount,
        bookingId: quoteResponse.data.bookingId,
        accountReference: quoteResponse.data.bookingCode,
        description: `Equipment for ${quoteResponse.data.bookingCode}`,
        context: "ADD_EQUIPMENT",
        paymentMetadata: {
          equipment: quoteResponse.data.equipment,
        },
        useGiftCard: !!formik.values.useGiftCard,
      };

      console.log("💳 Initiating STK push with payload:", payload);

      const { data } = await api.post("/payments/stk-push", payload);

      console.log("✅ STK push response:", data);

      const resp = (data?.data || data) as {
        paymentId?: string;
        CustomerMessage?: string;
        giftCardOnly?: boolean;
        bookingId?: string;
      };

      if (resp?.giftCardOnly) {
        setCreatedPaymentId(null);
        setIsPollingPayment(false);
        await finalizePayment(resp.CustomerMessage);
        return;
      }

      if (!resp.paymentId) {
        throw new Error(resp.CustomerMessage || "Failed to initiate payment");
      }

      setCreatedPaymentId(resp.paymentId);
      setIsPollingPayment(true);
      toaster(
        resp.CustomerMessage ||
          "Payment request sent. Please check your phone to complete the transaction.",
        { variant: "info" }
      );
    } catch (error: any) {
      console.error("❌ Payment initiation error:", error);
      console.error("Error response:", error?.response?.data);
      const message =
        error?.response?.data?.message ||
        error?.message ||
        "Failed to initiate payment";
      toaster(message, {
        variant: "error",
      });
    } finally {
      setIsInitiatingPayment(false);
    }
  };

  // Finalize payment success
  const finalizePayment = useCallback(
    async (message?: string) => {
      if (paymentHandledRef.current) return;
      paymentHandledRef.current = true;

      setIsPollingPayment(false);
      setPaymentStatus({ status: "SUCCESS" });

      toaster(message || "Equipment added successfully!", {
        variant: "success",
      });

      // Refresh booking data
      await queryClient.invalidateQueries(["my-bookings"]);

      // Call onSuccess callback
      if (onSuccess) {
        onSuccess();
      }

      // Close modal after a short delay

      popModal();
    },
    [toaster, queryClient, onSuccess, popModal]
  );

  // Payment polling
  useEffect(() => {
    if (!createdPaymentId || !isPollingPayment) return;

    let cancelled = false;
    const pollInterval = 3000;
    const maxPolls = 60;
    let pollCount = 0;

    const poll = async () => {
      if (cancelled || paymentHandledRef.current) return;

      try {
        const { data } = await api.get(`/payments/${createdPaymentId}/status`);
        const payment = data?.data || data;

        if (payment.status === "COMPLETED") {
          if (!cancelled && !paymentHandledRef.current) {
            await finalizePayment();
          }
          return;
        }

        if (payment.status === "FAILED" || payment.status === "CANCELLED") {
          if (!cancelled && !paymentHandledRef.current) {
            paymentHandledRef.current = true;
            setIsPollingPayment(false);
            setPaymentStatus({ status: "FAILED" });
            toaster(
              payment.failureReason || "Payment failed. Please try again.",
              { variant: "error" }
            );
          }
          return;
        }

        pollCount++;
        if (pollCount < maxPolls && !cancelled) {
          setTimeout(poll, pollInterval);
        } else if (!cancelled && !paymentHandledRef.current) {
          paymentHandledRef.current = true;
          setIsPollingPayment(false);
          toaster(
            "Payment verification timed out. Please check your booking status.",
            {
              variant: "warning",
            }
          );
        }
      } catch (error) {
        console.error("Payment polling error:", error);
        if (!cancelled && pollCount < maxPolls) {
          setTimeout(poll, pollInterval);
        }
      }
    };

    poll();

    return () => {
      cancelled = true;
    };
  }, [createdPaymentId, isPollingPayment, finalizePayment, toaster]);

  // Socket listener for payment updates
  useEffect(() => {
    if (!socket || !isConnected || !createdPaymentId) return;

    const handlePaymentUpdate = (data: any) => {
      if (data.paymentId === createdPaymentId && data.status === "COMPLETED") {
        finalizePayment();
      }
    };

    socket.on("payment:update", handlePaymentUpdate);

    return () => {
      socket.off("payment:update", handlePaymentUpdate);
    };
  }, [socket, isConnected, createdPaymentId, finalizePayment]);

  return (
    <Card
      className="w-full h-[100dvh] md:h-auto md:w-4/5 mt-0 pt-0 lg:w-3/5 xl:w-1/2 md:max-h-[90vh] overflow-auto shadow-2xl rounded-none md:rounded-2xl border border-border"
      onClick={(e) => e.stopPropagation()}
    >
      <CardHeader className="border-b p-4 sm:pt-6 sm:px-6 sm:pb-4 border-border bg-muted/30">
        <div className="flex justify-center items-center">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base sm:text-lg font-semibold text-foreground truncate">
              Add Equipment
            </CardTitle>
            <div className="text-xs sm:text-sm text-muted-foreground mt-1 break-words">
              Add rackets or ball packs to booking {booking.bookingCode}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => popModal()}
            disabled={isInitiatingPayment || isPollingPayment}
          >
            <X className="w-4 h-4 sm:mr-1" />
            <span className="hidden sm:inline">Close</span>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="py-0">
        {isLoadingPricing ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <form
            onSubmit={formik.handleSubmit}
            className="space-y-4 sm:space-y-6"
          >
            {/* Current Equipment Info */}
            {(currentRackets > 0 || currentBalls > 0) && (
              <Alert>
                <Package className="h-4 w-4" />
                <AlertDescription>
                  <div className="text-sm">
                    <strong>
                      Current equipment
                      {relatedBookings.length > 0
                        ? " (shared across all courts)"
                        : ""}
                      :
                    </strong>
                    {currentRackets > 0 && ` ${currentRackets} racket(s)`}
                    {currentRackets > 0 && currentBalls > 0 && ", "}
                    {currentBalls > 0 && ` ${currentBalls} ball pack(s)`}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Show error if pricing failed to load */}
            {isPricingError && (
              <Alert variant="destructive">
                <AlertDescription>
                  Using default pricing rates due to loading error
                </AlertDescription>
              </Alert>
            )}

            {/* Show info when at maximum capacity */}
            {additionalRacketCapacity === 0 &&
              additionalBallsCapacity === 0 && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    <div className="text-sm">
                      You've reached the maximum equipment capacity for this
                      booking (8 rackets, 5 ball packs).
                    </div>
                  </AlertDescription>
                </Alert>
              )}

            {/* Booking Info */}
            <Card>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>
                      Duration: {durationDisplay} hour
                      {durationHours === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="text-muted-foreground">
                    Equipment will be charged for the full duration
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Equipment Selection */}
            <div className="space-y-4">
              <p className="text-xs sm:text-sm text-muted-foreground">
                {equipmentIntroMessage}
              </p>
              <div className="space-y-2">
                <Label className="text-muted-foreground flex items-center justify-between">
                  <span className="font-medium">Additional rackets</span>
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
                      formik.values.racketQty === 0 ||
                      isInitiatingPayment ||
                      isPollingPayment
                    }
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <div className="flex-1 text-center">
                    <div className="text-2xl font-semibold">
                      {formik.values.racketQty}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formik.values.racketQty === 0
                        ? "No rackets"
                        : `${formik.values.racketQty} racket${
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
                        Math.min(
                          additionalRacketCapacity,
                          formik.values.racketQty + 1
                        )
                      )
                    }
                    disabled={
                      additionalRacketCapacity <= 0 ||
                      formik.values.racketQty >= additionalRacketCapacity ||
                      isInitiatingPayment ||
                      isPollingPayment
                    }
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {additionalRacketCapacity <= 0 ? (
                  <p className="text-xs text-muted-foreground">
                    You already have the maximum number of rackets (8). Contact
                    support if you need further adjustments.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {currentRackets > 0
                      ? `You can add up to ${additionalRacketCapacity} more for this booking.`
                      : `You can add up to ${additionalRacketCapacity} racket${
                          additionalRacketCapacity > 1 ? "s" : ""
                        } for this booking.`}
                  </p>
                )}
                {formik.values.racketQty > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Subtotal: {formatCurrency(racketsAmount)}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground flex items-center justify-between">
                  <span className="font-medium">Ball packs</span>
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
                        const isSelected = selectedBallTypeId === option.id;
                        const isOutOfStock =
                          option.availableQty !== undefined &&
                          option.availableQty <= 0;
                        return (
                          <Button
                            key={option.id}
                            type="button"
                            variant={isSelected ? "default" : "ghost"}
                            className={`h-auto py-2.5 sm:py-3 px-3 sm:px-4 flex flex-col items-start gap-0.5 sm:gap-1 border-0 text-left w-full ${
                              isOutOfStock
                                ? "opacity-50 cursor-not-allowed"
                                : isSelected
                                ? ""
                                : "bg-muted hover:bg-muted/80"
                            }`}
                            onClick={() => {
                              if (isOutOfStock) return;
                              setSelectedBallTypeId(option.id);
                              setBallsUnitPrice(
                                option.unitFinal || option.unitBase || 1000
                              );
                            }}
                            disabled={
                              isInitiatingPayment ||
                              isPollingPayment ||
                              isOutOfStock
                            }
                          >
                            <span className="text-xs sm:text-sm font-medium flex items-center gap-1.5">
                              {option.name}
                              {isOutOfStock && (
                                <span className="text-[10px] font-semibold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">
                                  Out of Stock
                                </span>
                              )}
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
                      formik.values.ballsQty === 0 ||
                      isInitiatingPayment ||
                      isPollingPayment
                    }
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <div className="flex-1 text-center">
                    <div className="text-2xl font-semibold">
                      {formik.values.ballsQty}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formik.values.ballsQty === 0
                        ? "No ball packs"
                        : `${formik.values.ballsQty} pack${
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
                        Math.min(
                          additionalBallsCapacity,
                          formik.values.ballsQty + 1
                        )
                      )
                    }
                    disabled={
                      additionalBallsCapacity <= 0 ||
                      formik.values.ballsQty >= additionalBallsCapacity ||
                      isInitiatingPayment ||
                      isPollingPayment
                    }
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {additionalBallsCapacity <= 0 ? (
                  <p className="text-xs text-muted-foreground">
                    You already have the maximum number of ball packs (5).
                    Contact support if you need further adjustments.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {currentBalls > 0
                      ? `You can add up to ${additionalBallsCapacity} more for this booking.`
                      : `You can add up to ${additionalBallsCapacity} ball pack${
                          additionalBallsCapacity > 1 ? "s" : ""
                        } for this booking.`}
                  </p>
                )}
                {formik.values.ballsQty > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Subtotal: {formatCurrency(ballsAmount)}
                  </p>
                )}
              </div>
            </div>

            {/* Discounts & Credits */}
            <Card>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="inline-flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      name="useGiftCard"
                      checked={formik.values.useGiftCard}
                      onChange={(event) => {
                        formik.handleChange(event);
                        setGiftCardError(null);
                      }}
                      onBlur={formik.handleBlur}
                      disabled={
                        !user?.id || isInitiatingPayment || isPollingPayment
                      }
                    />
                    <span className="flex items-center gap-1">
                      <Gift className="h-4 w-4 text-primary" />
                      Use gift card balance
                    </span>
                  </label>
                  {!user?.id && (
                    <p className="text-xs text-muted-foreground ml-6">
                      Sign in to apply a gift card to this top-up.
                    </p>
                  )}
                  {isQuotingGiftCard && formik.values.useGiftCard && (
                    <p className="text-sm text-muted-foreground flex items-center gap-2 ml-6">
                      <Loader2 className="h-4 w-4 animate-spin" /> Checking
                      balance...
                    </p>
                  )}
                  {giftCardQuote?.applied ? (
                    <div className="text-sm text-emerald-600 flex flex-wrap items-center gap-2 ml-6">
                      <Check className="h-4 w-4" /> Applied{" "}
                      {formatCurrency(giftCardQuote.applied)}
                      {giftCardQuote.code && (
                        <span className="text-xs font-mono bg-emerald-50 dark:bg-emerald-950/20 px-2 py-0.5 rounded">
                          {giftCardQuote.code}
                        </span>
                      )}
                      {giftCardQuote.balance !== undefined && (
                        <span className="text-xs text-muted-foreground">
                          Remaining balance:{" "}
                          {formatCurrency(
                            Math.max(
                              0,
                              giftCardQuote.balance - giftCardQuote.applied
                            )
                          )}
                        </span>
                      )}
                    </div>
                  ) : null}
                  {giftCardError && (
                    <p className="text-sm text-amber-600 flex items-center gap-2 ml-6">
                      <Info className="h-4 w-4" />
                      {giftCardError}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Phone Number Selection */}
            <div className="space-y-4">
              <Label>M-Pesa Phone Number</Label>
              <RadioGroup
                value={formik.values.phoneOption}
                onValueChange={handlePhoneOptionChange}
              >
                {user?.phone && (
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="registered" id="registered" />
                    <Label
                      htmlFor="registered"
                      className="font-normal cursor-pointer"
                    >
                      Use registered number ({user.phone})
                    </Label>
                  </div>
                )}
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="custom" id="custom" />
                  <Label
                    htmlFor="custom"
                    className="font-normal cursor-pointer"
                  >
                    Use different number
                  </Label>
                </div>
              </RadioGroup>

              {formik.values.phoneOption === "custom" && (
                <div>
                  <Input
                    type="tel"
                    placeholder="e.g., 0712345678 or 254712345678"
                    {...formik.getFieldProps("phoneNumber")}
                    className={
                      formik.touched.phoneNumber && formik.errors.phoneNumber
                        ? "border-red-500"
                        : ""
                    }
                  />
                  {formik.touched.phoneNumber && formik.errors.phoneNumber && (
                    <p className="text-sm text-red-500 mt-1">
                      {formik.errors.phoneNumber}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Total Summary */}
            {canAddEquipment && (
              <Card className="bg-muted/50">
                <CardContent className="space-y-3">
                  <div className="space-y-2 text-sm">
                    {formik.values.racketQty > 0 && (
                      <div className="flex justify-between">
                        <span>
                          {formik.values.racketQty} racket
                          {formik.values.racketQty > 1 ? "s" : ""} ×{" "}
                          {durationDisplay}h
                        </span>
                        <span>{formatCurrency(racketsAmount)}</span>
                      </div>
                    )}
                    {formik.values.ballsQty > 0 && (
                      <div className="flex justify-between">
                        <span>
                          {formik.values.ballsQty} ball pack
                          {formik.values.ballsQty > 1 ? "s" : ""}
                        </span>
                        <span>{formatCurrency(ballsAmount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-medium text-foreground pt-2 border-t border-border">
                      <span>Subtotal</span>
                      <span>{formatCurrency(totalAmount)}</span>
                    </div>
                  </div>
                  <div className="space-y-2 border-t border-border pt-3 text-sm">
                    {giftCardQuote?.applied ? (
                      <div className="flex justify-between text-emerald-600">
                        <span>Gift card</span>
                        <span>{formatCurrency(-giftCardQuote.applied)}</span>
                      </div>
                    ) : null}
                    <div className="flex justify-between items-center font-semibold text-lg">
                      <span>Amount Due</span>
                      <span>{formatCurrency(amountDue)}</span>
                    </div>
                    {amountDue === 0 && (
                      <p className="text-xs text-muted-foreground">
                        Your gift card will cover this top-up. No M-Pesa prompt
                        will be sent.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Payment Status */}
            {isPollingPayment && (
              <Alert>
                <Loader2 className="h-4 w-4 animate-spin" />
                <AlertDescription>
                  Waiting for payment confirmation... Please complete the M-Pesa
                  prompt on your phone.
                  {paymentStatus && (
                    <span className="block mt-1 text-xs">
                      Status: {paymentStatus.status}
                    </span>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => popModal()}
                disabled={isInitiatingPayment || isPollingPayment}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  !canAddEquipment ||
                  !formik.isValid ||
                  isInitiatingPayment ||
                  isPollingPayment ||
                  isLoadingPricing
                }
                className="flex-1"
              >
                {isInitiatingPayment ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Initiating...
                  </>
                ) : isPollingPayment ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Waiting...
                  </>
                ) : amountDue === 0 ? (
                  "Complete top-up"
                ) : (
                  `Pay ${formatCurrency(amountDue)}`
                )}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
};

export default AddEquipmentModal;

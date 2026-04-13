/* eslint-disable @typescript-eslint/no-unused-vars */
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { useFormik } from "formik";
import * as Yup from "yup";
import {
  Gift,
  CreditCard,
  Wallet,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  CheckCircle,
  XCircle,
  Clock,
  Tag,
  Copy,
  Check,
  AlertTriangle,
  Calendar,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Badge } from "src/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "src/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { SocketContext } from "src/contexts/SocketProvider";
import giftcardService from "src/services/giftcard.service";
import type {
  GiftCard,
  GiftCardPurchaseInit,
  GiftCardQuote,
} from "src/services/giftcard.service";
import type { GiftCardStatus } from "src/services/adminGiftcard.service";
import useNotification from "src/hooks/useNotification";

// Status configuration matching AdminGiftCardManagement

const STATUS_LABELS: Record<GiftCardStatus, string> = {
  ISSUED: "Issued",
  REDEEMED: "Redeemed",
  EXHAUSTED: "Exhausted",
  CANCELLED: "Cancelled",
};

const STATUS_BADGE_VARIANT: Record<
  GiftCardStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  ISSUED: "secondary",
  REDEEMED: "default",
  EXHAUSTED: "outline",
  CANCELLED: "destructive",
};

const STATUS_ICONS: Record<GiftCardStatus, typeof CheckCircle> = {
  ISSUED: Sparkles,
  REDEEMED: CheckCircle,
  EXHAUSTED: XCircle,
  CANCELLED: XCircle,
};

const normalizeNumeric = (value: number | null | undefined): number => {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
};

// Helper functions for expiration
const isExpired = (expiresAt: string | null | undefined): boolean => {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
};

const isExpiringSoon = (
  expiresAt: string | null | undefined,
  daysThreshold: number = 30
): boolean => {
  if (!expiresAt) return false;
  const expiry = new Date(expiresAt);
  const now = new Date();
  const diffMs = expiry.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return diffDays > 0 && diffDays <= daysThreshold;
};

const getDaysUntilExpiry = (
  expiresAt: string | null | undefined
): number | null => {
  if (!expiresAt) return null;
  const expiry = new Date(expiresAt);
  const now = new Date();
  const diffMs = expiry.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
};

const formatExpiryDate = (expiresAt: string | null | undefined): string => {
  if (!expiresAt) return "No expiry";
  return new Date(expiresAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

// Constants
const MIN_GIFTCARD_AMOUNT = 2000;

// Validation schemas
const purchaseValidationSchema = Yup.object({
  amount: Yup.number()
    .min(MIN_GIFTCARD_AMOUNT, `Minimum amount is KES ${MIN_GIFTCARD_AMOUNT}`)
    .required("Amount is required")
    .typeError("Amount must be a number"),
  phoneNumber: Yup.string()
    .required("Phone number is required")
    .matches(
      /^(?:0?(?:7|1)\d{8}|(?:\+?254)(?:7|1)\d{8})$/,
      "Enter a valid Kenyan M-Pesa phone number"
    ),
  recipientEmail: Yup.string().email("Invalid email address").optional(),
  message: Yup.string().max(500, "Message is too long").optional(),
});

const redeemValidationSchema = Yup.object({
  code: Yup.string()
    .required("Gift card code is required")
    .matches(/^GC-/, "Invalid gift card code format"),
});

const quoteValidationSchema = Yup.object({
  amount: Yup.number()
    .min(1, "Amount must be greater than 0")
    .required("Amount is required")
    .typeError("Amount must be a number"),
});

type PurchasePayload = {
  amount: number;
  phoneNumber: string;
  recipientEmail?: string;
  message?: string;
};

export default function GiftCardsPage() {
  const { toaster } = useNotification();
  const queryClient = useQueryClient();
  const { socket, isConnected } = useContext(SocketContext);
  const [pendingPaymentId, setPendingPaymentId] = useState<string | null>(null);
  const [isWaitingPayment, setIsWaitingPayment] = useState<boolean>(false);
  const [pendingPaymentAmount, setPendingPaymentAmount] = useState<
    number | null
  >(null);
  const handledPaymentStatusesRef = useRef<Record<string, string>>({});
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [quoteResult, setQuoteResult] = useState<GiftCardQuote | null>(null);

  const formatter = useMemo(
    () =>
      new Intl.NumberFormat("en-KE", {
        style: "currency",
        currency: "KES",
        minimumFractionDigits: 0,
      }),
    []
  );

  // Purchase form
  const purchaseForm = useFormik({
    initialValues: {
      amount: MIN_GIFTCARD_AMOUNT,
      phoneNumber: "",
      recipientEmail: "",
      message: "",
    },
    validationSchema: purchaseValidationSchema,
    onSubmit: async (values) => {
      if (isWaitingPayment) {
        toaster("We're still waiting for the previous payment confirmation.", {
          variant: "info",
        });
        return;
      }
      await purchaseMutation.mutateAsync({
        amount: values.amount,
        phoneNumber: values.phoneNumber.trim(),
        recipientEmail: values.recipientEmail || undefined,
        message: values.message || undefined,
      });
    },
  });

  // Redeem form
  const redeemForm = useFormik({
    initialValues: {
      code: "",
    },
    validationSchema: redeemValidationSchema,
    onSubmit: async (values, { resetForm }) => {
      await redeemMutation.mutateAsync(values.code.trim());
      resetForm();
    },
  });

  // Quote form
  const quoteForm = useFormik({
    initialValues: {
      amount: 0,
    },
    validationSchema: quoteValidationSchema,
    onSubmit: async (values) => {
      setQuoteResult(null);
      await quoteMutation.mutateAsync(values.amount);
    },
  });

  const copyToClipboard = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      toaster(`Code ${code} copied to clipboard`, { variant: "success" });
      setTimeout(() => setCopiedCode(null), 2000);
    } catch (err) {
      toaster("Failed to copy code", { variant: "error" });
    }
  };

  const getErrorMessage = (error: unknown, fallback: string) => {
    if (typeof error === "string") return error;
    if (error && typeof error === "object") {
      const maybeResponse = (
        error as {
          response?: { data?: { message?: string } };
          message?: string;
        }
      ).response;
      if (maybeResponse?.data?.message) return maybeResponse.data.message;
      const maybeMessage = (error as { message?: string }).message;
      if (maybeMessage) return maybeMessage;
    }
    return fallback;
  };

  const {
    data: cardsData,
    isLoading: cardsLoading,
    isFetching: cardsFetching,
    refetch: refetchCards,
  } = useQuery<GiftCard[]>(
    ["giftcards", "mine"],
    () => giftcardService.listMine(),
    {
      onError: (error) => {
        toaster(getErrorMessage(error, "Failed to load your gift cards"), {
          variant: "error",
        });
      },
    }
  );
  const cards = useMemo(() => cardsData ?? [], [cardsData]);
  const activeCards = useMemo(
    () =>
      cards
        .filter(
          (card) =>
            card.status !== "CANCELLED" &&
            card.status !== "EXHAUSTED" &&
            normalizeNumeric(card.balance) > 0
        )
        .sort(
          (a, b) => normalizeNumeric(b.balance) - normalizeNumeric(a.balance)
        ),
    [cards]
  );
  const primaryActiveCard = activeCards[0] ?? null;
  const totalActiveBalance = useMemo(() => {
    return activeCards.reduce(
      (acc, card) => acc + normalizeNumeric(card.balance),
      0
    );
  }, [activeCards]);

  const purchaseMutation = useMutation<
    GiftCardPurchaseInit,
    unknown,
    PurchasePayload
  >((payload) => giftcardService.purchase(payload), {
    onSuccess: (initResult) => {
      const messageText =
        initResult?.customerMessage ||
        "Check your phone to approve the M-Pesa payment.";
      toaster(messageText, {
        variant: "info",
      });
      if (initResult?.paymentId) {
        setPendingPaymentId(initResult.paymentId);
        setIsWaitingPayment(true);
        setPendingPaymentAmount(
          typeof initResult.amount === "number"
            ? initResult.amount
            : purchaseForm.values.amount
        );
        handledPaymentStatusesRef.current = {};
        // Keep form values but mark as pristine since we're waiting for payment
        purchaseForm.setSubmitting(false);
      } else {
        setPendingPaymentId(null);
        setIsWaitingPayment(false);
        setPendingPaymentAmount(null);
        handledPaymentStatusesRef.current = {};
        queryClient.invalidateQueries(["giftcards", "mine"]);
        // Reset form on immediate success (rare case)
        purchaseForm.resetForm({
          values: {
            amount: MIN_GIFTCARD_AMOUNT,
            phoneNumber: purchaseForm.values.phoneNumber, // Keep phone for convenience
            recipientEmail: "",
            message: "",
          },
        });
      }
    },
    onError: (error) => {
      setPendingPaymentId(null);
      setIsWaitingPayment(false);
      setPendingPaymentAmount(null);
      handledPaymentStatusesRef.current = {};
      toaster(getErrorMessage(error, "Failed to purchase gift card"), {
        variant: "error",
      });
      purchaseForm.setSubmitting(false);
    },
  });

  const redeemMutation = useMutation<GiftCard, unknown, string>(
    (code) => giftcardService.redeem(code),
    {
      onSuccess: (card) => {
        toaster(`Gift card redeemed. Balance: KES ${card.balance}`, {
          variant: "success",
        });
        queryClient.invalidateQueries(["giftcards", "mine"]);
      },
      onError: (error) => {
        toaster(getErrorMessage(error, "Failed to redeem code"), {
          variant: "error",
        });
      },
    }
  );

  const quoteMutation = useMutation<GiftCardQuote, unknown, number>(
    (amountToQuote) => giftcardService.quote(amountToQuote),
    {
      onSuccess: (result) => {
        setQuoteResult(result);
      },
      onError: (error) => {
        toaster(getErrorMessage(error, "Failed to quote balance"), {
          variant: "error",
        });
      },
    }
  );

  const purchaseLoading = purchaseMutation.isLoading;
  const redeemLoading = redeemMutation.isLoading;
  const quoteLoading = quoteMutation.isLoading;
  const cardsRefreshing = cardsFetching && !cardsLoading;

  const handleRefresh = () => {
    void refetchCards();
  };

  useEffect(() => {
    if (!socket || !isConnected || !pendingPaymentId) return;

    const handlePaymentUpdate = (payload: unknown) => {
      try {
        if (!payload || typeof payload !== "object") return;
        const data = payload as Record<string, unknown>;
        const incomingPaymentId = data.paymentId as string | undefined;
        if (!incomingPaymentId || incomingPaymentId !== pendingPaymentId) {
          return;
        }

        const rawStatus = data.status;
        const normalizedStatus =
          typeof rawStatus === "string" ? rawStatus.toUpperCase() : "";
        if (!normalizedStatus) return;

        const lastStatus = handledPaymentStatusesRef.current[incomingPaymentId];
        if (lastStatus === normalizedStatus) {
          return;
        }
        handledPaymentStatusesRef.current[incomingPaymentId] = normalizedStatus;

        if (normalizedStatus === "COMPLETED") {
          const code = data.giftCardCode as string | undefined;
          const amountApplied = data.giftCardAmount as number | undefined;
          const amountText =
            typeof amountApplied === "number"
              ? ` (${formatter.format(amountApplied)})`
              : "";
          const message = code
            ? `Gift card ${code} is ready${amountText}.`
            : "Gift card payment completed.";
          toaster(message, { variant: "success" });
          setPendingPaymentId(null);
          setIsWaitingPayment(false);
          setPendingPaymentAmount(null);
          queryClient.invalidateQueries(["giftcards", "mine"]);
          void refetchCards();
          // Reset form after successful payment
          purchaseForm.resetForm({
            values: {
              amount: MIN_GIFTCARD_AMOUNT,
              phoneNumber: purchaseForm.values.phoneNumber, // Keep phone for convenience
              recipientEmail: "",
              message: "",
            },
          });
        } else if (
          normalizedStatus === "FAILED" ||
          normalizedStatus === "CANCELLED"
        ) {
          const reason = (data.reason || data.note) as string | undefined;
          const message =
            normalizedStatus === "CANCELLED"
              ? `Payment cancelled${reason ? `: ${reason}` : ""}`
              : `Payment failed${reason ? `: ${reason}` : ""}`;
          toaster(message, { variant: "error" });
          setPendingPaymentId(null);
          setIsWaitingPayment(false);
          setPendingPaymentAmount(null);
        }
      } catch (err) {
        console.error("Failed to handle gift card payment update", err);
      }
    };

    socket.on("payments:update", handlePaymentUpdate);
    return () => {
      socket.off("payments:update", handlePaymentUpdate);
    };
  }, [
    socket,
    isConnected,
    pendingPaymentId,
    toaster,
    queryClient,
    formatter,
    refetchCards,
    purchaseForm,
  ]);

  useEffect(() => {
    if (!pendingPaymentId) {
      handledPaymentStatusesRef.current = {};
    }
  }, [pendingPaymentId]);

  const getStatusBadge = (card: GiftCard) => {
    const status = (card.status || "ISSUED") as GiftCardStatus;
    const Icon = STATUS_ICONS[status];
    const balance = normalizeNumeric(card.balance);

    return (
      <div className="flex flex-wrap items-center gap-1">
        <Badge
          variant={STATUS_BADGE_VARIANT[status]}
          className="flex items-center gap-1"
        >
          <Icon className="h-3 w-3" />
          {STATUS_LABELS[status]}
        </Badge>
        {balance > 0 && status === "REDEEMED" && (
          <span className="text-xs text-muted-foreground ml-1">
            ({formatter.format(balance)} left)
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 bg-background min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
            Gift Cards
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Purchase, redeem, and manage your gift cards
          </p>
        </div>
        <Button
          onClick={handleRefresh}
          variant="outline"
          size="sm"
          disabled={cardsLoading || cardsRefreshing}
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 ${cardsRefreshing ? "animate-spin" : ""}`}
          />
          {cardsRefreshing ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {/* Balance Overview Card */}
      <Card className="border-0 bg-gradient-to-br from-green-500 to-green-600 text-white shadow-lg hover:shadow-xl transition-shadow">
        <CardHeader className="p-4 sm:p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 sm:h-6 sm:w-6" />
              <CardTitle className="text-white text-base sm:text-lg">
                Your Balance
              </CardTitle>
            </div>
            {activeCards.length > 0 && (
              <Badge
                variant="secondary"
                className="bg-white/20 text-white border-0"
              >
                {activeCards.length} Active{" "}
                {activeCards.length === 1 ? "Card" : "Cards"}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <div className="space-y-3">
            <div className="text-3xl sm:text-4xl font-bold">
              {formatter.format(totalActiveBalance)}
            </div>
            {primaryActiveCard && (
              <div className="flex items-center gap-2 text-xs sm:text-sm text-white/90">
                <Tag className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="font-mono truncate">
                  {primaryActiveCard.code}
                </span>
                <span>•</span>
                <span className="whitespace-nowrap">
                  {formatter.format(primaryActiveCard.balance || 0)}
                </span>
              </div>
            )}
            {!activeCards.length && (
              <p className="text-white/80 text-xs sm:text-sm">
                Redeem or purchase a gift card to get started
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Main Tabs */}
      <Tabs defaultValue="purchase" className="space-y-4 sm:space-y-6">
        <TabsList className="grid w-full grid-cols-3 h-auto">
          <TabsTrigger
            value="purchase"
            className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm py-2 sm:py-2.5"
          >
            <ShoppingBag className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Purchase</span>
            <span className="sm:hidden">Buy</span>
          </TabsTrigger>
          <TabsTrigger
            value="redeem"
            className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm py-2 sm:py-2.5"
          >
            <Gift className="h-3 w-3 sm:h-4 sm:w-4" />
            Redeem
          </TabsTrigger>
          <TabsTrigger
            value="balance"
            className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm py-2 sm:py-2.5"
          >
            <CreditCard className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Check Balance</span>
            <span className="sm:hidden">Balance</span>
          </TabsTrigger>
        </TabsList>

        {/* Purchase Tab */}
        <TabsContent value="purchase">
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base sm:text-lg">
                Buy a Gift Card
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Purchase a gift card for yourself or send it to someone special
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <form onSubmit={purchaseForm.handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount (KES)</Label>
                  <Input
                    id="amount"
                    name="amount"
                    type="number"
                    min={MIN_GIFTCARD_AMOUNT}
                    step={100}
                    value={purchaseForm.values.amount}
                    onChange={purchaseForm.handleChange}
                    onBlur={purchaseForm.handleBlur}
                    placeholder={`Minimum ${MIN_GIFTCARD_AMOUNT}`}
                    className={
                      purchaseForm.touched.amount && purchaseForm.errors.amount
                        ? "border-destructive"
                        : ""
                    }
                  />
                  {purchaseForm.touched.amount && purchaseForm.errors.amount ? (
                    <p className="text-xs text-destructive">
                      {purchaseForm.errors.amount}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Minimum gift card amount:{" "}
                      {formatter.format(MIN_GIFTCARD_AMOUNT)}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phoneNumber">M-Pesa Phone Number</Label>
                  <Input
                    id="phoneNumber"
                    name="phoneNumber"
                    type="tel"
                    value={purchaseForm.values.phoneNumber}
                    onChange={purchaseForm.handleChange}
                    onBlur={purchaseForm.handleBlur}
                    placeholder="07XXXXXXXX or 2547XXXXXXXX"
                    className={
                      purchaseForm.touched.phoneNumber &&
                      purchaseForm.errors.phoneNumber
                        ? "border-destructive"
                        : ""
                    }
                  />
                  {purchaseForm.touched.phoneNumber &&
                  purchaseForm.errors.phoneNumber ? (
                    <p className="text-xs text-destructive">
                      {purchaseForm.errors.phoneNumber}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      We will send an M-Pesa prompt to this number
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="recipientEmail">
                    Recipient Email (Optional)
                  </Label>
                  <Input
                    id="recipientEmail"
                    name="recipientEmail"
                    type="email"
                    value={purchaseForm.values.recipientEmail}
                    onChange={purchaseForm.handleChange}
                    onBlur={purchaseForm.handleBlur}
                    placeholder="friend@example.com"
                    className={
                      purchaseForm.touched.recipientEmail &&
                      purchaseForm.errors.recipientEmail
                        ? "border-destructive"
                        : ""
                    }
                  />
                  {purchaseForm.touched.recipientEmail &&
                    purchaseForm.errors.recipientEmail && (
                      <p className="text-xs text-destructive">
                        {purchaseForm.errors.recipientEmail}
                      </p>
                    )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">Personal Message (Optional)</Label>
                  <textarea
                    id="message"
                    name="message"
                    value={purchaseForm.values.message}
                    onChange={purchaseForm.handleChange}
                    onBlur={purchaseForm.handleBlur}
                    className={`flex min-h-[80px] w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                      purchaseForm.touched.message &&
                      purchaseForm.errors.message
                        ? "border-destructive"
                        : "border-border"
                    }`}
                    rows={3}
                    placeholder="Add a personal message..."
                  />
                  {purchaseForm.touched.message &&
                    purchaseForm.errors.message && (
                      <p className="text-xs text-destructive">
                        {purchaseForm.errors.message}
                      </p>
                    )}
                </div>

                <Button
                  type="submit"
                  disabled={
                    purchaseLoading ||
                    isWaitingPayment ||
                    !purchaseForm.isValid ||
                    !purchaseForm.dirty
                  }
                  className="w-full h-10 sm:h-auto text-sm touch-manipulation"
                >
                  {purchaseLoading ? (
                    <>
                      <Clock className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : isWaitingPayment ? (
                    <>
                      <Clock className="h-4 w-4 mr-2 animate-spin" />
                      Awaiting confirmation...
                    </>
                  ) : (
                    <>
                      <ShoppingBag className="h-4 w-4 mr-2" />
                      <span className="hidden sm:inline">
                        Pay {formatter.format(purchaseForm.values.amount)} with
                        M-Pesa
                      </span>
                      <span className="sm:hidden">
                        Pay {formatter.format(purchaseForm.values.amount)}
                      </span>
                    </>
                  )}
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  Once payment succeeds, your gift card will be generated
                  automatically
                </p>
                {isWaitingPayment && (
                  <Alert className="bg-accent/10 border-accent/30">
                    <Clock className="h-4 w-4 text-accent" />
                    <AlertTitle className="text-sm sm:text-base">
                      Awaiting M-Pesa confirmation
                    </AlertTitle>
                    <AlertDescription className="text-xs sm:text-sm">
                      Approve the prompt for{" "}
                      {formatter.format(
                        pendingPaymentAmount ?? purchaseForm.values.amount
                      )}{" "}
                      sent to{" "}
                      {purchaseForm.values.phoneNumber.trim() ||
                        "your phone number"}
                      . We will update your balance automatically once it is
                      confirmed.
                    </AlertDescription>
                  </Alert>
                )}
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Redeem Tab */}
        <TabsContent value="redeem">
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base sm:text-lg">
                Redeem a Gift Card
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Enter your gift card code to add it to your balance
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <form onSubmit={redeemForm.handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="code">Gift Card Code</Label>
                  <Input
                    id="code"
                    name="code"
                    value={redeemForm.values.code}
                    onChange={redeemForm.handleChange}
                    onBlur={redeemForm.handleBlur}
                    placeholder="Enter code e.g. GC-ABCD-12EF"
                    className={`font-mono ${
                      redeemForm.touched.code && redeemForm.errors.code
                        ? "border-destructive"
                        : ""
                    }`}
                  />
                  {redeemForm.touched.code && redeemForm.errors.code && (
                    <p className="text-xs text-destructive">
                      {redeemForm.errors.code}
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  disabled={
                    redeemLoading || !redeemForm.isValid || !redeemForm.dirty
                  }
                  className="w-full h-10 sm:h-auto text-sm touch-manipulation"
                >
                  {redeemLoading ? (
                    <>
                      <Clock className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Gift className="h-4 w-4 mr-2" />
                      Redeem Gift Card
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Balance Check Tab */}
        <TabsContent value="balance">
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base sm:text-lg">
                Check Balance Coverage
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                See how much of an upcoming purchase your gift card can cover
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <form onSubmit={quoteForm.handleSubmit} className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="flex-1 space-y-2">
                    <Input
                      type="number"
                      name="amount"
                      min={0}
                      step={100}
                      value={quoteForm.values.amount || ""}
                      onChange={quoteForm.handleChange}
                      onBlur={quoteForm.handleBlur}
                      placeholder="Amount in KES"
                      className={
                        quoteForm.touched.amount && quoteForm.errors.amount
                          ? "border-destructive"
                          : ""
                      }
                    />
                    {quoteForm.touched.amount && quoteForm.errors.amount && (
                      <p className="text-xs text-destructive">
                        {quoteForm.errors.amount}
                      </p>
                    )}
                  </div>
                  <Button
                    type="submit"
                    disabled={
                      quoteLoading || !quoteForm.isValid || !quoteForm.dirty
                    }
                    className="w-full sm:w-auto h-10 sm:h-auto text-sm touch-manipulation"
                  >
                    {quoteLoading ? (
                      <>
                        <Clock className="h-4 w-4 mr-2 animate-spin" />
                        Calculating...
                      </>
                    ) : (
                      <>
                        <CreditCard className="h-4 w-4 mr-2" />
                        Check Coverage
                      </>
                    )}
                  </Button>
                </div>

                {quoteResult && (
                  <div className="border border-border rounded-lg p-3 sm:p-4 bg-muted/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs sm:text-sm font-medium">
                        Gift Card Applied
                      </span>
                      <span className="text-base sm:text-lg font-bold text-primary">
                        {formatter.format(quoteResult.applied)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs sm:text-sm font-medium">
                        Remaining to Pay
                      </span>
                      <span className="text-base sm:text-lg font-bold">
                        {formatter.format(quoteResult.remaining)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs sm:text-sm text-muted-foreground">
                      <span>Available Balance</span>
                      <span>{formatter.format(quoteResult.balance)}</span>
                    </div>
                    {quoteResult.code && (
                      <div className="flex items-center gap-2 text-xs sm:text-sm pt-2 border-t">
                        <Tag className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                        <span className="font-mono text-xs truncate">
                          {quoteResult.code}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Gift Cards List */}
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">
            Your Gift Cards
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            View and manage all your gift cards
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          {/* Expiration Policy Info */}
          <Alert className="mb-4 sm:mb-6 bg-muted/50 border-border">
            <Clock className="h-4 w-4 text-primary" />
            <AlertTitle className="text-sm sm:text-base">
              Gift Card Validity
            </AlertTitle>
            <AlertDescription className="text-xs sm:text-sm">
              Gift cards are valid for{" "}
              <strong>12 months from the date you redeem them</strong>. Use your
              balance before expiry to avoid losing credit. We'll show warnings
              when cards are expiring soon.
            </AlertDescription>
          </Alert>

          {cardsLoading && cards.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-8 w-8 mx-auto mb-2 animate-spin" />
              Loading your gift cards...
            </div>
          ) : cards.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Gift className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No gift cards yet</p>
              <p className="text-sm mt-1">
                Purchase or redeem a gift card to get started
              </p>
            </div>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="block md:hidden space-y-4">
                {cards.map((card) => {
                  const amount = normalizeNumeric(card.amount);
                  const balance = Math.max(0, normalizeNumeric(card.balance));
                  const spent = Math.max(0, amount - balance);
                  const expired = isExpired(card.expiresAt);
                  const expiringSoon = isExpiringSoon(card.expiresAt);
                  const daysLeft = getDaysUntilExpiry(card.expiresAt);

                  return (
                    <div
                      key={card.id}
                      className="border border-border rounded-lg p-4 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1 flex-1">
                          <button
                            onClick={() => copyToClipboard(card.code)}
                            className="font-mono text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 group"
                            title="Click to copy"
                          >
                            <span>{card.code}</span>
                            {copiedCode === card.code ? (
                              <Check className="h-3 w-3 text-green-600" />
                            ) : (
                              <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                            )}
                          </button>
                          <div className="flex items-center gap-2 flex-wrap">
                            {getStatusBadge(card)}
                            {expired && (
                              <Badge variant="destructive" className="text-xs">
                                <XCircle className="h-3 w-3 mr-1" />
                                Expired
                              </Badge>
                            )}
                            {!expired && expiringSoon && daysLeft && (
                              <Badge
                                variant="outline"
                                className="text-xs border-accent text-accent"
                              >
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                {daysLeft}d left
                              </Badge>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {new Date(card.createdAt).toLocaleDateString()}
                        </p>
                      </div>

                      <div className="grid grid-cols-3 gap-3 pt-2 border-t border-border">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">
                            Original
                          </p>
                          <p className="font-medium text-sm">
                            {formatter.format(amount)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">
                            Balance
                          </p>
                          <p className="font-semibold text-sm text-primary">
                            {formatter.format(balance)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">
                            Spent
                          </p>
                          <p className="font-medium text-sm text-muted-foreground">
                            {formatter.format(spent)}
                          </p>
                        </div>
                      </div>

                      {card.expiresAt && (
                        <div className="pt-2 border-t border-border">
                          <div className="flex items-center gap-2 text-xs">
                            <Calendar className="h-3 w-3 text-muted-foreground" />
                            <span
                              className={`${
                                expired
                                  ? "text-destructive font-medium"
                                  : expiringSoon
                                  ? "text-accent font-medium"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {expired ? "Expired" : "Expires"}:{" "}
                              {formatExpiryDate(card.expiresAt)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="pb-3 px-4 font-medium text-sm">Code</th>
                      <th className="pb-3 px-4 font-medium text-sm">Status</th>
                      <th className="pb-3 px-4 font-medium text-sm text-right">
                        Original
                      </th>
                      <th className="pb-3 px-4 font-medium text-sm text-right">
                        Balance
                      </th>
                      <th className="pb-3 px-6 font-medium text-sm text-right">
                        Spent
                      </th>
                      <th className="pb-3 px-4 font-medium text-sm text-right">
                        Expires
                      </th>
                      <th className="pb-3 px-4 font-medium text-sm text-right">
                        Created
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {cards.map((card) => {
                      const amount = normalizeNumeric(card.amount);
                      const balance = Math.max(
                        0,
                        normalizeNumeric(card.balance)
                      );
                      const spent = Math.max(0, amount - balance);
                      const expired = isExpired(card.expiresAt);
                      const expiringSoon = isExpiringSoon(card.expiresAt);
                      const daysLeft = getDaysUntilExpiry(card.expiresAt);

                      return (
                        <tr
                          key={card.id}
                          className="border-b border-border last:border-0"
                        >
                          <td className="py-3 px-4">
                            <button
                              onClick={() => copyToClipboard(card.code)}
                              className="font-mono text-xs hover:text-foreground transition-colors flex items-center gap-1.5 group"
                              title="Click to copy"
                            >
                              <span>{card.code}</span>
                              {copiedCode === card.code ? (
                                <Check className="h-3 w-3 text-green-600" />
                              ) : (
                                <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                              )}
                            </button>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2 flex-wrap">
                              {getStatusBadge(card)}
                              {expired && (
                                <Badge
                                  variant="destructive"
                                  className="text-xs"
                                >
                                  <XCircle className="h-3 w-3 mr-1" />
                                  Expired
                                </Badge>
                              )}
                              {!expired && expiringSoon && daysLeft && (
                                <Badge
                                  variant="outline"
                                  className="text-xs border-accent text-accent"
                                >
                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                  {daysLeft}d
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            {formatter.format(amount)}
                          </td>
                          <td className="py-3 px-4 text-right font-semibold">
                            {formatter.format(balance)}
                          </td>
                          <td className="py-3 px-6 text-right text-muted-foreground">
                            {formatter.format(spent)}
                          </td>
                          <td className="py-3 px-4 text-sm text-right">
                            {card.expiresAt ? (
                              <span
                                className={`${
                                  expired
                                    ? "text-destructive font-medium"
                                    : expiringSoon
                                    ? "text-accent font-medium"
                                    : "text-muted-foreground"
                                }`}
                              >
                                {formatExpiryDate(card.expiresAt)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">
                                No expiry
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-sm text-right text-muted-foreground">
                            {new Date(card.createdAt).toLocaleDateString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

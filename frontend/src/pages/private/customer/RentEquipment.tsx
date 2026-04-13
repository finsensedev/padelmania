/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useContext, useCallback, useEffect } from "react";
import { useQuery } from "react-query";
import { useSelector } from "react-redux";
import {
  Loader2,
  Package,
  Minus,
  Plus,
  Phone,
  ShoppingCart,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
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
import { Badge } from "src/components/ui/badge";
import api from "src/utils/api";
import useNotification from "src/hooks/useNotification";
import paymentService from "src/services/payment.service";
import { SocketContext } from "src/contexts/SocketProvider";

interface EquipmentItem {
  id: string;
  name: string;
  type: string;
  brand: string | null;
  rentalPrice: number;
  totalQuantity: number;
  availableQty: number;
  condition: string;
  inStock: boolean;
}

interface CartItem {
  equipment: EquipmentItem;
  quantity: number;
}

type RentalStatus = "idle" | "paying" | "success" | "failed";

export default function RentEquipment() {
  const { toaster } = useNotification();
  const { socket, isConnected } = useContext(SocketContext);
  const user = useSelector((state: any) => state.userState?.user);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [phoneNumber, setPhoneNumber] = useState(user?.phone || "");
  const [status, setStatus] = useState<RentalStatus>("idle");
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [rentalCode, setRentalCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch available equipment
  const {
    data: equipment = [],
    isLoading,
    refetch,
  } = useQuery<EquipmentItem[]>(
    ["available-equipment"],
    async () => {
      const { data } = await api.get("/equipment-rentals/available");
      return data.data || [];
    },
    { staleTime: 60_000 },
  );

  // Fetch my rentals
  const { data: myRentals = [], refetch: refetchRentals } = useQuery(
    ["my-equipment-rentals"],
    async () => {
      const { data } = await api.get("/equipment-rentals/my-rentals");
      return data.data || [];
    },
    { staleTime: 30_000 },
  );

  // Group equipment by type
  const rackets = equipment.filter((e) => e.type === "RACKET");
  const balls = equipment.filter((e) => e.type === "BALLS");

  const cartTotal = cart.reduce(
    (sum, c) => sum + c.equipment.rentalPrice * c.quantity,
    0,
  );

  const addToCart = useCallback((eq: EquipmentItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.equipment.id === eq.id);
      if (existing) {
        if (existing.quantity >= eq.availableQty || existing.quantity >= 10)
          return prev;
        return prev.map((c) =>
          c.equipment.id === eq.id ? { ...c, quantity: c.quantity + 1 } : c,
        );
      }
      return [...prev, { equipment: eq, quantity: 1 }];
    });
  }, []);

  const removeFromCart = useCallback((equipmentId: string) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.equipment.id === equipmentId);
      if (!existing) return prev;
      if (existing.quantity <= 1) {
        return prev.filter((c) => c.equipment.id !== equipmentId);
      }
      return prev.map((c) =>
        c.equipment.id === equipmentId ? { ...c, quantity: c.quantity - 1 } : c,
      );
    });
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const getCartQty = (equipmentId: string) =>
    cart.find((c) => c.equipment.id === equipmentId)?.quantity || 0;

  // --- Payment ---
  const handlePayment = useCallback(async () => {
    if (cart.length === 0) {
      toaster("Please add at least one item to your cart.", {
        variant: "error",
      });
      return;
    }
    if (!phoneNumber.trim()) {
      toaster("M-Pesa phone number is required.", { variant: "error" });
      return;
    }

    setStatus("paying");
    setError(null);

    try {
      const { data } = await api.post("/equipment-rentals/standalone", {
        phoneNumber: phoneNumber.trim(),
        items: cart.map((c) => ({
          equipmentId: c.equipment.id,
          quantity: c.quantity,
        })),
      });

      const result = data.data || data;
      setPaymentId(result.paymentId);
      setRentalCode(result.rentalCode);
      toaster(
        result.CustomerMessage || "Check your phone for the M-Pesa prompt.",
        { variant: "info" },
      );
    } catch (err: any) {
      const msg = err?.response?.data?.message || "Failed to initiate payment.";
      setError(msg);
      setStatus("failed");
      toaster(msg, { variant: "error" });
    }
  }, [cart, phoneNumber, toaster]);

  // --- Payment polling via socket + fallback ---
  const handlePaymentResult = useCallback(
    (payStatus: string, _reason?: string) => {
      if (payStatus === "COMPLETED") {
        setStatus("success");
        setCart([]);
        refetch();
        refetchRentals();
        toaster("Equipment rented successfully!", { variant: "success" });
      } else {
        setStatus("failed");
        const msg = `Payment ${payStatus === "CANCELLED" ? "cancelled" : "failed"}${_reason ? `: ${_reason}` : ""}`;
        setError(msg);
        toaster(msg, { variant: "error" });
      }
    },
    [refetch, refetchRentals, toaster],
  );

  useEffect(() => {
    if (!paymentId || status !== "paying") return;

    if (isConnected && socket) {
      const onUpdate = (payload: any) => {
        if (payload?.paymentId === paymentId) {
          handlePaymentResult(payload.status, payload.reason || payload.note);
        }
      };
      socket.on("payments:update", onUpdate);
      return () => {
        socket.off("payments:update", onUpdate);
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
        const payment = await paymentService.getPaymentById(paymentId);
        if (["COMPLETED", "FAILED", "CANCELLED"].includes(payment?.status)) {
          stopped = true;
          handlePaymentResult(payment.status);
          return;
        }
      } catch {
        /* ignore */
      }
      if (attempts >= maxAttempts) {
        stopped = true;
        handlePaymentResult("FAILED", "timed out");
      } else {
        setTimeout(tick, 4000);
      }
    };
    const timer = setTimeout(tick, 4000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [paymentId, status, isConnected, socket, handlePaymentResult]);

  // --- Render: Success state ---
  if (status === "success") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="flex flex-col items-center py-10 text-center">
            <CheckCircle2 className="h-16 w-16 text-green-600 mb-4" />
            <h2 className="text-2xl font-bold text-green-800 mb-2">
              Rental Confirmed!
            </h2>
            {rentalCode && (
              <p className="text-lg font-mono font-semibold text-green-700 mb-4">
                {rentalCode}
              </p>
            )}
            <p className="text-muted-foreground mb-6">
              Your equipment rental has been confirmed. Present this code at the
              venue to collect your equipment.
            </p>
            <Button
              onClick={() => {
                setStatus("idle");
                setPaymentId(null);
                setRentalCode(null);
              }}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Rent More Equipment
            </Button>
          </CardContent>
        </Card>

        {/* Recent Rentals */}
        {myRentals.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-lg">Your Recent Rentals</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {myRentals.slice(0, 5).map((r: any) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <p className="font-medium">{r.equipment?.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.rentalCode} &middot; Qty: {r.quantity} &middot; Ksh{" "}
                        {r.total?.toLocaleString()}
                      </p>
                    </div>
                    <Badge
                      variant={
                        r.status === "ACTIVE"
                          ? "default"
                          : r.status === "RETURNED"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {r.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // --- Render: Main ---
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Rent Equipment
        </h1>
        <p className="text-muted-foreground mt-1">
          Rent padel rackets and ball packs without a court booking. Pay via
          M-Pesa and collect at the venue.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Equipment list */}
          <div className="lg:col-span-2 space-y-6">
            {/* Rackets */}
            {rackets.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    Rackets
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {rackets.map((eq) => (
                      <EquipmentCard
                        key={eq.id}
                        item={eq}
                        cartQty={getCartQty(eq.id)}
                        onAdd={() => addToCart(eq)}
                        onRemove={() => removeFromCart(eq.id)}
                        disabled={status === "paying"}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Balls */}
            {balls.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    Ball Packs
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {balls.map((eq) => (
                      <EquipmentCard
                        key={eq.id}
                        item={eq}
                        cartQty={getCartQty(eq.id)}
                        onAdd={() => addToCart(eq)}
                        onRemove={() => removeFromCart(eq.id)}
                        disabled={status === "paying"}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {equipment.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  No equipment available for rental at this time.
                </CardContent>
              </Card>
            )}
          </div>

          {/* Cart / Checkout sidebar */}
          <div className="space-y-4">
            <Card className="sticky top-4">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5" />
                  Your Cart
                  {cart.length > 0 && (
                    <Badge variant="secondary" className="ml-auto">
                      {cart.reduce((s, c) => s + c.quantity, 0)} item
                      {cart.reduce((s, c) => s + c.quantity, 0) !== 1
                        ? "s"
                        : ""}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {cart.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    Select equipment above to get started.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {cart.map((c) => (
                      <div
                        key={c.equipment.id}
                        className="flex items-center justify-between text-sm"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">
                            {c.equipment.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {c.quantity} &times; Ksh{" "}
                            {c.equipment.rentalPrice.toLocaleString()}
                          </p>
                        </div>
                        <p className="font-semibold tabular-nums whitespace-nowrap ml-2">
                          Ksh{" "}
                          {(
                            c.quantity * c.equipment.rentalPrice
                          ).toLocaleString()}
                        </p>
                      </div>
                    ))}

                    <div className="border-t pt-3 flex items-center justify-between font-bold">
                      <span>Total</span>
                      <span>Ksh {cartTotal.toLocaleString()}</span>
                    </div>

                    {/* Phone input */}
                    <div className="pt-2">
                      <Label
                        htmlFor="phone"
                        className="text-sm font-medium flex items-center gap-1.5 mb-1.5"
                      >
                        <Phone className="h-3.5 w-3.5" />
                        M-Pesa Phone Number
                      </Label>
                      <Input
                        id="phone"
                        type="tel"
                        placeholder="0712345678"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        disabled={status === "paying"}
                      />
                    </div>

                    {error && (
                      <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription className="text-xs">
                          {error}
                        </AlertDescription>
                      </Alert>
                    )}

                    <Button
                      className="w-full"
                      size="lg"
                      onClick={handlePayment}
                      disabled={status === "paying" || cart.length === 0}
                    >
                      {status === "paying" ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Waiting for M-Pesa...
                        </>
                      ) : (
                        <>Pay Ksh {cartTotal.toLocaleString()} via M-Pesa</>
                      )}
                    </Button>

                    {status !== "paying" && cart.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-muted-foreground"
                        onClick={clearCart}
                      >
                        Clear Cart
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Rentals */}
            {myRentals.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Recent Rentals
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {myRentals.slice(0, 3).map((r: any) => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between text-xs"
                      >
                        <div className="min-w-0">
                          <p className="font-medium truncate">
                            {r.equipment?.name}
                          </p>
                          <p className="text-muted-foreground">
                            {r.rentalCode}
                          </p>
                        </div>
                        <Badge
                          variant={
                            r.status === "ACTIVE" ? "default" : "secondary"
                          }
                          className="text-[10px] ml-2"
                        >
                          {r.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Equipment item card ---
function EquipmentCard({
  item,
  cartQty,
  onAdd,
  onRemove,
  disabled,
}: {
  item: EquipmentItem;
  cartQty: number;
  onAdd: () => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const outOfStock = !item.inStock || item.availableQty <= 0;

  return (
    <div
      className={`relative rounded-xl border p-4 transition-all ${
        outOfStock
          ? "opacity-50 bg-muted/30"
          : cartQty > 0
            ? "border-primary bg-primary/5 shadow-sm"
            : "hover:border-primary/40 hover:shadow-sm"
      }`}
    >
      {outOfStock && (
        <Badge
          variant="destructive"
          className="absolute top-2 right-2 text-[10px]"
        >
          Out of Stock
        </Badge>
      )}
      <div className="mb-3">
        <h4 className="font-semibold">{item.name}</h4>
        {item.brand && (
          <p className="text-xs text-muted-foreground">{item.brand}</p>
        )}
      </div>
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xl font-bold text-primary">
            Ksh {item.rentalPrice.toLocaleString()}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {item.type === "RACKET" ? "per racket" : "per pack"}
          </p>
          {!outOfStock && (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {item.availableQty} available
            </p>
          )}
        </div>

        {!outOfStock && (
          <div className="flex items-center gap-1.5">
            {cartQty > 0 && (
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8"
                onClick={onRemove}
                disabled={disabled}
              >
                <Minus className="h-3.5 w-3.5" />
              </Button>
            )}
            {cartQty > 0 && (
              <span className="w-6 text-center font-semibold text-sm tabular-nums">
                {cartQty}
              </span>
            )}
            <Button
              size="icon"
              variant={cartQty > 0 ? "default" : "outline"}
              className="h-8 w-8"
              onClick={onAdd}
              disabled={
                disabled || cartQty >= item.availableQty || cartQty >= 10
              }
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

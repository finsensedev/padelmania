/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import {
  Calendar,
  Clock,
  MapPin,
  Users,
  XCircle,
  CheckCircle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Package,
} from "lucide-react";
import { Card, CardContent } from "src/components/ui/card";
import { Button } from "src/components/ui/button";
import { Badge } from "src/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "src/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "src/components/ui/accordion";
import {
  Alert,
  AlertDescription,
  // AlertTitle
} from "src/components/ui/alert";
import { useQuery } from "react-query";
import bookingService from "src/services/booking.service";
import useModal from "src/hooks/useModal";
import AddEquipmentModal from "src/components/customer/AddEquipmentModal";
// import useNotification from "src/hooks/useNotification";
// import RescheduleBookingModal from "src/components/customer/RescheduleBookingModal";

type TabKey = "upcoming" | "past" | "cancelled";

interface EquipmentBreakdown {
  type: string;
  name: string;
  quantity: number;
  pricePerUnit: number;
  subtotal: number;
}

interface PricingDetails {
  totalAmount: number;
  courtSubtotal: number;
  equipmentSubtotal: number;
  voucherDiscount?: number | null;
  giftCardApplied?: number | null;
  pricePerHour: number;
  equipment?: EquipmentBreakdown[];
}

interface Booking {
  id: string;
  bookingCode: string;
  court: {
    id: string;
    name: string;
    type: string;
    location: string;
  };
  startTime: string;
  endTime: string;
  duration: number;
  numberOfPlayers: number;
  status: string;
  totalAmount: number;
  createdAt: string;
  notes?: string;
  pricing?: PricingDetails;
}

const PAGE_SIZE = 5;

function MyBookings() {
  const navigate = useNavigate();
  const { pushModal } = useModal();
  // const { toaster } = useNotification();

  const {
    data: bookings = [],
    isLoading: loading,
    refetch,
  } = useQuery<Booking[]>({
    queryKey: ["my-bookings"],
    queryFn: () => bookingService.myBookings(),
  });
  const [activeTab, setActiveTab] = useState<TabKey>("upcoming");
  const [pageByTab, setPageByTab] = useState<Record<TabKey, number>>({
    upcoming: 1,
    past: 1,
    cancelled: 1,
  });

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: "KES",
      currencyDisplay: "code",
      maximumFractionDigits: 0,
    })
      .format(amount)
      // Ensure spacing like `KES 9,000` (Intl may output `KSh9,000` on some locales)
      .replace(/^KSh\s?/, "KES ");

  const getStatusBadge = (status: string) => {
    const variants: Record<
      string,
      {
        variant: "default" | "secondary" | "destructive" | "outline";
        icon: any;
      }
    > = {
      PENDING: { variant: "outline", icon: AlertCircle },
      CONFIRMED: { variant: "default", icon: CheckCircle },
      CANCELLED: { variant: "destructive", icon: XCircle },
      COMPLETED: { variant: "secondary", icon: CheckCircle },
      NO_SHOW: { variant: "destructive", icon: XCircle },
      REFUNDED: { variant: "secondary", icon: CheckCircle },
    };

    const config = variants[status] || {
      variant: "outline",
      icon: AlertCircle,
    };
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {status}
      </Badge>
    );
  };

  const filterBookings = useCallback(
    (status: string) => {
      const now = new Date();
      let filtered = bookings;

      if (status === "upcoming") {
        filtered = bookings.filter(
          (b) =>
            new Date(b.startTime) > now &&
            ["PENDING", "CONFIRMED"].includes(b.status)
        );
        // Sort upcoming chronologically (soonest first)
        return filtered.sort(
          (a, b) =>
            new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
        );
      } else if (status === "past") {
        filtered = bookings.filter(
          (b) => new Date(b.startTime) <= now || b.status === "COMPLETED"
        );
        // Sort past bookings reverse chronologically (most recent first)
        return filtered.sort(
          (a, b) =>
            new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
        );
      } else if (status === "cancelled") {
        filtered = bookings.filter((b) =>
          ["CANCELLED", "REFUNDED"].includes(b.status)
        );
        // Sort cancelled bookings reverse chronologically (most recent first)
        return filtered.sort(
          (a, b) =>
            new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
        );
      }

      return filtered.sort(
        (a, b) =>
          new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
      );
    },
    [bookings]
  );

  const groupMultiCourtBookings = useCallback((bookingsList: Booking[]) => {
    const groups = new Map<string, Booking[]>();
    const processed = new Set<string>();

    bookingsList.forEach((booking, index) => {
      if (processed.has(booking.id)) return;

      const relatedBookings: Booking[] = [];
      for (let j = index + 1; j < bookingsList.length; j++) {
        const other = bookingsList[j];
        if (processed.has(other.id)) continue;

        const sameTimeSlot =
          booking.startTime === other.startTime &&
          booking.endTime === other.endTime;
        const createdWithinSeconds =
          Math.abs(
            new Date(booking.createdAt).getTime() -
              new Date(other.createdAt).getTime()
          ) < 10000;

        if (sameTimeSlot && createdWithinSeconds) {
          relatedBookings.push(other);
          processed.add(other.id);
        }
      }

      if (relatedBookings.length > 0) {
        groups.set(booking.id, relatedBookings);
        processed.add(booking.id);
      }
    });

    return groups;
  }, []);

  const upcomingBookings = useMemo(
    () => filterBookings("upcoming"),
    [filterBookings]
  );
  const pastBookings = useMemo(() => filterBookings("past"), [filterBookings]);
  const cancelledBookings = useMemo(
    () => filterBookings("cancelled"),
    [filterBookings]
  );

  const multiCourtUpcoming = useMemo(
    () => groupMultiCourtBookings(upcomingBookings),
    [upcomingBookings, groupMultiCourtBookings]
  );
  const multiCourtPast = useMemo(
    () => groupMultiCourtBookings(pastBookings),
    [pastBookings, groupMultiCourtBookings]
  );
  const multiCourtCancelled = useMemo(
    () => groupMultiCourtBookings(cancelledBookings),
    [cancelledBookings, groupMultiCourtBookings]
  );

  const resetAllPages = useCallback(() => {
    setPageByTab({ upcoming: 1, past: 1, cancelled: 1 });
  }, []);

  useEffect(() => {
    resetAllPages();
  }, [resetAllPages]);

  useEffect(() => {
    const totals: Record<TabKey, number> = {
      upcoming: upcomingBookings.length,
      past: pastBookings.length,
      cancelled: cancelledBookings.length,
    };
    setPageByTab((prev) => {
      let changed = false;
      const next = { ...prev };
      (Object.keys(totals) as TabKey[]).forEach((tab) => {
        const total = totals[tab];
        const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        const desiredPage = total === 0 ? 1 : Math.min(prev[tab], totalPages);
        if (prev[tab] !== desiredPage) {
          next[tab] = desiredPage;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [upcomingBookings.length, pastBookings.length, cancelledBookings.length]);

  const paginate = useCallback(
    (list: Booking[], tab: TabKey) => {
      const total = list.length;
      const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      const currentPage = Math.min(pageByTab[tab], totalPages);
      const startIndex = (currentPage - 1) * PAGE_SIZE;
      const items = list.slice(startIndex, startIndex + PAGE_SIZE);
      const start = total === 0 ? 0 : startIndex + 1;
      const end = total === 0 ? 0 : Math.min(startIndex + PAGE_SIZE, total);
      return { items, total, currentPage, totalPages, start, end };
    },
    [pageByTab]
  );

  const upcomingPagination = useMemo(
    () => paginate(upcomingBookings, "upcoming"),
    [paginate, upcomingBookings]
  );
  const pastPagination = useMemo(
    () => paginate(pastBookings, "past"),
    [paginate, pastBookings]
  );
  const cancelledPagination = useMemo(
    () => paginate(cancelledBookings, "cancelled"),
    [paginate, cancelledBookings]
  );

  const setPage = (tab: TabKey, page: number) => {
    setPageByTab((prev) => ({ ...prev, [tab]: page }));
  };

  const PaginationFooter = ({
    tab,
    meta,
  }: {
    tab: TabKey;
    meta: {
      total: number;
      currentPage: number;
      totalPages: number;
      start: number;
      end: number;
    };
  }) => {
    if (meta.total <= PAGE_SIZE) {
      return null;
    }

    return (
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-xs sm:text-sm text-muted-foreground text-center sm:text-left">
          Showing {meta.start} to {meta.end} of {meta.total} bookings
        </p>
        <div className="flex items-center justify-center sm:justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(tab, meta.currentPage - 1)}
            disabled={meta.currentPage <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Previous</span>
          </Button>
          <span className="text-xs sm:text-sm text-muted-foreground px-2">
            Page {meta.currentPage} of {meta.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(tab, meta.currentPage + 1)}
            disabled={meta.currentPage >= meta.totalPages}
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  const BookingCard = ({
    booking,
    showAddEquipmentButton = false,
    isMultiCourt = false,
    relatedBookings = [],
  }: {
    booking: Booking;
    showRescheduleButton?: boolean;
    showAddEquipmentButton?: boolean;
    isMultiCourt?: boolean;
    relatedBookings?: Booking[];
  }) => {
    // const canEdit = (() => {
    //   const start = new Date(booking.startTime).getTime();
    //   const cutoff = start - 24 * 60 * 60 * 1000;
    //   return (
    //     Date.now() < cutoff && ["PENDING", "CONFIRMED"].includes(booking.status)
    //   );
    // })();

    const canAddEquipment = (() => {
      const start = new Date(booking.startTime).getTime();
      const now = Date.now();
      return start > now && ["PENDING", "CONFIRMED"].includes(booking.status);
    })();

    const handleAddEquipment = () => {
      pushModal(
        <AddEquipmentModal
          booking={booking}
          relatedBookings={relatedBookings}
          onSuccess={() => {
            refetch();
          }}
        />
      );
    };

    // Calculate combined total for multi-court bookings
    const combinedTotal =
      isMultiCourt && relatedBookings.length > 0
        ? [booking, ...relatedBookings].reduce(
            (sum, b) => sum + Number(b.totalAmount || 0),
            0
          )
        : Number(booking.totalAmount || 0);

    const bookingGroup = [booking, ...relatedBookings];
    const totalVoucherDiscount = bookingGroup.reduce(
      (sum, b) => sum + Number(b?.pricing?.voucherDiscount || 0),
      0
    );
    const totalGiftCardDiscount = bookingGroup.reduce(
      (sum, b) => sum + Number(b?.pricing?.giftCardApplied || 0),
      0
    );
    const combinedDiscount = totalVoucherDiscount + totalGiftCardDiscount;
    const netTotal = Math.max(0, combinedTotal - combinedDiscount);
    const hasDiscount = combinedDiscount > 0;

    const bookingVoucherDiscount = Number(
      booking.pricing?.voucherDiscount || 0
    );
    const bookingGiftCardDiscount = Number(
      booking.pricing?.giftCardApplied || 0
    );
    const bookingDiscountTotal =
      bookingVoucherDiscount + bookingGiftCardDiscount;
    const bookingNetTotal = Math.max(
      0,
      Number(booking.pricing?.totalAmount || 0) - bookingDiscountTotal
    );

    return (
      <Card className="hover:shadow-lg transition-shadow ">
        <CardContent className="p-4 sm:p-6">
          {isMultiCourt && relatedBookings.length > 0 && (
            <Alert className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs sm:text-sm text-muted-foreground">
                Multi-court booking with {relatedBookings.length + 1} court
                {relatedBookings.length + 1 > 1 ? "s" : ""}. Equipment and
                discounts are shared across all courts.
              </AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-0 mb-4">
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <h3 className="font-semibold text-base sm:text-lg">
                  {isMultiCourt && relatedBookings.length > 0
                    ? `${booking.court.name} + ${relatedBookings.length} more`
                    : booking.court.name}
                </h3>
                {getStatusBadge(booking.status)}
                {isMultiCourt && (
                  <Badge variant="outline" className="text-xs">
                    Multi-Court
                  </Badge>
                )}
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Booking #{booking.bookingCode}
                {relatedBookings.length > 0 &&
                  ` (+ ${relatedBookings.length} more)`}
              </p>
            </div>
            <div className="sm:text-right">
              <p className="text-xl sm:text-2xl font-bold">
                {formatCurrency(netTotal)}
              </p>
              {hasDiscount && (
                <>
                  <p className="text-xs text-muted-foreground mt-1">
                    {netTotal === 0
                      ? "Fully covered by discounts"
                      : `Includes ${formatCurrency(
                          combinedDiscount
                        )} in discounts`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Gross {formatCurrency(combinedTotal)}
                  </p>
                </>
              )}
              {isMultiCourt && relatedBookings.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Combined total across {relatedBookings.length + 1} courts
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4">
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="truncate">
                {format(new Date(booking.startTime), "EEE, MMM d, yyyy")}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span>
                {format(new Date(booking.startTime), "HH:mm")} -{" "}
                {format(new Date(booking.endTime), "HH:mm")}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="truncate">{booking.court.location}</span>
            </div>
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <Users className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span>{booking.numberOfPlayers} players</span>
            </div>
          </div>

          {/* Multi-Court Details Accordion */}
          {isMultiCourt && relatedBookings.length > 0 && (
            <Accordion type="single" collapsible className="mb-4">
              <AccordionItem
                value="courts"
                className="border border-border rounded-lg"
              >
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <span className="text-sm font-medium">
                    View breakdown for all {relatedBookings.length + 1} court
                    {relatedBookings.length + 1 > 1 ? "s" : ""}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  <div className="space-y-4">
                    {/* Courts breakdown */}
                    <div className="space-y-2">
                      <h5 className="text-xs font-semibold text-muted-foreground uppercase">
                        Courts
                      </h5>
                      {[booking, ...relatedBookings].map((b) => (
                        <div
                          key={b.id}
                          className="flex items-center justify-between py-1"
                        >
                          <div className="text-sm flex-1">
                            <div className="font-medium">{b.court.name}</div>
                            <div className="text-muted-foreground text-xs">
                              #{b.bookingCode} • {b.duration} min @{" "}
                              {formatCurrency(b.pricing?.pricePerHour || 0)}/hr
                            </div>
                          </div>
                          <span className="text-sm font-medium ml-2">
                            {formatCurrency(b.pricing?.courtSubtotal || 0)}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Equipment (shared across all courts) */}
                    {(() => {
                      const allEquipment = [
                        booking,
                        ...relatedBookings,
                      ].flatMap((b) => b.pricing?.equipment || []);

                      // Group equipment by type and sum quantities
                      const equipmentMap = new Map<
                        string,
                        { name: string; quantity: number; subtotal: number }
                      >();
                      allEquipment.forEach((eq) => {
                        const existing = equipmentMap.get(eq.name);
                        if (existing) {
                          existing.quantity += eq.quantity;
                          existing.subtotal += eq.subtotal;
                        } else {
                          equipmentMap.set(eq.name, { ...eq });
                        }
                      });

                      return (
                        equipmentMap.size > 0 && (
                          <div className="space-y-2 border-t border-border pt-3">
                            <h5 className="text-xs font-semibold text-muted-foreground uppercase">
                              Equipment
                            </h5>
                            {Array.from(equipmentMap.values()).map(
                              (eq, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-center justify-between py-1"
                                >
                                  <span className="text-sm text-muted-foreground">
                                    {eq.name} x {eq.quantity}
                                  </span>
                                  <span className="text-sm font-medium">
                                    {formatCurrency(eq.subtotal)}
                                  </span>
                                </div>
                              )
                            )}
                          </div>
                        )
                      );
                    })()}

                    {/* Discounts (applied once to entire booking) */}
                    {hasDiscount && (
                      <div className="space-y-2 border-t border-border pt-3">
                        <h5 className="text-xs font-semibold text-muted-foreground uppercase">
                          Discounts
                        </h5>
                        {totalVoucherDiscount > 0 && (
                          <div className="flex items-center justify-between py-1">
                            <span className="text-sm text-primary">
                              Voucher discount
                            </span>
                            <span className="text-sm font-medium text-primary">
                              -{formatCurrency(totalVoucherDiscount)}
                            </span>
                          </div>
                        )}
                        {totalGiftCardDiscount > 0 && (
                          <div className="flex items-center justify-between py-1">
                            <span className="text-sm text-primary">
                              Gift card applied
                            </span>
                            <span className="text-sm font-medium text-primary">
                              -{formatCurrency(totalGiftCardDiscount)}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Total */}
                    <div className="flex items-center justify-between py-2 border-t border-border font-semibold">
                      <span className="text-sm">
                        {hasDiscount ? "Total after discounts" : "Total"}
                      </span>
                      <span className="text-base">
                        {formatCurrency(netTotal)}
                      </span>
                    </div>
                    {hasDiscount && (
                      <p className="text-xs text-muted-foreground text-right">
                        Gross {formatCurrency(combinedTotal)}
                      </p>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}

          {/* Cost Breakdown - Only show for single court bookings */}
          {booking.pricing && !isMultiCourt && (
            <div className="border-t border-border pt-4 mb-4">
              <h4 className="text-xs sm:text-sm font-semibold mb-3 text-muted-foreground">
                Cost Breakdown
              </h4>
              <div className="space-y-2">
                {/* Court rental */}
                <div className="flex justify-between gap-2 text-xs sm:text-sm">
                  <span className="text-muted-foreground flex-1 break-words">
                    Court rental ({booking.duration} min @{" "}
                    {formatCurrency(booking.pricing.pricePerHour)}/hr)
                  </span>
                  <span className="font-medium whitespace-nowrap">
                    {formatCurrency(booking.pricing.courtSubtotal)}
                  </span>
                </div>

                {/* Equipment rental - detailed breakdown */}
                {booking.pricing.equipment &&
                booking.pricing.equipment.length > 0 ? (
                  <div className="space-y-1">
                    {booking.pricing.equipment.map((item, index) => (
                      <div
                        key={index}
                        className="flex justify-between gap-2 text-xs sm:text-sm"
                      >
                        <span className="text-muted-foreground flex-1 break-words">
                          {item.name} x {item.quantity}{" "}
                          {item.type === "RACKET"
                            ? `(${booking.duration} min)`
                            : item.type === "BALLS"
                            ? "pack(s)"
                            : ""}
                        </span>
                        <span className="font-medium whitespace-nowrap">
                          {formatCurrency(item.subtotal)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}

                {/* Fallback if equipment array not available but subtotal exists */}
                {(!booking.pricing.equipment ||
                  booking.pricing.equipment.length === 0) &&
                booking.pricing.equipmentSubtotal > 0 ? (
                  <div className="flex justify-between gap-2 text-xs sm:text-sm">
                    <span className="text-muted-foreground">
                      Equipment rental
                    </span>
                    <span className="font-medium whitespace-nowrap">
                      {formatCurrency(booking.pricing.equipmentSubtotal)}
                    </span>
                  </div>
                ) : null}

                {/* Voucher discount */}
                {booking.pricing.voucherDiscount != null &&
                  booking.pricing.voucherDiscount > 0 && (
                    <div className="flex justify-between gap-2 text-xs sm:text-sm text-primary">
                      <span>Voucher discount</span>
                      <span className="font-medium whitespace-nowrap">
                        -{formatCurrency(booking.pricing.voucherDiscount)}
                      </span>
                    </div>
                  )}

                {/* Gift card applied */}
                {booking.pricing.giftCardApplied &&
                  booking.pricing.giftCardApplied > 0 && (
                    <div className="flex justify-between gap-2 text-xs sm:text-sm text-primary">
                      <span>Gift card applied</span>
                      <span className="font-medium whitespace-nowrap">
                        -{formatCurrency(booking.pricing.giftCardApplied)}
                      </span>
                    </div>
                  )}

                {/* Total */}
                <div className="flex justify-between gap-2 text-xs sm:text-sm font-semibold pt-2 border-t border-border">
                  <span>
                    {bookingDiscountTotal > 0
                      ? "Total after discounts"
                      : "Total"}
                  </span>
                  <span className="whitespace-nowrap">
                    {formatCurrency(bookingNetTotal)}
                  </span>
                </div>
                {bookingDiscountTotal > 0 && (
                  <div className="text-right text-xs text-muted-foreground">
                    Gross {formatCurrency(booking.pricing?.totalAmount || 0)}
                  </div>
                )}
                {bookingDiscountTotal > 0 && bookingNetTotal === 0 && (
                  <div className="text-right text-xs text-muted-foreground">
                    Fully covered by voucher/gift card
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Add Equipment Button for Upcoming Bookings */}
          {showAddEquipmentButton && canAddEquipment && (
            <div className="mt-4 pt-4 border-t border-border">
              <Button
                variant="default"
                size="sm"
                onClick={handleAddEquipment}
                className="w-full sm:w-auto "
              >
                <Package className="h-4 w-4 mr-2" />
                <span>Add Rackets/Balls</span>
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                Add rackets or ball packs to your booking
              </p>
            </div>
          )}

          {/* {showRescheduleButton && (
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                className={!canEdit ? "opacity-60 cursor-not-allowed" : ""}
                onClick={() => {
                  if (!canEdit) {
                    toaster(
                      "You can only reschedule bookings up to 24 hours before the start time.",
                      { variant: "error" }
                    );
                    return;
                  }
                  pushModal(<RescheduleBookingModal booking={booking} />);
                }}
                title={
                  canEdit
                    ? "Edit this booking"
                    : `Cannot reschedule (less than 24 hours before start)`
                }
              >
                <span className="hidden sm:inline">Edit Booking</span>
                <span className="sm:hidden">Edit</span>
              </Button>
            </div>
          )} */}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 bg-background min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
            My Bookings
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            View and manage your court bookings
          </p>
        </div>
        <Button
          onClick={() => navigate("/customer/book-court")}
          size="sm"
          className="sm:size-default"
        >
          <span className="hidden sm:inline">Book New Court</span>
          <span className="sm:hidden">Book Court</span>
        </Button>
      </div>

      {/* Bookings Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as TabKey)}
      >
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="upcoming">
            Upcoming ({upcomingBookings.length})
          </TabsTrigger>
          <TabsTrigger value="past">Past ({pastBookings.length})</TabsTrigger>
          <TabsTrigger value="cancelled">
            Cancelled ({cancelledBookings.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="space-y-4">
          {/* Rescheduling Policy Alert */}
          {/* <Alert className="bg-accent/10 mt-2 border-accent/30">
            <AlertCircle className="h-4 w-4 text-accent" />
            <AlertTitle className="text-foreground text-sm sm:text-base">
              Rescheduling Policy
            </AlertTitle>
            <AlertDescription className="text-muted-foreground text-xs sm:text-sm">
              You can reschedule your bookings up to 24 hours before the start
              time. The duration and original price will remain the same. You
              can only reschedule to time slots with the same price as your
              original booking.
            </AlertDescription>
          </Alert> */}

          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="p-4 sm:p-6">
                    <div className="h-32 bg-muted animate-pulse rounded" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : upcomingPagination.total === 0 ? (
            <Card>
              <CardContent className="p-8 sm:p-12 text-center">
                <Calendar className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-base sm:text-lg font-semibold mb-2">
                  No upcoming bookings
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground mb-4">
                  You don't have any upcoming court bookings
                </p>
                <Button
                  onClick={() => navigate("/customer/book-court")}
                  size="sm"
                  className="sm:size-default"
                >
                  <span className="hidden sm:inline">Book a Court Now</span>
                  <span className="sm:hidden">Book Now</span>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid gap-4">
                {upcomingPagination.items
                  .filter((booking) => {
                    // Filter out bookings that are related to another booking (already shown in accordion)
                    for (const relatedBookings of multiCourtUpcoming.values()) {
                      if (relatedBookings.some((rb) => rb.id === booking.id)) {
                        return false;
                      }
                    }
                    return true;
                  })
                  .map((booking) => (
                    <BookingCard
                      key={booking.id}
                      booking={booking}
                      showRescheduleButton={true}
                      showAddEquipmentButton={true}
                      isMultiCourt={multiCourtUpcoming.has(booking.id)}
                      relatedBookings={multiCourtUpcoming.get(booking.id) || []}
                    />
                  ))}
              </div>
              <PaginationFooter tab="upcoming" meta={upcomingPagination} />
            </>
          )}
        </TabsContent>

        <TabsContent value="past" className="space-y-4">
          {pastPagination.total === 0 ? (
            <Card>
              <CardContent className="p-8 sm:p-12 text-center">
                <Clock className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-base sm:text-lg font-semibold mb-2">
                  No past bookings
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Your completed bookings will appear here
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid gap-4">
                {pastPagination.items
                  .filter((booking) => {
                    // Filter out bookings that are related to another booking (already shown in accordion)
                    for (const relatedBookings of multiCourtPast.values()) {
                      if (relatedBookings.some((rb) => rb.id === booking.id)) {
                        return false;
                      }
                    }
                    return true;
                  })
                  .map((booking) => (
                    <BookingCard
                      key={booking.id}
                      booking={booking}
                      isMultiCourt={multiCourtPast.has(booking.id)}
                      relatedBookings={multiCourtPast.get(booking.id) || []}
                    />
                  ))}
              </div>
              <PaginationFooter tab="past" meta={pastPagination} />
            </>
          )}
        </TabsContent>

        <TabsContent value="cancelled" className="space-y-4">
          {cancelledPagination.total === 0 ? (
            <Card>
              <CardContent className="p-8 sm:p-12 text-center">
                <XCircle className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-base sm:text-lg font-semibold mb-2">
                  No cancelled bookings
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Your cancelled bookings will appear here
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid gap-4">
                {cancelledPagination.items
                  .filter((booking) => {
                    // Filter out bookings that are related to another booking (already shown in accordion)
                    for (const relatedBookings of multiCourtCancelled.values()) {
                      if (relatedBookings.some((rb) => rb.id === booking.id)) {
                        return false;
                      }
                    }
                    return true;
                  })
                  .map((booking) => (
                    <BookingCard
                      key={booking.id}
                      booking={booking}
                      isMultiCourt={multiCourtCancelled.has(booking.id)}
                      relatedBookings={
                        multiCourtCancelled.get(booking.id) || []
                      }
                    />
                  ))}
              </div>
              <PaginationFooter tab="cancelled" meta={cancelledPagination} />
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default MyBookings;

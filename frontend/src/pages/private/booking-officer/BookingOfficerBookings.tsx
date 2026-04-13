/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { useQuery } from "react-query";
import { motion } from "framer-motion";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { Input } from "src/components/ui/input";
import { Badge } from "src/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "src/components/ui/select";
import { Search, Clock, Check, X, RotateCcw, Users } from "lucide-react";
import bookingService, {
  type BookingRecord,
} from "src/services/booking.service";
import LayoutContainer from "src/components/booking-officer/LayoutContainer";
import { usePermissions } from "src/hooks/usePermissions";

interface BookingGroup {
  id: string;
  bookings: BookingRecord[];
  paymentRef?: string;
  isMultiCourt: boolean;
}

function StatusBadge({ status }: { status: BookingRecord["status"] }) {
  const map: Record<string, { variant: any; icon: any }> = {
    PENDING: { variant: "outline", icon: Clock },
    CONFIRMED: { variant: "default", icon: Check },
    CANCELLED: { variant: "destructive", icon: X },
    COMPLETED: { variant: "secondary", icon: Check },
    NO_SHOW: { variant: "destructive", icon: X },
    REFUNDED: { variant: "outline", icon: RotateCcw },
  };
  const cfg = map[status] || map.PENDING;
  const Icon = cfg.icon;
  return (
    <Badge variant={cfg.variant} className="flex items-center gap-1">
      <Icon className="h-3 w-3" /> {status}
    </Badge>
  );
}

export default function BookingOfficerBookings() {
  const { has } = usePermissions();
  const canView = has("bookings.read");
  const [search, setSearch] = useState("");
  const [date, setDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [status, setStatus] = useState<string>("ALL");

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["officer-bookings", date, status],
    queryFn: () =>
      bookingService.list({
        date,
        status: status === "ALL" ? undefined : (status as any),
      }),
    enabled: canView,
  });

  // Group bookings by payment reference (for multi-court bookings)
  const groupedBookings = useMemo(() => {
    const groups: BookingGroup[] = [];
    const processed = new Set<string>();

    bookings.forEach((booking) => {
      if (processed.has(booking.id)) return;

      const paymentRef = booking.payment?.providerRef;

      // Find related bookings with same payment reference and similar timestamps
      const relatedBookings = paymentRef
        ? bookings.filter(
            (b) =>
              b.payment?.providerRef === paymentRef &&
              !processed.has(b.id) &&
              Math.abs(
                new Date(b.startTime).getTime() -
                  new Date(booking.startTime).getTime()
              ) < 60000 // Within 1 minute
          )
        : [booking];

      relatedBookings.forEach((b) => processed.add(b.id));

      groups.push({
        id: booking.id,
        bookings: relatedBookings,
        paymentRef: paymentRef || undefined,
        isMultiCourt: relatedBookings.length > 1,
      });
    });

    return groups;
  }, [bookings]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return groupedBookings.filter((group) => {
      if (!term) return true;
      return group.bookings.some(
        (b) =>
          b.bookingCode.toLowerCase().includes(term) ||
          (b.court?.name || "").toLowerCase().includes(term) ||
          (b.user
            ? `${b.user.firstName} ${b.user.lastName}`
                .toLowerCase()
                .includes(term)
            : false)
      );
    });
  }, [groupedBookings, search]);

  if (!canView) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        You do not have permission to view bookings.
      </div>
    );
  }

  return (
    <LayoutContainer className="py-4 md:py-6 space-y-4 md:space-y-6">
      <motion.div
        className="flex flex-col gap-2 md:gap-4 md:flex-row md:items-center md:justify-between"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
            Bookings
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-1">
            Monitor and search existing bookings
          </p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <Card>
          <CardHeader className="pb-2 px-4 md:px-6">
            <CardTitle className="text-sm md:text-base font-medium">
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 pt-2 px-4 md:px-6">
            <div className="relative sm:col-span-2 md:col-span-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-10 text-sm"
                placeholder="Search code, court, customer"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="text-sm"
              />
            </div>
            <div>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Status</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="CONFIRMED">Confirmed</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="NO_SHOW">No Show</SelectItem>
                  <SelectItem value="REFUNDED">Refunded</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <motion.button
                className="px-3 py-2 border border-border rounded-lg text-sm hover:bg-muted transition-colors w-full md:w-auto"
                onClick={() => {
                  setDate(format(new Date(), "yyyy-MM-dd"));
                  setStatus("ALL");
                  setSearch("");
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Reset
              </motion.button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
      >
        <Card>
          <CardHeader className="pb-2 px-4 md:px-6">
            <CardTitle className="text-sm md:text-base font-medium">
              Results ({filtered.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto pt-2 px-0 md:px-6">
            {isLoading ? (
              <motion.div
                className="p-8 text-sm text-muted-foreground text-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                Loading...
              </motion.div>
            ) : filtered.length === 0 ? (
              <motion.div
                className="p-8 text-sm text-muted-foreground text-center"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                No bookings found matching your filters
              </motion.div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs md:text-sm border-collapse min-w-[800px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left py-2 px-2 md:px-3 font-medium whitespace-nowrap">
                        Code
                      </th>
                      <th className="text-left py-2 px-2 md:px-3 font-medium whitespace-nowrap">
                        Court(s)
                      </th>
                      <th className="text-left py-2 px-2 md:px-3 font-medium whitespace-nowrap">
                        Customer
                      </th>
                      <th className="text-left py-2 px-2 md:px-3 font-medium whitespace-nowrap">
                        Start
                      </th>
                      <th className="text-left py-2 px-2 md:px-3 font-medium whitespace-nowrap">
                        End
                      </th>
                      <th className="text-left py-2 px-2 md:px-3 font-medium whitespace-nowrap">
                        Status
                      </th>
                      <th className="text-left py-2 px-2 md:px-3 font-medium whitespace-nowrap">
                        M-Pesa Ref
                      </th>
                      <th className="text-left py-2 px-2 md:px-3 font-medium whitespace-nowrap">
                        Booked At
                      </th>
                      <th className="text-left py-2 px-2 md:px-3 font-medium whitespace-nowrap">
                        Racket(s)
                      </th>
                      <th className="text-left py-2 px-2 md:px-3 font-medium whitespace-nowrap">
                        Ball Pack(s)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((group, index) => {
                      const firstBooking = group.bookings[0];
                      const totalRackets = group.bookings.reduce(
                        (sum, b) => sum + (b.rackets?.quantity || 0),
                        0
                      );
                      const totalRacketsAmount = group.bookings.reduce(
                        (sum, b) => sum + (b.rackets?.amount || 0),
                        0
                      );
                      const totalBalls = group.bookings.reduce(
                        (sum, b) => sum + (b.balls?.quantity || 0),
                        0
                      );
                      const totalBallsAmount = group.bookings.reduce(
                        (sum, b) => sum + (b.balls?.amount || 0),
                        0
                      );

                      return (
                        <motion.tr
                          key={group.id}
                          className="border-b border-border hover:bg-muted/50 transition-colors"
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.2, delay: index * 0.03 }}
                        >
                          <td className="py-2 px-2 md:px-3 font-mono">
                            <div className="flex flex-col gap-0.5">
                              {group.bookings.map((b) => (
                                <span key={b.id} className="whitespace-nowrap">
                                  {b.bookingCode}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-2 px-2 md:px-3">
                            <div className="flex items-start gap-1.5">
                              {group.isMultiCourt && (
                                <Badge
                                  variant="secondary"
                                  className="flex items-center gap-1 text-[10px] px-1.5 py-0.5"
                                >
                                  <Users className="h-3 w-3" />
                                  {group.bookings.length}
                                </Badge>
                              )}
                              <div className="flex flex-col gap-0.5">
                                {group.bookings.map((b) => (
                                  <span
                                    key={b.id}
                                    className="whitespace-nowrap"
                                  >
                                    {b.court?.name}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </td>
                          <td className="py-2 px-2 md:px-3">
                            {firstBooking.user
                              ? `${firstBooking.user.firstName} ${firstBooking.user.lastName}`
                              : "Walk-in"}
                          </td>
                          <td className="py-2 px-2 md:px-3 whitespace-nowrap">
                            {format(
                              new Date(firstBooking.startTime),
                              "MMM d, HH:mm"
                            )}
                          </td>
                          <td className="py-2 px-2 md:px-3 whitespace-nowrap">
                            {format(
                              new Date(firstBooking.endTime),
                              "MMM d, HH:mm"
                            )}
                          </td>
                          <td className="py-2 px-2 md:px-3">
                            <StatusBadge status={firstBooking.status} />
                          </td>
                          <td className="py-2 px-2 md:px-3">
                            {firstBooking.payment?.providerRef ? (
                              <span
                                className="font-mono text-xs break-all cursor-pointer hover:text-primary transition-colors"
                                title={firstBooking.payment.providerRef}
                                onClick={() => {
                                  navigator.clipboard.writeText(
                                    firstBooking.payment?.providerRef || ""
                                  );
                                }}
                              >
                                {firstBooking.payment.providerRef}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">
                                —
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-2 md:px-3 whitespace-nowrap">
                            {firstBooking.createdAt ? (
                              <span className="text-xs">
                                {format(
                                  new Date(firstBooking.createdAt),
                                  "MMM d, HH:mm"
                                )}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">
                                —
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-2 md:px-3">
                            {totalRackets > 0 ? (
                              <div className="flex flex-col leading-tight">
                                <span className="font-medium">
                                  {totalRackets}×
                                </span>
                                <span className="text-[10px] md:text-xs text-muted-foreground">
                                  KES {totalRacketsAmount.toLocaleString()}
                                </span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">
                                None
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-2 md:px-3">
                            {totalBalls > 0 ? (
                              <div className="flex flex-col leading-tight">
                                <span className="font-medium">
                                  {totalBalls}×
                                </span>
                                <span className="text-[10px] md:text-xs text-muted-foreground">
                                  KES {totalBallsAmount.toLocaleString()}
                                </span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">
                                None
                              </span>
                            )}
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </LayoutContainer>
  );
}

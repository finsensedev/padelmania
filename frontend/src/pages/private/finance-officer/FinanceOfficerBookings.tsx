import { useContext, useMemo, useState } from "react";
import { useQuery } from "react-query";
import { motion } from "framer-motion";
import { Calendar, Download, Users } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Badge } from "src/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "src/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "src/components/ui/select";
import useNotification from "src/hooks/useNotification";
import { financeOfficerService } from "src/services/financeOfficer.service";
import { useWithTwoFAExport } from "src/utils/withTwoFAExport";
import { downloadBlob, defaultCsvName } from "src/utils/download";
import { SocketContext } from "src/contexts/SocketProvider";
import RangeSelect from "src/components/ui/RangeSelect";
import {
  type ExtendedRange,
  type CustomDateBounds,
  getExtendedRangeBounds,
} from "src/utils/rangeUtils";

interface BookingFilters {
  courtId?: string; // values: ALL | COURT_1 | COURT_2
}

type FoBooking = {
  id: string;
  bookingNumber?: string | null;
  user: { firstName: string; lastName: string; email: string };
  court: { name: string };
  startTime: string;
  endTime: string;
  status:
    | "PENDING"
    | "CONFIRMED"
    | "CHECKED_IN"
    | "COMPLETED"
    | "CANCELLED"
    | "NO_SHOW"
    | string;
  payment?: {
    id: string;
    amount: number;
    status: string;
    method: string;
    createdAt: string;
  } | null;
  totalAmount?: number;
  paidAmount?: number;
  paymentStatus?:
    | "COMPLETED"
    | "FAILED"
    | "CANCELLED"
    | "REFUNDED"
    | "PARTIALLY_REFUNDED"
    | string;
  createdAt: string;
};

export default function FinanceOfficerBookings() {
  const { toaster } = useNotification();
  // text search removed per new requirements
  const [range, setRange] = useState<ExtendedRange>("DAY");
  const [customDates, setCustomDates] = useState<CustomDateBounds>({
    customFrom: "",
    customTo: "",
  });
  const [specificDate, setSpecificDate] = useState("");
  const [filters, setFilters] = useState<BookingFilters>({ courtId: "ALL" });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);

  const { socket } = useContext(SocketContext);
  const { data, isFetching, refetch } = useQuery({
    queryKey: [
      "finance-bookings",
      range,
      customDates,
      specificDate,
      filters.courtId,
      currentPage,
      pageSize,
    ],
    queryFn: async () => {
      const selectedCourtName =
        filters.courtId === "COURT_1"
          ? "Court 1"
          : filters.courtId === "COURT_2"
            ? "Court 2"
            : undefined;
      // If a specific date is chosen, use the daily stats endpoint (includes freeSlots & utilization)
      if (specificDate) {
        const daily = await financeOfficerService.getBookingsByDate(
          specificDate,
          { courtName: selectedCourtName },
        );
        // For consistency with paginated view, also fetch paginated bookings for table (filters/time range still align to the single day)
        const s = new Date(specificDate);
        s.setHours(0, 0, 0, 0);
        const e = new Date(specificDate);
        e.setHours(23, 59, 59, 999);
        const paged = await financeOfficerService.getBookings({
          page: currentPage,
          limit: pageSize,
          startDate: s.toISOString(),
          endDate: e.toISOString(),
          courtName: selectedCourtName,
        });
        const pageBookings = (paged.bookings || []) as FoBooking[];
        const pageRevenue = pageBookings
          .filter((b) => b.payment?.status === "COMPLETED")
          .reduce((sum, b) => sum + Number(b.payment?.amount || 0), 0);
        const averageBookingValue = pageBookings.length
          ? pageRevenue / pageBookings.length
          : 0;
        const mergedStats = {
          totalBookings:
            daily.stats?.totalBookings ??
            paged.pagination?.total ??
            pageBookings.length,
          totalRevenue: pageRevenue,
          averageBookingValue,
          freeSlots: daily.stats?.freeSlots,
          utilizationRate: daily.stats?.utilizationRate,
        };
        return { ...paged, bookings: pageBookings, stats: mergedStats };
      }
      // Period aggregated (without free slot info)
      const { startDate, endDate } = getExtendedRangeBounds(range, customDates);
      const resp = await financeOfficerService.getBookings({
        page: currentPage,
        limit: pageSize,
        startDate,
        endDate,
        courtName: selectedCourtName,
      });
      const bookings = (resp.bookings || []) as FoBooking[];
      const pageRevenue = bookings
        .filter((b) => b.payment?.status === "COMPLETED")
        .reduce((sum, b) => sum + Number(b.payment?.amount || 0), 0);
      const averageBookingValue = bookings.length
        ? pageRevenue / bookings.length
        : 0;
      const stats = {
        totalBookings: resp.pagination?.total ?? bookings.length,
        totalRevenue: pageRevenue,
        averageBookingValue,
        freeSlots: undefined as number | undefined,
        utilizationRate: undefined as number | undefined,
      };
      return { ...resp, stats, bookings };
    },
    keepPreviousData: true,
  });

  // Live updates
  useMemo(() => {
    if (!socket) return;
    const handler = () => refetch();
    socket.on("payments:update", handler);
    socket.on("bookings:update", handler);
    return () => {
      socket.off("payments:update", handler);
      socket.off("bookings:update", handler);
    };
  }, [socket, refetch]);

  const with2FA = useWithTwoFAExport();
  const handleExport = async () => {
    await with2FA(
      async (sessionToken) => {
        try {
          const { startDate, endDate } = specificDate
            ? (() => {
                const d = new Date(specificDate);
                const s = new Date(d);
                s.setHours(0, 0, 0, 0);
                const e = new Date(d);
                e.setHours(23, 59, 59, 999);
                return { startDate: s.toISOString(), endDate: e.toISOString() };
              })()
            : getExtendedRangeBounds(range, customDates);
          const selectedCourtName =
            filters.courtId === "COURT_1"
              ? "Court 1"
              : filters.courtId === "COURT_2"
                ? "Court 2"
                : undefined;
          const blob = await financeOfficerService.exportBookings({
            startDate,
            endDate,
            paymentStatus: undefined,
            courtName: selectedCourtName,
            sessionToken,
          });
          downloadBlob(blob, defaultCsvName("bookings"));
          toaster("Bookings exported", { variant: "success" });
        } catch {
          toaster("Failed to export bookings", { variant: "error" });
        }
      },
      {
        cacheKey: `bookings-${range}-${specificDate || "none"}-${
          filters.courtId
        }`,
        useResultCache: true,
      },
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return "bg-green-100 text-green-800";
      case "CONFIRMED":
        return "bg-blue-100 text-blue-800";
      // no pending
      case "CANCELLED":
        return "bg-red-100 text-red-800";
      case "NO_SHOW":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return "bg-green-100 text-green-800";
      case "PARTIAL":
        return "bg-orange-100 text-orange-800";
      case "PENDING":
        return "bg-yellow-100 text-yellow-800";
      case "FAILED":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 bg-background min-h-screen">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
      >
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            Bookings Management
          </h1>
          <p className="text-sm md:text-base text-muted-foreground">
            View and monitor court bookings and payments
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <RangeSelect
            value={range}
            onChange={setRange}
            customDates={customDates}
            onCustomDatesChange={setCustomDates}
            triggerClassName="w-full sm:w-36"
          />
          <div className="flex items-center gap-2">
            <label className="text-xs md:text-sm text-muted-foreground whitespace-nowrap">
              Court:
            </label>
            <Select
              value={filters.courtId || "ALL"}
              onValueChange={(value) => {
                setFilters((prev) => ({ ...prev, courtId: value }));
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                <SelectItem value="COURT_1">Court 1</SelectItem>
                <SelectItem value="COURT_2">Court 2</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs md:text-sm text-muted-foreground whitespace-nowrap">
              Date:
            </label>
            <Input
              type="date"
              value={specificDate}
              onChange={(e) => {
                setSpecificDate(e.target.value);
                setCurrentPage(1);
              }}
              className="w-auto flex-1"
            />
          </div>
          <Button onClick={handleExport} className="w-full sm:w-auto">
            <Download className="w-4 h-4 mr-2" />
            Export Bookings
          </Button>
        </div>
      </motion.div>

      {/* Stats & Inline Filters */}
      <div className="grid gap-3 md:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {/* Total Bookings */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          whileHover={{ y: -4 }}
        >
          <Card className="relative overflow-hidden touch-manipulation border-0 bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader className="relative z-10 flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs md:text-sm font-medium text-white">
                Total Bookings
              </CardTitle>
              <Calendar className="h-4 w-4 text-white/80" />
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-xl md:text-2xl font-bold text-white">
                {data?.stats?.totalBookings || 0}
              </div>
              <p className="text-xs text-white/80">Within selected range</p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Booking Revenue (page subset) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          whileHover={{ y: -4 }}
        >
          <Card className="relative overflow-hidden touch-manipulation border-0 bg-gradient-to-br from-green-500 to-green-600 text-white shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader className="relative z-10 flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs md:text-sm font-medium text-white">
                Revenue (This Page)
              </CardTitle>
              <Users className="h-4 w-4 text-white/80" />
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-xl md:text-2xl font-bold text-white">
                KSh {data?.stats?.totalRevenue?.toLocaleString() || 0}
              </div>
              <p className="text-xs text-white/80">Completed payments only</p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Average Booking Value */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
          whileHover={{ y: -4 }}
          className="sm:col-span-2 lg:col-span-1"
        >
          <Card className="relative overflow-hidden touch-manipulation border-0 bg-gradient-to-br from-cyan-500 to-cyan-600 text-white shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader className="relative z-10 flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs md:text-sm font-medium text-white">
                Avg Booking Value
              </CardTitle>
              <Calendar className="h-4 w-4 text-white/80" />
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-xl md:text-2xl font-bold text-white">
                KSh{" "}
                {data?.stats?.averageBookingValue
                  ? Math.round(data.stats.averageBookingValue).toLocaleString()
                  : 0}
              </div>
              <p className="text-xs text-white/80">Per booking (page)</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Bookings Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.4 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-lg md:text-xl">Bookings</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {isFetching ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              <>
                <div className="rounded-md border border-border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[150px]">Booking</TableHead>
                        <TableHead className="min-w-[180px]">
                          Customer
                        </TableHead>
                        <TableHead className="min-w-[120px]">Court</TableHead>
                        <TableHead className="min-w-[180px]">Time</TableHead>
                        <TableHead className="min-w-[100px]">Status</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Payment</TableHead>
                        {/* Actions column removed */}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data?.bookings?.map((booking: FoBooking) => (
                        <TableRow key={booking.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">
                                {booking.bookingNumber || booking.id}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {formatDate(booking.createdAt)}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">
                                {booking.user.firstName} {booking.user.lastName}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {booking.user.email}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">
                                {booking.court.name}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <p>
                                {formatTime(booking.startTime)} -{" "}
                                {formatTime(booking.endTime)}
                              </p>
                              <p className="text-muted-foreground">
                                {formatDate(booking.startTime)}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={getStatusColor(booking.status)}>
                              {booking.status.replace("_", " ")}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">
                            <div>
                              <p>
                                KSh{" "}
                                {(
                                  booking.payment?.amount ??
                                  booking.totalAmount ??
                                  0
                                ).toLocaleString()}
                              </p>
                              {booking.paidAmount &&
                                booking.totalAmount &&
                                booking.paidAmount < booking.totalAmount && (
                                  <p className="text-sm text-orange-600">
                                    Paid: KSh{" "}
                                    {booking.paidAmount.toLocaleString()}
                                  </p>
                                )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={getPaymentStatusColor(
                                booking.payment?.status ||
                                  booking.paymentStatus ||
                                  "FAILED",
                              )}
                            >
                              {booking.payment?.status ||
                                booking.paymentStatus ||
                                "FAILED"}
                            </Badge>
                          </TableCell>
                          {/* Actions cell removed */}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mt-4">
                  <p className="text-sm text-muted-foreground">
                    Showing {(currentPage - 1) * pageSize + 1} to{" "}
                    {Math.min(currentPage * pageSize, data?.total || 0)} of{" "}
                    {data?.total || 0} bookings
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <span className="text-sm">
                      Page {currentPage} of{" "}
                      {data?.pagination?.pages || data?.totalPages || 1}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => p + 1)}
                      disabled={
                        currentPage >=
                        (data?.pagination?.pages || data?.totalPages || 1)
                      }
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

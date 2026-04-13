import { useQuery, useMutation, useQueryClient } from "react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { Button } from "src/components/ui/button";
import bookingService from "src/services/booking.service";
import type { BookingRecord as BaseBookingRecord } from "src/services/booking.service";
import { useState } from "react";

// Extend booking record locally to allow REFUNDED status (backend provides it for cancellations view)
type BookingRecord = BaseBookingRecord & {
  status: BaseBookingRecord["status"] | "REFUNDED";
};
import { format } from "date-fns";
import { Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import useTwoFASession from "src/hooks/useTwoFASession";
import useNotification from "src/hooks/useNotification";

export default function AdminBookingCancellations() {
  const qc = useQueryClient();
  const { toaster } = useNotification();
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const { data, isLoading } = useQuery({
    queryKey: ["admin-bookings-cancellations", currentPage],
    queryFn: () =>
      bookingService.listPaginated({
        cancellations: 1,
        page: currentPage,
        limit: itemsPerPage,
      }),
  });

  const items: BookingRecord[] = data?.data || [];
  const pagination = data?.pagination || {
    page: 1,
    limit: itemsPerPage,
    total: 0,
    pages: 0,
  };

  const { obtainSession } = useTwoFASession();
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const session = await obtainSession("permissions");
      if (!session) throw new Error("2FA session required");
      return bookingService.remove(id, session);
    },
    onSuccess: () => {
      toaster("Deleted", { variant: "success" });
      qc.invalidateQueries({ queryKey: ["admin-bookings-cancellations"] });
    },
  });

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < pagination.pages) {
      setCurrentPage(currentPage + 1);
    }
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 bg-background h-full overflow-auto">
      <h1 className="text-2xl font-semibold">Cancelled / Refunded Bookings</h1>
      <Card>
        <CardHeader>
          <CardTitle>List ({pagination.total})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="p-6">Loading...</div>
          ) : items.length === 0 ? (
            <div className="p-6 text-muted-foreground">
              No cancelled or refunded bookings
            </div>
          ) : (
            <>
              <div className="grid gap-3">
                {items.map((b) => (
                  <div
                    key={b.id}
                    className="p-4 border border-border rounded-md flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">
                          {b.court?.name} • {b.bookingCode}
                        </span>
                        {b.status === "REFUNDED" && (
                          <span className="text-xs px-2 py-0.5 rounded bg-success/10 text-success border border-success/20">
                            Refunded
                          </span>
                        )}
                        {b.refundInfo && b.refundInfo.amount > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/10 text-success border border-success/20">
                            Refund KES {b.refundInfo.amount.toFixed(2)}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {format(new Date(b.startTime), "MMM d, HH:mm")} -{" "}
                        {format(new Date(b.endTime), "HH:mm")}
                      </div>
                      <div className="text-xs text-destructive">
                        {b.derivedReason ||
                          b.cancellationReason ||
                          "No reason recorded"}
                      </div>
                      {b.cancelActor && (
                        <div className="text-[11px] text-muted-foreground">
                          {b.cancelActor.type === "REFUND"
                            ? "Refunded"
                            : "Cancelled"}{" "}
                          by {b.cancelActor.name} ({b.cancelActor.role})
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => deleteMutation.mutate(b.id)}
                        disabled={deleteMutation.isLoading}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {pagination.pages > 1 && (
                <div className="flex items-center justify-between gap-2 mt-6 pt-4 border-t border-border">
                  <div className="text-sm text-muted-foreground">
                    Page {pagination.page} of {pagination.pages} (
                    {pagination.total} total)
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handlePreviousPage}
                      disabled={currentPage === 1 || isLoading}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Previous
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleNextPage}
                      disabled={currentPage === pagination.pages || isLoading}
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

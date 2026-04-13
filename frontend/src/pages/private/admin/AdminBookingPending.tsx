import { useQuery, useMutation, useQueryClient } from "react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { Button } from "src/components/ui/button";
import bookingService from "src/services/booking.service";
import { format } from "date-fns";
import useNotification from "src/hooks/useNotification";

export default function AdminBookingPending() {
  const qc = useQueryClient();
  const { toaster } = useNotification();
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["admin-bookings-pending"],
    queryFn: () => bookingService.list({ status: "PENDING" }),
  });

  const confirmMutation = useMutation({
    mutationFn: (id: string) => bookingService.confirm(id),
    onSuccess: () => {
      toaster("Confirmed", { variant: "success" });
      qc.invalidateQueries({ queryKey: ["admin-bookings-pending"] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => bookingService.cancel(id),
    onSuccess: () => {
      toaster("Cancelled", { variant: "success" });
      qc.invalidateQueries({ queryKey: ["admin-bookings-pending"] });
    },
  });

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Pending Bookings</h1>
      <Card>
        <CardHeader>
          <CardTitle>Requests ({items.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="p-6">Loading...</div>
          ) : items.length === 0 ? (
            <div className="p-6 text-muted-foreground">No pending bookings</div>
          ) : (
            <div className="grid gap-3">
              {items.map((b) => (
                <div
                  key={b.id}
                  className="p-4 border rounded-md flex items-center justify-between"
                >
                  <div>
                    <div className="font-medium">
                      {b.court?.name} • {b.bookingCode}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {format(new Date(b.startTime), "MMM d, HH:mm")} -{" "}
                      {format(new Date(b.endTime), "HH:mm")}
                    </div>
                  </div>
                  <div className="space-x-2">
                    <Button
                      size="sm"
                      onClick={() => confirmMutation.mutate(b.id)}
                      disabled={confirmMutation.isLoading}
                    >
                      Confirm
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => cancelMutation.mutate(b.id)}
                      disabled={cancelMutation.isLoading}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "react-query";
import api from "src/utils/api";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { Badge } from "src/components/ui/badge";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Wrench,
  Clock,
  XCircle,
} from "lucide-react";

import { useSelector } from "react-redux";
import type { RootState } from "src/redux/store";
import courtService, {
  type MaintenanceDryRunResponse,
  type MaintenanceDryRunImpactBooking,
} from "src/services/court.service";
import useTwoFASession from "src/hooks/useTwoFASession";

// Types
interface Court {
  id: string;
  name: string;
  isActive: boolean;
  type?: string;
  surface?: string;
}

interface Booking {
  id: string;
  bookingCode: string;
  courtId: string;
  startTime: string;
  endTime: string;
  duration: number;
  status: "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED";
  totalAmount: number;
  numberOfPlayers: number;
}

function AdminCourtMaintenance() {
  const { user } = useSelector((state: RootState) => state.userState);

  const [selectedCourtId, setSelectedCourtId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    // Use local date to avoid UTC offset shifting the day (e.g. EAT = UTC+3)
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  });
  const [startHour, setStartHour] = useState<string>("08:00");
  const [durationHours, setDurationHours] = useState<number>(1);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [preview, setPreview] = useState<MaintenanceDryRunResponse | null>(
    null,
  );
  const [commitResult, setCommitResult] = useState<{
    cancelledCount: number;
    cancelled: MaintenanceDryRunImpactBooking[];
    maintenanceId?: string;
  } | null>(null);
  const queryClient = useQueryClient();
  const twofa = useTwoFASession();

  const messageFromError = (err: unknown, fallback: string) => {
    if (typeof err === "object" && err) {
      const maybe = err as {
        response?: { data?: { message?: string } };
        message?: string;
      };
      return maybe.response?.data?.message || maybe.message || fallback;
    }
    return fallback;
  };

  const {
    data: courts = [],
    isLoading: courtsLoading,
    error: courtsError,
  } = useQuery<Court[]>({
    queryKey: ["admin-maintenance-courts"],
    staleTime: 60_000,
    queryFn: async () => {
      const res = await api.get("/court");
      const data = res?.data?.data ?? res?.data ?? [];
      return Array.isArray(data) ? data : [];
    },
  });

  const bookingsQueryKey: [string, string | undefined, string | undefined] = [
    "admin-maintenance-bookings",
    selectedCourtId || undefined,
    selectedDate || undefined,
  ];

  const {
    data: bookings = [],
    isLoading: bookingsLoading,
    error: bookingsError,
  } = useQuery<Booking[]>({
    queryKey: bookingsQueryKey,
    enabled: Boolean(selectedCourtId && selectedDate),
    queryFn: async () => {
      const res = await api.get(
        `/court/${selectedCourtId}/blackouts?date=${selectedDate}`,
      );
      const data = res?.data?.data ?? res?.data ?? [];
      return Array.isArray(data) ? data : [];
    },
  });

  const selectedCourt = useMemo(
    () => courts.find((c) => c.id === selectedCourtId),
    [courts, selectedCourtId],
  );

  useEffect(() => {
    if (courts.length && !selectedCourtId) {
      setSelectedCourtId(courts[0].id);
    }
  }, [courts, selectedCourtId]);

  // Clear preview when inputs change
  useEffect(() => {
    setPreview(null);
    setCommitResult(null);
  }, [selectedCourtId, selectedDate, startHour, durationHours]);

  const handleToggleCourt = async () => {
    if (!selectedCourt) return;
    setSaving(true);
    setError(null);
    try {
      try {
        await api.patch(`/court/${selectedCourt.id}/toggle` as const);
      } catch {
        await api.put(`/court/${selectedCourt.id}` as const, {
          isActive: !selectedCourt.isActive,
        });
      }
      await queryClient.invalidateQueries(["admin-maintenance-courts"]);
    } catch (e: unknown) {
      setError(messageFromError(e, "Failed to toggle court status"));
    } finally {
      setSaving(false);
    }
  };

  const handleDryRun = async () => {
    if (!user?.id) {
      setError("You must be logged in to create blackouts.");
      return;
    }
    if (!selectedCourtId || !selectedDate || !startHour || durationHours <= 0)
      return;
    if (previewing) return;

    setPreviewing(true);
    setError(null);
    setPreview(null);
    setCommitResult(null);

    try {
      const start = new Date(`${selectedDate}T${startHour}:00`);
      const end = new Date(start);
      end.setHours(end.getHours() + durationHours);

      const res = await courtService.maintenanceDryRun(selectedCourtId, {
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        userId: user.id,
      });

      setPreview(res);
    } catch (e: unknown) {
      setError(messageFromError(e, "Failed to generate impact preview"));
    } finally {
      setPreviewing(false);
    }
  };

  const handleConfirm = async () => {
    if (!preview || confirming) return;
    setConfirming(true);
    setError(null);
    try {
      const session = await twofa.obtainSession("permissions");
      if (!session) {
        setConfirming(false);
        return;
      }

      const res = await courtService.createMaintenance(
        selectedCourtId,
        {
          startTime: preview.proposed.startTime,
          endTime: preview.proposed.endTime,
          userId: user?.id,
        },
        session,
      );

      const cancelled =
        (res.cancelled as unknown as MaintenanceDryRunImpactBooking[]) || [];
      setCommitResult({
        cancelledCount: res.cancelledCount || 0,
        cancelled,
        maintenanceId: (res as unknown as { maintenanceId?: string })
          .maintenanceId,
      });
      setPreview(null);
      await queryClient.invalidateQueries(bookingsQueryKey);
      // Reset form
      setStartHour("08:00");
      setDurationHours(1);
    } catch (e: unknown) {
      setError(messageFromError(e, "Failed to confirm maintenance"));
    } finally {
      setConfirming(false);
    }
  };

  const handleCancelBlackout = async (bookingId: string) => {
    if (!confirm("Cancel this blackout?")) return;
    setSaving(true);
    setError(null);
    try {
      const session = await twofa.obtainSession("permissions");
      if (!session) {
        setSaving(false);
        return;
      }
      await courtService.cancelMaintenance(selectedCourtId, bookingId, session);
      await queryClient.invalidateQueries(bookingsQueryKey);
    } catch (e: unknown) {
      setError(messageFromError(e, "Failed to cancel blackout"));
    } finally {
      setSaving(false);
    }
  };

  const hours = Array.from({ length: 18 }, (_, i) => 6 + i) // 06 -> 23
    .map((h) => `${String(h).padStart(2, "0")}:00`);

  const queryErrorMessage = courtsError
    ? messageFromError(courtsError, "Failed to load courts")
    : bookingsError
      ? messageFromError(bookingsError, "Failed to load maintenance slots")
      : null;

  const displayError = error || queryErrorMessage;

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 bg-background h-full overflow-auto">
      {/* Header */}
      <motion.div
        className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            Court Maintenance
          </h1>
          <p className="text-muted-foreground text-xs md:text-sm">
            Manage blackout windows and court availability.
          </p>
        </div>
        <div className="flex items-center gap-2 md:gap-3 flex-wrap">
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw) {
                const [y, mo, da] = raw.split("-").map(Number);
                const probe = new Date(y, mo - 1, da);
                if (
                  probe.getFullYear() === y &&
                  probe.getMonth() === mo - 1 &&
                  probe.getDate() === da
                ) {
                  setSelectedDate(raw);
                }
              }
            }}
            min={(() => {
              const now = new Date();
              return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
            })()}
            className="h-9 w-auto text-sm"
          />
          <select
            value={selectedCourtId}
            onChange={(e) => setSelectedCourtId(e.target.value)}
            disabled={courtsLoading}
            className="h-9 border border-border rounded-md px-2 text-sm bg-background"
          >
            {courtsLoading ? (
              <option value="" disabled>
                Loading...
              </option>
            ) : (
              courts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))
            )}
          </select>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                queryClient.invalidateQueries(["admin-maintenance-courts"]);
                queryClient.invalidateQueries(bookingsQueryKey);
              }}
            >
              <RefreshCw className="w-4 h-4 md:mr-1" />
              <span className="hidden md:inline">Refresh</span>
            </Button>
          </motion.div>
        </div>
      </motion.div>

      {displayError && (
        <motion.div
          className="bg-destructive/15 text-destructive px-4 py-2 rounded-md text-xs md:text-sm"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2 }}
        >
          {displayError}
        </motion.div>
      )}

      {/* Court Status Card */}
      {selectedCourt && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <Card className="border-l-4 border-l-primary">
            <CardHeader className="pb-3">
              <CardTitle className="text-base md:text-lg flex items-center gap-2">
                <Wrench className="w-5 h-5" />
                Court Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div>
                    <p className="font-semibold text-sm md:text-base">
                      {selectedCourt.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Court {selectedCourt.surface}
                    </p>
                  </div>
                  <Badge
                    variant={selectedCourt.isActive ? "default" : "secondary"}
                    className="text-xs"
                  >
                    {selectedCourt.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <Button
                  type="button"
                  variant={selectedCourt.isActive ? "outline" : "default"}
                  onClick={handleToggleCourt}
                  disabled={saving || !selectedCourt}
                  size="sm"
                >
                  {selectedCourt.isActive ? "Disable Court" : "Enable Court"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Create Blackout */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
      >
        <Card className="border-l-4 border-l-green-500">
          <CardHeader>
            <CardTitle className="text-lg md:text-xl flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Create Blackout Window
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
              <div className="space-y-1 col-span-1">
                <label className="text-xs font-medium">Start Time</label>
                <select
                  value={startHour}
                  onChange={(e) => setStartHour(e.target.value)}
                  className="h-9 border border-border rounded-md px-2 text-sm w-full bg-background"
                >
                  {hours.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1 col-span-1">
                <label className="text-xs font-medium">Duration (h)</label>
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={durationHours}
                  onChange={(e) =>
                    setDurationHours(
                      Math.max(1, Math.min(12, Number(e.target.value) || 1)),
                    )
                  }
                  className="h-9"
                />
              </div>
              <div className="flex items-end gap-2 col-span-1 sm:col-span-2">
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex-1"
                >
                  <Button
                    type="button"
                    onClick={handleDryRun}
                    disabled={previewing || !selectedCourtId || !!preview}
                    className="bg-green-600 hover:bg-green-700 w-full h-9 text-sm"
                  >
                    {previewing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Checking...
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-4 h-4 mr-2" />
                        Preview Impact
                      </>
                    )}
                  </Button>
                </motion.div>
                {preview && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.2 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex-1"
                  >
                    <Button
                      type="button"
                      onClick={handleConfirm}
                      disabled={confirming}
                      className="bg-green-700 hover:bg-green-800 w-full h-9 text-sm"
                    >
                      {confirming ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Confirming...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                          Confirm Blackout
                        </>
                      )}
                    </Button>
                  </motion.div>
                )}
              </div>
            </div>

            {/* Preview Section */}
            {preview && (
              <motion.div
                className="rounded-md border-2 border-green-500 dark:border-green-600 bg-white dark:bg-green-600 p-3 md:p-4 text-sm space-y-3"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
              >
                <div className="flex items-center gap-2 font-bold text-green-900 dark:text-white text-base">
                  <AlertTriangle className="w-5 h-5" />
                  Impact Preview
                </div>
                <div className="space-y-2">
                  <p className="text-gray-900 dark:text-white font-semibold">
                    <strong className="text-green-900 dark:text-white ">
                      Duration:
                    </strong>{" "}
                    {preview.proposed.durationMinutes} minutes
                  </p>
                  <p className="text-gray-900 dark:text-white font-semibold">
                    <strong className="text-green-900 dark:text-white ">
                      Affected bookings:
                    </strong>{" "}
                    {preview.impact.total}{" "}
                    {preview.impact.paid > 0 && (
                      <span className="text-red-700  font-bold">
                        ({preview.impact.paid} paid)
                      </span>
                    )}
                  </p>
                </div>
                {preview.impact.bookings.length > 0 && (
                  <div className="space-y-2">
                    <p className="font-bold text-gray-900 ">
                      Bookings to be cancelled:
                    </p>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {preview.impact.bookings.map((b) => (
                        <div
                          key={b.id}
                          className="text-sm bg-white p-3 rounded border-2 border-green-200 dark:border-green-700 shadow-sm"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-bold text-gray-900 ">
                                <strong>Code:</strong> {b.bookingCode}
                              </div>
                              {b.customerName && (
                                <div className="text-gray-700 text-xs mt-1 font-medium">
                                  {b.customerName}
                                </div>
                              )}
                            </div>
                            {b.paid && (
                              <Badge
                                variant="destructive"
                                className="text-xs font-bold"
                              >
                                PAID
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <p className="text-sm text-gray-800 dark:text-white italic font-semibold border-t border-green-200 pt-2">
                  Click "Confirm Blackout" to proceed. All affected bookings
                  will be cancelled and refunds issued automatically via M-Pesa
                  B2C.
                </p>
              </motion.div>
            )}

            {/* Commit Result Section */}
            {commitResult && (
              <motion.div
                className="rounded-md border-2 border-green-500 bg-green-50 dark:bg-green-950/30 dark:border-green-600 p-3 md:p-4 text-sm space-y-3"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
              >
                <div className="flex items-center gap-2 font-bold text-green-900 dark:text-green-100 text-base">
                  <CheckCircle2 className="w-5 h-5" />
                  Blackout Created Successfully
                </div>
                <p className="text-gray-900 dark:text-gray-100 font-semibold">
                  {commitResult.cancelledCount} booking(s) cancelled. Automatic
                  refunds have been initiated via M-Pesa B2C.
                </p>
                {commitResult.cancelled?.length > 0 && (
                  <div className="space-y-2">
                    <p className="font-bold text-gray-900 dark:text-gray-100">
                      Cancelled bookings:
                    </p>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {commitResult.cancelled.map((c, idx) => (
                        <div
                          key={idx}
                          className="text-sm bg-white dark:bg-gray-800 p-2 rounded border-2 border-green-200 dark:border-green-700 font-mono font-bold text-gray-900 dark:text-gray-100 shadow-sm"
                        >
                          {c.bookingCode}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCommitResult(null)}
                  className="w-full font-semibold border-2"
                >
                  Dismiss
                </Button>
              </motion.div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Existing Blackouts */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-lg md:text-xl">
              Maintenance Windows
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {new Date(selectedDate).toLocaleDateString("en-KE", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          </CardHeader>
          <CardContent>
            {bookingsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : displayError ? (
              <div className="bg-destructive/15 text-destructive px-3 md:px-4 py-2.5 md:py-3 rounded-md text-xs md:text-sm">
                {displayError}
              </div>
            ) : bookings.length === 0 ? (
              <motion.div
                className="text-xs md:text-sm text-muted-foreground py-8 text-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                No maintenance windows for this date
              </motion.div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {bookings.map((b, index) => {
                  const start = new Date(b.startTime);
                  const end = new Date(b.endTime);
                  const durationMinutes = Math.round(
                    (end.getTime() - start.getTime()) / 60000,
                  );
                  const durationText =
                    durationMinutes >= 60
                      ? `${Math.floor(durationMinutes / 60)}h ${
                          durationMinutes % 60 > 0
                            ? `${durationMinutes % 60}min`
                            : ""
                        }`.trim()
                      : `${durationMinutes} min`;

                  const timeRange = `${start.toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  })} - ${end.toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  })}`;

                  return (
                    <motion.div
                      key={b.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                      whileHover={{ x: 4 }}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 md:p-4 rounded-md border bg-orange-50 border-orange-200 dark:bg-orange-950/20 dark:border-orange-900 gap-3 hover:shadow-md transition-all"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 md:gap-3">
                        <Wrench className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                        <div className="font-mono text-sm md:text-base font-semibold">
                          {timeRange}
                        </div>
                        <Badge variant="secondary" className="text-xs w-fit">
                          {durationText}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant="outline"
                          className="text-xs border-orange-300 dark:border-orange-700"
                        >
                          MAINTENANCE
                        </Badge>
                        <motion.div
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCancelBlackout(b.id)}
                            disabled={saving}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs h-7 md:h-8"
                          >
                            <XCircle className="w-3 h-3 mr-1" />
                            Cancel
                          </Button>
                        </motion.div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

export default AdminCourtMaintenance;

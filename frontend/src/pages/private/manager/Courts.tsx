import { useState, useEffect, useCallback, useMemo } from "react";
import {
  format,
  differenceInCalendarDays,
  startOfDay,
  setHours,
  setMinutes,
  isBefore,
  getDay,
} from "date-fns";
import courtService, {
  type CourtRecord,
  type CourtDayStats,
  type MaintenanceWindow,
  type MaintenanceDryRunResponse,
  type MaintenanceDryRunImpactBooking,
} from "src/services/court.service";
import systemConfigService, {
  type OperatingHoursConfig,
  type OperatingDayConfig,
  DEFAULT_OPERATING_HOURS,
} from "src/services/system-config.service";
import { Button } from "src/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "src/components/ui/card";
import { Input } from "src/components/ui/input";
import { Badge } from "src/components/ui/badge";
import { useSelector } from "react-redux";
import type { RootState } from "src/redux/store";
import useTwoFASession from "src/hooks/useTwoFASession";
import useNotification from "src/hooks/useNotification";
import {
  Calendar as CalendarIcon,
  Wrench,
  Activity,
  DollarSign,
  PlusCircle,
  RefreshCw,
} from "lucide-react";
import { motion } from "framer-motion";

// (legacy types removed after refactor)

export default function ManagerCourts() {
  const { user } = useSelector((s: RootState) => s.userState);
  const { toaster } = useNotification();
  const [courts, setCourts] = useState<CourtRecord[]>([]);
  const [selectedCourtId, setSelectedCourtId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    // Use local date to avoid UTC offset shifting the day (e.g. EAT = UTC+3)
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  });
  const [stats, setStats] = useState<CourtDayStats | null>(null);
  // loading state reserved for future composed network calls (not used now)
  const [maintenance, setMaintenance] = useState<MaintenanceWindow[]>([]);
  const [startHour, setStartHour] = useState<string>("");
  const [duration, setDuration] = useState<number>(1);
  // creating: specifically for the create maintenance action so we can unlock if 2FA cancelled/failed
  const [creating, setCreating] = useState(false); // for dry run generation
  const [confirming, setConfirming] = useState(false); // for final confirm path
  // removing: for remove maintenance action
  const [removing, setRemoving] = useState<string | null>(null);
  // conflicts legacy placeholder removed (dry run now handles impact)
  const [preview, setPreview] = useState<MaintenanceDryRunResponse | null>(
    null,
  );
  const [commitResult, setCommitResult] = useState<{
    cancelledCount: number;
    cancelled: MaintenanceDryRunImpactBooking[];
    maintenanceId?: string;
  } | null>(null);
  const twofa = useTwoFASession();
  const [operatingHours, setOperatingHours] = useState<OperatingHoursConfig>(
    DEFAULT_OPERATING_HOURS,
  );

  // Load operating hours on mount
  useEffect(() => {
    const loadOperatingHours = async () => {
      try {
        const hours = await systemConfigService.getOperatingHours();
        setOperatingHours(hours);
      } catch {
        // Use default hours if fetch fails
      }
    };
    loadOperatingHours();
  }, []);

  // Get operating hours for the selected date
  const selectedDayConfig = useMemo((): OperatingDayConfig => {
    const selectedDateObj = new Date(selectedDate);
    const dayOfWeek = getDay(selectedDateObj);
    return (
      operatingHours.days.find((d) => d.dayOfWeek === dayOfWeek) ||
      operatingHours.days[0]
    );
  }, [selectedDate, operatingHours]);

  // Parse time string to minutes from midnight
  const parseTimeToMinutes = (time: string): number => {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
  };

  // Check if close time extends past midnight (e.g., "01:00" means next day)
  const closeTimeExtendsPastMidnight = useMemo((): boolean => {
    const closeMinutes = parseTimeToMinutes(selectedDayConfig.closeTime);
    const openMinutes = parseTimeToMinutes(selectedDayConfig.openTime);
    // If close time is less than open time, it extends past midnight
    return closeMinutes < openMinutes;
  }, [selectedDayConfig]);

  // Generate time slots dynamically based on operating hours for the selected day
  const timeSlots = useMemo(() => {
    const now = new Date();
    const selectedDateObj = new Date(selectedDate);
    const isToday =
      differenceInCalendarDays(startOfDay(selectedDateObj), startOfDay(now)) ===
      0;
    const nowMinusTolerance = new Date(now.getTime() - 5 * 60 * 1000);

    const openMinutes = parseTimeToMinutes(selectedDayConfig.openTime);
    const closeMinutes = parseTimeToMinutes(selectedDayConfig.closeTime);

    const allSlots: string[] = [];

    // Generate slots from open time to either midnight or close time
    // If close extends past midnight, generate up to 23:30, then add next-day slots
    const endOfDayMinutes = closeTimeExtendsPastMidnight
      ? 24 * 60
      : closeMinutes;

    // Generate same-day slots (from open time up to end of day or close time)
    for (let minutes = openMinutes; minutes < endOfDayMinutes; minutes += 30) {
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      allSlots.push(
        `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
      );
    }

    // If close time extends past midnight, add next-day slots (00:00, 00:30, etc.)
    if (closeTimeExtendsPastMidnight) {
      for (let minutes = 0; minutes < closeMinutes; minutes += 30) {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        allSlots.push(
          `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
        );
      }
    }

    if (!isToday) {
      return allSlots;
    }

    // Filter out past times for today
    return allSlots.filter((time) => {
      const [h, m] = time.split(":").map(Number);
      // For times before the opening hour (next-day slots), always available today
      if (h < Math.floor(openMinutes / 60)) return true;
      const slotStart = setMinutes(setHours(new Date(selectedDateObj), h), m);
      return !isBefore(slotStart, nowMinusTolerance);
    });
  }, [selectedDate, selectedDayConfig, closeTimeExtendsPastMidnight]);

  // Calculate maximum duration based on start time and operating hours for the day
  const maxDuration = useMemo(() => {
    const openMinutes = parseTimeToMinutes(selectedDayConfig.openTime);
    const closeMinutes = parseTimeToMinutes(selectedDayConfig.closeTime);

    // Calculate end of operating hours in terms of minutes from day start
    // If close extends past midnight, add 24 hours to close minutes
    const endOfOperatingHours = closeTimeExtendsPastMidnight
      ? 24 * 60 + closeMinutes
      : closeMinutes;

    // Default max duration when no start hour selected
    const defaultMaxHours = (endOfOperatingHours - openMinutes) / 60;
    if (!startHour) return defaultMaxHours;

    const [hours, minutes] = startHour.split(":").map(Number);
    const startMinutes = hours * 60 + minutes;
    // For times after midnight (00:xx), they're at 24:xx in terms of the day's timeline
    const adjustedStartMinutes =
      hours < Math.floor(openMinutes / 60)
        ? 24 * 60 + startMinutes
        : startMinutes;
    const maxMinutes = endOfOperatingHours - adjustedStartMinutes;
    return Math.max(0.5, maxMinutes / 60); // Convert to hours, minimum 0.5
  }, [startHour, selectedDayConfig, closeTimeExtendsPastMidnight]);

  const handleIncrementDuration = () => {
    setDuration((prev) => Math.min(maxDuration, prev + 0.5));
  };

  const handleDecrementDuration = () => {
    setDuration((prev) => Math.max(0.5, prev - 0.5));
  };

  // Adjust duration if it exceeds max when start time changes
  useEffect(() => {
    if (duration > maxDuration) {
      setDuration(maxDuration);
    }
  }, [duration, maxDuration]);

  const formatDuration = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}m`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
  };

  const loadCourts = useCallback(async () => {
    try {
      const list = await courtService.list();
      setCourts(list);
      if (!selectedCourtId && list.length) setSelectedCourtId(list[0].id);
    } catch {
      toaster("Failed to load courts", { variant: "error" });
    }
  }, [selectedCourtId, toaster]);
  const loadStats = useCallback(async () => {
    if (!selectedCourtId) return;
    try {
      const s = await courtService.dayStats(selectedCourtId, selectedDate);
      setStats(s);
    } catch {
      /* noop */
    }
  }, [selectedCourtId, selectedDate]);
  const loadMaintenance = useCallback(async () => {
    if (!selectedCourtId) return;
    try {
      const m = await courtService.listMaintenance(
        selectedCourtId,
        selectedDate,
      );
      setMaintenance(m);
    } catch {
      /* noop */
    }
  }, [selectedCourtId, selectedDate]);
  useEffect(() => {
    loadCourts();
  }, [loadCourts]);
  useEffect(() => {
    loadStats();
    loadMaintenance();
  }, [loadStats, loadMaintenance]);

  // Set initial startHour or reset if it's no longer in the available time slots
  useEffect(() => {
    if (!startHour || !timeSlots.includes(startHour)) {
      setStartHour(timeSlots[0] || "");
    }
  }, [timeSlots, startHour]);

  const handleDryRun = async () => {
    if (!selectedCourtId || !startHour || !duration || creating) return;
    setCreating(true);
    setPreview(null);
    setCommitResult(null);
    try {
      // Parse the time correctly to include both hours and minutes
      const [hours, minutes] = startHour.split(":").map(Number);
      // Create date in local timezone by parsing date components
      const [year, month, day] = selectedDate.split("-").map(Number);

      // Determine if this is a "next day" slot (for times past midnight like 00:00, 00:30)
      // A slot is "next day" if close extends past midnight AND the hour is before the open hour
      const openHour = Math.floor(
        parseTimeToMinutes(selectedDayConfig.openTime) / 60,
      );
      const isNextDaySlot = closeTimeExtendsPastMidnight && hours < openHour;

      let start: Date;
      if (isNextDaySlot) {
        // Next day for post-midnight slots
        start = new Date(year, month - 1, day + 1, hours, minutes, 0, 0);
      } else {
        start = new Date(year, month - 1, day, hours, minutes, 0, 0);
      }

      const end = new Date(start);
      // Add duration in minutes to handle 30-minute intervals properly
      end.setMinutes(end.getMinutes() + duration * 60);

      const res = await courtService.maintenanceDryRun(selectedCourtId, {
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        userId: user?.id,
      });
      setPreview(res);
    } catch (err) {
      // Show the backend error message if available, otherwise use generic message
      const errorMessage =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Failed to generate impact preview";
      toaster(errorMessage, { variant: "error" });
    } finally {
      setCreating(false);
    }
  };

  const handleConfirm = async () => {
    if (!preview || confirming) return;
    setConfirming(true);
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
      await Promise.all([loadMaintenance(), loadStats()]);
      setStartHour("08:00");
      setDuration(1);
      toaster("Maintenance window created successfully", {
        variant: "success",
      });
    } catch {
      toaster("Failed to confirm maintenance", { variant: "error" });
    } finally {
      setConfirming(false);
    }
  };

  const handleRemove = async (id: string) => {
    if (removing) return; // avoid double

    setRemoving(id);
    try {
      const session = await twofa.obtainSession("permissions");
      if (!session) {
        setRemoving(null);
        return; // cancelled 2FA -> just unlock
      }
      await courtService.cancelMaintenance(selectedCourtId, id, session);
      await Promise.all([loadMaintenance(), loadStats()]);
      toaster("Maintenance window removed successfully", {
        variant: "success",
      });
    } catch {
      toaster("Failed to remove maintenance", { variant: "error" });
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="flex flex-col gap-4 md:gap-6 p-4 md:p-6">
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
            Manage blackout windows and see impact.
          </p>
        </div>
        <div className="flex items-center gap-2 md:gap-3 flex-wrap">
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => {
              const raw = e.target.value; // YYYY-MM-DD
              if (raw) {
                // Reject overflow dates (e.g. Feb 29 in a non-leap year)
                const [y, mo, da] = raw.split("-").map(Number);
                const probe = new Date(y, mo - 1, da);
                if (
                  probe.getFullYear() === y &&
                  probe.getMonth() === mo - 1 &&
                  probe.getDate() === da
                ) {
                  setSelectedDate(raw);
                }
                // else: invalid date (overflow) — silently ignore, keep current value
              }
            }}
            className="h-9 w-auto text-sm"
          />
          <select
            value={selectedCourtId}
            onChange={(e) => setSelectedCourtId(e.target.value)}
            className="h-9 border border-border rounded-md px-2 text-sm bg-background"
          >
            {courts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                loadStats();
                loadMaintenance();
              }}
            >
              <RefreshCw className="w-4 h-4 md:mr-1" />
              <span className="hidden md:inline">Refresh</span>
            </Button>
          </motion.div>
        </div>
      </motion.div>

      <div className="grid gap-3 md:gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={CalendarIcon}
          label="Booked Slots"
          value={stats?.bookedSlots ?? 0}
          helper="Per hour blocks"
          delay={0.1}
          variant="purple"
        />
        <StatCard
          icon={Activity}
          label="Free Slots"
          value={stats?.freeSlots ?? 0}
          helper="Available"
          delay={0.2}
          variant="teal"
        />
        <StatCard
          icon={Wrench}
          label="Maintenance"
          value={stats?.maintenanceSlots ?? 0}
          helper="Blocked hours"
          delay={0.3}
          variant="orange"
        />
        <StatCard
          icon={DollarSign}
          label="Avg Income"
          value={`KSh ${(stats?.averageIncome || 0).toLocaleString()}`}
          helper="Per booking"
          delay={0.4}
          variant="green"
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 md:gap-6 items-start">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.5 }}
        >
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-lg md:text-xl">
                Maintenance Windows
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-96 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-muted-foreground/30 scrollbar-track-muted/30">
                {maintenance.length === 0 && (
                  <motion.div
                    className="flex flex-col items-center justify-center py-12 text-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                  >
                    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-3">
                      <Wrench className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      No maintenance windows for this date
                    </p>
                  </motion.div>
                )}
                {maintenance.map((m, index) => {
                  const s = new Date(m.startTime);
                  const e = new Date(m.endTime);
                  return (
                    <motion.div
                      key={m.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                          <Wrench className="w-5 h-5 text-orange-500" />
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1">
                          <Badge
                            variant="secondary"
                            className="text-sm font-mono whitespace-nowrap w-fit"
                          >
                            {format(s, "HH:mm")} - {format(e, "HH:mm")}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {((e.getTime() - s.getTime()) / 3600000)
                              .toFixed(1)
                              .replace(".0", "")}
                            h duration
                          </span>
                        </div>
                      </div>
                      <motion.div
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={removing === m.id}
                          onClick={() => handleRemove(m.id)}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 w-full sm:w-auto h-10"
                        >
                          {removing === m.id && (
                            <span className="w-4 h-4 border-2 border-destructive/40 border-t-destructive rounded-full animate-spin mr-2" />
                          )}
                          <span>Remove</span>
                        </Button>
                      </motion.div>
                    </motion.div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.5 }}
        >
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-lg md:text-xl flex items-center gap-2">
                <PlusCircle className="w-5 h-5" />
                Create Maintenance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                {/* Time and Duration Controls */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Start Time</label>
                    <select
                      value={startHour}
                      onChange={(e) => setStartHour(e.target.value)}
                      className="h-10 border border-border rounded-md px-3 text-sm w-full bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {timeSlots.map((time) => (
                        <option key={time} value={time}>
                          {time}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Duration (hours)
                    </label>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleDecrementDuration}
                        disabled={duration <= 0.5}
                        className="h-10 w-10 p-0 flex-shrink-0"
                      >
                        -
                      </Button>
                      <div className="flex-1 h-10 border border-border rounded-md px-3 text-sm flex items-center justify-center font-semibold bg-background">
                        {duration}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleIncrementDuration}
                        disabled={duration >= maxDuration}
                        className="h-10 w-10 p-0 flex-shrink-0"
                      >
                        +
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Helper message for existing maintenance */}
                {maintenance.length > 0 && !preview && !commitResult && (
                  <motion.div
                    className="bg-destructive/10 border border-accent/20 rounded-lg p-3 text-sm"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <div className="flex items-start gap-2">
                      <Wrench className="w-4 h-4 text-destructive  flex-shrink-0 mt-0.5" />
                      <div className="text-destructive">
                        <p className="font-medium mb-1">
                          Maintenance already scheduled
                        </p>
                        <p className="text-xs text-destructive">
                          This date has existing maintenance windows. Creating
                          overlapping maintenance will be blocked. Remove
                          existing maintenance first if you need to reschedule.
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Action Buttons */}
                <div>
                  {!preview && !commitResult && (
                    <motion.div
                      className="w-full"
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                    >
                      <Button
                        disabled={creating || !selectedCourtId || !startHour}
                        onClick={handleDryRun}
                        className="w-full h-11 flex items-center justify-center gap-2 text-base"
                      >
                        {creating && (
                          <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        )}
                        <PlusCircle className="w-5 h-5" />
                        <span>Preview Impact</span>
                      </Button>
                    </motion.div>
                  )}
                  {preview && (
                    <motion.div
                      className="flex gap-3 w-full"
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <motion.div
                        className="flex-1"
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                      >
                        <Button
                          variant="outline"
                          className="w-full h-11 text-base"
                          onClick={() => setPreview(null)}
                          disabled={confirming}
                        >
                          Adjust
                        </Button>
                      </motion.div>
                      <motion.div
                        className="flex-1"
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                      >
                        <Button
                          className="w-full h-11 text-base"
                          onClick={handleConfirm}
                          disabled={confirming}
                        >
                          {confirming && (
                            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin mr-2" />
                          )}
                          Confirm
                        </Button>
                      </motion.div>
                    </motion.div>
                  )}
                </div>
              </div>
              {preview && (
                <motion.div
                  className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-primary" />
                    <span className="font-semibold text-base text-primary">
                      Impact Preview
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Window:</span>
                      <span className="font-mono font-semibold">
                        {format(new Date(preview.proposed.startTime), "HH:mm")}{" "}
                        - {format(new Date(preview.proposed.endTime), "HH:mm")}
                      </span>
                      <Badge variant="outline" className="ml-auto">
                        {formatDuration(preview.proposed.durationMinutes)}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2 text-sm">
                      <Wrench className="w-4 h-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Impact:</span>
                      <span className="font-semibold">
                        {preview.impact.total} booking(s)
                      </span>
                      {preview.impact.paid > 0 && (
                        <Badge variant="destructive" className="ml-auto">
                          {preview.impact.paid} paid
                        </Badge>
                      )}
                    </div>
                  </div>

                  {preview.impact.bookings.length > 0 && (
                    <details className="group">
                      <summary className="cursor-pointer font-medium text-sm hover:text-primary transition-colors list-none flex items-center gap-2">
                        <span className="transform transition-transform group-open:rotate-90">
                          ▶
                        </span>
                        Affected Bookings ({preview.impact.bookings.length})
                      </summary>
                      <ul className="mt-2 space-y-2 pl-6">
                        {preview.impact.bookings.map((b) => {
                          return (
                            <li
                              key={b.id}
                              className="text-sm border-l-2 border-muted pl-3 py-1"
                            >
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-xs font-semibold">
                                  {b.bookingCode}
                                </span>
                                <span className="text-muted-foreground">
                                  {b.customerName || b.email || "Customer"}
                                </span>
                                {b.paid && (
                                  <Badge
                                    variant="secondary"
                                    className="text-xs"
                                  >
                                    Paid
                                  </Badge>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                Ref: {b.paymentRef || "—"} • Amt:{" "}
                                {b.amount ?? "—"} • Status: {b.status}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </details>
                  )}

                  <p className="text-xs text-muted-foreground pt-2 border-t border-border">
                    💡 Confirm to cancel these bookings and lock the court.
                  </p>
                </motion.div>
              )}
              {commitResult && (
                <motion.div
                  className="rounded-lg border border-primary p-4 space-y-3"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                      <svg
                        className="w-5 h-5 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                    <span className="font-semibold text-base text-primary ">
                      Maintenance Created Successfully
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-primary ">
                    <span>Cancelled bookings:</span>
                    <Badge
                      variant="secondary"
                      className="bg-primary text-white"
                    >
                      {commitResult.cancelledCount}
                    </Badge>
                  </div>

                  {commitResult.cancelled?.length > 0 && (
                    <details className="group">
                      <summary className="cursor-pointer font-medium text-sm text-primary  hover:text-primary-dark dark:hover:text-primary-light transition-colors list-none flex items-center gap-2">
                        <span className="transform transition-transform group-open:rotate-90">
                          ▶
                        </span>
                        View Cancellations ({commitResult.cancelled.length})
                      </summary>
                      <ul className="mt-2 space-y-1 pl-6">
                        {commitResult.cancelled.map((b) => (
                          <li
                            key={b.id || b.bookingCode}
                            className="text-sm text-primary"
                          >
                            <span className="font-mono text-xs font-semibold">
                              {b.bookingCode}
                            </span>{" "}
                            • {b.email || b.phone || "N/A"}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}

                  <motion.button
                    onClick={() => setCommitResult(null)}
                    className="text-sm font-medium underline text-primary dark:text-primary-light hover:text-primary-dark dark:hover:text-primary-light mt-2"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Dismiss
                  </motion.button>
                </motion.div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}

interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  helper?: string;
  delay?: number;
  variant?: "purple" | "teal" | "green" | "orange" | "blue" | "indigo";
}

const variantClasses = {
  purple: "bg-gradient-to-br from-purple-500 to-purple-600",
  teal: "bg-gradient-to-br from-cyan-500 to-cyan-600",
  green: "bg-gradient-to-br from-green-500 to-green-600",
  orange: "bg-gradient-to-br from-orange-500 to-orange-600",
  blue: "bg-gradient-to-br from-blue-500 to-blue-600",
  indigo: "bg-gradient-to-br from-indigo-500 to-indigo-600",
};

function StatCard({
  icon: Icon,
  label,
  value,
  helper,
  delay = 0,
  variant = "purple",
}: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      whileHover={{ y: -4 }}
    >
      <div
        className={`relative overflow-hidden touch-manipulation ${variantClasses[variant]} text-white border border-slate-300/20 hover:shadow-md transition-shadow p-4 md:p-6 rounded-xl h-full`}
      >
        <div className="absolute inset-0 bg-white/10 transform -skew-y-6"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_50%,_rgba(255,255,255,0.1)_0px,_transparent_40%)]"></div>
        <div className="relative z-10">
          <div className="pb-2 flex flex-row items-center justify-between space-y-0">
            <div className="text-xs md:text-sm font-medium flex items-center gap-2">
              <Icon className="w-4 h-4 md:w-5 md:h-5 text-white" />
              <span className="hidden sm:inline text-white">{label}</span>
              <span className="sm:hidden text-white">
                {label.split(" ")[0]}
              </span>
            </div>
          </div>
          <div>
            <div className="text-xl md:text-2xl font-bold tabular-nums text-white">
              {value}
            </div>
            {helper && <p className="text-xs text-white/80 mt-1">{helper}</p>}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

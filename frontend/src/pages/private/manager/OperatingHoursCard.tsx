import { useEffect, useMemo, useState } from "react";
import { Clock4, RefreshCcw, Save, CheckCircle2, Loader2 } from "lucide-react";
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
import { Switch } from "src/components/ui/switch";
import { Badge } from "src/components/ui/badge";
import { Alert, AlertDescription } from "src/components/ui/alert";
import useNotification from "src/hooks/useNotification";
import useWithTwoFA from "src/hooks/useWithTwoFA";
import { useSystemConfig } from "src/hooks/useSystemConfig";
import systemConfigService, {
  DEFAULT_OPERATING_HOURS,
} from "src/services/system-config.service";
import type {
  OperatingDayConfig,
  OperatingHoursConfig,
} from "src/services/system-config.service";

const DAYS = [
  { label: "Sunday", value: 0 },
  { label: "Monday", value: 1 },
  { label: "Tuesday", value: 2 },
  { label: "Wednesday", value: 3 },
  { label: "Thursday", value: 4 },
  { label: "Friday", value: 5 },
  { label: "Saturday", value: 6 },
];

// Generate time options in 30-minute increments (00:00 to 23:30)
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const hour = Math.floor(i / 2);
  const minute = (i % 2) * 30;
  return `${hour.toString().padStart(2, "0")}:${minute
    .toString()
    .padStart(2, "0")}`;
});

const timePattern = /^([01]\d|2[0-3]):(00|30)$/;

function sortDays(days: OperatingDayConfig[]): OperatingDayConfig[] {
  return [...days].sort((a, b) => a.dayOfWeek - b.dayOfWeek);
}

function normalizeDay(day: OperatingDayConfig): OperatingDayConfig {
  return {
    ...day,
    isClosed: Boolean(day.isClosed),
  };
}

export default function OperatingHoursCard() {
  const { toaster } = useNotification();
  const { withTwoFA } = useWithTwoFA();
  const {
    operatingHoursConfig,
    isLoading: configLoading,
    refreshConfig,
  } = useSystemConfig();

  const [timezone, setTimezone] = useState<string>(
    DEFAULT_OPERATING_HOURS.timezone
  );
  const [rows, setRows] = useState<OperatingDayConfig[]>(
    sortDays(DEFAULT_OPERATING_HOURS.days)
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Hydrate local state when config changes
  useEffect(() => {
    if (operatingHoursConfig) {
      setTimezone(
        operatingHoursConfig.timezone || DEFAULT_OPERATING_HOURS.timezone
      );
      setRows(
        sortDays(operatingHoursConfig.days || DEFAULT_OPERATING_HOURS.days)
      );
    }
  }, [operatingHoursConfig]);

  const validationError = useMemo(() => {
    if (!timezone.trim()) return "Timezone is required";
    if (!rows || rows.length !== 7) return "All 7 days must be configured";
    for (const row of rows) {
      if (row.isClosed) continue;
      if (!timePattern.test(row.openTime) || !timePattern.test(row.closeTime)) {
        return `${
          DAYS[row.dayOfWeek]?.label || "Day"
        }: use HH:MM format with 30-minute intervals (e.g., 06:00, 06:30)`;
      }
      const [openHour, openMinute] = row.openTime.split(":").map(Number);
      const [closeHour, closeMinute] = row.closeTime.split(":").map(Number);
      const openTotal = openHour * 60 + openMinute;
      const closeTotal = closeHour * 60 + closeMinute;
      // Allow wrap past midnight by treating close <= open as next-day close
      const closesNextDay = closeTotal <= openTotal;
      const effectiveClose = closesNextDay ? closeTotal + 24 * 60 : closeTotal;
      if (effectiveClose <= openTotal) {
        return `${
          DAYS[row.dayOfWeek]?.label || "Day"
        }: closing time must be after opening time`;
      }
    }
    return null;
  }, [rows, timezone]);

  const hasChanges = useMemo(() => {
    const base = operatingHoursConfig || DEFAULT_OPERATING_HOURS;
    const normalizedBase = JSON.stringify(sortDays(base.days));
    const normalizedCurrent = JSON.stringify(sortDays(rows));
    return base.timezone !== timezone || normalizedBase !== normalizedCurrent;
  }, [rows, operatingHoursConfig, timezone]);

  const updateRow = (dayOfWeek: number, patch: Partial<OperatingDayConfig>) => {
    setRows((prev) => {
      const next = prev.map((day) =>
        day.dayOfWeek === dayOfWeek ? normalizeDay({ ...day, ...patch }) : day
      );
      return sortDays(next);
    });
  };

  const handleSave = async () => {
    if (validationError) {
      toaster(validationError, { variant: "error" });
      return;
    }
    if (!hasChanges) return;

    const payload: OperatingHoursConfig = {
      timezone: timezone || DEFAULT_OPERATING_HOURS.timezone,
      days: sortDays(rows).map(normalizeDay),
    };

    setIsSaving(true);
    try {
      await withTwoFA(
        async (sessionToken) => {
          await systemConfigService.updateOperatingHours(payload, sessionToken);
          await refreshConfig();
          toaster("Operating hours saved", { variant: "success" });
        },
        { scope: "settings", actionName: "Update Operating Hours" }
      );
    } catch (error) {
      console.error("Failed to save operating hours", error);
      toaster("Failed to save operating hours", { variant: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    setIsResetting(true);
    try {
      await withTwoFA(
        async (sessionToken) => {
          await systemConfigService.resetOperatingHours(sessionToken);
          await refreshConfig();
          toaster("Operating hours reset to defaults", { variant: "success" });
        },
        { scope: "settings", actionName: "Reset Operating Hours" }
      );
    } catch (error) {
      console.error("Failed to reset operating hours", error);
      toaster("Failed to reset operating hours", { variant: "error" });
    } finally {
      setIsResetting(false);
    }
  };

  const handleCancel = () => {
    if (operatingHoursConfig) {
      setTimezone(
        operatingHoursConfig.timezone || DEFAULT_OPERATING_HOURS.timezone
      );
      setRows(sortDays(operatingHoursConfig.days));
    }
  };

  const renderStatus = () => {
    const openDays = rows.filter((d) => !d.isClosed).length;
    return (
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Badge variant="secondary">{timezone}</Badge>
        <span className="flex items-center gap-1">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          {openDays} open day{openDays === 1 ? "" : "s"}
        </span>
      </div>
    );
  };

  if (configLoading) {
    return (
      <Card className="shadow-md rounded-2xl">
        <CardContent className="flex items-center gap-3 py-8">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm text-muted-foreground">
            Loading operating hours...
          </span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-md rounded-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock4 className="h-5 w-5" />
          Operating Hours
        </CardTitle>
        <CardDescription>
          Set the weekly opening and closing times for court bookings and
          facility services.
        </CardDescription>
        {renderStatus()}
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label htmlFor="timezone">Timezone</Label>
            <Input
              id="timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="e.g. Africa/Nairobi"
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 text-xs font-semibold text-muted-foreground">
            <span className="md:col-span-3">Day</span>
            <span className="md:col-span-3">Open</span>
            <span className="md:col-span-3">Close</span>
            <span className="md:col-span-3">Status</span>
          </div>
          <div className="space-y-2">
            {DAYS.map((day) => {
              const row = rows.find((r) => r.dayOfWeek === day.value) || {
                dayOfWeek: day.value,
                openTime: "06:00",
                closeTime: "23:00",
                isClosed: false,
              };
              return (
                <div
                  key={day.value}
                  className="grid grid-cols-1 md:grid-cols-12 gap-3 p-3 rounded-lg border border-border bg-muted/40"
                >
                  <div className="md:col-span-3 flex items-center justify-between md:justify-start md:gap-2">
                    <span className="font-medium text-sm">{day.label}</span>
                    {row.isClosed && (
                      <Badge variant="destructive">Closed</Badge>
                    )}
                  </div>
                  <div className="md:col-span-3 flex items-center gap-2">
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      value={row.openTime}
                      disabled={row.isClosed}
                      onChange={(e) =>
                        updateRow(day.value, { openTime: e.target.value })
                      }
                    >
                      {TIME_OPTIONS.map((time) => (
                        <option key={time} value={time}>
                          {time}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-3 flex items-center gap-2">
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      value={row.closeTime}
                      disabled={row.isClosed}
                      onChange={(e) =>
                        updateRow(day.value, { closeTime: e.target.value })
                      }
                    >
                      {TIME_OPTIONS.map((time) => (
                        <option key={time} value={time}>
                          {time}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-3 flex items-center gap-3">
                    <Switch
                      checked={!row.isClosed}
                      onCheckedChange={(checked) =>
                        updateRow(day.value, { isClosed: !checked })
                      }
                    />
                    <span className="text-sm text-muted-foreground">
                      {row.isClosed ? "Closed" : "Open"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {validationError && (
          <Alert variant="destructive">
            <AlertDescription>{validationError}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-end">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={!hasChanges || isSaving || isResetting}
          >
            Revert Changes
          </Button>
          <Button variant="ghost" onClick={handleReset} disabled={isResetting}>
            <RefreshCcw className="h-4 w-4 mr-2" />
            {isResetting ? "Resetting..." : "Reset to Default"}
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !hasChanges || !!validationError}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

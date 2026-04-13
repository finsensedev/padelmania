import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Settings,
  Clock,
  Save,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  Info,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { Button } from "src/components/ui/button";
import { Label } from "src/components/ui/label";
import { Badge } from "src/components/ui/badge";
import { Alert, AlertDescription } from "src/components/ui/alert";
import useNotification from "src/hooks/useNotification";
import { useSystemConfig } from "src/hooks/useSystemConfig";
import systemConfigService from "src/services/system-config.service";
import useWithTwoFA from "src/hooks/useWithTwoFA";

interface BookingSlotConfig {
  allowedDurations: number[];
  defaultDuration: number;
  minDuration: number;
  maxDuration: number;
}

const DURATION_OPTIONS = [30, 60, 90, 120, 150, 180, 210, 240];

export default function BookingSettings() {
  const { toaster } = useNotification();
  const {
    bookingSlotConfig,
    isLoading: configLoading,
    refreshConfig,
  } = useSystemConfig();
  const { withTwoFA } = useWithTwoFA();

  const [selectedDurations, setSelectedDurations] = useState<number[]>([]);
  const [defaultDuration, setDefaultDuration] = useState<number>(60);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Initialize state from config
  useEffect(() => {
    if (bookingSlotConfig) {
      setSelectedDurations(bookingSlotConfig.allowedDurations);
      setDefaultDuration(bookingSlotConfig.defaultDuration);
      setHasChanges(false);
      setValidationError(null);
    }
  }, [bookingSlotConfig]);

  // Validate configuration
  useEffect(() => {
    if (selectedDurations.length === 0) {
      setValidationError("At least one duration must be selected");
      return;
    }

    if (!selectedDurations.includes(defaultDuration)) {
      setValidationError(
        "Default duration must be one of the selected durations"
      );
      return;
    }

    setValidationError(null);
  }, [selectedDurations, defaultDuration]);

  // Check if changes were made
  useEffect(() => {
    if (!bookingSlotConfig) return;

    const durationsChanged =
      selectedDurations.length !== bookingSlotConfig.allowedDurations.length ||
      selectedDurations.some(
        (d, i) => d !== bookingSlotConfig.allowedDurations[i]
      );

    const defaultChanged =
      defaultDuration !== bookingSlotConfig.defaultDuration;

    setHasChanges(durationsChanged || defaultChanged);
  }, [selectedDurations, defaultDuration, bookingSlotConfig]);

  const toggleDuration = (duration: number) => {
    setSelectedDurations((prev) => {
      const newDurations = prev.includes(duration)
        ? prev.filter((d) => d !== duration)
        : [...prev, duration].sort((a, b) => a - b);

      // If removing the default duration, set new default to first available
      if (!newDurations.includes(defaultDuration) && newDurations.length > 0) {
        setDefaultDuration(newDurations[0]);
      }

      return newDurations;
    });
  };

  const handleSave = async () => {
    if (validationError) {
      toaster(validationError, { variant: "error" });
      return;
    }

    setIsSaving(true);
    try {
      const minDuration = Math.min(...selectedDurations);
      const maxDuration = Math.max(...selectedDurations);

      const config: BookingSlotConfig = {
        allowedDurations: selectedDurations,
        defaultDuration,
        minDuration,
        maxDuration,
      };

      await withTwoFA(
        async (sessionToken) => {
          await systemConfigService.updateBookingSlots(config, sessionToken);
          await refreshConfig();

          toaster("Booking slot configuration saved successfully", {
            variant: "success",
          });
          setHasChanges(false);
        },
        { scope: "settings", actionName: "Update Booking Settings" }
      );
    } catch (error) {
      console.error("Failed to save booking slot config:", error);
      toaster(
        error instanceof Error
          ? error.message
          : "Failed to save booking slot configuration",
        { variant: "error" }
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    setIsResetting(true);
    try {
      await withTwoFA(
        async (sessionToken) => {
          await systemConfigService.resetBookingSlots(sessionToken);
          await refreshConfig();

          toaster("Booking slot configuration reset to defaults", {
            variant: "success",
          });
        },
        { scope: "settings", actionName: "Reset Booking Settings" }
      );
    } catch (error) {
      console.error("Failed to reset booking slot config:", error);
      toaster("Failed to reset booking slot configuration", {
        variant: "error",
      });
    } finally {
      setIsResetting(false);
    }
  };

  const handleCancel = () => {
    if (bookingSlotConfig) {
      setSelectedDurations(bookingSlotConfig.allowedDurations);
      setDefaultDuration(bookingSlotConfig.defaultDuration);
      setHasChanges(false);
    }
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    if (hours === 0) return `${mins} min`;
    if (mins === 0) return `${hours} hr`;
    return `${hours}h ${mins}m`;
  };

  if (configLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <p className="text-muted-foreground">Loading configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 p-4 md:p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Settings className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Booking Settings</h1>
              <p className="text-muted-foreground">
                Configure available booking slot durations
              </p>
            </div>
          </div>
        </div>

        {/* Main Configuration Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Booking Duration Options
            </CardTitle>
            <CardDescription>
              Select which booking durations customers can choose from. These
              durations will be available subject to court availability.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Info Alert */}
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Changes to booking durations will apply immediately to all new
                bookings. Existing bookings will not be affected.
              </AlertDescription>
            </Alert>

            {/* Duration Selection */}
            <div className="space-y-3">
              <Label className="text-base font-semibold">
                Available Durations
              </Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {DURATION_OPTIONS.map((duration) => {
                  const isSelected = selectedDurations.includes(duration);
                  const isDefault = duration === defaultDuration;

                  return (
                    <motion.button
                      key={duration}
                      onClick={() => toggleDuration(duration)}
                      className={`
                        relative p-4 rounded-lg border-2 transition-all
                        ${
                          isSelected
                            ? "border-primary bg-primary/10 shadow-sm"
                            : "border-muted hover:border-muted-foreground/50"
                        }
                        ${isDefault ? "ring-2 ring-primary ring-offset-2" : ""}
                      `}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className="flex flex-col items-center gap-2">
                        <span
                          className={`text-lg font-semibold ${
                            isSelected ? "text-primary" : ""
                          }`}
                        >
                          {formatDuration(duration)}
                        </span>
                        {isSelected && (
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                        )}
                        {isDefault && (
                          <Badge variant="default" className="text-xs">
                            Default
                          </Badge>
                        )}
                      </div>
                    </motion.button>
                  );
                })}
              </div>
              <p className="text-sm text-muted-foreground">
                Click to select or deselect duration options. At least one
                duration must be selected.
              </p>
            </div>

            {/* Default Duration Selection */}
            {selectedDurations.length > 0 && (
              <div className="space-y-3">
                <Label className="text-base font-semibold">
                  Default Duration
                </Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {selectedDurations.map((duration) => (
                    <motion.button
                      key={duration}
                      onClick={() => setDefaultDuration(duration)}
                      className={`
                        p-3 rounded-lg border-2 transition-all
                        ${
                          duration === defaultDuration
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted hover:border-muted-foreground/50"
                        }
                      `}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <span className="text-sm font-medium">
                        {formatDuration(duration)}
                      </span>
                    </motion.button>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">
                  The default duration will be pre-selected when customers
                  create a booking.
                </p>
              </div>
            )}

            {/* Validation Error */}
            {validationError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{validationError}</AlertDescription>
              </Alert>
            )}

            {/* Configuration Summary */}
            {selectedDurations.length > 0 && !validationError && (
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <h4 className="font-semibold text-sm">Configuration Summary</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">
                      Available Durations:
                    </p>
                    <p className="font-medium">
                      {selectedDurations.map(formatDuration).join(", ")}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Default Duration:</p>
                    <p className="font-medium">
                      {formatDuration(defaultDuration)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Minimum Duration:</p>
                    <p className="font-medium">
                      {formatDuration(Math.min(...selectedDurations))}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Maximum Duration:</p>
                    <p className="font-medium">
                      {formatDuration(Math.max(...selectedDurations))}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-4 border-t border-border">
              <Button
                variant="outline"
                onClick={handleReset}
                disabled={isSaving || isResetting}
              >
                {isResetting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
                    Resetting...
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset to Defaults
                  </>
                )}
              </Button>

              <div className="flex items-center gap-2">
                {hasChanges && (
                  <Button
                    variant="ghost"
                    onClick={handleCancel}
                    disabled={isSaving}
                  >
                    Cancel
                  </Button>
                )}
                <Button
                  onClick={handleSave}
                  disabled={!hasChanges || !!validationError || isSaving}
                >
                  {isSaving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Additional Information Card */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">How it works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="flex gap-3">
              <div className="mt-1">
                <div className="h-2 w-2 rounded-full bg-primary" />
              </div>
              <p>
                <strong className="text-foreground">
                  Duration Availability:
                </strong>{" "}
                The selected durations will only be available if there are
                enough consecutive court hours available. For example, a
                120-minute booking requires 2 consecutive available hours.
              </p>
            </div>
            <div className="flex gap-3">
              <div className="mt-1">
                <div className="h-2 w-2 rounded-full bg-primary" />
              </div>
              <p>
                <strong className="text-foreground">Real-time Updates:</strong>{" "}
                Changes take effect immediately for new bookings. Customers will
                see the updated duration options when they select a court and
                time slot.
              </p>
            </div>
            <div className="flex gap-3">
              <div className="mt-1">
                <div className="h-2 w-2 rounded-full bg-primary" />
              </div>
              <p>
                <strong className="text-foreground">Existing Bookings:</strong>{" "}
                Bookings that are already confirmed will not be affected by
                these changes, even if their duration is removed from the
                available options.
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

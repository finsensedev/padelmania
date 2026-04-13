import { useState, useEffect, useMemo } from "react";
import { Clock } from "lucide-react";
import {
  getAllCourtsPricing,
  getCourtPricing,
  formatKES,
  formatTime12h,
  type AllCourtsPricingData,
  type CourtPricingData,
  type TimeSlotPricing,
} from "src/services/public-pricing.service";

interface PricingDisplayProps {
  className?: string;
}

function PricingDisplay({ className = "" }: PricingDisplayProps) {
  const [allCourtsPricing, setAllCourtsPricing] =
    useState<AllCourtsPricingData | null>(null);
  const [courtPricing, setCourtPricing] = useState<CourtPricingData | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPricing = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const data = await getAllCourtsPricing();
        setAllCourtsPricing(data);

        if (data.courts?.length > 0) {
          try {
            const courtData = await getCourtPricing(data.courts[0].id);
            setCourtPricing(courtData);
          } catch (err) {
            console.error("Failed to fetch court pricing:", err);
          }
        }
      } catch (err) {
        console.error("Failed to fetch pricing:", err);
        setError("Failed to load pricing information");
      } finally {
        setIsLoading(false);
      }
    };

    fetchPricing();
  }, []);

  const groupedSlots = useMemo(() => {
    if (!courtPricing?.timeSlots) return { peak: [], offPeak: [] };
    const peak: TimeSlotPricing[] = [];
    const offPeak: TimeSlotPricing[] = [];
    courtPricing.timeSlots.forEach((slot) => {
      if (slot.isPeak) peak.push(slot);
      else offPeak.push(slot);
    });
    return { peak, offPeak };
  }, [courtPricing]);

  const timeRanges = useMemo(() => {
    const formatRange = (slots: TimeSlotPricing[]): string[] => {
      if (slots.length === 0) return [];
      const ranges: string[] = [];
      let rangeStart = slots[0];
      let rangeEnd = slots[0];

      for (let i = 1; i <= slots.length; i++) {
        const current = slots[i];
        const prev = slots[i - 1];
        const isConsecutive =
          current &&
          current.hour * 60 + current.minutes ===
            prev.hour * 60 + prev.minutes + 30;

        if (!isConsecutive) {
          const start = formatTime12h(rangeStart.time);
          const endHour = rangeEnd.hour + (rangeEnd.minutes + 30 >= 60 ? 1 : 0);
          const endMin = (rangeEnd.minutes + 30) % 60;
          const end = formatTime12h(
            `${endHour.toString().padStart(2, "0")}:${endMin.toString().padStart(2, "0")}`,
          );
          ranges.push(`${start} – ${end}`);
          if (current) {
            rangeStart = current;
            rangeEnd = current;
          }
        } else {
          rangeEnd = current;
        }
      }
      return ranges;
    };

    return {
      peak: formatRange(groupedSlots.peak),
      offPeak: formatRange(groupedSlots.offPeak),
    };
  }, [groupedSlots]);

  if (isLoading) {
    return (
      <section className={`py-20 sm:py-28 bg-background ${className}`}>
        <div className="max-w-7xl mx-auto px-5 sm:px-10 lg:px-16">
          <div className="animate-pulse space-y-6">
            <div className="h-4 bg-foreground/10 w-24" />
            <div className="h-12 bg-foreground/10 w-1/3" />
            <div className="grid md:grid-cols-2 gap-px bg-foreground/10 mt-10">
              <div className="h-72 bg-card" />
              <div className="h-72 bg-card" />
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (error || !allCourtsPricing) {
    return (
      <section className={`py-20 sm:py-28 bg-background ${className}`}>
        <div className="max-w-7xl mx-auto px-5 sm:px-10 lg:px-16">
          <p className="text-red-400 text-sm">
            {error || "Failed to load pricing"}
          </p>
        </div>
      </section>
    );
  }

  const { operatingHours, pricingSummary } = allCourtsPricing;

  return (
    <section
      className={`py-20 sm:py-28 bg-background border-y border-border/10 ${className}`}
    >
      <div className="max-w-7xl mx-auto px-5 sm:px-10 lg:px-16">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 mb-14">
          <div>
            <p className="text-primary text-xs font-black uppercase tracking-[0.25em] mb-4 flex items-center gap-2">
              <span className="w-6 h-px bg-primary" />
              Live Pricing
            </p>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black uppercase leading-none">
              Today's
              <br />
              <span className="text-foreground/30">Rates</span>
            </h2>
          </div>

          {/* Operating hours */}
          {operatingHours && !operatingHours.isClosed && (
            <div className="flex items-center gap-2 border border-border/20 bg-card px-5 py-3 text-foreground/60 text-sm self-start sm:self-end">
              <Clock className="w-4 h-4 text-primary flex-shrink-0" />
              <span>
                {formatTime12h(operatingHours.openTime)} –{" "}
                {formatTime12h(operatingHours.closeTime)}
              </span>
              <span className="text-foreground/30 hidden sm:inline">
                · {operatingHours.timezone}
              </span>
            </div>
          )}
          {operatingHours?.isClosed && (
            <div className="flex items-center gap-2 border border-red-500/20 bg-red-500/5 px-5 py-3 text-red-400 text-sm self-start sm:self-end">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              Closed on {allCourtsPricing.dayOfWeek}
            </div>
          )}
        </div>

        {/* Pricing cards */}
        <div className="grid md:grid-cols-2 gap-px bg-border/10 mb-14">
          {/* Off-Peak */}
          <div className="group bg-background p-8 sm:p-12 hover:bg-card transition-colors duration-300 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
            <div className="pl-4">
              <div className="flex items-start justify-between mb-8">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary bg-primary/10 px-3 py-1">
                    Best Value
                  </span>
                  <h3 className="text-2xl sm:text-3xl font-black uppercase mt-4 text-foreground">
                    Off-Peak
                  </h3>
                  <p className="text-foreground/40 text-sm mt-1">
                    Morning & late night slots
                  </p>
                </div>
                <p className="text-5xl sm:text-6xl font-black tabular-nums text-foreground leading-none text-right">
                  {courtPricing && groupedSlots.offPeak.length > 0
                    ? formatKES(
                        Math.min(
                          ...groupedSlots.offPeak.map((s) => s.hourlyRate),
                        ),
                      )
                    : formatKES(pricingSummary.lowestRate)}
                </p>
              </div>

              <div className="border-t border-border/10 pt-6">
                <p className="text-foreground/30 text-[10px] uppercase tracking-widest font-black mb-3">
                  Hours
                </p>
                <div className="space-y-1">
                  {timeRanges.offPeak.length > 0 ? (
                    timeRanges.offPeak.map((range, idx) => (
                      <p
                        key={idx}
                        className="text-foreground/70 text-sm font-semibold"
                      >
                        {range}
                      </p>
                    ))
                  ) : (
                    <p className="text-foreground/40 text-sm">
                      Check schedule for times
                    </p>
                  )}
                </div>
              </div>
              <p className="text-primary text-xs font-black uppercase tracking-wider mt-6">
                per hour / per court
              </p>
            </div>
          </div>

          {/* Peak */}
          <div className="group bg-background p-8 sm:p-12 hover:bg-card transition-colors duration-300 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-foreground/20" />
            <div className="pl-4">
              <div className="flex items-start justify-between mb-8">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-foreground/50 bg-foreground/5 px-3 py-1">
                    Peak Hours
                  </span>
                  <h3 className="text-2xl sm:text-3xl font-black uppercase mt-4 text-foreground">
                    Peak
                  </h3>
                  <p className="text-foreground/40 text-sm mt-1">
                    Prime time for matches
                  </p>
                </div>
                <p className="text-5xl sm:text-6xl font-black tabular-nums text-foreground leading-none text-right">
                  {courtPricing && groupedSlots.peak.length > 0
                    ? formatKES(
                        Math.max(...groupedSlots.peak.map((s) => s.hourlyRate)),
                      )
                    : formatKES(pricingSummary.highestRate)}
                </p>
              </div>

              <div className="border-t border-border/10 pt-6">
                <p className="text-foreground/30 text-[10px] uppercase tracking-widest font-black mb-3">
                  Hours
                </p>
                <div className="space-y-1">
                  {timeRanges.peak.length > 0 ? (
                    timeRanges.peak.map((range, idx) => (
                      <p
                        key={idx}
                        className="text-foreground/70 text-sm font-semibold"
                      >
                        {range}
                      </p>
                    ))
                  ) : (
                    <p className="text-foreground/40 text-sm">
                      No peak hours today
                    </p>
                  )}
                </div>
              </div>
              <p className="text-foreground/30 text-xs font-black uppercase tracking-wider mt-6">
                per hour / per court
              </p>
            </div>
          </div>
        </div>

        {/* Hourly breakdown */}
        {courtPricing && courtPricing.timeSlots.length > 0 && (
          <div>
            <p className="text-foreground/30 text-[10px] uppercase tracking-widest font-black mb-5">
              Full Schedule Breakdown
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-px bg-border/10">
              {courtPricing.timeSlots
                .filter((_, idx) => idx % 2 === 0)
                .map((slot, idx) => (
                  <div
                    key={idx}
                    className={`px-3 py-4 text-center transition-colors duration-200 ${
                      slot.isPeak
                        ? "bg-card hover:bg-muted"
                        : "bg-background hover:bg-card"
                    }`}
                  >
                    <p className="text-[10px] sm:text-xs font-semibold text-foreground/40 mb-1">
                      {formatTime12h(slot.time)}
                    </p>
                    <p
                      className={`text-xs sm:text-sm font-black ${slot.isPeak ? "text-foreground" : "text-primary"}`}
                    >
                      {formatKES(slot.hourlyRate)}
                    </p>
                    <p
                      className={`text-[9px] uppercase tracking-wider font-black mt-1 ${slot.isPeak ? "text-foreground/20" : "text-primary/40"}`}
                    >
                      {slot.isPeak ? "Peak" : "Off"}
                    </p>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export default PricingDisplay;

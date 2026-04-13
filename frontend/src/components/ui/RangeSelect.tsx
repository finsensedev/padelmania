import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "src/components/ui/select";
import type { ExtendedRange, CustomDateBounds } from "src/utils/rangeUtils";

interface RangeSelectProps {
  value: ExtendedRange;
  onChange: (range: ExtendedRange) => void;
  customDates: CustomDateBounds;
  onCustomDatesChange: (dates: CustomDateBounds) => void;
  /** Override the select trigger width. Default: "w-full sm:w-36" */
  triggerClassName?: string;
  /** Show a "Period:" label. Default: true */
  showLabel?: boolean;
}

/** YYYY-MM-DD */
function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function defaultCustomDates(): CustomDateBounds {
  const now = new Date();
  return {
    customFrom: fmtDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    customTo: fmtDate(now),
  };
}

export default function RangeSelect({
  value,
  onChange,
  customDates,
  onCustomDatesChange,
  triggerClassName = "w-full sm:w-36",
  showLabel = true,
}: RangeSelectProps) {
  const today = fmtDate(new Date());

  const handleValueChange = (v: string) => {
    const next = v as ExtendedRange;
    if (
      next === "CUSTOM" &&
      (!customDates.customFrom || !customDates.customTo)
    ) {
      onCustomDatesChange(defaultCustomDates());
    }
    onChange(next);
  };

  const handleFromChange = (v: string) => {
    const next = { ...customDates, customFrom: v };
    if (next.customTo && v > next.customTo) next.customTo = v;
    onCustomDatesChange(next);
  };

  const handleToChange = (v: string) => {
    const next = { ...customDates, customTo: v };
    if (next.customFrom && v < next.customFrom) next.customFrom = v;
    onCustomDatesChange(next);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {showLabel && (
          <label className="text-xs md:text-sm text-muted-foreground whitespace-nowrap">
            Period:
          </label>
        )}
        <Select value={value} onValueChange={handleValueChange}>
          <SelectTrigger className={triggerClassName}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="DAY">Day</SelectItem>
            <SelectItem value="WEEK">Week</SelectItem>
            <SelectItem value="MONTH">Month</SelectItem>
            <SelectItem value="YEAR">Year</SelectItem>
            <SelectItem value="CUSTOM">Custom Range</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {value === "CUSTOM" && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            className={`px-2 py-1.5 text-sm border rounded-md bg-background ${
              !customDates.customFrom ? "border-destructive" : "border-border"
            }`}
            value={customDates.customFrom}
            max={customDates.customTo || today}
            onChange={(e) => handleFromChange(e.target.value)}
          />
          <span className="text-xs text-muted-foreground">to</span>
          <input
            type="date"
            className={`px-2 py-1.5 text-sm border rounded-md bg-background ${
              !customDates.customTo ? "border-destructive" : "border-border"
            }`}
            value={customDates.customTo}
            min={customDates.customFrom || undefined}
            max={today}
            onChange={(e) => handleToChange(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}

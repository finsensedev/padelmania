import { useMemo, useState } from "react";

export interface TimeRangeValue {
  range?: string; // day|week|month|quarter|year|custom
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
  compare?: boolean;
}

/** Returns true when a custom-range value has both dates and from <= to */
export function isCustomRangeValid(val: TimeRangeValue): boolean {
  if (val.range !== "custom") return true;
  if (!val.from || !val.to) return false;
  return val.from <= val.to;
}

interface TimeRangePickerProps {
  value: TimeRangeValue;
  onChange: (val: TimeRangeValue) => void;
  allowCompare?: boolean;
}

/* Helpers ----------------------------------------------------------------- */

/** YYYY-MM-DD for a Date */
function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Sensible defaults when entering custom mode: current month boundaries */
function defaultCustomRange(): { from: string; to: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: fmtDate(start), to: fmtDate(now) };
}

/* Component --------------------------------------------------------------- */

export function TimeRangePicker({
  value,
  onChange,
  allowCompare = true,
}: TimeRangePickerProps) {
  const [mode, setMode] = useState<string>(value.range || "month");

  const today = useMemo(() => fmtDate(new Date()), []);

  const presets = [
    { key: "day", label: "Day" },
    { key: "week", label: "Week" },
    { key: "month", label: "Month" },
    { key: "quarter", label: "Quarter" },
    { key: "year", label: "Year" },
    { key: "custom", label: "Custom" },
  ];

  const handlePreset = (key: string) => {
    setMode(key);
    if (key === "custom") {
      // Pre-fill with current month start → today so the query never fires
      // with empty from/to
      const defaults = defaultCustomRange();
      onChange({
        range: "custom",
        from: value.from || defaults.from,
        to: value.to || defaults.to,
        compare: value.compare,
      });
    } else {
      onChange({ range: key, compare: value.compare });
    }
  };

  const handleCustomChange = (field: "from" | "to", val: string) => {
    const next: TimeRangeValue = {
      range: "custom",
      from: field === "from" ? val : value.from,
      to: field === "to" ? val : value.to,
      compare: value.compare,
    };
    // Auto-correct: if from > to, clamp the other field
    if (next.from && next.to && next.from > next.to) {
      if (field === "from") next.to = next.from;
      else next.from = next.to;
    }
    onChange(next);
  };

  const validCustom = isCustomRangeValid(value);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <button
            key={p.key}
            onClick={() => handlePreset(p.key)}
            className={`px-3 py-1.5 text-xs rounded-md border ${
              mode === p.key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background hover:bg-muted border-border text-foreground"
            }`}
          >
            {p.label}
          </button>
        ))}
        {allowCompare && (
          <label className="inline-flex items-center gap-1 text-xs ml-2">
            <input
              type="checkbox"
              checked={!!value.compare}
              onChange={(e) =>
                onChange({ ...value, compare: e.target.checked })
              }
            />
            Compare prev
          </label>
        )}
      </div>
      {mode === "custom" && (
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-2 items-center">
            <input
              type="date"
              className={`px-2 py-1 text-sm border rounded-md bg-background ${
                !value.from ? "border-destructive" : "border-border"
              }`}
              value={value.from || ""}
              max={value.to || today}
              onChange={(e) => handleCustomChange("from", e.target.value)}
            />
            <span className="text-xs text-muted-foreground">to</span>
            <input
              type="date"
              className={`px-2 py-1 text-sm border rounded-md bg-background ${
                !value.to ? "border-destructive" : "border-border"
              }`}
              value={value.to || ""}
              min={value.from || undefined}
              max={today}
              onChange={(e) => handleCustomChange("to", e.target.value)}
            />
          </div>
          {!validCustom && (
            <p className="text-xs text-destructive">
              Please select both a start and end date.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default TimeRangePicker;

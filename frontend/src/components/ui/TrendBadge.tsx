import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";

interface TrendBadgeProps {
  value?: number | null;
  invert?: boolean; // if true, negative is good
  className?: string;
  precision?: number;
}

export function TrendBadge({
  value,
  invert = false,
  className = "",
  precision = 1,
}: TrendBadgeProps) {
  if (value === undefined || value === null || isNaN(value)) {
    return (
      <span
        className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground ${className}`}
      >
        <Minus className="w-3 h-3" />
        N/A
      </span>
    );
  }
  const good = invert ? value < 0 : value > 0;
  const bad = invert ? value > 0 : value < 0;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${
        good
          ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400"
          : bad
          ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400"
          : "bg-muted text-muted-foreground"
      } ${className}`}
    >
      {good ? (
        <ArrowUpRight className="w-3 h-3" />
      ) : bad ? (
        <ArrowDownRight className="w-3 h-3" />
      ) : (
        <Minus className="w-3 h-3" />
      )}
      {Math.abs(value).toFixed(precision)}%
    </span>
  );
}

export default TrendBadge;

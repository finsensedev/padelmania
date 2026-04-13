import TrendBadge from "./TrendBadge";

interface KPIStatProps {
  label: string;
  value: number | string | null | undefined;
  prefix?: string;
  suffix?: string;
  deltaPct?: number | null;
  loading?: boolean;
  helpText?: string;
  invertTrend?: boolean;
  variant?: "purple" | "teal" | "green" | "orange" | "blue" | "indigo";
}

const variantClasses = {
  purple: "bg-gradient-to-br from-purple-600 to-indigo-700",
  teal: "bg-gradient-to-br from-teal-600 to-cyan-700",
  green: "bg-gradient-to-br from-green-700 to-emerald-800",
  orange: "bg-gradient-to-br from-orange-600 to-amber-700",
  blue: "bg-gradient-to-br from-blue-700 to-indigo-800",
  indigo: "bg-gradient-to-br from-indigo-600 to-purple-700",
};

export function KPIStat({
  label,
  value,
  prefix = "",
  suffix = "",
  deltaPct,
  loading,
  helpText,
  invertTrend = false,
  variant = "purple",
}: KPIStatProps) {
  return (
    <div
      className={`relative overflow-hidden touch-manipulation ${variantClasses[variant]} text-white border border-slate-300/20 rounded-lg p-4 flex flex-col gap-2 shadow-sm`}
    >
      <div className="absolute top-1/2 left-0 w-full h-16 -translate-y-1/2 bg-white/10 transform -skew-y-6"></div>
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_20%_80%,_rgba(255,255,255,0.1)_0px,_transparent_40%)]"></div>
      <div className="relative z-10 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-white drop-shadow-sm">
            {label}
          </span>
          {deltaPct !== undefined && deltaPct !== null && (
            <TrendBadge value={deltaPct} invert={invertTrend} />
          )}
        </div>
        <div className="text-2xl font-semibold tabular-nums text-white drop-shadow-md">
          {loading ? (
            <span className="animate-pulse text-white/70">...</span>
          ) : (
            <>
              {prefix}
              {typeof value === "number"
                ? value.toLocaleString()
                : value ?? "—"}
              {suffix}
            </>
          )}
        </div>
        {helpText && (
          <p className="text-xs text-white/95 drop-shadow-sm leading-snug">
            {helpText}
          </p>
        )}
      </div>
    </div>
  );
}

export default KPIStat;

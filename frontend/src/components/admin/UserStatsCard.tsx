// components/admin/users/UserStatsCard.tsx
import { TrendingUp, TrendingDown } from "lucide-react";

interface UserStatsCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  change?: number;
  changeLabel?: string;
  color: "blue" | "green" | "purple" | "orange";
}

export default function UserStatsCard({
  title,
  value,
  icon,
  change,
  changeLabel,
  color,
}: UserStatsCardProps) {
  const colorClasses = {
    blue: "bg-gradient-to-br from-blue-600 to-purple-600",
    green: "bg-gradient-to-br from-green-600 to-gray-300",
    purple: "bg-gradient-to-br from-purple-500 to-indigo-600",
    orange: "bg-gradient-to-br from-gray-600 to-orange-500",
  };

  return (
    <div
      className={`relative overflow-hidden touch-manipulation ${colorClasses[color]} text-white border border-slate-300/20 p-4 rounded-lg shadow-sm`}
    >
      <div className="absolute top-1/2 left-0 w-full h-16 -translate-y-1/2 bg-white/10 transform -skew-y-6"></div>
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_20%_80%,_rgba(255,255,255,0.1)_0px,_transparent_40%)]"></div>
      <div className="relative z-10 flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm text-white/80">{title}</p>
          <p className="text-2xl font-bold text-white mt-1">{value}</p>
          {change !== undefined && (
            <div className="flex items-center gap-1 mt-2">
              {change >= 0 ? (
                <TrendingUp className="w-4 h-4 text-white/90" />
              ) : (
                <TrendingDown className="w-4 h-4 text-white/70" />
              )}
              <span
                className={`text-sm ${
                  change >= 0 ? "text-white/90" : "text-white/70"
                }`}
              >
                {change >= 0 ? "+" : ""}
                {change}%
              </span>
              {changeLabel && (
                <span className="text-sm text-white/70">{changeLabel}</span>
              )}
            </div>
          )}
        </div>
        <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-white/20">
          {icon}
        </div>
      </div>
    </div>
  );
}

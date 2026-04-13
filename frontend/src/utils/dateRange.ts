export type Range = "DAY" | "WEEK" | "MONTH" | "YEAR";

export function getRangeBounds(range: Range) {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);
  const setStartOfDay = (d: Date) => { d.setHours(0, 0, 0, 0); };
  const setEndOfDay = (d: Date) => { d.setHours(23, 59, 59, 999); };
  if (range === "DAY") {
    setStartOfDay(start); setEndOfDay(end);
  } else if (range === "WEEK") {
    const day = now.getDay();
    const diffToMonday = (day + 6) % 7;
    start.setDate(now.getDate() - diffToMonday);
    setStartOfDay(start);
    end.setDate(start.getDate() + 6);
    setEndOfDay(end);
  } else if (range === "MONTH") {
    start.setDate(1); setStartOfDay(start);
    end.setMonth(now.getMonth() + 1, 0); setEndOfDay(end);
  } else {
    start.setMonth(0, 1); setStartOfDay(start);
    end.setMonth(11, 31); setEndOfDay(end);
  }
  return { startDate: start.toISOString(), endDate: end.toISOString() } as const;
}

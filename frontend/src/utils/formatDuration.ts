/**
 * Format seconds into a human-readable duration string
 * @param seconds - Number of seconds
 * @returns Formatted string like "2 minutes 30 seconds" or "45 seconds"
 */
export function formatDuration(seconds: number): string {
  if (seconds < 0) return "0 seconds";

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes === 0) {
    return `${remainingSeconds} second${remainingSeconds !== 1 ? "s" : ""}`;
  }

  if (remainingSeconds === 0) {
    return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
  }

  return `${minutes} minute${
    minutes !== 1 ? "s" : ""
  } ${remainingSeconds} second${remainingSeconds !== 1 ? "s" : ""}`;
}

/**
 * Format seconds into a compact duration string
 * @param seconds - Number of seconds
 * @returns Formatted string like "2m 30s" or "45s"
 */
export function formatDurationCompact(seconds: number): string {
  if (seconds < 0) return "0s";

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes === 0) {
    return `${remainingSeconds}s`;
  }

  if (remainingSeconds === 0) {
    return `${minutes}m`;
  }

  return `${minutes}m ${remainingSeconds}s`;
}

import { Request, Response, NextFunction } from "express";

// ANSI color codes
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",

  // Method colors
  cyan: "\x1b[36m",

  // Status colors
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",

  // User info color
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
  gray: "\x1b[90m",
};

function getStatusColor(statusCode: number): string {
  if (statusCode >= 500) return colors.red;
  if (statusCode >= 400) return colors.yellow;
  if (statusCode >= 300) return colors.cyan;
  if (statusCode >= 200) return colors.green;
  return colors.reset;
}

function formatTimestamp(): string {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");

  return `${day}/${month}/${year} at ${hours}:${minutes}`;
}

/**
 * Request logger middleware that logs authenticated requests with user email
 * This middleware should be placed BEFORE authentication to track timing
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();

  // Track if we've already logged
  let logged = false;

  const logRequest = () => {
    if (logged) return;
    logged = true;

    const duration = Date.now() - start;
    const userEmail = req.user?.email || "anonymous";
    const userRole = req.user?.role || "";
    const roleInfo = userRole ? ` (${userRole})` : "";

    const statusColor = getStatusColor(res.statusCode);
    const userColor = userEmail === "anonymous" ? colors.gray : colors.magenta;
    const timestamp = formatTimestamp();

    console.log(
      `${colors.blue}[${timestamp}]${colors.reset} ` +
        `${colors.cyan}${req.method}${colors.reset} ` +
        `${colors.dim}${req.originalUrl}${colors.reset} ` +
        `${statusColor}${res.statusCode}${colors.reset} ` +
        `${colors.dim}${duration}ms${colors.reset} ` +
        `${userColor}[${userEmail}${roleInfo}]${colors.reset}`
    );
  };

  // Handle the finish event
  res.on("finish", logRequest);

  next();
}

export default requestLogger;

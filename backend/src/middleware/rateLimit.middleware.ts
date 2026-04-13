import type { RequestHandler } from "express";
import rateLimit, { RateLimitRequestHandler } from "express-rate-limit";

const WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_MAX = 1500;

const createLimiter = (max: number): RateLimitRequestHandler =>
  rateLimit({
    windowMs: WINDOW_MS,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      status: 429,
      error: "Too many requests, please try again later.",
    },
  });

const methodLimits: Record<string, number> = {
  GET: DEFAULT_MAX,
  POST: 100,
  PUT: 40,
  PATCH: 50,
  DELETE: 40,
};

const methodLimiters: Record<string, RateLimitRequestHandler> =
  Object.fromEntries(
    Object.entries(methodLimits).map(([method, max]) => [
      method,
      createLimiter(max),
    ])
  );

const fallbackLimiter = createLimiter(DEFAULT_MAX);

const rateLimitMiddleware: RequestHandler = (req, res, next) => {
  const limiter = methodLimiters[req.method.toUpperCase()] ?? fallbackLimiter;
  return limiter(req, res, next);
};

export default rateLimitMiddleware;

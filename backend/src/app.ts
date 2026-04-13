require("dotenv").config();
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import path from "path";
import cookieParser from "cookie-parser";
import apiRouters from "./routes/index";
import errorHandler from "./middleware/error.middleware";
import rateLimitMiddleware from "./middleware/rateLimit.middleware";
import { responseHelpers } from "./middleware/response.middleware";
import auditLogger from "./middleware/audit.middleware";
import requestLogger from "./middleware/request-logger.middleware";

const app = express();

// Security middleware
app.use(helmet());
app.use(compression());
app.use(cookieParser());

// CORS configuration
const productionCors = ["https://tudorpadel.com", "https://www.tudorpadel.com"];
const developmentCors = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:8070",
  "http://localhost:5174",
  "http://192.168.100.7:8081",
  "http://localhost:8081",
  "http://192.168.100.7:5173",
  "http://localhost:8080",
  "http://192.168.1.118:5173",
  "http://192.168.1.229:8081",
];

app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production" ? productionCors : developmentCors,
    credentials: true,
  })
);

// Body parsing middleware
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Disable caching for all API routes to ensure fresh data
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.set("Surrogate-Control", "no-store");
  next();
});

// Rate limiting on API routes
app.use("/api", rateLimitMiddleware);

// Response helpers
app.use(responseHelpers);

// Request logger with user email (placed early to track full request lifecycle)
app.use("/api", requestLogger);

// Audit logger should run on API requests (after helpers). It will skip /api/audit-logs itself
app.use("/api", auditLogger);

// Trust proxy
app.set("trust proxy", 1);

// API Routes
app.use("/api", apiRouters);

// Static files serving
app.use("/files/:userId", (req, res, next) => {
  const userId = req.params.userId;
  return express.static(path.join(__dirname, "../public", userId, "files"))(
    req,
    res,
    next
  );
});

// 404 handler
app.use((_, res) => {
  return res.status(404).json({
    status: "error",
    statusCode: 404,
    message: "Not Found",
  });
});

// Centralized error handler
app.use(errorHandler);

export default app;

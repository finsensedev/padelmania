import { Request, Response, NextFunction } from "express";

const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  // Body-parser JSON parse error => send a clean 400
  if (
    (err instanceof SyntaxError && "body" in err) ||
    err?.type === "entity.parse.failed"
  ) {
    return res.status(400).json({
      status: "error",
      statusCode: 400,
      message: "Invalid JSON payload",
    });
  }

  // Fallback
  const statusCode = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  // Keep minimal logging in dev; avoid leaking internals in response
  if (process.env.NODE_ENV !== "test") {
    // eslint-disable-next-line no-console
    console.error(err);
  }

  res.status(statusCode).json({
    status: "error",
    statusCode,
    message,
  });
};

export default errorHandler;

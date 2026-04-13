// src/types/express.d.ts
import { Request, Response } from "express";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: string;
      };
    }

    interface Response {
      sendSuccess: (data: any, message?: string) => Response;
      sendError: (error: any, message?: string) => Response;
    }
  }
}

Response.prototype.sendSuccess = function (
  data: any,
  message: string = "Success"
) {
  return this.status(200).json({ message, data });
};

Response.prototype.sendError = function (
  error: any,
  message: string = "Error"
) {
  return this.status(500).json({ message, error });
};

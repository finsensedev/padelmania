import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { ACCESS_COOKIE_NAME } from "../controllers/auth.controller";

const prisma = new PrismaClient();

interface JwtPayload {
  sub: string;
  role: string;
  iat?: number;
  exp?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: string;
        email?: string;
      };
    }
  }
}

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    let token: string | null = null;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7).trim();
    } else if (req.cookies?.[ACCESS_COOKIE_NAME]) {
      token = req.cookies[ACCESS_COOKIE_NAME];
    }

    if (!token) {
      return res.status(401).json({
        status: "error",
        message: "No token provided",
      });
    }
    const JWT_SECRET = process.env.JWT_SECRET as string;

    if (!JWT_SECRET) {
      throw new Error("JWT_SECRET is not configured");
    }

    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;

    // Optionally verify user still exists and is active
    // Use any-cast to support fields introduced in newer schema (e.g., isDeleted)
    const p: any = prisma;
    const user = await p.user.findUnique({
      where: { id: decoded.sub },
      select: {
        id: true,
        role: true,
        email: true,
        isActive: true,
        isDeleted: true,
      },
    });

    if (!user || !user.isActive || user.isDeleted) {
      return res.status(401).json({
        status: "error",
        message: "User not found or inactive",
      });
    }

    req.user = {
      id: user.id,
      role: user.role,
      email: user.email,
    };

    // Store the start time for this request
    (req as any)._authStartTime = Date.now();

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({
        status: "error",
        message: "Token expired",
      });
    }

    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({
        status: "error",
        message: "Invalid token",
      });
    }

    return res.status(500).json({
      status: "error",
      message: "Authentication error",
    });
  }
};

export const authorize = (...allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        status: "error",
        message: "Not authenticated",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        status: "error",
        message: "Insufficient permissions",
      });
    }

    next();
  };
};

// Optional authentication: if Authorization header is present, validate it;
// otherwise continue without blocking the request.
export const optionalAuthenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    const cookieToken = req.cookies?.[ACCESS_COOKIE_NAME];
    if ((!authHeader || !authHeader.startsWith("Bearer ")) && !cookieToken) {
      return next();
    }
    // Reuse the existing authenticate logic when a token is provided
    return authenticate(req, res, next);
  } catch (err) {
    return next();
  }
};

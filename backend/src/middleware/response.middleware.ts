import { Request, Response, NextFunction } from "express";

declare global {
  namespace Express {
    interface Response {
      sendSuccess: (
        data?: any,
        message?: string,
        statusCode?: number
      ) => Response;
      sendError: (
        message?: string,
        statusCode?: number,
        error?: any
      ) => Response;
      sendPaginated: (
        data: any[],
        total: number,
        page: number,
        limit: number
      ) => Response;
    }
  }
}

export const responseHelpers = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  res.sendSuccess = function (
    data: any = null,
    message: string = "Success",
    statusCode: number = 200
  ) {
    return this.status(statusCode).json({
      status: "success",
      message,
      data,
    });
  };

  res.sendError = function (
    message: string = "An error occurred",
    statusCode: number = 500,
    error: any = null
  ) {
    const response: any = {
      status: "error",
      message,
    };

    if (process.env.NODE_ENV === "development" && error) {
      response.error = error;
    }

    return this.status(statusCode).json(response);
  };

  res.sendPaginated = function (
    data: any[],
    total: number,
    page: number,
    limit: number
  ) {
    const totalPages = Math.ceil(total / limit);

    return this.status(200).json({
      status: "success",
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    });
  };

  next();
};

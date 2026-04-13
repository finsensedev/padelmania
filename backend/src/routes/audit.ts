import { Router } from "express";
import prisma from "../config/db";
import { authenticate, authorize } from "../middleware/auth.middleware";

const router = Router();

// GET /api/audit-logs
// Query params: page, limit, search, action, entity, userId, from, to, sortBy, sortOrder
router.get(
  "/",
  authenticate,
  authorize("ADMIN", "SUPER_ADMIN"),
  async (req, res) => {
    try {
      const {
        page = "1",
        limit = "20",
        search = "",
        action,
        entity,
        userId,
        from,
        to,
        sortBy = "createdAt",
        sortOrder = "desc",
        includeRead,
      } = req.query as Record<string, string>;

      const pageNum = Math.max(parseInt(page, 10) || 1, 1);
      const pageSize = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
      const includeReadRequests =
        includeRead === undefined
          ? true
          : ["true", "1", "yes"].includes((includeRead ?? "").toLowerCase());

      const baseWhere: any = {};
      if (action) baseWhere.action = { contains: action, mode: "insensitive" };
      if (entity) baseWhere.entity = { contains: entity, mode: "insensitive" };
      if (userId) baseWhere.userId = userId;

      if (search) {
        baseWhere.OR = [
          { action: { contains: search, mode: "insensitive" } },
          { entity: { contains: search, mode: "insensitive" } },
          { entityId: { contains: search, mode: "insensitive" } },
        ];
      }

      if (from || to) {
        baseWhere.createdAt = {};
        if (from) baseWhere.createdAt.gte = new Date(from);
        if (to) baseWhere.createdAt.lte = new Date(to);
      }

      const readSuppression = [
        { action: { startsWith: "GET", mode: "insensitive" } },
        { action: { startsWith: "HEAD", mode: "insensitive" } },
      ];
      const where = includeReadRequests
        ? baseWhere
        : {
            ...baseWhere,
            NOT: readSuppression,
          };

      const orderBy: any = {};
      orderBy[sortBy] = sortOrder.toLowerCase() === "asc" ? "asc" : "desc";

      const totalPromise = prisma.auditLog.count({ where });
      const dataPromise = prisma.auditLog.findMany({
        where,
        orderBy,
        skip: (pageNum - 1) * pageSize,
        take: pageSize,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
        },
      });

      const totalIncludingReadPromise = includeReadRequests
        ? Promise.resolve(0)
        : prisma.auditLog.count({ where: baseWhere });

      const [total, data, totalIncludingReadRaw] = await Promise.all([
        totalPromise,
        dataPromise,
        totalIncludingReadPromise,
      ]);

      const totalIncludingRead = includeReadRequests
        ? total
        : totalIncludingReadRaw;

      const suppressed = includeReadRequests
        ? 0
        : Math.max(totalIncludingRead - total, 0);

      return res.json({
        data,
        meta: {
          page: pageNum,
          limit: pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
          totalIncludingRead,
          includeRead: includeReadRequests,
          suppressed,
        },
      });
    } catch (error) {
      console.error("Failed to fetch audit logs", error);
      return res.status(500).json({ message: "Failed to fetch audit logs" });
    }
  }
);

// GET /api/audit-logs/:id
// GET /api/audit-logs/export (CSV)
router.get(
  "/export",
  authenticate,
  authorize("ADMIN", "SUPER_ADMIN"),
  async (req, res) => {
    try {
      const {
        search = "",
        action,
        entity,
        userId,
        from,
        to,
        includeRead,
      } = req.query as Record<string, string>;

      const includeReadRequests = ["true", "1", "yes"].includes(
        (includeRead ?? "").toLowerCase()
      );

      const baseWhere: any = {};
      if (action) baseWhere.action = { contains: action, mode: "insensitive" };
      if (entity) baseWhere.entity = { contains: entity, mode: "insensitive" };
      if (userId) baseWhere.userId = userId;
      if (search) {
        baseWhere.OR = [
          { action: { contains: search, mode: "insensitive" } },
          { entity: { contains: search, mode: "insensitive" } },
          { entityId: { contains: search, mode: "insensitive" } },
        ];
      }
      if (from || to) {
        baseWhere.createdAt = {};
        if (from) baseWhere.createdAt.gte = new Date(from);
        if (to) baseWhere.createdAt.lte = new Date(to);
      }

      const readFilter = {
        OR: [
          { action: { startsWith: "GET", mode: "insensitive" } },
          { action: { startsWith: "HEAD", mode: "insensitive" } },
        ],
      };

      const where = includeReadRequests
        ? baseWhere
        : {
            ...baseWhere,
            NOT: readFilter,
          };

      const logs = await prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { email: true, firstName: true, lastName: true } },
        },
        take: 5000, // safety cap
      });

      const header = [
        "Timestamp",
        "Action",
        "Entity",
        "Entity ID",
        "User",
        "IP",
        "User Agent",
      ];
      const rows = logs.map((l) => [
        l.createdAt.toISOString(),
        l.action,
        l.entity,
        l.entityId,
        l.user
          ? `${l.user.firstName ?? ""} ${l.user.lastName ?? ""} <${
              l.user.email ?? ""
            }>`
          : "",
        l.ipAddress ?? "",
        (l.userAgent ?? "").slice(0, 200),
      ]);
      const csv = [header, ...rows]
        .map((cols) =>
          cols
            .map((c) => {
              const s = String(c ?? "");
              if (s.includes(",") || s.includes("\n") || s.includes('"')) {
                return '"' + s.replace(/"/g, '""') + '"';
              }
              return s;
            })
            .join(",")
        )
        .join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=audit-logs-${Date.now()}.csv`
      );
      return res.status(200).send(csv);
    } catch (error) {
      console.error("Failed to export audit logs", error);
      return res.status(500).json({ message: "Failed to export audit logs" });
    }
  }
);

// GET /api/audit-logs/:id
router.get(
  "/:id",
  authenticate,
  authorize("ADMIN", "SUPER_ADMIN"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const log = await prisma.auditLog.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
        },
      });
      if (!log) return res.status(404).json({ message: "Audit log not found" });
      return res.json(log);
    } catch (error) {
      console.error("Failed to fetch audit log", error);
      return res.status(500).json({ message: "Failed to fetch audit log" });
    }
  }
);

export default router;

import prisma from "../config/db";
import { Request } from "express";

export async function logAudit(
  req: Request,
  action: string,
  entity: string,
  entityId: string,
  oldData?: any,
  newData?: any
) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: req.user?.id,
        action,
        entity,
        entityId,
        oldData: oldData as any,
        newData: newData as any,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] as string,
      },
    });
  } catch (e) {
    console.error("Audit log error", e);
  }
}

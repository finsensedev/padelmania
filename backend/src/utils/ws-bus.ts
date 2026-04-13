import type { Server as SocketServer } from "socket.io";

let ioRef: SocketServer | null = null;

export function setIO(io: SocketServer) {
  ioRef = io;
}

export function emitPaymentUpdate(
  userId: string | null | undefined,
  payload: any
) {
  if (!ioRef) return;
  ioRef.emit("payments:update", payload);
  if (userId) {
    ioRef.to(`user:${userId}`).emit("payments:update", payload);
  }
}

export function emitBookingUpdate(courtId: string, payload: any) {
  if (!ioRef) return;
  ioRef.emit("bookings:update", { courtId, ...payload });
}

export function emitBookingCancelled(payload: { bookingId:string; bookingCode?:string; courtId:string; actorId:string; actorRole:string; actorEmail?:string; reason?:string; at:string; amount?:number }) {
  if(!ioRef) return;
  ioRef.emit('booking:cancelled', payload);
}

export function emitCourtAvailability(courtId: string, dateISO: string) {
  if (!ioRef) return;
  ioRef.emit("court:availability:updated", { courtId, date: dateISO });
}

// Maintenance events (extended payload includes optional maintenanceId)
export function emitMaintenanceCreated(payload: { maintenanceId?:string; courtId:string; start:string; end:string; cancelledCount:number }) {
  if (!ioRef) return;
  ioRef.emit('maintenance:created', payload);
}

export function emitMaintenanceCancellations(payload: { maintenanceId?:string; courtId:string; start:string; end:string; bookings: Array<{ bookingId:string; bookingCode:string; userEmail?:string; phone?:string; paymentRef?:string|null; previousStatus?:string; amount?:unknown }> }) {
  if (!ioRef) return;
  ioRef.emit('maintenance:cancellations', payload);
}

// Maintenance summary email dispatched (manager + optional finance variant)
export function emitMaintenanceEmailSummary(payload: { maintenanceId?:string; courtId:string; start:string; end:string; cancelled:number; paid:number; potentialRefund:number }) {
  if (!ioRef) return;
  ioRef.emit('maintenance:emailSummary', payload);
}

// User email verification completed
export function emitUserVerified(payload: { userId:string; email:string; at:string }) {
  if (!ioRef) return;
  ioRef.emit('user:verified', payload);
}

// Broadcast analytics deltas to privileged dashboards
export function emitAdminAnalytics(event: string, payload: any) {
  if (!ioRef) return;
  ioRef.emit(`admin:analytics:${event}`, payload);
}

// Shop product events
export function emitProductStockUpdated(payload: { productId: string; newStock: number; productName?: string }) {
  if (!ioRef) return;
  ioRef.emit("PRODUCT_STOCK_UPDATED", payload);
}

export function emitProductAdded(payload: { product: any }) {
  if (!ioRef) return;
  ioRef.emit("PRODUCT_ADDED", payload);
}

export function emitProductRemoved(payload: { productId: string; productName?: string }) {
  if (!ioRef) return;
  ioRef.emit("PRODUCT_REMOVED", payload);
}

export function emitProductUpdated(payload: { product: any }) {
  if (!ioRef) return;
  ioRef.emit("PRODUCT_UPDATED", payload);
}

// Shop order events
export function emitShopOrderUpdate(userId: string | null | undefined, payload: {
  orderId: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  message?: string;
}) {
  if (!ioRef) return;
  ioRef.emit("shop:order:update", payload);
  if (userId) {
    ioRef.to(`user:${userId}`).emit("shop:order:update", payload);
  }
}

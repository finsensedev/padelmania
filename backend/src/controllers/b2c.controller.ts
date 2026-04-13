import { Request, Response } from 'express';
import prisma from '../config/db';
import { emitPaymentUpdate, emitCourtAvailability, emitBookingUpdate } from '../utils/ws-bus';
import { format } from 'date-fns';

async function finalizeB2CRefund(opts: { paymentId: string; amount: number; success: boolean; reason: string; providerPayload: any }) {
  const payment = await prisma.payment.findUnique({ where: { id: opts.paymentId }, include: { booking: true } });
  if (!payment) return;
  const meta: any = payment.metadata || {};
  if (!meta.refundPending) return; // already handled
  if (!opts.success) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: payment.status === 'PROCESSING' ? (payment.refundAmount ? 'PARTIALLY_REFUNDED' : 'COMPLETED') : payment.status,
        metadata: { ...meta, refundPending: false, b2cRefundFailure: opts.providerPayload },
      },
    });
    await prisma.auditLog.create({
      data: { action: 'PAYMENT_REFUND_FAILED', entity: 'Payment', entityId: payment.id, userId: null, newData: { provider: 'MPESA_B2C', payload: opts.providerPayload } },
    });
    return;
  }
  const numericPaid = Number(payment.amount);
  const already = Number(payment.refundAmount || 0);
  const newTotal = already + opts.amount;
  const fully = Math.abs(newTotal - numericPaid) < 0.00001;
  const now = new Date();
  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      refundAmount: newTotal,
      refundReason: meta.refundReasonPending || opts.reason,
      status: fully ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
      refundedAt: fully ? now : payment.refundedAt,
      metadata: { ...meta, refundPending: false, b2cRefundCompletedAt: now.toISOString(), b2cProviderPayload: opts.providerPayload },
    },
  });
  if (payment.booking && fully) {
    const b = await prisma.booking.update({
      where: { id: payment.booking.id },
      data: { status: 'REFUNDED', cancellationReason: meta.refundReasonPending || opts.reason, cancelledAt: now },
      select: { id: true, courtId: true, startTime: true },
    });
    try {
      emitCourtAvailability(b.courtId, format(new Date(b.startTime), 'yyyy-MM-dd'));
      emitBookingUpdate(b.courtId, { bookingId: b.id, status: 'REFUNDED' });
    } catch (e) {
      console.warn('WS emit error (b2c booking refund)', e);
    }
  }
  try {
    emitPaymentUpdate(payment.userId, {
      status: updated.status,
      paymentId: payment.id,
      bookingId: payment.bookingId,
      refundAmount: opts.amount,
      refundTotal: newTotal,
      fullyRefunded: fully,
      b2c: true,
    });
  } catch (e) {
    console.warn('WS emit error (b2c refund)', e);
  }
  await prisma.auditLog.create({
    data: {
      action: fully ? 'PAYMENT_REFUND_FULL' : 'PAYMENT_REFUND_PARTIAL',
      entity: 'Payment',
      entityId: payment.id,
      userId: null,
      oldData: { refundAmount: already },
      newData: { refundAmount: newTotal, provider: 'MPESA_B2C', fully },
    },
  });
}

export class B2CController {
  static async result(req: Request, res: Response) {
    try {
      const body = req.body;
      const result = body?.Result || body?.result || body;
      const resultCode = result?.ResultCode;
      const resultDesc = result?.ResultDesc || 'B2C Result';
      const paramsArr: any[] = result?.ResultParameters?.ResultParameter || [];
      const paramLookup: Record<string, any> = {};
      for (const p of paramsArr) if (p?.Key) paramLookup[p.Key] = p.Value;
      const originConversation = result?.OriginatorConversationID;
      const conversationId = result?.ConversationID;
      const transReceipt = paramLookup['TransactionReceipt'];
      const transactionAmount = Number(paramLookup['TransactionAmount'] || paramLookup['Amount'] || 0);
      // Find payment via metadata.b2cRefundRequest.apiResponse OriginatorConversationID if stored
      const payment = await prisma.payment.findFirst({
        where: {
          OR: [
            { metadata: { path: ['b2cRefundRequest', 'apiResponse', 'OriginatorConversationID'], equals: originConversation } },
            { metadata: { path: ['b2cRefundRequest', 'apiResponse', 'ConversationID'], equals: conversationId } },
          ],
        },
      });
      if (!payment) {
        await prisma.auditLog.create({ data: { action: 'B2C_RESULT_PAYMENT_NOT_FOUND', entity: 'Payment', entityId: originConversation || conversationId || 'UNKNOWN', newData: body } });
        return res.status(200).json({ ok: true });
      }
      const success = resultCode === 0;
      await finalizeB2CRefund({ paymentId: payment.id, amount: transactionAmount, success, reason: resultDesc, providerPayload: body });
      // Optionally persist receipt
      if (success && transReceipt) {
        await prisma.payment.update({ where: { id: payment.id }, data: { providerRef: payment.providerRef || transReceipt } });
      }
      return res.status(200).json({ ok: true });
    } catch (e) {
      await prisma.auditLog.create({ data: { action: 'B2C_RESULT_HANDLER_ERROR', entity: 'Payment', entityId: 'N/A', newData: { error: (e as any)?.message } } });
      return res.status(200).json({ ok: false });
    }
  }
  static async timeout(req: Request, res: Response) {
    try {
      const body = req.body;
      await prisma.auditLog.create({ data: { action: 'B2C_TIMEOUT', entity: 'Payment', entityId: body?.ConversationID || 'UNKNOWN', newData: body } });
      return res.status(200).json({ ok: true });
    } catch (e) {
      await prisma.auditLog.create({ data: { action: 'B2C_TIMEOUT_HANDLER_ERROR', entity: 'Payment', entityId: 'N/A', newData: { error: (e as any)?.message } } });
      return res.status(200).json({ ok: false });
    }
  }
}

export default B2CController;
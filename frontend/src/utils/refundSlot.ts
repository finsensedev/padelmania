// Utility to compute refund eligibility & visual state for booking slot based refunds
// Uses environment values:
//   VITE_REFUND_SLOT_GRACE_MINUTES (matches backend REFUND_SLOT_GRACE_MINUTES)
//   VITE_REFUND_EXPIRY_SOON_MINUTES (UI highlight threshold before expiry)
export interface SlotRefundState {
  ended: boolean;              // slot end + grace in past
  soon: boolean;               // within soon threshold but not yet ended
  remainingMs: number;         // ms until end+grace (0 if ended)
  graceMinutes: number;        // parsed grace
  soonMinutes: number;         // parsed soon threshold
}

export function computeSlotRefundState(slotEndIso?: string | null, opts?: { now?: number }): SlotRefundState {
  const now = opts?.now ?? Date.now();
  const graceMinutes = parseInt(import.meta.env.VITE_REFUND_SLOT_GRACE_MINUTES || '0', 10) || 0;
  const soonMinutes = parseInt(import.meta.env.VITE_REFUND_EXPIRY_SOON_MINUTES || '15', 10) || 0;
  if (!slotEndIso) {
    return { ended: false, soon: false, remainingMs: Number.POSITIVE_INFINITY, graceMinutes, soonMinutes };
  }
  const end = new Date(slotEndIso).getTime();
  if (isNaN(end)) {
    return { ended: false, soon: false, remainingMs: Number.POSITIVE_INFINITY, graceMinutes, soonMinutes };
  }
  const deadline = end + graceMinutes * 60 * 1000;
  const remainingMs = Math.max(0, deadline - now);
  const ended = remainingMs === 0;
  const soon = !ended && remainingMs <= soonMinutes * 60 * 1000;
  return { ended, soon, remainingMs, graceMinutes, soonMinutes };
}

export function formatRemaining(ms: number): string {
  if (ms === Number.POSITIVE_INFINITY) return '';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const remM = m % 60;
    return `${h}h ${remM}m`;
  }
  return `${m}m ${s.toString().padStart(2,'0')}s`;
}

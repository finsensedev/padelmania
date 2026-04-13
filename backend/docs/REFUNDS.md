# Refund Architecture (B2C Only)

The Tudor Padel backend now uses a **single deterministic refund path**: direct M-Pesa **B2C payout**. All prior TransactionReversal (48h provider reversal) logic has been removed.

## High-Level Flow

### Manual Refunds

1. Admin / Manager / Finance Officer triggers refund (2FA required).
2. `PaymentController.refundPayment` validates amount and payment state.
3. Calls `MpesaService.b2cRefund` which initiates a B2C payment to the original payer's MSISDN (captured during STK callback and stored in `payment.metadata.phone`).
4. Refund is **optimistically finalized immediately**:
   - `refundAmount`, `status` (REFUNDED / PARTIALLY_REFUNDED), `refundedAt` (if fully refunded)
   - Booking (if associated and fully refunded) marked `REFUNDED` and slot availability broadcast.
5. **Customer notification email** (fire-and-forget, asynchronous):
   - Sent to customer whose payment was refunded (if email and booking available)
   - Includes booking details, refund amount, cancellation reason
   - Uses existing `buildBookingCancellationEmail` template
   - Logged in audit trail as `REFUND_CUSTOMER_NOTIFICATION`
6. **Staff notification emails** sent to all Managers and Finance Officers with refund summary.
7. WebSocket events notify UI clients.
8. Later B2C callback (result/timeout) is logged; it does not change state because no `refundPending` flag is set.

### Automatic Maintenance Refunds

1. Admin / Manager creates a maintenance blackout (2FA required).
2. System identifies all paid bookings overlapping the maintenance window.
3. Bookings are cancelled in database transaction.
4. **Automatic refund processing** (fire-and-forget, asynchronous):
   - For each cancelled booking with `payment.status === "COMPLETED"` and valid phone number
   - Initiates B2C refund via `MpesaService.b2cRefund`
   - Optimistically finalizes: payment marked `REFUNDED`, booking marked `REFUNDED`
   - Logs success/failure for each refund attempt
   - Creates audit summary of all automatic refunds
5. **Customer notification emails** (fire-and-forget, asynchronous):
   - Sent to all customers whose bookings were cancelled
   - Includes booking details, cancellation reason ("Court maintenance scheduled"), refund amount (if applicable)
   - Uses existing `buildBookingCancellationEmail` template
   - Logs success/failure for each email sent
   - Creates audit summary of all customer notifications (`MAINTENANCE_CUSTOMER_NOTIFICATIONS`)
6. Court availability is broadcast immediately after cancellation.
7. Emails sent to managers/finance with summary (including auto-refund status).

## Rationale for Optimistic Finalization

- Business requirement: immediate freeing of court slot for re-booking.
- Real-world experience: B2C result callbacks are reliable but sometimes delayed; optimistic approach avoids user confusion.
- Any rare payout failure post-initiation can be detected through reconciliation (see below) and manually adjusted.

## Key Database Fields

| Field                           | Purpose                                                    |
| ------------------------------- | ---------------------------------------------------------- |
| `payment.status`                | Updated to `REFUNDED` or `PARTIALLY_REFUNDED` immediately. |
| `payment.refundAmount`          | Cumulative total refunded.                                 |
| `payment.refundedAt`            | Timestamp only set when fully refunded.                    |
| `payment.metadata.lastRefundAt` | ISO time of last refund operation.                         |
| `booking.status`                | Set to `REFUNDED` for fully refunded linked bookings.      |

## Idempotency & Safety

- Full refunds set status to `REFUNDED`; refund endpoint rejects further refunds on that payment.
- Partial refunds accumulate until total refunded equals original amount (then status transitions to `REFUNDED`).
- Each refund action logs an audit record (`PAYMENT_REFUND_FULL` or `PAYMENT_REFUND_PARTIAL`).

## Environment Variables (B2C Mode – Real Only)

Refunds now have **no simulation fallback**; missing B2C credentials will hard‑fail with HTTP 502.

Required:
| Var | Purpose |
|-----|---------|
| `MPESA_CONSUMER_KEY` / `MPESA_CONSUMER_SECRET` | OAuth token retrieval (shared with STK). |
| `MPESA_ENV` | Must be `production` for real payouts. |
| `MPESA_SHORTCODE` | Funding paybill/till (used if no dedicated B2C shortcode). |
| `MPESA_CALLBACK_URL_BASE` | Base to derive B2C result & timeout URLs. Must be public HTTPS. |
| `MPESA_B2C_INITIATOR` | Safaricom provided B2C initiator username (NOT the shortcode). |
| `MPESA_B2C_CREDENTIAL` | SecurityCredential (encrypted initiator password using prod cert). |

Also required for STK intake (not B2C itself):
| Var | Purpose |
|-----|---------|
| `MPESA_PASSKEY` | STK password generation. |

Optional overrides / tuning:
| Var | Default | Notes |
|-----|---------|-------|
| `MPESA_B2C_SHORTCODE` | `MPESA_SHORTCODE` | Set if Safaricom issued a distinct payout shortcode. |
| `MPESA_B2C_RESULT_URL` | Derived | `{BASE}/api/payments/b2c/result` if unset. |
| `MPESA_B2C_TIMEOUT_URL` | Derived | `{BASE}/api/payments/b2c/timeout` if unset. |
| `MPESA_B2C_COMMAND_ID` | `BusinessPayment` | Others: `SalaryPayment`, `PromotionPayment` (must be approved). |
| `MPESA_B2C_OCCASION` | `REFUND` | <=30 chars label. |

Removed / deprecated:
| Removed Var | Reason |
|-------------|--------|
| `MPESA_REVERSAL_*` | Reversal path eliminated. |
| `REFUND_REVERSAL_MAX_HOURS` | Obsolete with reversal removal. |

Encrypt the initiator plain password with the Safaricom **production** public cert:

OpenSSL example:

```bash
openssl rsautl -encrypt -inkey saf_prod.cer -pubin -in pw.txt | base64 -w0
```

Where `pw.txt` contains only the initiator plain password (no trailing newline). Output is the value for `MPESA_B2C_CREDENTIAL`.

Node.js helper snippet:

```js
const fs = require("fs");
const crypto = require("crypto");
const password = process.env.INITIATOR_PASSWORD; // supply at runtime only
const cert = fs.readFileSync("./saf_prod.cer", "utf8");
const encrypted = crypto.publicEncrypt(
  { key: cert, padding: crypto.constants.RSA_PKCS1_PADDING },
  Buffer.from(password)
);
console.log(encrypted.toString("base64"));
```

### Troubleshooting B2C Errors

| Symptom                                     | Likely Cause                                                               | Action                                                              |
| ------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 502 + `Missing B2C initiator/credential`    | `MPESA_B2C_INITIATOR` or `MPESA_B2C_CREDENTIAL` unset                      | Populate both and redeploy.                                         |
| 400/500 with `Invalid Credentials`          | SecurityCredential not matching initiator (password changed or wrong cert) | Regenerate credential with correct prod cert.                       |
| No callback received                        | Callback base unreachable / firewall / ngrok sleeping                      | Curl the result URL publicly; ensure HTTPS and correct domain.      |
| Payout not received but optimistic REFUNDED | Downstream provider failure post-initiation                                | Run reconciliation script; manually compensate if confirmed failed. |
| `Request cancelled` style error             | Incorrect CommandID or unsupported product                                 | Use `BusinessPayment` unless Safaricom enabled others.              |

Security tips:

- Never store the plain initiator password in `.env`.
- Rotate initiator password periodically; regenerate `MPESA_B2C_CREDENTIAL` each time.
- Scope access to refund endpoint (2FA + role guard already in place).

## WebSocket Events

| Event                   | Trigger               | Payload Highlights                                                    |
| ----------------------- | --------------------- | --------------------------------------------------------------------- |
| `emitPaymentUpdate`     | After refund finalize | `status`, `paymentId`, `refundAmount`, `refundTotal`, `fullyRefunded` |
| `emitCourtAvailability` | Full booking refund   | Court/date for UI refresh                                             |

## Reconciliation Script

Because refunds are finalized optimistically, reconciliation provides a backstop ensuring financial integrity.

Script: `scripts/reconcile-b2c-refunds.ts`

What it checks:

- Callback latency: Flags refunds lacking any provider metadata beyond a grace window (default 15m) -> `NO_CALLBACK_META_>15M`.
- Data completeness: `NO_B2C_META` when no `b2cRefundRequest` object persisted (unexpected unless legacy data).
- Over-refund: `OVER_REFUNDED` if `refundAmount > amount` (should never occur; would indicate race or manual DB alteration).
- Missing receipt / providerRef: Identifies fully refunded payments without a receipt to assist audit.
- Missing phone: Prevents silent corruption where B2C could not have been legitimately executed.

Why it's needed:
| Risk | Without Reconciliation | With Reconciliation |
|------|------------------------|---------------------|
| Provider payout fails after optimistic mark | Slot freed, customer not paid | Flag appears (missing receipt / missing meta) enabling manual correction |
| Credential rotated (silent failures) | Multiple silent non-payouts | Wave of anomalies triggers investigation |
| Partial refund arithmetic bug | Gradual financial drift | OVER_REFUNDED alerts early |
| Malicious manual DB edit | Hard to detect | Inconsistent meta vs state flagged |

Run (last 24h default):

```bash
npm run reconcile:refunds
```

Custom window & JSON export:

```bash
npm run reconcile:refunds -- --hours 6 --limit 500 --json > refund-audit.json
```

Operational cadence suggestion:

- Hourly in cron for early detection (short window, e.g. `--hours 2`).
- Daily summary (24h) archived for finance review.
- Escalate if anomaly rate > 1% of examined refunds.

## Operational Runbook

| Scenario                                           | Action                                                                                                                        |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Court slot should reopen after refund              | Confirm booking status = REFUNDED and WS broadcast; otherwise check server logs.                                              |
| Callback shows failure but payment marked REFUNDED | Investigate via reconciliation script; if payout truly failed, adjust manually (create compensating payment or mark anomaly). |
| Wrong amount refunded                              | Create an administrative adjustment (manual charge + note) and audit log entry.                                               |

## Refund Notification Emails

When a refund (full or partial) is executed, the system now dispatches an email to all verified, active users with roles `MANAGER` and `FINANCE_OFFICER`.

Contents include:

- Refund scope (full / partial)
- Single refund amount and cumulative refunded total
- Original payment transaction ID & provider reference (if available)
- Booking code & slot (if tied to booking)
- Customer identity (name/email)
- Actor (staff member initiating refund)
- Reason supplied

Failure to send an email is non-fatal (logged as a console warning). Addresses are sent individually to avoid leaking recipient lists and improve deliverability.

## Refunds Export Endpoint

Administrators, Managers, and Finance Officers can export refund data as CSV or trigger an emailed export attachment.

Endpoint:
`GET /api/payments/refunds/export`

Query Parameters:
| Param | Required | Description |
|-------|----------|-------------|
| `from` | No | ISO datetime (inclusive lower bound on `refundedAt`). |
| `to` | No | ISO datetime (inclusive upper bound on `refundedAt`). |
| `search` | No | Case-insensitive match across transaction ID, booking code, customer email/name, provider ref. |
| `limit` | No | Max rows (default 5000, cap 20000). |
| `email` | No | If `true`/`1`/`yes`, CSV is emailed (attachment) to all managers & finance officers instead of inline download. |

Behavior:

- Without `email=true`: returns `text/csv` attachment immediately.
- With `email=true`: responds JSON `{ message: 'Refunds export emailed', rows }` after attempting dispatch.
- Audit log entry `REFUNDS_EXPORT_EMAIL` is created when email mode succeeds (records high-level parameters).
- CSV columns: `PaymentID,TransactionID,Status,RefundAmount,TotalPaid,RefundedAt,RefundReason,BookingCode,Court,SlotStart,SlotEnd,CustomerName,CustomerEmail,ProviderRef`.

Example Inline Download:
`GET /api/payments/refunds/export?from=2025-01-01&to=2025-01-31`

Example Email Export:
`GET /api/payments/refunds/export?from=2025-01-01&to=2025-01-31&email=true`

Error Cases:

- `400` if invalid dates or no recipients (email mode).
- `500` unexpected server error (logged).

## Changelog

| Date       | Change                                                                          |
| ---------- | ------------------------------------------------------------------------------- |
| 2025-10-06 | Added refund notification emails & CSV export endpoint.                         |
| 2025-10-09 | Clarified required B2C env vars (no simulation), added troubleshooting section. |

## Extending (Optional)

Future features that can layer without rewriting flow:

- Delayed finalization mode (add env to require callback before marking REFUNDED).
- Automatic anomaly remediation (queue follow-up B2C attempts).
- Exportable CSV from reconciliation results.

## Security Notes

- 2FA enforced for refund endpoint.
- Callback endpoint still subject to secret/IP checks (soft-fail advisable in early production). Callback no longer critical for state correctness.

## Glossary

| Term                    | Definition                                                            |
| ----------------------- | --------------------------------------------------------------------- |
| B2C                     | Business-to-Customer M-Pesa API for payouts.                          |
| Optimistic Finalization | Committing local state before external confirmation arrives.          |
| Reconciliation          | Process of verifying internal state against external system outcomes. |

---

Last updated: (auto-generated)

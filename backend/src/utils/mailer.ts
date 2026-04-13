import nodemailer from "nodemailer";
export { buildResendVerificationEmail } from "./resend-email-template";

// ---------------------------------------------------------------------------
// SMTP Configuration & Helper Flags
// ---------------------------------------------------------------------------

const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "465", 10);
const SMTP_SECURE = process.env.SMTP_SECURE
  ? /^true$/i.test(process.env.SMTP_SECURE)
  : SMTP_PORT === 465;
const SMTP_USER = process.env.SMTP_USER as string;
const SMTP_PASS = process.env.SMTP_PASS as string;
const MAIL_FROM = process.env.MAIL_FROM || SMTP_USER;
const MAIL_REPLY_TO = process.env.MAIL_REPLY_TO || MAIL_FROM;
const MAIL_DISABLE = /^true$/i.test(process.env.MAIL_DISABLE || "false");
const MAIL_LOG_PAYLOAD = /^true$/i.test(
  process.env.MAIL_LOG_PAYLOAD || "false",
);

if (!SMTP_USER || !SMTP_PASS) {
  console.warn(
    "[mailer] SMTP_USER/SMTP_PASS not configured. Email sending will fail until set.",
  );
}

// Use pooled connection for better performance under bursts
export const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  pool: true,
  maxConnections: Number(process.env.SMTP_MAX_CONNECTIONS || 3),
  maxMessages: Number(process.env.SMTP_MAX_MESSAGES || 50),
  auth:
    SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
});

let verifiedOnce = false;

async function verifyOnce() {
  if (verifiedOnce || MAIL_DISABLE) return true;
  try {
    await transporter.verify();
    verifiedOnce = true;
    console.log("✅ SMTP transporter verified (one-time)");
    return true;
  } catch (err) {
    console.warn("[mailer] Transport verify failed (will retry lazily):", err);
    return false;
  }
}

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string; // optionally provide plaintext; auto-generated if omitted
  fromName?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  attachments?: any[]; // pass-through for nodemailer
  skipVerify?: boolean; // skip lazy verify for fire-and-forget contexts
}

export async function sendMail(options: SendMailOptions) {
  const {
    to,
    subject,
    html,
    text,
    fromName,
    replyTo,
    headers,
    attachments,
    skipVerify,
  } = options;

  if (MAIL_DISABLE) {
    if (MAIL_LOG_PAYLOAD) {
      console.log(
        "[mailer] MAIL_DISABLE=true; email suppressed:",
        JSON.stringify({ to, subject }, null, 2),
      );
    } else {
      console.log(
        `[mailer] MAIL_DISABLE=true; suppressed email to ${to} (subject: ${subject})`,
      );
    }
    return { suppressed: true };
  }

  if (!SMTP_USER || !SMTP_PASS) {
    const msg =
      "SMTP credentials not configured. Please set SMTP_USER & SMTP_PASS.";
    console.error("❌", msg);
    throw new Error(msg);
  }

  // Lazy verify (only once) unless explicitly skipped
  if (!skipVerify) await verifyOnce();

  try {
    const fromAddr = MAIL_FROM || SMTP_USER;
    const plainText =
      text ||
      html
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const finalHeaders = {
      "X-Mailer": "Padel Mania System",
      "X-Priority": "3",
      ...(headers || {}),
    } as Record<string, string>;

    console.log(`� [mailer] Sending → to=${to} subject="${subject}"`);
    const info = await transporter.sendMail({
      from: `${fromName || "Padel Mania"} <${fromAddr}>`,
      to,
      subject,
      html,
      text: plainText,
      replyTo: replyTo || MAIL_REPLY_TO,
      headers: finalHeaders,
      attachments,
    });
    console.log(
      `✅ [mailer] Sent to ${to} id=${info.messageId} response=${info.response}`,
    );
    return info;
  } catch (error) {
    const domain = to.split("@")[1]?.toLowerCase() || "unknown";
    console.error(
      `❌ [mailer] Failed send to ${to} (domain=${domain}):`,
      error instanceof Error ? error.message : error,
    );
    console.error(
      `[mailer] DELIVERY_FAILURE domain=${domain} recipient=${to} subject="${subject}"`,
    );
    throw error;
  }
}

// Test email connection
export async function testEmailConnection() {
  if (MAIL_DISABLE) {
    console.log("[mailer] MAIL_DISABLE=true; skipping SMTP verify");
    return true;
  }
  try {
    await transporter.verify();
    console.log("✅ SMTP connection verified successfully");
    return true;
  } catch (error) {
    console.error("❌ SMTP connection failed:", error);
    return false;
  }
}

// Helper to be called during server startup
export async function ensureEmailReady() {
  if (MAIL_DISABLE) {
    console.log(
      "[mailer] Email disabled via MAIL_DISABLE env. No outbound emails will be sent.",
    );
    return;
  }
  const ok = await testEmailConnection();
  if (!ok) {
    console.warn(
      "[mailer] Proceeding without verified SMTP. Emails may fail at runtime.",
    );
  }
}

// ---------------------------------------------------------------------------
// Refund Notification Email Template (Staff)
// ---------------------------------------------------------------------------
export function buildRefundNotificationEmail(params: {
  refundAmount: number;
  totalRefunded: number;
  totalPaid: number;
  full: boolean;
  transactionId: string;
  bookingCode?: string | null;
  courtName?: string | null;
  slotStart?: Date | string | null;
  slotEnd?: Date | string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  reason?: string | null;
  referenceId?: string | null; // internal refund request id
}) {
  const {
    refundAmount,
    totalRefunded,
    totalPaid,
    full,
    transactionId,
    bookingCode,
    courtName,
    slotStart,
    slotEnd,
    customerName,
    customerEmail,
    actorName,
    actorRole,
    reason,
    referenceId,
  } = params;

  const fmt = (v: number) =>
    new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: "KES",
      maximumFractionDigits: 0,
    }).format(v);
  const dt = (d?: Date | string | null) =>
    d
      ? new Date(d).toLocaleString("en-KE", {
          hour12: false,
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";

  const subject = `💰 Refund ${full ? "Completed" : "Processed"} • ${fmt(
    refundAmount,
  )} • ${bookingCode || transactionId}`;

  const statusBadgeColor = full ? "#dc2626" : "#d97706";
  const statusBadgeBg = full ? "#fee2e2" : "#fef3c7";
  const statusText = full ? "FULL REFUND" : "PARTIAL REFUND";

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${subject}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:AllowPNG/>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <style type="text/css">
    table {border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt;}
    td {border-collapse: collapse; mso-line-height-rule: exactly;}
  </style>
  <![endif]-->
  <style type="text/css">
    * { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
    body { margin: 0; padding: 0; }
    @media only screen and (max-width: 600px) {
      .email-container { width: 100% !important; }
      .mobile-padding { padding: 20px !important; }
      .mobile-font { font-size: 14px !important; }
      .mobile-hide { display: none !important; }
    }
    @media (prefers-color-scheme: dark) {
      .dark-bg { background-color: #1a1a1a !important; }
      .dark-card { background-color: #2d2d2d !important; }
      .dark-text { color: #e5e5e5 !important; }
      .dark-text-secondary { color: #b3b3b3 !important; }
      .dark-border { border-color: #404040 !important; }
      .dark-accent-bg { background-color: #1e1b4b !important; }
    }
    :root { color-scheme: light dark; }
  </style>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f5f3ff; min-height: 100vh; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="dark-bg" style="background-color: #f5f3ff; padding: 20px 0; min-height: 100vh; mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
    <tr>
      <td align="center" valign="top" style="padding: 20px 10px;">
        <!--[if mso]>
        <table role="presentation" align="center" border="0" cellspacing="0" cellpadding="0" width="600">
        <tr>
        <td align="center" valign="top" width="600">
        <![endif]-->
        <table role="presentation" class="email-container dark-card" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; max-width: 600px; margin: 0 auto; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
          
          <!-- Header -->
          <tr>
            <td bgcolor="#6d28d9" style="background-color: #6d28d9; padding: 40px 30px; text-align: center; mso-line-height-rule: exactly; line-height: 1.5;">
              <!-- Icon -->
              <div style="font-size: 48px; line-height: 1; margin-bottom: 16px;">💰</div>
              
              <h1 style="color: #ffffff; font-size: 32px; font-weight: bold; margin: 0; font-family: Arial, Helvetica, sans-serif;">Refund ${
                full ? "Completed" : "Processed"
              }</h1>
              <p style="color: #ffffff; font-size: 18px; margin: 8px 0 0 0; font-weight: normal; font-family: Arial, Helvetica, sans-serif;">Financial Transaction Alert</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td class="mobile-padding dark-text" style="padding: 50px 40px; text-align: center;">
              
              <!-- Status Badge -->
              <table cellpadding="0" cellspacing="0" border="0" align="center" style="margin: 0 0 32px 0; mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                <tr>
                  <td bgcolor="${statusBadgeBg}" style="background-color: ${statusBadgeBg}; border-radius: 8px; padding: 10px 20px;">
                    <p style="margin: 0; font-size: 14px; font-weight: bold; color: ${statusBadgeColor}; font-family: Arial, Helvetica, sans-serif; text-transform: uppercase; letter-spacing: 0.5px;">
                      ${statusText}
                    </p>
                  </td>
                </tr>
              </table>

              <p class="dark-text-secondary mobile-font" style="color: #6b7280; font-size: 18px; line-height: 1.6; margin: 0 0 32px 0; font-family: Arial, Helvetica, sans-serif;">
                A ${
                  full ? "full" : "partial"
                } refund has been processed and recorded in the system. Please review the details below:
              </p>
              
              <!-- Amount Box -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 32px 0; mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                <tr>
                  <td bgcolor="#f5f3ff" class="dark-accent-bg dark-border" style="background-color: #f5f3ff; border-radius: 12px; padding: 32px; border: 1px solid #6d28d9;">
                    <p style="margin: 0 0 8px 0; font-size: 14px; color: #6d28d9; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; font-family: Arial, Helvetica, sans-serif;">Refund Amount</p>
                    <p style="margin: 0; font-size: 36px; font-weight: bold; color: #6d28d9; font-family: Arial, Helvetica, sans-serif;">${fmt(
                      refundAmount,
                    )}</p>
                    <p style="margin: 12px 0 0 0; font-size: 16px; color: #6d28d9; font-family: Arial, Helvetica, sans-serif;">
                      Total Refunded: <strong>${fmt(
                        totalRefunded,
                      )}</strong> of ${fmt(totalPaid)}
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Details Table -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" class="dark-border" style="border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; margin: 32px 0; text-align: left; mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                <tr>
                  <td colspan="2" bgcolor="#f9fafb" class="dark-accent-bg dark-border" style="background-color: #f9fafb; padding: 16px 20px; border-bottom: 1px solid #e5e7eb;">
                    <p class="dark-text" style="margin: 0; font-size: 16px; font-weight: bold; color: #111827; font-family: Arial, Helvetica, sans-serif;">📋 Transaction Details</p>
                  </td>
                </tr>
                <tr>
                  <td class="dark-text-secondary dark-border" style="padding: 12px 20px; font-weight: 600; color: #6b7280; font-size: 14px; border-bottom: 1px solid #f3f4f6; width: 40%; font-family: Arial, Helvetica, sans-serif;">Transaction ID</td>
                  <td class="dark-text dark-border" style="padding: 12px 20px; color: #111827; font-size: 14px; border-bottom: 1px solid #f3f4f6; font-family: Arial, Helvetica, sans-serif;">${transactionId}</td>
                </tr>
                ${
                  bookingCode
                    ? `<tr>
                  <td class="dark-text-secondary dark-border" style="padding: 12px 20px; font-weight: 600; color: #6b7280; font-size: 14px; border-bottom: 1px solid #f3f4f6; font-family: Arial, Helvetica, sans-serif;">Booking Code</td>
                  <td class="dark-text dark-border" style="padding: 12px 20px; color: #111827; font-size: 14px; border-bottom: 1px solid #f3f4f6; font-family: Arial, Helvetica, sans-serif;">${bookingCode}</td>
                </tr>`
                    : ""
                }
                ${
                  courtName
                    ? `<tr>
                  <td class="dark-text-secondary dark-border" style="padding: 12px 20px; font-weight: 600; color: #6b7280; font-size: 14px; border-bottom: 1px solid #f3f4f6; font-family: Arial, Helvetica, sans-serif;">Court</td>
                  <td class="dark-text dark-border" style="padding: 12px 20px; color: #111827; font-size: 14px; border-bottom: 1px solid #f3f4f6; font-family: Arial, Helvetica, sans-serif;">${courtName}</td>
                </tr>`
                    : ""
                }
                ${
                  slotStart
                    ? `<tr>
                  <td class="dark-text-secondary dark-border" style="padding: 12px 20px; font-weight: 600; color: #6b7280; font-size: 14px; border-bottom: 1px solid #f3f4f6; font-family: Arial, Helvetica, sans-serif;">Time Slot</td>
                  <td class="dark-text dark-border" style="padding: 12px 20px; color: #111827; font-size: 14px; border-bottom: 1px solid #f3f4f6; font-family: Arial, Helvetica, sans-serif;">${dt(
                    slotStart,
                  )}${
                    slotEnd
                      ? ` – ${new Date(slotEnd).toLocaleTimeString("en-KE", {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                        })}`
                      : ""
                  }</td>
                </tr>`
                    : ""
                }
                ${
                  customerName || customerEmail
                    ? `<tr>
                  <td class="dark-text-secondary dark-border" style="padding: 12px 20px; font-weight: 600; color: #6b7280; font-size: 14px; border-bottom: 1px solid #f3f4f6; font-family: Arial, Helvetica, sans-serif;">Customer</td>
                  <td class="dark-text dark-border" style="padding: 12px 20px; color: #111827; font-size: 14px; border-bottom: 1px solid #f3f4f6; font-family: Arial, Helvetica, sans-serif;">${
                    customerName || ""
                  }${
                    customerEmail
                      ? ` <span class="dark-text-secondary" style="color: #6b7280;">(${customerEmail})</span>`
                      : ""
                  }</td>
                </tr>`
                    : ""
                }
                ${
                  actorName || actorRole
                    ? `<tr>
                  <td class="dark-text-secondary dark-border" style="padding: 12px 20px; font-weight: 600; color: #6b7280; font-size: 14px; border-bottom: 1px solid #f3f4f6; font-family: Arial, Helvetica, sans-serif;">Processed By</td>
                  <td class="dark-text dark-border" style="padding: 12px 20px; color: #111827; font-size: 14px; border-bottom: 1px solid #f3f4f6; font-family: Arial, Helvetica, sans-serif;">${
                    actorName || ""
                  }${
                    actorRole
                      ? ` <span class="dark-text-secondary" style="color: #6b7280;">(${actorRole})</span>`
                      : ""
                  }</td>
                </tr>`
                    : ""
                }
                ${
                  reason
                    ? `<tr>
                  <td class="dark-text-secondary" style="padding: 12px 20px; font-weight: 600; color: #6b7280; font-size: 14px; font-family: Arial, Helvetica, sans-serif;">Reason</td>
                  <td class="dark-text" style="padding: 12px 20px; color: #111827; font-size: 14px; font-family: Arial, Helvetica, sans-serif;">${reason}</td>
                </tr>`
                    : ""
                }
              </table>

              <!-- Action Required Notice -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" class="dark-accent-bg" style="background-color: #f5f3ff; border-left: 4px solid #6d28d9; border-radius: 8px; margin: 32px 0; mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 12px 0; font-size: 15px; font-weight: bold; color: #6d28d9; font-family: Arial, Helvetica, sans-serif;">ℹ️ Next Steps</p>
                    <p style="margin: 0; font-size: 14px; color: #6d28d9; line-height: 1.6; font-family: Arial, Helvetica, sans-serif;">
                      • Verify the refund in the admin dashboard<br>
                      • Run reconciliation if needed<br>
                      • Check audit logs for any anomalies
                      ${
                        referenceId
                          ? `<br>• Reference ID: <strong>${referenceId}</strong>`
                          : ""
                      }
                    </p>
                  </td>
                </tr>
              </table>

              <p class="dark-text-secondary mobile-font" style="margin: 32px 0 0 0; font-size: 14px; color: #9ca3af; line-height: 1.6; font-family: Arial, Helvetica, sans-serif;">
                This is an automated notification sent to MANAGER and FINANCE_OFFICER roles. If you received this in error or have concerns about this refund, please contact the system administrator immediately.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td bgcolor="#f9fafb" class="dark-accent-bg dark-border" style="background-color: #f9fafb; padding: 40px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p class="dark-text-secondary" style="color: #6b7280; font-size: 12px; margin: 0 0 16px 0; line-height: 1.5; font-family: Arial, Helvetica, sans-serif;">
                © ${new Date().getFullYear()} Padel Mania. All rights reserved.<br>
                <span style="color: #6d28d9; font-weight: bold;">Mombasa, Kenya</span> | 
                <a href="mailto:support@padelmania.co.ke" style="color: #6d28d9; text-decoration: none;">support@padelmania.co.ke</a> | 
                <span style="color: #6d28d9; font-weight: bold;">+254 113 666 444</span>
              </p>
              <p class="dark-text-secondary" style="color: #9ca3af; font-size: 11px; margin: 0; font-family: Arial, Helvetica, sans-serif;">
                Powered by <a href="https://www.finsense.co.ke/" style="color: #fc4639; text-decoration: none; font-weight: 600;">FinSense Africa ❤️</a>
              </p>
            </td>
          </tr>
        </table>
        <!--[if mso]>
        </td>
        </tr>
        </table>
        <![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html };
}

export function buildWelcomeEmail(firstName: string) {
  return {
    subject: "🎉 Welcome to Padel Mania - Your Account is Ready!",
    html: `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>Welcome to Padel Mania</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:AllowPNG/>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <style type="text/css">
    table {border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt;}
    td {border-collapse: collapse; mso-line-height-rule: exactly;}
  </style>
  <![endif]-->
  <style type="text/css">
    * { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
    body { margin: 0; padding: 0; }
    @media only screen and (max-width: 600px) {
      .email-container { width: 100% !important; }
      .mobile-padding { padding: 20px !important; }
      .mobile-font { font-size: 14px !important; }
    }
    @media (prefers-color-scheme: dark) {
      .dark-bg { background-color: #1a1a1a !important; }
      .dark-card { background-color: #2d2d2d !important; }
      .dark-text { color: #e5e5e5 !important; }
      .dark-text-secondary { color: #b3b3b3 !important; }
      .dark-border { border-color: #404040 !important; }
      .dark-accent-bg { background-color: #1e1b4b !important; }
    }
    :root { color-scheme: light dark; }
  </style>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f5f3ff; min-height: 100vh; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="dark-bg" style="background-color: #f5f3ff; padding: 40px 0; min-height: 100vh; mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
    <tr>
      <td align="center" valign="top" style="padding: 20px 10px;">
        <!--[if mso]>
        <table role="presentation" align="center" border="0" cellspacing="0" cellpadding="0" width="600">
        <tr>
        <td align="center" valign="top" width="600">
        <![endif]-->
        <table role="presentation" class="email-container dark-card" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 12px; max-width: 600px; margin: 0 auto; box-shadow: 0 4px 6px rgba(0,0,0,0.1); mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                
          <!-- Header -->
          <tr>
            <td bgcolor="#6d28d9" style="background-color: #6d28d9; padding: 50px 30px; text-align: center; border-radius: 12px 12px 0 0;">
              
              <!-- Success Icon Circle -->
              <table width="100" cellpadding="0" cellspacing="0" border="0" align="center" role="presentation" style="margin-bottom: 24px; mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                <tr>
                  <td width="100" height="100" bgcolor="rgba(255, 255, 255, 0.2)" style="background-color: rgba(255, 255, 255, 0.2); border-radius: 50px; text-align: center; vertical-align: middle;">
                    <table width="60" cellpadding="0" cellspacing="0" border="0" align="center" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                      <tr>
                        <td width="60" height="60" bgcolor="#ffffff" style="background-color: #ffffff; border-radius: 30px; text-align: center; vertical-align: middle; font-size: 32px; color: #6d28d9; font-weight: bold; line-height: 60px;">
                          ✓
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <h1 style="color: #ffffff; font-size: 32px; font-weight: bold; margin: 0; font-family: Arial, Helvetica, sans-serif;">Account Verified Successfully!</h1>
              <p style="color: #ffffff; font-size: 18px; margin: 8px 0 0 0; font-weight: normal; font-family: Arial, Helvetica, sans-serif;">Welcome to Padel Mania</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td class="mobile-padding dark-text" style="padding: 50px 40px; text-align: center;">
              <h2 class="dark-text" style="color: #111827; font-size: 28px; font-weight: bold; margin: 0 0 24px 0; font-family: Arial, Helvetica, sans-serif;">Welcome to Padel Mania, ${firstName}! 🎉</h2>
              
              <p class="dark-text-secondary mobile-font" style="color: #6b7280; font-size: 18px; line-height: 1.6; margin: 0 0 32px 0; font-family: Arial, Helvetica, sans-serif;">
                Your email has been successfully verified and your account is now active. You're all set to start your padel journey with us!
              </p>
              
              <!-- Welcome Bonus Box -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin: 32px 0; mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                <tr>
                  <td bgcolor="#f5f3ff" class="dark-accent-bg dark-border" style="background-color: #f5f3ff; border-radius: 12px; padding: 32px; border: 1px solid #6d28d9;">
                    <h3 style="color: #6d28d9; font-size: 20px; font-weight: bold; margin: 0 0 16px 0; font-family: Arial, Helvetica, sans-serif;">🎁 Welcome Bonus</h3>
                    <p style="color: #6d28d9; font-size: 18px; margin: 0; font-family: Arial, Helvetica, sans-serif;">You've received <strong style="color: #f59e0b;">100 loyalty points</strong> to get you started!</p>
                  </td>
                </tr>
              </table>
              
              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" border="0" align="center" role="presentation" style="margin: 40px 0; mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                <tr>
                  <td bgcolor="#6d28d9" style="background-color: #6d28d9; border-radius: 12px; padding: 0;">
                    <a href="#" style="display: block; color: #ffffff; text-decoration: none; padding: 16px 32px; font-weight: bold; font-size: 16px; font-family: Arial, Helvetica, sans-serif;">
                      🎾 Start Playing Now
                    </a>
                  </td>
                </tr>
              </table>
              
              <p class="dark-text-secondary mobile-font" style="color: #6b7280; font-size: 16px; margin: 32px 0; font-family: Arial, Helvetica, sans-serif;">
                Ready to play? Log in to your account and book your first court.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td bgcolor="#f9fafb" class="dark-accent-bg dark-border" style="background-color: #f9fafb; padding: 40px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p class="dark-text-secondary" style="color: #6b7280; font-size: 12px; margin: 0 0 16px 0; line-height: 1.5; font-family: Arial, Helvetica, sans-serif;">
                © ${new Date().getFullYear()} Padel Mania. All rights reserved.<br>
                <span style="color: #6d28d9; font-weight: bold;">Mombasa, Kenya</span> | 
                <a href="mailto:support@padelmania.co.ke" style="color: #6d28d9; text-decoration: none;">support@padelmania.co.ke</a> | 
                <span style="color: #6d28d9; font-weight: bold;">+254 113 666 444</span>
              </p>
              <p class="dark-text-secondary" style="color: #9ca3af; font-size: 11px; margin: 0; font-family: Arial, Helvetica, sans-serif;">
                Powered by <a href="https://www.finsense.co.ke/" style="color: #fc4639; text-decoration: none; font-weight: 600;">FinSense Africa ❤️</a>
              </p>
            </td>
          </tr>
        </table>
        <!--[if mso]>
        </td>
        </tr>
        </table>
        <![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`,
  };
}

export function buildBookingConfirmationEmail(params: {
  firstName?: string;
  bookingCode: string;
  courtName: string;
  date: string; // e.g. Friday, Sep 19 2025
  timeRange: string; // e.g. 14:00 - 15:00
  players: number;
  amount: number; // numeric (KES) - total amount paid (could be 0 if fully covered by voucher/gift card)
  subtotal?: number; // optional - original amount before discounts
  voucherDiscount?: number; // optional - amount discounted by voucher
  voucherCode?: string; // optional - voucher code used
  giftCardAmount?: number; // optional - amount paid via gift card
  giftCardCode?: string; // optional - gift card code used
  manageUrl?: string; // optional link to view/manage booking
  // New: support multiple courts
  isMultipleCourts?: boolean; // flag indicating multiple courts
  courtDetails?: Array<{ name: string; timeRange: string }>; // array of court details for multi-court bookings
}) {
  const {
    firstName,
    bookingCode,
    courtName,
    date,
    timeRange,
    players,
    amount,
    subtotal,
    voucherDiscount,
    voucherCode,
    giftCardAmount,
    giftCardCode,
    manageUrl,
    isMultipleCourts,
    courtDetails,
  } = params;

  const greeting = firstName ? `Hi ${firstName}` : "Hello";
  const currencyFormatter = new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  });
  const currency = currencyFormatter.format(amount);

  const subject = `🎾 Booking Confirmed • ${bookingCode}`;
  const buttonUrl =
    manageUrl || process.env.APP_URL || "https://padelmania.co.ke";

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>Booking Confirmed</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:AllowPNG/>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <style type="text/css">
    table {border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt;}
    td {border-collapse: collapse; mso-line-height-rule: exactly;}
  </style>
  <![endif]-->
  <style type="text/css">
    * { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
    body { margin: 0; padding: 0; }
    @media only screen and (max-width: 600px) {
      .email-container { width: 100% !important; }
      .mobile-padding { padding: 20px !important; }
    }
    @media (prefers-color-scheme: dark) {
      .dark-bg { background-color: #1a1a1a !important; }
      .dark-card { background-color: #2d2d2d !important; }
      .dark-text { color: #e5e5e5 !important; }
      .dark-text-secondary { color: #b3b3b3 !important; }
      .dark-border { border-color: #404040 !important; }
      .dark-accent-bg { background-color: #1e1b4b !important; }
    }
    :root { color-scheme: light dark; }
  </style>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f5f3ff;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="dark-bg" style="background:#f5f3ff;padding:40px 0;mso-table-lspace:0pt;mso-table-rspace:0pt;">
    <tr><td align="center" valign="top" style="padding:20px 10px;">
      <!--[if mso]>
      <table role="presentation" align="center" border="0" cellspacing="0" cellpadding="0" width="600">
      <tr>
      <td align="center" valign="top" width="600">
      <![endif]-->
      <table role="presentation" class="email-container dark-card" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);mso-table-lspace:0pt;mso-table-rspace:0pt;">
        <tr>
          <td style="background:#6d28d9;padding:36px 28px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">Booking Confirmed</h1>
            <p style="margin:8px 0 0;color:#ede9fe;font-size:14px;font-family:Arial,Helvetica,sans-serif;">${bookingCode}</p>
          </td>
        </tr>
        <tr>
          <td class="mobile-padding dark-text" style="padding:40px 34px;">
            <p class="dark-text" style="margin:0 0 18px;color:#111827;font-size:16px;line-height:1.55;font-family:Arial,Helvetica,sans-serif;">${greeting},</p>
            <p class="dark-text-secondary" style="margin:0 0 22px;color:#4b5563;font-size:15px;line-height:1.55;font-family:Arial,Helvetica,sans-serif;">${
              isMultipleCourts
                ? "Your multi-court booking has been confirmed. We can't wait to see you on court! Below are the details:"
                : "Your court booking has been confirmed. We can't wait to see you on court! Below are the details:"
            }</p>
            <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" class="dark-border" style="margin:0 0 28px;border:1px solid #e5e7eb;border-radius:10px;mso-table-lspace:0pt;mso-table-rspace:0pt;">
              <tr><td class="dark-accent-bg" style="padding:22px 24px;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="font-size:14px;color:#111827;line-height:1.5;mso-table-lspace:0pt;mso-table-rspace:0pt;">
                  ${
                    isMultipleCourts && courtDetails && courtDetails.length > 0
                      ? `<tr><td colspan="2" class="dark-text dark-border" style="padding:4px 0 12px 0;font-weight:700;color:#111827;border-bottom:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;">Courts Booked</td></tr>
                    ${courtDetails
                      .map(
                        (court, idx) =>
                          `<tr><td style="padding:8px 0;font-weight:600;width:140px;">${
                            court.name
                          }</td><td style="padding:8px 0;">${
                            court.timeRange
                          }</td></tr>${
                            idx < courtDetails.length - 1
                              ? '<tr><td colspan="2" style="padding:0;border-bottom:1px solid #f3f4f6;"></td></tr>'
                              : ""
                          }`,
                      )
                      .join("")}
                    <tr><td colspan="2" style="padding:12px 0 8px 0;border-top:1px solid #e5e7eb;"></td></tr>`
                      : `<tr><td style="padding:4px 0;font-weight:600;width:140px;">Court</td><td style="padding:4px 0;">${courtName}</td></tr>
                    <tr><td style="padding:4px 0;font-weight:600;">Time</td><td style="padding:4px 0;">${timeRange}</td></tr>`
                  }
                    <tr><td class="dark-text-secondary" style="padding:4px 0;font-weight:600;font-family:Arial,Helvetica,sans-serif;">Date</td><td class="dark-text" style="padding:4px 0;font-family:Arial,Helvetica,sans-serif;">${date}</td></tr>
                    <tr><td class="dark-text-secondary" style="padding:4px 0;font-weight:600;font-family:Arial,Helvetica,sans-serif;">Players</td><td class="dark-text" style="padding:4px 0;font-family:Arial,Helvetica,sans-serif;">${players}</td></tr>
                    <tr><td class="dark-text-secondary" style="padding:4px 0;font-weight:600;font-family:Arial,Helvetica,sans-serif;">Booking Code</td><td class="dark-text" style="padding:4px 0;font-family:monospace;">${bookingCode}</td></tr>
                  </table>
                  ${
                    subtotal || voucherDiscount || giftCardAmount
                      ? `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" class="dark-border" style="font-size:13px;color:#111827;line-height:1.5;margin-top:16px;padding-top:16px;border-top:1px solid #e5e7eb;mso-table-lspace:0pt;mso-table-rspace:0pt;">
                    <tr><td colspan="2" class="dark-text" style="padding:0 0 8px 0;font-weight:700;color:#111827;font-family:Arial,Helvetica,sans-serif;">Payment Summary</td></tr>
                    ${
                      subtotal
                        ? `<tr><td class="dark-text-secondary" style="padding:4px 0;width:140px;font-family:Arial,Helvetica,sans-serif;">Subtotal</td><td class="dark-text" style="padding:4px 0;text-align:right;font-family:Arial,Helvetica,sans-serif;">${currencyFormatter.format(
                            subtotal,
                          )}</td></tr>`
                        : ""
                    }
                    ${
                      voucherDiscount && voucherDiscount > 0
                        ? `<tr><td class="dark-text-secondary" style="padding:4px 0;font-family:Arial,Helvetica,sans-serif;">Voucher${
                            voucherCode ? ` (${voucherCode})` : ""
                          }</td><td style="padding:4px 0;text-align:right;color:#7c3aed;font-family:Arial,Helvetica,sans-serif;">-${currencyFormatter.format(
                            voucherDiscount,
                          )}</td></tr>`
                        : ""
                    }
                    ${
                      giftCardAmount && giftCardAmount > 0
                        ? `<tr><td class="dark-text-secondary" style="padding:4px 0;font-family:Arial,Helvetica,sans-serif;">Gift Card${
                            giftCardCode ? ` (${giftCardCode})` : ""
                          }</td><td style="padding:4px 0;text-align:right;color:#7c3aed;font-family:Arial,Helvetica,sans-serif;">-${currencyFormatter.format(
                            giftCardAmount,
                          )}</td></tr>`
                        : ""
                    }
                    <tr class="dark-border" style="border-top:1px solid #e5e7eb;"><td class="dark-text" style="padding:8px 0 4px 0;font-weight:700;font-family:Arial,Helvetica,sans-serif;">Amount Paid${
                      amount === 0 ? " (M-Pesa)" : ""
                    }</td><td style="padding:8px 0 4px 0;text-align:right;color:#6d28d9;font-weight:700;font-size:15px;font-family:Arial,Helvetica,sans-serif;">${currency}</td></tr>
                  </table>`
                      : `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" class="dark-border" style="font-size:14px;color:#111827;line-height:1.5;margin-top:16px;padding-top:16px;border-top:1px solid #e5e7eb;mso-table-lspace:0pt;mso-table-rspace:0pt;">
                    <tr><td class="dark-text-secondary" style="padding:4px 0;font-weight:600;width:140px;font-family:Arial,Helvetica,sans-serif;">Amount Paid</td><td style="padding:4px 0;text-align:right;color:#6d28d9;font-weight:700;font-family:Arial,Helvetica,sans-serif;">${currency}</td></tr>
                  </table>`
                  }
                </td></tr>
              </table>
              <table cellpadding="0" cellspacing="0" border="0" align="center" role="presentation" style="margin:0 0 34px;mso-table-lspace:0pt;mso-table-rspace:0pt;">
                <tr><td style="background:#6d28d9;border-radius:10px;">
                  <a href="${buttonUrl}" style="display:block;padding:14px 28px;color:#ffffff;font-weight:600;font-size:15px;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">View / Manage Booking</a>
                </td></tr>
              </table>
              <p class="dark-text-secondary" style="margin:0 0 14px;color:#374151;font-size:13px;line-height:1.5;font-family:Arial,Helvetica,sans-serif;">Please arrive 10 minutes before your start time to warm up and check in with staff. Remember to bring appropriate footwear and stay hydrated.</p>
              <p class="dark-text-secondary" style="margin:0 0 26px;color:#6b7280;font-size:12px;font-family:Arial,Helvetica,sans-serif;">If you need to make changes, you can manage your booking via the button above.</p>
              <p class="dark-text" style="margin:0;color:#111827;font-size:14px;font-weight:600;font-family:Arial,Helvetica,sans-serif;">See you soon! 👋</p>
              <p style="margin:6px 0 0;color:#6d28d9;font-size:13px;font-family:Arial,Helvetica,sans-serif;">Padel Mania Team</p>
            </td>
          </tr>
          <tr>
            <td class="dark-accent-bg dark-border" style="background:#f9fafb;padding:28px 30px;text-align:center;border-top:1px solid #e5e7eb;">
              <p class="dark-text-secondary" style="margin:0 0 12px 0;color:#6b7280;font-size:11px;line-height:1.5;font-family:Arial,Helvetica,sans-serif;">© ${new Date().getFullYear()} Padel Mania. Mombasa, Kenya • <a href="mailto:support@padelmania.co.ke" style="color:#6d28d9;text-decoration:none;">support@padelmania.co.ke</a></p>
              <p class="dark-text-secondary" style="margin:0;color:#9ca3af;font-size:10px;font-family:Arial,Helvetica,sans-serif;">Powered by <a href="https://www.finsense.co.ke/" style="color:#fc4639;text-decoration:none;font-weight:600;">FinSense Africa ❤️</a></p>
            </td>
          </tr>
        </table>
        <!--[if mso]>
        </td>
        </tr>
        </table>
        <![endif]-->
      </td></tr>
    </table>
  </body></html>`;

  return { subject, html };
}

export function buildVerificationEmail(verifyUrl: string, firstName?: string) {
  const greeting = firstName ? `Hi ${firstName}` : "Hello";

  return {
    subject: "🎾 Welcome to Padel Mania - Verify Your Account",
    html: `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>Verify Your Padel Mania Account</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:AllowPNG/>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <style type="text/css">
    table {border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt;}
    td {border-collapse: collapse; mso-line-height-rule: exactly;}
  </style>
  <![endif]-->
  <style type="text/css">
    * { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
    body { margin: 0; padding: 0; }
    @media only screen and (max-width: 600px) {
      .email-container { width: 100% !important; }
      .mobile-padding { padding: 20px !important; }
    }
    @media (prefers-color-scheme: dark) {
      .dark-bg { background-color: #1a1a1a !important; }
      .dark-card { background-color: #2d2d2d !important; }
      .dark-text { color: #e5e5e5 !important; }
      .dark-text-secondary { color: #b3b3b3 !important; }
      .dark-border { border-color: #404040 !important; }
      .dark-accent-bg { background-color: #1e1b4b !important; }
    }
    :root { color-scheme: light dark; }
  </style>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f5f3ff; min-height: 100vh; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="dark-bg" style="background-color: #f5f3ff; padding: 40px 0; min-height: 100vh; mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
    <tr>
      <td align="center" valign="top" style="padding: 20px 10px;">
        <!--[if mso]>
        <table role="presentation" align="center" border="0" cellspacing="0" cellpadding="0" width="600">
        <tr>
        <td align="center" valign="top" width="600">
        <![endif]-->
        <table role="presentation" class="email-container dark-card" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 12px; max-width: 600px; margin: 0 auto; box-shadow: 0 4px 6px rgba(0,0,0,0.1); mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                
          <!-- Header -->
          <tr>
            <td bgcolor="#6d28d9" style="background-color: #6d28d9; padding: 50px 30px; text-align: center; border-radius: 12px 12px 0 0;">
              <h1 style="color: #ffffff; font-size: 32px; font-weight: bold; margin: 0; font-family: Arial, Helvetica, sans-serif;">Padel Mania</h1>
              <p style="color: #ffffff; font-size: 18px; margin: 8px 0 0 0; font-weight: normal; font-family: Arial, Helvetica, sans-serif;">Join Padel Mania today</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td class="mobile-padding dark-text" style="padding: 30px 40px;">
              
              <p class="dark-text-secondary" style="color: #6b7280; font-size: 18px; line-height: 1.6; margin: 0 0 24px 0; text-align: center; font-family: Arial, Helvetica, sans-serif;">${greeting},</p>
              
              <p class="dark-text-secondary" style="color: #6b7280; font-size: 16px; line-height: 1.6; margin: 0 0 32px 0; text-align: center; font-family: Arial, Helvetica, sans-serif;">
                Thank you for joining Padel Mania! We're excited to have you as part of our padel community. To complete your registration and start booking courts, please verify your email address.
              </p>
              
              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" border="0" align="center" role="presentation" style="margin: 40px 0; mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                <tr>
                  <td bgcolor="#6d28d9" style="background-color: #6d28d9; border-radius: 12px; padding: 0;">
                    <a href="${verifyUrl}" style="display: block; color: #ffffff; text-decoration: none; padding: 16px 32px; font-weight: bold; font-size: 16px; font-family: Arial, Helvetica, sans-serif;">
                      ✅ Verify My Email Address
                    </a>
                  </td>
                </tr>
              </table>
              
              <p class="dark-text-secondary" style="color: #6b7280; font-size: 14px; line-height: 1.5; margin: 32px 0 24px 0; text-align: center; font-family: Arial, Helvetica, sans-serif;">
                This verification link will expire in <strong style="color: #6d28d9;">30 minutes</strong> for security purposes.
              </p>
              
              <!-- Alternative Link -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin: 32px 0; mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                <tr>
                  <td bgcolor="#f9fafb" class="dark-accent-bg dark-border" style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px;">
                    <p class="dark-text" style="color: #111827; font-size: 14px; margin: 0 0 12px 0; font-weight: bold; font-family: Arial, Helvetica, sans-serif;">Can't click the button? Copy and paste this link:</p>
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                      <tr>
                        <td bgcolor="#ffffff" class="dark-card dark-border" style="background-color: #ffffff; padding: 12px; border-radius: 8px; border: 1px solid #e5e7eb;">
                          <a href="${verifyUrl}" style="color: #6d28d9; text-decoration: none; font-family: monospace; font-size: 13px; word-break: break-all;">${verifyUrl}</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <!-- What's Next -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin: 32px 0; mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                <tr>
                  <td bgcolor="#f5f3ff" class="dark-accent-bg" style="background-color: #f5f3ff; border-left: 4px solid #6d28d9; padding: 24px; border-radius: 0 12px 12px 0;">
                    <h3 style="color: #6d28d9; font-size: 18px; font-weight: bold; margin: 0 0 16px 0; font-family: Arial, Helvetica, sans-serif;">🎯 What's next?</h3>
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                      <tr>
                        <td style="color: #6d28d9; font-size: 16px; line-height: 1.8; font-family: Arial, Helvetica, sans-serif;">
                          • Complete your profile setup<br>
                          • Browse available courts and time slots<br>
                          • Make your first booking<br>
                          • Earn loyalty points with every game
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td bgcolor="#f9fafb" class="dark-accent-bg dark-border" style="background-color: #f9fafb; padding: 40px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p class="dark-text-secondary" style="color: #6b7280; font-size: 14px; margin: 0 0 20px 0; line-height: 1.6; font-family: Arial, Helvetica, sans-serif;">
                If you didn't create an account with Padel Mania, please ignore this email or 
                <a href="mailto:support@padelmania.co.ke" style="color: #6d28d9; text-decoration: none; font-weight: bold;">contact our support team</a>.
              </p>
              
              <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" class="dark-border" style="border-top: 1px solid #e5e7eb; margin-top: 24px; padding-top: 24px; mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                <tr>
                  <td>
                    <p class="dark-text-secondary" style="color: #6b7280; font-size: 12px; margin: 0 0 12px 0; line-height: 1.5; font-family: Arial, Helvetica, sans-serif;">
                      © ${new Date().getFullYear()} Padel Mania. All rights reserved.<br>
                      <span style="color: #6d28d9; font-weight: bold;">Mombasa, Kenya</span> | 
                      <a href="mailto:support@padelmania.co.ke" style="color: #6d28d9; text-decoration: none;">support@padelmania.co.ke</a> | 
                      <span style="color: #6d28d9; font-weight: bold;">+254 113 666 444</span>
                    </p>
                    <p class="dark-text-secondary" style="color: #9ca3af; font-size: 11px; margin: 0; font-family: Arial, Helvetica, sans-serif;">
                      Powered by <a href="https://www.finsense.co.ke/" style="color: #fc4639; text-decoration: none; font-weight: 600;">FinSense Africa ❤️</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        <!--[if mso]>
        </td>
        </tr>
        </table>
        <![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`,
  };
}

export function buildPasswordResetEmail(resetUrl: string, firstName?: string) {
  const greeting = firstName ? `Hi ${firstName}` : "Hello";

  return {
    subject: "Reset your Padel Mania password",
    html: `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>Reset your password</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:AllowPNG/>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <style type="text/css">
    table {border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt;}
    td {border-collapse: collapse; mso-line-height-rule: exactly;}
  </style>
  <![endif]-->
  <style type="text/css">
    * { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
    body { margin: 0; padding: 0; }
    @media only screen and (max-width: 600px) {
      .email-container { width: 100% !important; }
      .mobile-padding { padding: 20px !important; }
    }
    @media (prefers-color-scheme: dark) {
      .dark-bg { background-color: #1a1a1a !important; }
      .dark-card { background-color: #2d2d2d !important; }
      .dark-text { color: #e5e5e5 !important; }
      .dark-text-secondary { color: #b3b3b3 !important; }
      .dark-border { border-color: #404040 !important; }
      .dark-accent-bg { background-color: #1e1b4b !important; }
    }
    :root { color-scheme: light dark; }
  </style>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background-color:#f5f3ff;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="dark-bg" style="background-color:#f5f3ff;padding:32px 0;mso-table-lspace:0pt;mso-table-rspace:0pt;">
    <tr>
      <td align="center" valign="top" style="padding:20px 10px;">
        <!--[if mso]>
        <table role="presentation" align="center" border="0" cellspacing="0" cellpadding="0" width="600">
        <tr>
        <td align="center" valign="top" width="600">
        <![endif]-->
        <table role="presentation" class="email-container dark-card" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 12px 24px rgba(34,115,75,0.12);mso-table-lspace:0pt;mso-table-rspace:0pt;">
          <tr>
            <td style="background:#6d28d9;padding:32px 24px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">Reset Password</h1>
            </td>
          </tr>
          <tr>
            <td class="mobile-padding dark-text" style="padding:32px 28px;color:#374151;font-size:16px;line-height:1.6;">
              <p class="dark-text" style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;">${greeting},</p>
              <p class="dark-text-secondary" style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;">
                We received a request to reset the password for your Padel Mania account.
                Click the button below to choose a new password. This link will stay active for the next hour.
              </p>
              <p class="dark-text-secondary" style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;">
                If you didn't request this, you can safely ignore this email—your password will stay the same.
              </p>
              <table cellpadding="0" cellspacing="0" border="0" align="center" role="presentation" style="margin:32px auto;mso-table-lspace:0pt;mso-table-rspace:0pt;">
                <tr>
                  <td style="background:#6d28d9;border-radius:12px;">
                    <a
                      href="${resetUrl}"
                      style="display:block;padding:14px 32px;color:#ffffff;font-weight:600;font-size:16px;text-decoration:none;font-family:Arial,Helvetica,sans-serif;"
                    >Choose a new password</a>
                  </td>
                </tr>
              </table>
              <p class="dark-text-secondary" style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;">Or copy and paste this link into your browser:</p>
              <p class="dark-text" style="margin:0 0 24px 0;word-break:break-all;color:#1f2937;font-size:14px;font-family:Arial,Helvetica,sans-serif;">
                ${resetUrl}
              </p>
            </td>
          </tr>
          <tr>
            <td class="dark-accent-bg dark-border" style="background:#f9fafb;padding:24px;text-align:center;color:#6b7280;font-size:12px;">
              <p class="dark-text-secondary" style="margin:0 0 12px 0;font-family:Arial,Helvetica,sans-serif;">
                This link expires in 60 minutes for your security.<br />
                © ${new Date().getFullYear()} Padel Mania. Mombasa, Kenya •
                <a href="mailto:support@padelmania.co.ke" style="color:#6d28d9;text-decoration:none;">support@padelmania.co.ke</a>
              </p>
              <p class="dark-text-secondary" style="margin:0;color:#9ca3af;font-size:10px;font-family:Arial,Helvetica,sans-serif;">
                Powered by <a href="https://www.finsense.co.ke/" style="color:#fc4639;text-decoration:none;font-weight:600;">FinSense Africa ❤️</a>
              </p>
            </td>
          </tr>
        </table>
        <!--[if mso]>
        </td>
        </tr>
        </table>
        <![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`,
  };
}

export function buildTwoFactorSetupEmail(
  secret: string,
  {
    email,
    firstName,
    issuer = "Padel Mania",
  }: { email: string; firstName?: string; issuer?: string },
) {
  const greeting = firstName ? `Hi ${firstName}` : "Hello";

  return {
    subject: "Set up Two‑Factor Authentication (2FA)",
    html: `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>2FA Setup</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:AllowPNG/>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <style type="text/css">
    table {border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt;}
    td {border-collapse: collapse; mso-line-height-rule: exactly;}
  </style>
  <![endif]-->
  <style type="text/css">
    * { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
    body { margin: 0; padding: 0; }
    @media only screen and (max-width: 600px) {
      .email-container { width: 100% !important; }
      .mobile-padding { padding: 20px !important; }
    }
    @media (prefers-color-scheme: dark) {
      .dark-bg { background-color: #1a1a1a !important; }
      .dark-card { background-color: #2d2d2d !important; }
      .dark-text { color: #e5e5e5 !important; }
      .dark-text-secondary { color: #b3b3b3 !important; }
      .dark-border { border-color: #404040 !important; }
      .dark-accent-bg { background-color: #1e1b4b !important; }
    }
    :root { color-scheme: light dark; }
  </style>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background-color:#f5f3ff;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="dark-bg" style="background-color:#f5f3ff;padding:32px 0;mso-table-lspace:0pt;mso-table-rspace:0pt;">
    <tr>
      <td align="center" valign="top" style="padding:20px 10px;">
        <!--[if mso]>
        <table role="presentation" align="center" border="0" cellspacing="0" cellpadding="0" width="600">
        <tr>
        <td align="center" valign="top" width="600">
        <![endif]-->
        <table role="presentation" class="email-container dark-card" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border-radius:12px;max-width:600px;margin:0 auto;box-shadow:0 4px 6px rgba(0,0,0,0.1);mso-table-lspace:0pt;mso-table-rspace:0pt;">
          
          <!-- Header -->
          <tr>
            <td bgcolor="#6d28d9" style="background-color:#6d28d9;padding:28px 24px;text-align:center;border-radius:12px 12px 0 0;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:bold;font-family:Arial,Helvetica,sans-serif;">Two‑Factor Authentication</h1>
              <p style="margin:8px 0 0;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">Secure your ${issuer} account</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td class="mobile-padding dark-text" style="padding:28px 24px;">
              <p class="dark-text" style="color:#111827;font-size:16px;line-height:1.6;margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;">${greeting},</p>
              <p class="dark-text-secondary" style="color:#4b5563;font-size:15px;line-height:1.7;margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;">
                Use the secret below to add ${issuer} to your authenticator app (Google Authenticator, 1Password, Authy, etc.). Then enter the 6‑digit code on the website to finish enabling 2FA.
              </p>

              <!-- Secret Box -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:20px 0;mso-table-lspace:0pt;mso-table-rspace:0pt;">
                <tr>
                  <td bgcolor="#f9fafb" class="dark-accent-bg dark-border" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px;">
                    <p class="dark-text" style="margin:0 0 8px;color:#111827;font-weight:bold;font-family:Arial,Helvetica,sans-serif;">Your 2FA secret</p>
                    <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="mso-table-lspace:0pt;mso-table-rspace:0pt;">
                      <tr>
                        <td bgcolor="#111827" style="background-color:#111827;color:#f9fafb;padding:10px 12px;border-radius:8px;font-family:monospace,Courier;font-size:14px;">
                          ${secret}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p class="dark-text-secondary" style="color:#6b7280;font-size:13px;margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;">If you didn't request this, you can ignore this email.</p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td bgcolor="#f3f4f6" class="dark-accent-bg dark-border" style="background-color:#f3f4f6;padding:16px 24px;text-align:center;color:#6b7280;font-size:12px;border-top:1px solid #e5e7eb;">
              <p class="dark-text-secondary" style="margin:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;">© ${new Date().getFullYear()} ${issuer}. All rights reserved.</p>
              <p class="dark-text-secondary" style="margin:0;color:#9ca3af;font-size:10px;font-family:Arial,Helvetica,sans-serif;">Powered by <a href="https://www.finsense.co.ke/" style="color:#fc4639;text-decoration:none;font-weight:600;">FinSense Africa ❤️</a></p>
            </td>
          </tr>
        </table>
        <!--[if mso]>
        </td>
        </tr>
        </table>
        <![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`,
  };
}

export function buildBookingCancellationEmail(params: {
  firstName?: string;
  bookingCode: string;
  courtName?: string;
  date: string; // formatted e.g. Fri, Sep 19 2025
  timeRange: string; // e.g. 14:00 - 15:00
  reason?: string | null;
  refundedAmount?: number | null; // numeric in KES
  manageUrl?: string;
}) {
  const {
    firstName,
    bookingCode,
    courtName,
    date,
    timeRange,
    reason,
    refundedAmount,
    manageUrl,
  } = params;

  const greeting = firstName ? `Hi ${firstName}` : "Hello";
  const currencyFormatter = new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  });
  const refundStr =
    refundedAmount && refundedAmount > 0
      ? currencyFormatter.format(refundedAmount)
      : null;
  const subject = `❌ Booking Cancelled • ${bookingCode}`;
  const buttonUrl =
    manageUrl || process.env.APP_URL || "https://padelmania.co.ke/account";

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>Booking Cancelled</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:AllowPNG/>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <style type="text/css">
    table {border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt;}
    td {border-collapse: collapse; mso-line-height-rule: exactly;}
  </style>
  <![endif]-->
  <style type="text/css">
    * { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
    body { margin: 0; padding: 0; }
    @media only screen and (max-width: 600px) {
      .email-container { width: 100% !important; }
      .mobile-padding { padding: 20px !important; }
    }
    @media (prefers-color-scheme: dark) {
      .dark-bg { background-color: #1a1a1a !important; }
      .dark-card { background-color: #2d2d2d !important; }
      .dark-text { color: #e5e5e5 !important; }
      .dark-text-secondary { color: #b3b3b3 !important; }
      .dark-border { border-color: #404040 !important; }
      .dark-accent-bg { background-color: #1e1b4b !important; }
    }
    :root { color-scheme: light dark; }
  </style>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f8fafc;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="dark-bg" style="background:#f8fafc;padding:40px 0;mso-table-lspace:0pt;mso-table-rspace:0pt;">
    <tr>
      <td align="center" valign="top" style="padding:20px 10px;">
        <!--[if mso]>
        <table role="presentation" align="center" border="0" cellspacing="0" cellpadding="0" width="600">
        <tr>
        <td align="center" valign="top" width="600">
        <![endif]-->
        <table role="presentation" class="email-container dark-card" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);mso-table-lspace:0pt;mso-table-rspace:0pt;">
          <tr>
            <td style="background:#991b1b;padding:34px 26px;text-align:center;border-radius:12px 12px 0 0;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">Booking Cancelled</h1>
              <p style="margin:8px 0 0;color:#fecaca;font-size:13px;font-family:Arial,Helvetica,sans-serif;">${bookingCode}</p>
            </td>
          </tr>
          <tr>
            <td class="mobile-padding dark-text" style="padding:36px 32px;">
              <p class="dark-text" style="margin:0 0 18px;color:#111827;font-size:15px;line-height:1.55;font-family:Arial,Helvetica,sans-serif;">${greeting},</p>
              <p class="dark-text-secondary" style="margin:0 0 18px;color:#4b5563;font-size:14px;line-height:1.55;font-family:Arial,Helvetica,sans-serif;">Your booking has been cancelled.
              ${
                reason
                  ? ` Reason provided: <strong style=\"color:#991b1b;\">${reason}</strong>.`
                  : ""
              }</p>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" class="dark-border" style="margin:0 0 26px;border:1px solid #e5e7eb;border-radius:10px;mso-table-lspace:0pt;mso-table-rspace:0pt;">
                <tr>
                  <td class="dark-accent-bg" style="padding:20px 22px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="font-size:13px;color:#111827;line-height:1.5;mso-table-lspace:0pt;mso-table-rspace:0pt;">
                      <tr><td class="dark-text-secondary" style="padding:4px 0;font-weight:600;width:130px;font-family:Arial,Helvetica,sans-serif;">Booking Code</td><td class="dark-text" style="padding:4px 0;font-family:monospace;">${bookingCode}</td></tr>
                      ${
                        courtName
                          ? `<tr><td class="dark-text-secondary" style='padding:4px 0;font-weight:600;font-family:Arial,Helvetica,sans-serif;'>Court</td><td class="dark-text" style='padding:4px 0;font-family:Arial,Helvetica,sans-serif;'>${courtName}</td></tr>`
                          : ""
                      }
                      <tr><td class="dark-text-secondary" style="padding:4px 0;font-weight:600;font-family:Arial,Helvetica,sans-serif;">Date</td><td class="dark-text" style="padding:4px 0;font-family:Arial,Helvetica,sans-serif;">${date}</td></tr>
                      <tr><td class="dark-text-secondary" style="padding:4px 0;font-weight:600;font-family:Arial,Helvetica,sans-serif;">Time</td><td class="dark-text" style="padding:4px 0;font-family:Arial,Helvetica,sans-serif;">${timeRange}</td></tr>
                      ${
                        refundStr
                          ? `<tr><td class="dark-text-secondary" style='padding:4px 0;font-weight:600;font-family:Arial,Helvetica,sans-serif;'>Refund</td><td style='padding:4px 0;color:#5b21b6;font-weight:700;font-family:Arial,Helvetica,sans-serif;'>${refundStr}</td></tr>`
                          : ""
                      }
                      ${
                        reason
                          ? `<tr><td class="dark-text-secondary" style='padding:4px 0;font-weight:600;font-family:Arial,Helvetica,sans-serif;'>Reason</td><td class="dark-text" style='padding:4px 0;font-family:Arial,Helvetica,sans-serif;'>${reason}</td></tr>`
                          : ""
                      }
                    </table>
                  </td>
                </tr>
              </table>
              <p class="dark-text-secondary" style="margin:0 0 20px;color:#6b7280;font-size:12px;font-family:Arial,Helvetica,sans-serif;">If you believe this was a mistake or need further assistance, please contact support.</p>
              <table cellpadding="0" cellspacing="0" border="0" align="center" role="presentation" style="margin:0 0 30px;mso-table-lspace:0pt;mso-table-rspace:0pt;">
                <tr>
                  <td style="background:#1f2937;border-radius:8px;">
                    <a href="${buttonUrl}" style="display:block;padding:12px 24px;color:#ffffff;font-weight:600;font-size:14px;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">Manage Bookings</a>
                  </td>
                </tr>
              </table>
              <p class="dark-text" style="margin:0;color:#111827;font-size:13px;font-weight:600;font-family:Arial,Helvetica,sans-serif;">Padel Mania Support</p>
            </td>
          </tr>
          <tr>
            <td class="dark-accent-bg dark-border" style="background:#f9fafb;padding:26px 28px;text-align:center;border-top:1px solid #e5e7eb;">
              <p class="dark-text-secondary" style="margin:0 0 12px 0;color:#6b7280;font-size:11px;line-height:1.5;font-family:Arial,Helvetica,sans-serif;">© ${new Date().getFullYear()} Padel Mania. Mombasa, Kenya • <a style="color:#6d28d9;text-decoration:none;" href="mailto:support@padelmania.co.ke">support@padelmania.co.ke</a></p>
              <p class="dark-text-secondary" style="margin:0;color:#9ca3af;font-size:10px;font-family:Arial,Helvetica,sans-serif;">Powered by <a href="https://www.finsense.co.ke/" style="color:#fc4639;text-decoration:none;font-weight:600;">FinSense Africa ❤️</a></p>
            </td>
          </tr>
        </table>
        <!--[if mso]>
        </td>
        </tr>
        </table>
        <![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html };
}

export function buildGiftCardEmail(params: {
  recipientEmail?: string;
  firstName?: string;
  code: string;
  amount: number;
  message?: string | null;
  senderName?: string;
  expiresAt?: string | null;
}) {
  const {
    recipientEmail,
    firstName,
    code,
    amount,
    message,
    senderName,
    expiresAt,
  } = params;

  const greeting = firstName ? `Hi ${firstName}` : "Hello";
  const currencyFormatter = new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  });
  const amountFormatted = currencyFormatter.format(amount);
  const sender = senderName || "Someone special";
  const expiryDate = expiresAt
    ? new Date(expiresAt).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  const subject = `🎁 You've received a ${amountFormatted} Padel Mania Gift Card!`;

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>Gift Card from Padel Mania</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:AllowPNG/>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <style type="text/css">
    table {border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt;}
    td {border-collapse: collapse; mso-line-height-rule: exactly;}
  </style>
  <![endif]-->
  <style type="text/css">
    * { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
    body { margin: 0; padding: 0; }
    @media only screen and (max-width: 600px) {
      .email-container { width: 100% !important; }
      .mobile-padding { padding: 20px !important; }
    }
    @media (prefers-color-scheme: dark) {
      .dark-bg { background-color: #1a1a1a !important; }
      .dark-card { background-color: #2d2d2d !important; }
      .dark-text { color: #e5e5e5 !important; }
      .dark-text-secondary { color: #b3b3b3 !important; }
      .dark-border { border-color: #404040 !important; }
      .dark-accent-bg { background-color: #1e1b4b !important; }
    }
    :root { color-scheme: light dark; }
  </style>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f5f3ff; min-height: 100vh; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="dark-bg" style="background-color: #f5f3ff; padding: 40px 0; min-height: 100vh; mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
    <tr>
      <td align="center" valign="top" style="padding: 20px 10px;">
        <!--[if mso]>
        <table role="presentation" align="center" border="0" cellspacing="0" cellpadding="0" width="600">
        <tr>
        <td align="center" valign="top" width="600">
        <![endif]-->
        <table role="presentation" class="email-container dark-card" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 12px; max-width: 600px; margin: 0 auto; box-shadow: 0 8px 24px rgba(109, 40, 217, 0.15); mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
          
          <!-- Header with Gift Icon -->
          <tr>
            <td bgcolor="#6d28d9" style="background: linear-gradient(135deg, #6d28d9 0%, #7c3aed 100%); padding: 50px 30px; text-align: center; border-radius: 12px 12px 0 0;">
              
              <!-- Gift Icon -->
              <table width="120" cellpadding="0" cellspacing="0" border="0" role="presentation" align="center" style="margin-bottom: 24px; mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                <tr>
                  <td width="120" height="120" style="text-align: center; vertical-align: middle; font-size: 64px; color: #ffffff;">
                    🎁
                  </td>
                </tr>
              </table>
              
              <h1 style="color: #ffffff; font-size: 32px; font-weight: bold; margin: 0; font-family: Arial, Helvetica, sans-serif;">You've Got a Gift!</h1>
              <p style="color: #ede9fe; font-size: 18px; margin: 12px 0 0 0; font-weight: normal; font-family: Arial, Helvetica, sans-serif;">${sender} sent you something special</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td class="mobile-padding dark-text" style="padding: 50px 40px; text-align: center;">
              <p class="dark-text" style="color: #111827; font-size: 20px; line-height: 1.6; margin: 0 0 24px 0; font-family: Arial, Helvetica, sans-serif;">${greeting},</p>
              
              <p class="dark-text-secondary" style="color: #6b7280; font-size: 16px; line-height: 1.6; margin: 0 0 32px 0; font-family: Arial, Helvetica, sans-serif;">
                ${sender} has sent you a Padel Mania gift card! Book a court, play some padel, and enjoy your time on the court.
              </p>
              
              ${
                message
                  ? `<!-- Personal Message -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin: 32px 0; mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                <tr>
                  <td bgcolor="#f5f3ff" class="dark-accent-bg dark-border" style="background-color: #f5f3ff; border-left: 4px solid #6d28d9; padding: 24px; border-radius: 0 12px 12px 0; text-align: left;">
                    <p class="dark-text" style="color: #111827; font-size: 14px; font-weight: bold; margin: 0 0 12px 0; font-family: Arial, Helvetica, sans-serif;">💌 Personal Message</p>
                    <p class="dark-text-secondary" style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0; font-family: Arial, Helvetica, sans-serif; font-style: italic;">"${message}"</p>
                  </td>
                </tr>
              </table>`
                  : ""
              }
              
              <!-- Gift Card Display -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin: 40px 0; mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                <tr>
                  <td style="background: linear-gradient(135deg, #6d28d9 0%, #7c3aed 100%); border-radius: 16px; padding: 40px 32px; box-shadow: 0 4px 16px rgba(109, 40, 217, 0.2);">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                      <tr>
                        <td style="text-align: center;">
                          <p style="color: #ede9fe; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 16px 0; font-family: Arial, Helvetica, sans-serif;">Padel Mania Gift Card</p>
                          
                          <!-- Amount -->
                          <table cellpadding="0" cellspacing="0" border="0" role="presentation" align="center" style="margin: 0 0 24px 0; mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                            <tr>
                              <td bgcolor="rgba(255, 255, 255, 0.2)" style="background-color: rgba(255, 255, 255, 0.2); border-radius: 12px; padding: 16px 32px;">
                                <p style="color: #ffffff; font-size: 48px; font-weight: bold; margin: 0; font-family: Arial, Helvetica, sans-serif; line-height: 1;">${amountFormatted}</p>
                              </td>
                            </tr>
                          </table>
                          
                          <!-- Gift Card Code -->
                          <p style="color: #ffffff; font-size: 13px; margin: 0 0 12px 0; font-family: Arial, Helvetica, sans-serif;">Your Gift Card Code</p>
                          <table cellpadding="0" cellspacing="0" border="0" role="presentation" align="center" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                            <tr>
                              <td bgcolor="#ffffff" style="background-color: #ffffff; border-radius: 10px; padding: 16px 24px;">
                                <p style="color: #6d28d9; font-size: 24px; font-weight: bold; margin: 0; font-family: 'Courier New', monospace; letter-spacing: 2px;">${code}</p>
                              </td>
                            </tr>
                          </table>
                          
                          ${
                            expiryDate
                              ? `<p style="color: #ede9fe; font-size: 13px; margin: 24px 0 0 0; font-family: Arial, Helvetica, sans-serif;">Valid until ${expiryDate}</p>`
                              : ""
                          }
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <!-- How to Redeem -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin: 40px 0; mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                <tr>
                  <td bgcolor="#fef3c7" class="dark-accent-bg dark-border" style="background-color: #fef3c7; border-radius: 12px; padding: 32px; border: 2px dashed #f59e0b;">
                    <h3 class="dark-text" style="color: #92400e; font-size: 18px; font-weight: bold; margin: 0 0 16px 0; font-family: Arial, Helvetica, sans-serif; text-align: center;">🎯 How to Redeem</h3>
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                      <tr>
                        <td class="dark-text-secondary" style="color: #78350f; font-size: 14px; line-height: 1.8; font-family: Arial, Helvetica, sans-serif; text-align: left;">
                          <strong>1.</strong> Log in to your Padel Mania account<br>
                          <strong>2.</strong> Go to <strong>Gift Cards</strong> section<br>
                          <strong>3.</strong> Click <strong>Redeem</strong> and enter code: <strong style="font-family: 'Courier New', monospace;">${code}</strong><br>
                          <strong>4.</strong> Your balance will be updated instantly!
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" border="0" role="presentation" align="center" style="margin: 40px 0 32px 0; mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                <tr>
                  <td bgcolor="#6d28d9" style="background-color: #6d28d9; border-radius: 12px; padding: 0; box-shadow: 0 4px 12px rgba(109, 40, 217, 0.3);">
                    <a href="${
                      process.env.APP_URL || "https://padelmania.co.ke"
                    }/gift-cards" style="display: block; color: #ffffff; text-decoration: none; padding: 18px 40px; font-weight: bold; font-size: 16px; font-family: Arial, Helvetica, sans-serif;">
                      🎾 Redeem Now & Book a Court
                    </a>
                  </td>
                </tr>
              </table>
              
              <p class="dark-text-secondary" style="color: #6b7280; font-size: 14px; line-height: 1.5; margin: 32px 0 0 0; font-family: Arial, Helvetica, sans-serif;">
                Don't have an account yet? <a href="${
                  process.env.APP_URL || "https://padelmania.co.ke"
                }/signup" style="color: #6d28d9; text-decoration: none; font-weight: bold;">Sign up free</a> to get started!
              </p>
            </td>
          </tr>
          
          <!-- Features Banner -->
          <tr>
            <td class="mobile-padding" style="padding: 0 40px 40px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" class="dark-border" style="border-top: 1px solid #e5e7eb; padding-top: 32px; mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                <tr>
                  <td width="33%" style="text-align: center; padding: 0 8px;">
                    <p style="font-size: 28px; margin: 0 0 8px 0;">🏆</p>
                    <p class="dark-text" style="color: #111827; font-size: 13px; font-weight: bold; margin: 0 0 4px 0; font-family: Arial, Helvetica, sans-serif;">Earn Points</p>
                    <p class="dark-text-secondary" style="color: #6b7280; font-size: 11px; margin: 0; font-family: Arial, Helvetica, sans-serif;">Get rewarded with every game</p>
                  </td>
                  <td width="33%" class="dark-border" style="text-align: center; padding: 0 8px; border-left: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb;">
                    <p style="font-size: 28px; margin: 0 0 8px 0;">⚡</p>
                    <p class="dark-text" style="color: #111827; font-size: 13px; font-weight: bold; margin: 0 0 4px 0; font-family: Arial, Helvetica, sans-serif;">Instant Booking</p>
                    <p class="dark-text-secondary" style="color: #6b7280; font-size: 11px; margin: 0; font-family: Arial, Helvetica, sans-serif;">Reserve courts in seconds</p>
                  </td>
                  <td width="33%" style="text-align: center; padding: 0 8px;">
                    <p style="font-size: 28px; margin: 0 0 8px 0;">🎁</p>
                    <p class="dark-text" style="color: #111827; font-size: 13px; font-weight: bold; margin: 0 0 4px 0; font-family: Arial, Helvetica, sans-serif;">No Expiry</p>
                    <p class="dark-text-secondary" style="color: #6b7280; font-size: 11px; margin: 0; font-family: Arial, Helvetica, sans-serif;">Use your balance anytime</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td bgcolor="#f9fafb" class="dark-accent-bg dark-border" style="background-color: #f9fafb; padding: 40px 30px; text-align: center; border-top: 1px solid #e5e7eb; border-radius: 0 0 12px 12px;">
              <p class="dark-text" style="color: #111827; font-size: 16px; font-weight: bold; margin: 0 0 16px 0; font-family: Arial, Helvetica, sans-serif;">Need Help?</p>
              <p class="dark-text-secondary" style="color: #6b7280; font-size: 14px; margin: 0 0 24px 0; line-height: 1.6; font-family: Arial, Helvetica, sans-serif;">
                If you have any questions about redeeming your gift card or booking a court, our support team is here to help!
              </p>
              
              <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" class="dark-border" style="border-top: 1px solid #e5e7eb; margin-top: 24px; padding-top: 24px; mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                <tr>
                  <td>
                    <p class="dark-text-secondary" style="color: #6b7280; font-size: 12px; margin: 0 0 12px 0; line-height: 1.5; font-family: Arial, Helvetica, sans-serif;">
                      © ${new Date().getFullYear()} Padel Mania. All rights reserved.<br>
                      <span style="color: #6d28d9; font-weight: bold;">Mombasa, Kenya</span> | 
                      <a href="mailto:support@padelmania.co.ke" style="color: #6d28d9; text-decoration: none;">support@padelmania.co.ke</a> | 
                      <span style="color: #6d28d9; font-weight: bold;">+254 113 666 444</span>
                    </p>
                    <p class="dark-text-secondary" style="color: #9ca3af; font-size: 11px; margin: 0; font-family: Arial, Helvetica, sans-serif;">
                      Powered by <a href="https://www.finsense.co.ke/" style="color: #fc4639; text-decoration: none; font-weight: 600;">FinSense Africa ❤️</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        <!--[if mso]>
        </td>
        </tr>
        </table>
        <![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html };
}

export function buildRescheduleEmail(params: {
  firstName?: string;
  bookingCode: string;
  courtName: string;
  date: string; // e.g. Friday, Sep 19 2025
  timeRange: string; // e.g. 14:00 - 15:00
  oldCourtName?: string;
  oldDate?: string;
  oldTimeRange?: string;
  manageUrl?: string;
}) {
  const {
    firstName,
    bookingCode,
    courtName,
    date,
    timeRange,
    oldCourtName,
    oldDate,
    oldTimeRange,
    manageUrl,
  } = params;

  const greeting = firstName ? `Hi ${firstName}` : "Hello";
  const subject = `📅 Booking Rescheduled • ${bookingCode}`;
  const buttonUrl =
    manageUrl || process.env.APP_URL || "https://padelmania.co.ke";

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>Booking Rescheduled</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:AllowPNG/>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <style type="text/css">
    table {border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt;}
    td {border-collapse: collapse; mso-line-height-rule: exactly;}
  </style>
  <![endif]-->
  <style type="text/css">
    * { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
    body { margin: 0; padding: 0; }
    @media only screen and (max-width: 600px) {
      .email-container { width: 100% !important; }
      .mobile-padding { padding: 20px !important; }
    }
    @media (prefers-color-scheme: dark) {
      .dark-bg { background-color: #1a1a1a !important; }
      .dark-card { background-color: #2d2d2d !important; }
      .dark-text { color: #e5e5e5 !important; }
      .dark-text-secondary { color: #b3b3b3 !important; }
      .dark-border { border-color: #404040 !important; }
      .dark-accent-bg { background-color: #1e1b4b !important; }
    }
    :root { color-scheme: light dark; }
  </style>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f5f3ff;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="dark-bg" style="background:#f5f3ff;padding:40px 0;mso-table-lspace:0pt;mso-table-rspace:0pt;">
    <tr>
      <td align="center" valign="top" style="padding:20px 10px;">
        <!--[if mso]>
        <table role="presentation" align="center" border="0" cellspacing="0" cellpadding="0" width="600">
        <tr>
        <td align="center" valign="top" width="600">
        <![endif]-->
        <table role="presentation" class="email-container dark-card" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:12px;box-shadow:0 8px 24px rgba(34,115,75,0.15);mso-table-lspace:0pt;mso-table-rspace:0pt;">
          <tr>
            <td style="background:linear-gradient(135deg,#6d28d9,#7c3aed);padding:36px 28px;text-align:center;border-radius:12px 12px 0 0;">
              <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">Booking Rescheduled</h1>
              <p style="margin:8px 0 0;color:#ede9fe;font-size:14px;font-family:Arial,Helvetica,sans-serif;">${bookingCode}</p>
            </td>
          </tr>
          <tr>
            <td class="mobile-padding dark-text" style="padding:40px 34px;">
              <p class="dark-text" style="margin:0 0 18px;color:#111827;font-size:16px;line-height:1.55;font-family:Arial,Helvetica,sans-serif;">${greeting},</p>
              <p class="dark-text-secondary" style="margin:0 0 22px;color:#4b5563;font-size:15px;line-height:1.55;font-family:Arial,Helvetica,sans-serif;">Your court booking has been successfully rescheduled. Here are your updated details:</p>
              
              ${
                oldCourtName || oldDate || oldTimeRange
                  ? `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" class="dark-accent-bg dark-border" style="margin:0 0 20px;border:1px solid #fee2e2;border-radius:10px;background:#fef2f2;mso-table-lspace:0pt;mso-table-rspace:0pt;">
                <tr>
                  <td style="padding:20px 24px;">
                    <h3 class="dark-text" style="margin:0 0 12px;color:#991b1b;font-size:14px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">Previous Booking Details</h3>
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" class="dark-text-secondary" style="font-size:13px;color:#7f1d1d;line-height:1.5;font-family:Arial,Helvetica,sans-serif;mso-table-lspace:0pt;mso-table-rspace:0pt;">
                      ${
                        oldCourtName
                          ? `<tr><td style="padding:4px 0;width:100px;">Court:</td><td style="padding:4px 0;text-decoration:line-through;">${oldCourtName}</td></tr>`
                          : ""
                      }
                      ${
                        oldDate
                          ? `<tr><td style="padding:4px 0;">Date:</td><td style="padding:4px 0;text-decoration:line-through;">${oldDate}</td></tr>`
                          : ""
                      }
                      ${
                        oldTimeRange
                          ? `<tr><td style="padding:4px 0;">Time:</td><td style="padding:4px 0;text-decoration:line-through;">${oldTimeRange}</td></tr>`
                          : ""
                      }
                    </table>
                  </td>
                </tr>
              </table>`
                  : ""
              }
              
              <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" class="dark-accent-bg dark-border" style="margin:0 0 28px;border:2px solid #6d28d9;border-radius:10px;mso-table-lspace:0pt;mso-table-rspace:0pt;">
                <tr>
                  <td style="padding:22px 24px;">
                    <h3 style="margin:0 0 14px;color:#6d28d9;font-size:16px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">✓ New Booking Details</h3>
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" class="dark-text" style="font-size:14px;color:#111827;line-height:1.5;font-family:Arial,Helvetica,sans-serif;mso-table-lspace:0pt;mso-table-rspace:0pt;">
                      <tr><td style="padding:4px 0;font-weight:600;width:140px;">Court</td><td style="padding:4px 0;">${courtName}</td></tr>
                      <tr><td style="padding:4px 0;font-weight:600;">Date</td><td style="padding:4px 0;">${date}</td></tr>
                      <tr><td style="padding:4px 0;font-weight:600;">Time</td><td style="padding:4px 0;">${timeRange}</td></tr>
                      <tr><td style="padding:4px 0;font-weight:600;">Booking Code</td><td style="padding:4px 0;font-family:monospace;">${bookingCode}</td></tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <table cellpadding="0" cellspacing="0" border="0" role="presentation" align="center" style="margin:0 0 34px;mso-table-lspace:0pt;mso-table-rspace:0pt;">
                <tr>
                  <td style="background:#6d28d9;border-radius:10px;box-shadow:0 4px 12px rgba(34,115,75,0.3);">
                    <a href="${buttonUrl}" style="display:block;padding:14px 28px;color:#ffffff;font-weight:600;font-size:15px;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">View / Manage Booking</a>
                  </td>
                </tr>
              </table>
              
              <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" class="dark-accent-bg dark-border" style="margin:0 0 22px;background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;mso-table-lspace:0pt;mso-table-rspace:0pt;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p class="dark-text-secondary" style="margin:0;color:#78350f;font-size:13px;line-height:1.5;font-family:Arial,Helvetica,sans-serif;"><strong class="dark-text" style="color:#92400e;">⚠️ Important:</strong> If you did not request this change, please contact us immediately to secure your account.</p>
                  </td>
                </tr>
              </table>
              
              <p class="dark-text-secondary" style="margin:0 0 14px;color:#374151;font-size:13px;line-height:1.5;font-family:Arial,Helvetica,sans-serif;">Please arrive 10 minutes before your start time. Remember to bring appropriate footwear and stay hydrated.</p>
              <p class="dark-text" style="margin:0;color:#111827;font-size:14px;font-weight:600;font-family:Arial,Helvetica,sans-serif;">See you soon! 👋</p>
              <p style="margin:6px 0 0;color:#6d28d9;font-size:13px;font-family:Arial,Helvetica,sans-serif;">Padel Mania Team</p>
            </td>
          </tr>
          <tr>
            <td bgcolor="#f9fafb" class="dark-accent-bg dark-border" style="background:#f9fafb;padding:28px 30px;text-align:center;border-top:1px solid #e5e7eb;border-radius:0 0 12px 12px;">
              <p class="dark-text-secondary" style="margin:0 0 12px 0;color:#6b7280;font-size:11px;line-height:1.5;font-family:Arial,Helvetica,sans-serif;">© ${new Date().getFullYear()} Padel Mania. All rights reserved.<br><span style="color:#6d28d9;font-weight:bold;">Mombasa, Kenya</span> | <a href="mailto:support@padelmania.co.ke" style="color:#6d28d9;text-decoration:none;">support@padelmania.co.ke</a> | <span style="color:#6d28d9;font-weight:bold;">+254 113 666 444</span></p>
              <p class="dark-text-secondary" style="margin:0;color:#9ca3af;font-size:10px;font-family:Arial,Helvetica,sans-serif;">Powered by <a href="https://www.finsense.co.ke/" style="color:#fc4639;text-decoration:none;font-weight:600;">FinSense Africa ❤️</a></p>
            </td>
          </tr>
        </table>
        <!--[if mso]>
        </td>
        </tr>
        </table>
        <![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html };
}

export function buildBookingInvitationEmail(params: {
  recipientEmail: string;
  recipientFirstName?: string | null;
  inviterName: string;
  bookingCode: string;
  courtName: string;
  date: string;
  timeRange: string;
  location?: string;
  acceptUrl?: string;
}) {
  const {
    recipientEmail,
    recipientFirstName,
    inviterName,
    bookingCode,
    courtName,
    date,
    timeRange,
    location,
    acceptUrl,
  } = params;

  const greeting = recipientFirstName ? `Hi ${recipientFirstName}` : "Hi";
  const subject = `🎾 You're Invited to Play Padel with ${inviterName}!`;
  const buttonUrl =
    acceptUrl || process.env.APP_URL || "https://padelmania.co.ke";
  const locationText = location || "Padel Mania, Mombasa";
  const locationLink = "https://maps.app.goo.gl/ukUF3jp5HvS8bxTx7";

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>Padel Invitation</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:AllowPNG/>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <style type="text/css">
    table {border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt;}
    td {border-collapse: collapse; mso-line-height-rule: exactly;}
  </style>
  <![endif]-->
  <style type="text/css">
    * { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
    body { margin: 0; padding: 0; }
    @media only screen and (max-width: 600px) {
      .email-container { width: 100% !important; }
      .mobile-padding { padding: 20px !important; }
    }
    @media (prefers-color-scheme: dark) {
      .dark-bg { background-color: #1a1a1a !important; }
      .dark-card { background-color: #2d2d2d !important; }
      .dark-text { color: #e5e5e5 !important; }
      .dark-text-secondary { color: #b3b3b3 !important; }
      .dark-border { border-color: #404040 !important; }
      .dark-accent-bg { background-color: #1e1b4b !important; }
    }
    :root { color-scheme: light dark; }
  </style>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f5f3ff;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="dark-bg" style="background:#f5f3ff;padding:40px 0;mso-table-lspace:0pt;mso-table-rspace:0pt;">
<tr>
  <td align="center" valign="top" style="padding:20px 10px;">
    <!--[if mso]>
    <table role="presentation" align="center" border="0" cellspacing="0" cellpadding="0" width="600">
    <tr>
    <td align="center" valign="top" width="600">
    <![endif]-->
    <table role="presentation" class="email-container dark-card" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:12px;box-shadow:0 8px 24px rgba(34,115,75,0.15);mso-table-lspace:0pt;mso-table-rspace:0pt;">
      <tr>
        <td style="background:linear-gradient(135deg,#6d28d9,#7c3aed);padding:50px 30px;text-align:center;border-radius:12px 12px 0 0;">
          <table width="120" cellpadding="0" cellspacing="0" border="0" role="presentation" align="center" style="margin-bottom:24px;mso-table-lspace:0pt;mso-table-rspace:0pt;">
            <tr>
              <td width="120" height="120" style="text-align:center;font-size:64px;">🎾</td>
            </tr>
          </table>
          <h1 style="color:#ffffff;font-size:32px;font-weight:bold;margin:0;font-family:Arial,Helvetica,sans-serif;">You're Invited!</h1>
          <p style="color:#ede9fe;font-size:18px;margin:12px 0 0;font-family:Arial,Helvetica,sans-serif;">Join ${inviterName} for Padel</p>
        </td>
      </tr>
      <tr>
        <td class="mobile-padding dark-text" style="padding:50px 40px;text-align:center;">
          <p class="dark-text" style="color:#111827;font-size:20px;margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;">${greeting}! 👋</p>
          <p class="dark-text-secondary" style="color:#6b7280;font-size:16px;line-height:1.6;margin:0 0 32px;font-family:Arial,Helvetica,sans-serif;">${inviterName} has invited you to play padel at Padel Mania. Come join the match and have a great time on the court!</p>
          
          <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:32px 0;mso-table-lspace:0pt;mso-table-rspace:0pt;">
            <tr>
              <td bgcolor="#f5f3ff" class="dark-card dark-border" style="background:#f5f3ff;border-radius:12px;padding:32px;border:2px solid #6d28d9;mso-table-lspace:0pt;mso-table-rspace:0pt;">
                <p style="color:#6d28d9;font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin:0 0 20px;text-align:left;font-family:Arial,Helvetica,sans-serif;">📋 Match Details</p>
                <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="font-size:15px;color:#111827;line-height:2;text-align:left;mso-table-lspace:0pt;mso-table-rspace:0pt;">
                  <tr><td class="dark-text-secondary" style="padding:8px 0;font-weight:600;width:120px;font-family:Arial,Helvetica,sans-serif;">🏟️ Court</td><td class="dark-text" style="padding:8px 0;font-family:Arial,Helvetica,sans-serif;">${courtName}</td></tr>
                  <tr><td class="dark-text-secondary" style="padding:8px 0;font-weight:600;font-family:Arial,Helvetica,sans-serif;">📅 Date</td><td class="dark-text" style="padding:8px 0;font-family:Arial,Helvetica,sans-serif;">${date}</td></tr>
                  <tr><td class="dark-text-secondary" style="padding:8px 0;font-weight:600;font-family:Arial,Helvetica,sans-serif;">⏰ Time</td><td class="dark-text" style="padding:8px 0;font-family:Arial,Helvetica,sans-serif;">${timeRange}</td></tr>
                  <tr><td class="dark-text-secondary" style="padding:8px 0;font-weight:600;font-family:Arial,Helvetica,sans-serif;">📍 Location</td><td class="dark-text" style="padding:8px 0;font-family:Arial,Helvetica,sans-serif;"><a href="${locationLink}" style="color:#6d28d9;text-decoration:none;font-weight:600;">${locationText}</a></td></tr>
                  <tr><td class="dark-text-secondary" style="padding:8px 0;font-weight:600;font-family:Arial,Helvetica,sans-serif;">🎫 Code</td><td class="dark-text" style="padding:8px 0;font-family:monospace;color:#6d28d9;">${bookingCode}</td></tr>
                </table>
              </td>
            </tr>
          </table>
          
          <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:32px 0;mso-table-lspace:0pt;mso-table-rspace:0pt;">
            <tr>
              <td bgcolor="#fef3c7" class="dark-accent-bg dark-border" style="background:#fef3c7;border-radius:12px;padding:24px;border:2px dashed #f59e0b;">
                <p class="dark-text" style="color:#92400e;font-size:14px;font-weight:bold;margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;">🎒 What to Bring</p>
                <p class="dark-text-secondary" style="color:#78350f;font-size:14px;line-height:1.8;text-align:left;font-family:Arial,Helvetica,sans-serif;">✓ Comfortable sports attire<br>✓ Proper court shoes<br>✓ Water bottle<br>✓ Your A-game! 🔥</p>
              </td>
            </tr>
          </table>
          
          <table cellpadding="0" cellspacing="0" border="0" role="presentation" align="center" style="margin:40px 0 32px;mso-table-lspace:0pt;mso-table-rspace:0pt;">
            <tr>
              <td bgcolor="#6d28d9" style="background:#6d28d9;border-radius:12px;box-shadow:0 4px 12px rgba(34,115,75,0.3);">
                <a href="${buttonUrl}" style="display:block;color:#ffffff;text-decoration:none;padding:18px 40px;font-weight:bold;font-size:16px;font-family:Arial,Helvetica,sans-serif;">✅ View Booking Details</a>
              </td>
            </tr>
          </table>
${
  !recipientFirstName
    ? `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:32px 0;mso-table-lspace:0pt;mso-table-rspace:0pt;">
            <tr>
              <td bgcolor="#e0f2fe" class="dark-accent-bg dark-border" style="background:#e0f2fe;border-radius:12px;padding:24px;border:1px solid #6d28d9;">
                <p class="dark-text" style="color:#075985;font-size:14px;margin:0 0 12px;font-weight:bold;font-family:Arial,Helvetica,sans-serif;">🎁 New to Padel Mania?</p>
                <p class="dark-text-secondary" style="color:#0c4a6e;font-size:13px;margin:0;line-height:1.6;font-family:Arial,Helvetica,sans-serif;">Create a free account to book courts, earn loyalty points, and unlock exclusive benefits!</p>
                <table cellpadding="0" cellspacing="0" border="0" role="presentation" align="center" style="margin:16px 0 0;mso-table-lspace:0pt;mso-table-rspace:0pt;">
                  <tr>
                    <td bgcolor="#6d28d9" style="background:#6d28d9;border-radius:8px;">
                      <a href="${
                        process.env.APP_URL || "https://padelmania.co.ke"
                      }/signup" style="display:block;color:#ffffff;text-decoration:none;padding:12px 24px;font-weight:600;font-size:14px;font-family:Arial,Helvetica,sans-serif;">Register</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>`
    : ""
}
          <p class="dark-text-secondary" style="color:#6b7280;font-size:14px;line-height:1.6;margin:32px 0 0;font-family:Arial,Helvetica,sans-serif;">This is a confirmed booking. Simply show up at the court at the scheduled time. If you have any questions, feel free to reach out to our support team.</p>
        </td>
      </tr>
      <tr>
        <td bgcolor="#f9fafb" class="dark-accent-bg dark-border" style="background:#f9fafb;padding:40px 30px;text-align:center;border-top:1px solid #e5e7eb;border-radius:0 0 12px 12px;">
          <p class="dark-text" style="color:#111827;font-size:16px;font-weight:bold;margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;">Need Help?</p>
          <p class="dark-text-secondary" style="color:#6b7280;font-size:14px;margin:0 0 24px;line-height:1.6;font-family:Arial,Helvetica,sans-serif;">If you have any questions about this match or need assistance, our support team is here to help!</p>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" class="dark-border" style="border-top:1px solid #e5e7eb;margin-top:24px;padding-top:24px;mso-table-lspace:0pt;mso-table-rspace:0pt;">
            <tr>
              <td>
                <p class="dark-text-secondary" style="color:#6b7280;font-size:12px;margin:0 0 12px;line-height:1.5;font-family:Arial,Helvetica,sans-serif;">© ${new Date().getFullYear()} Padel Mania. All rights reserved.<br><span style="color:#6d28d9;font-weight:bold;">Mombasa, Kenya</span> | <a href="mailto:support@padelmania.co.ke" style="color:#6d28d9;text-decoration:none;">support@padelmania.co.ke</a> | <span style="color:#6d28d9;font-weight:bold;">+254 113 666 444</span></p>
                <p class="dark-text-secondary" style="color:#9ca3af;font-size:11px;margin:0;font-family:Arial,Helvetica,sans-serif;">Powered by <a href="https://www.finsense.co.ke/" style="color:#fc4639;text-decoration:none;font-weight:600;">FinSense Africa ❤️</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    <!--[if mso]>
    </td>
    </tr>
    </table>
    <![endif]-->
  </td>
</tr>
</table>
</body>
</html>`;

  return { subject, html };
}

export function buildLoyaltyRedemptionEmail(params: {
  firstName?: string;
  pointsRedeemed: number;
  giftCardCode: string;
  giftCardAmount: number;
  remainingPoints: number;
  expiresAt?: string | null;
}) {
  const {
    firstName,
    pointsRedeemed,
    giftCardCode,
    giftCardAmount,
    remainingPoints,
    expiresAt,
  } = params;

  const greeting = firstName ? `Hi ${firstName}` : "Hello";
  const currencyFormatter = new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  });
  const amountFormatted = currencyFormatter.format(giftCardAmount);
  const expiryDate = expiresAt
    ? new Date(expiresAt).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  const subject = `🎉 ${pointsRedeemed} Points Redeemed for ${amountFormatted} Gift Card!`;

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>Loyalty Points Redeemed</title>
  <style type="text/css">
    * { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
    body { margin: 0; padding: 0; }
    @media only screen and (max-width: 600px) {
      .email-container { width: 100% !important; }
      .mobile-padding { padding: 20px !important; }
    }
    @media (prefers-color-scheme: dark) {
      .dark-bg { background-color: #1a1a1a !important; }
      .dark-card { background-color: #2d2d2d !important; }
      .dark-text { color: #e5e5e5 !important; }
      .dark-text-secondary { color: #b3b3b3 !important; }
      .dark-border { border-color: #404040 !important; }
      .dark-accent-bg { background-color: #1e1b4b !important; }
    }
    :root { color-scheme: light dark; }
  </style>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f5f3ff;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="dark-bg" style="background:#f5f3ff;padding:40px 0;mso-table-lspace:0pt;mso-table-rspace:0pt;">
    <tr><td align="center" valign="top" style="padding:20px 10px;">
      <table role="presentation" class="email-container dark-card" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);mso-table-lspace:0pt;mso-table-rspace:0pt;">
        <tr>
          <td style="background:#6d28d9;padding:36px 28px;text-align:center;">
            <div style="font-size:48px;margin:0 0 12px;">🎊</div>
            <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">Points Redeemed!</h1>
            <p style="margin:8px 0 0;color:#ede9fe;font-size:14px;font-family:Arial,Helvetica,sans-serif;">Your loyalty points have been converted to a gift card</p>
          </td>
        </tr>
        <tr>
          <td class="mobile-padding dark-text" style="padding:40px 34px;">
            <p class="dark-text" style="margin:0 0 18px;color:#111827;font-size:16px;line-height:1.55;font-family:Arial,Helvetica,sans-serif;">${greeting},</p>
            <p class="dark-text-secondary" style="margin:0 0 22px;color:#4b5563;font-size:15px;line-height:1.55;font-family:Arial,Helvetica,sans-serif;">Great news! You've successfully redeemed <strong style="color:#6d28d9;">${pointsRedeemed.toLocaleString()} loyalty points</strong> and received a <strong style="color:#6d28d9;">${amountFormatted}</strong> gift card!</p>
            
            <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" class="dark-border" style="margin:0 0 28px;border:1px solid #e5e7eb;border-radius:10px;mso-table-lspace:0pt;mso-table-rspace:0pt;">
              <tr><td class="dark-accent-bg" style="padding:22px 24px;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="font-size:14px;color:#111827;line-height:1.5;mso-table-lspace:0pt;mso-table-rspace:0pt;">
                  <tr><td class="dark-text" style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;color:#4b5563;">Points Redeemed:</td><td class="dark-text" style="padding:6px 0;text-align:right;font-weight:700;font-family:Arial,Helvetica,sans-serif;color:#111827;">${pointsRedeemed.toLocaleString()} points</td></tr>
                  <tr><td class="dark-text" style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;color:#4b5563;">Gift Card Value:</td><td class="dark-text" style="padding:6px 0;text-align:right;font-weight:700;font-family:Arial,Helvetica,sans-serif;color:#6d28d9;font-size:16px;">${amountFormatted}</td></tr>
                  <tr><td colspan="2" class="dark-border" style="padding:12px 0;border-top:1px solid #e5e7eb;"></td></tr>
                  <tr><td class="dark-text" style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;color:#4b5563;">Remaining Points:</td><td class="dark-text" style="padding:6px 0;text-align:right;font-weight:700;font-family:Arial,Helvetica,sans-serif;color:#111827;">${remainingPoints.toLocaleString()} points</td></tr>
                </table>
              </td></tr>
            </table>
            
            <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:28px 0;background:#6d28d9;border-radius:10px;overflow:hidden;mso-table-lspace:0pt;mso-table-rspace:0pt;">
              <tr><td style="padding:32px 28px;text-align:center;">
                <p style="color:#ede9fe;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;">Padel Mania Gift Card</p>
                <div style="background-color:rgba(255,255,255,0.15);border-radius:8px;padding:16px 24px;margin:0 0 20px;">
                  <p style="color:#ffffff;font-size:36px;font-weight:700;margin:0;line-height:1;font-family:Arial,Helvetica,sans-serif;">${amountFormatted}</p>
                </div>
                <p style="color:#ffffff;font-size:13px;margin:0 0 10px;font-family:Arial,Helvetica,sans-serif;">Your Gift Card Code</p>
                <div style="background-color:#ffffff;border-radius:8px;padding:14px 20px;">
                  <p style="color:#6d28d9;font-size:20px;font-weight:700;margin:0;font-family:'Courier New',monospace;letter-spacing:2px;">${giftCardCode}</p>
                </div>
                ${expiryDate ? `<p style="color:#ede9fe;font-size:12px;margin:20px 0 0;font-family:Arial,Helvetica,sans-serif;">Valid until ${expiryDate}</p>` : ""}
              </td></tr>
            </table>

            <table cellpadding="0" cellspacing="0" border="0" role="presentation" align="center" style="margin:32px auto;mso-table-lspace:0pt;mso-table-rspace:0pt;">
              <tr><td style="background-color:#6d28d9;border-radius:8px;">
                <a href="${process.env.APP_URL || "https://padelmania.co.ke"}/customer/loyalty" style="display:block;color:#ffffff;text-decoration:none;padding:14px 32px;font-weight:700;font-size:15px;font-family:Arial,Helvetica,sans-serif;">🏆 View My Loyalty Points</a>
              </td></tr>
            </table>

            <p class="dark-text-secondary" style="color:#6b7280;font-size:14px;line-height:1.5;margin:28px 0 0;text-align:center;font-family:Arial,Helvetica,sans-serif;">Keep earning points with every booking! The more you play, the more rewards you unlock.</p>
          </td>
        </tr>
        <tr>
          <td class="dark-border" style="background-color:#f9fafb;padding:28px;text-align:center;border-top:1px solid #e5e7eb;">
            <p class="dark-text" style="color:#111827;font-size:15px;font-weight:700;margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;">Need Help?</p>
            <p class="dark-text-secondary" style="color:#6b7280;font-size:13px;margin:0 0 20px;line-height:1.6;font-family:Arial,Helvetica,sans-serif;">If you have any questions about your gift card or loyalty points, our support team is here to help!</p>
            <div class="dark-border" style="border-top:1px solid #e5e7eb;margin-top:20px;padding-top:20px;">
              <p class="dark-text-secondary" style="color:#6b7280;font-size:12px;margin:0 0 10px;line-height:1.5;font-family:Arial,Helvetica,sans-serif;">© ${new Date().getFullYear()} Padel Mania. All rights reserved.<br><span style="color:#6d28d9;font-weight:600;">Mombasa, Kenya</span> | <a href="mailto:support@padelmania.co.ke" style="color:#6d28d9;text-decoration:none;">support@padelmania.co.ke</a> | <span style="color:#6d28d9;font-weight:600;">+254 113 666 444</span></p>
              <p style="color:#9ca3af;font-size:11px;margin:0;font-family:Arial,Helvetica,sans-serif;">Powered by <a href="https://www.finsense.co.ke/" style="color:#fc4639;text-decoration:none;font-weight:600;">FinSense Africa ❤️</a></p>
            </div>
          </td>
        </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html };
}

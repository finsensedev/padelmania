import crypto from "crypto";

export function generateBookingCode(): string {
  const prefix = "TPB"; // Padel Mania Booking
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

export function generateOrderNumber(): string {
  const prefix = "TPO"; // Padel Mania Order
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

export function generateRentalCode(): string {
  const prefix = "TPR"; // Padel Mania Rental
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

export function generateTransactionId(): string {
  return crypto.randomBytes(16).toString("hex").toUpperCase();
}

export function calculatePriceWithTax(
  amount: number,
  taxRate: number = 0.16,
): {
  subtotal: number;
  tax: number;
  total: number;
} {
  const subtotal = amount;
  const tax = subtotal * taxRate;
  const total = subtotal + tax;

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    tax: Math.round(tax * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
}

export function formatCurrency(
  amount: number,
  currency: string = "KES",
): string {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency,
  }).format(amount);
}

export function paginate(page: number = 1, limit: number = 10) {
  const skip = (page - 1) * limit;
  return { skip, take: limit };
}

// Confidential Registration Number (e.g., PM-1234567)
export function generateRegistrationNumber(prefix: string = "PM"): string {
  // Generate a 7-digit numeric code to keep it clean and readable
  const num = Math.floor(1000000 + Math.random() * 9000000); // 1000000 - 9999999
  return `${prefix}-${num}`;
}

export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return email;
  const visible = user.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(1, user.length - 2))}@${domain}`;
}

export function maskPhone(phone?: string | null): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  const last4 = digits.slice(-4);
  return `${"*".repeat(Math.max(0, digits.length - 4))}${last4}`;
}

import crypto from "crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buffer: Buffer): string {
  let bits = "";
  for (const byte of buffer) bits += byte.toString(2).padStart(8, "0");
  let output = "";
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.substring(i, i + 5);
    if (chunk.length < 5)
      output += BASE32_ALPHABET[parseInt(chunk.padEnd(5, "0"), 2)];
    else output += BASE32_ALPHABET[parseInt(chunk, 2)];
  }
  while (output.length % 8 !== 0) output += "=";
  return output;
}

export function base32Decode(input: string): Buffer {
  let bits = "";
  for (const c of input.replace(/=+$/, "").toUpperCase()) {
    const val = BASE32_ALPHABET.indexOf(c);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

export function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  for (let i = 7; i >= 0; i--) {
    buf[i] = counter & 0xff;
    counter = counter >> 8;
  }
  const hmac = crypto.createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const otp = (code % 1_000_000).toString().padStart(6, "0");
  return otp;
}

export function verifyTotp(
  secretBase32: string,
  token: string,
  window = 1
): boolean {
  const secret = base32Decode(secretBase32);
  const step = 30;
  const currentCounter = Math.floor(Date.now() / 1000 / step);
  const candidate = token.replace(/\s+/g, "");
  for (let w = -window; w <= window; w++) {
    if (hotp(secret, currentCounter + w) === candidate) return true;
  }
  return false;
}

export function generateBase32Secret(length: number = 20): string {
  const buffer = crypto.randomBytes(length);
  return base32Encode(buffer).replace(/=+$/, "");
}

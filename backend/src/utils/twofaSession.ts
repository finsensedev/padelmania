import jwt from "jsonwebtoken";

interface TwoFASessionClaims {
  sub: string; // userId
  type: "2fa-session";
  slice: number; // 30s TOTP slice when issued
  iat: number;
  exp: number;
}

const SESSION_GRACE_SECONDS = 5; // small grace to cover boundary race

export function issueTwoFASession(userId: string): {
  token: string;
  exp: number;
  slice: number;
} {
  const slice = Math.floor(Date.now() / 1000 / 30);
  const now = Math.floor(Date.now() / 1000);
  // expire end of slice + grace
  const sliceEnd = (slice + 1) * 30; // start of next slice
  const exp = sliceEnd + SESSION_GRACE_SECONDS;

  const claims: TwoFASessionClaims = {
    sub: userId,
    type: "2fa-session",
    slice,
    iat: now,
    exp,
  };

  const token = jwt.sign(claims, process.env.JWT_SECRET!, {
    algorithm: "HS256",
  });
  return { token, exp, slice };
}

export function verifyTwoFASession(
  token: string,
  expectedUserId: string,
  window: number = 0
): { valid: boolean; reason?: string; delta?: number } {
  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET!
    ) as TwoFASessionClaims;
    if (decoded.type !== "2fa-session")
      return { valid: false, reason: "WRONG_TYPE" };
    if (decoded.sub !== expectedUserId)
      return { valid: false, reason: "SUB_MISMATCH" };
    const currentSlice = Math.floor(Date.now() / 1000 / 30);
    const delta = currentSlice - decoded.slice;
    if (Math.abs(delta) > window)
      return { valid: false, reason: "SLICE_OUT_OF_WINDOW", delta };
    return { valid: true, delta };
  } catch (e) {
    return { valid: false, reason: "JWT_ERROR" };
  }
}

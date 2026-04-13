import { jwtDecode } from "jwt-decode";

export type MinimalTokenPayload = {
  exp?: number;
  role?: string;
  sub?: string;
};

export function isTokenValid(token?: string | null): boolean {
  if (!token) return false;

  try {
    const decoded = jwtDecode<MinimalTokenPayload>(token);
    if (!decoded?.exp) {
      return false;
    }

    return decoded.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export function decodeToken<T extends object = MinimalTokenPayload>(
  token: string
): T | null {
  try {
    return jwtDecode<T>(token);
  } catch {
    return null;
  }
}

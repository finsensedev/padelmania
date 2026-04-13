import { useRef } from "react";
import useTwoFAPrompt from "./useTwoFAPrompt";
import useNotification from "./useNotification";
import { authService } from "src/services/authService";

interface SessionRecord {
  token: string;
  slice: number;
  exp: number;
  ts: number;
}

type TwoFASessionScope =
  | "permissions"
  | "users"
  | "updatePermissions"
  | "exports"
  | "refunds"
  | "vouchers"
  | "giftcards"
  | "settings";

// Returns the active 30s slice
const currentSlice = () => Math.floor(Date.now() / 1000 / 30);

export default function useTwoFASession() {
  const twoFAPrompt = useTwoFAPrompt();
  const { toaster } = useNotification();
  // Cache by scope (and optionally role if needed by caller) but simple global per-slice works for now
  const sessionRef = useRef<Record<string, SessionRecord>>({});

  const obtainSession = async (
    scope: TwoFASessionScope
  ): Promise<string | undefined> => {
    const slice = currentSlice();
    const existing = sessionRef.current[scope];
    if (
      existing &&
      existing.slice === slice &&
      existing.exp * 1000 > Date.now()
    ) {
      return existing.token;
    }

    const code = await twoFAPrompt({
      title: "Two-Factor Verification",
      description: "Enter your 6-digit authentication code to proceed.",
      submitLabel: "Verify",
    });
    if (!code) return undefined;

    interface VerifyResp {
      ok: boolean;
      error?: string;
      sessionToken?: string;
      exp?: number;
      slice?: number;
    }

    let resp: VerifyResp | undefined;

    try {
      const httpResp = await authService.verifyTwoFA(code);
      resp = httpResp as unknown as VerifyResp;
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      if (err.response?.data?.error) {
        const errMsg = err.response.data.error;
        let mappedError = "SERVER_ERROR";
        if (errMsg === "Invalid code") mappedError = "INVALID_CODE";
        else if (errMsg === "Code required") mappedError = "CODE_REQUIRED";
        else if (errMsg === "2FA not enabled")
          mappedError = "TWO_FACTOR_NOT_ENABLED";
        else if (errMsg === "Unauthenticated") mappedError = "UNAUTHENTICATED";

        resp = { ok: false, error: mappedError };
      }
    }

    if (!resp) {
      toaster("Verification failed (connection error)", { variant: "error" });
      return undefined;
    }

    if (!resp.ok) {
      if (resp.error === "INVALID_CODE") {
        toaster("Invalid 2FA code", { variant: "error" });
      } else if (resp.error === "CODE_REQUIRED") {
        toaster("Code required", { variant: "error" });
      } else if (resp.error === "TWO_FACTOR_NOT_ENABLED") {
        toaster("2FA not enabled for this account", { variant: "error" });
      } else if (resp.error === "SERVER_ERROR") {
        toaster("Server error during 2FA", { variant: "error" });
      } else if (resp.error === "UNAUTHENTICATED") {
        toaster("Authentication required for 2FA", { variant: "error" });
      } else {
        toaster("2FA verification failed", { variant: "error" });
      }
      return undefined;
    }

    if (!resp.sessionToken || resp.exp == null || resp.slice == null) {
      toaster("Malformed 2FA session response", { variant: "error" });
      return undefined;
    }

    sessionRef.current[scope] = {
      token: resp.sessionToken,
      slice: resp.slice,
      exp: resp.exp,
      ts: Date.now(),
    };
    return resp.sessionToken;
  };

  const getSessionInfo = (
    scope: TwoFASessionScope
  ): SessionRecord | undefined => {
    const rec = sessionRef.current[scope];
    if (!rec) return undefined;
    if (rec.exp * 1000 < Date.now()) return undefined;
    return rec;
  };

  return { obtainSession, getSessionInfo };
}

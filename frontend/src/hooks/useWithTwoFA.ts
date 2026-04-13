import { useCallback } from "react";
import useTwoFASession from "./useTwoFASession";
import useNotification from "./useNotification";

type TwoFAScope = "vouchers" | "giftcards" | "settings";

interface WithTwoFAOptions {
  scope: TwoFAScope;
  actionName?: string;
}

/**
 * Hook to wrap sensitive actions with 2FA verification.
 * Returns a function that prompts for 2FA and then executes the action with the session token.
 */
export default function useWithTwoFA() {
  const { obtainSession } = useTwoFASession();
  const { toaster } = useNotification();

  const withTwoFA = useCallback(
    async <T>(
      action: (sessionToken: string) => Promise<T>,
      options: WithTwoFAOptions
    ): Promise<T | undefined> => {
      try {
        const sessionToken = await obtainSession(options.scope);

        if (!sessionToken) {
          toaster("2FA verification cancelled", { variant: "info" });
          return undefined;
        }

        return await action(sessionToken);
      } catch (error: unknown) {
        // Check if error is due to missing 2FA
        const err = error as {
          response?: { status?: number; data?: { message?: string } };
        };
        if (
          err?.response?.status === 403 ||
          err?.response?.data?.message?.includes("2FA")
        ) {
          toaster(
            err.response.data?.message ||
              "2FA is required for this action. Please enable 2FA in your profile.",
            { variant: "error" }
          );
        } else {
          throw error;
        }
        return undefined;
      }
    },
    [obtainSession, toaster]
  );

  return { withTwoFA };
}

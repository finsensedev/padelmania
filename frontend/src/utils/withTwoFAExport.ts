import useTwoFASession from "src/hooks/useTwoFASession";
import useNotification from "src/hooks/useNotification";

/**
 * Hook-returning helper to wrap an async export / generate / download action
 * with a 2FA session acquisition flow. If user cancels or 2FA fails, the action is aborted.
 *
 * Usage:
 * const with2FA = useWithTwoFAExport();
 * const handleExport = () => with2FA(async (sessionToken) => {
 *   const blob = await financeOfficerService.exportTransactions({ ...filters, sessionToken });
 *   downloadBlob(blob, "transactions.csv");
 * });
 */
type TwoFASessionScope = "permissions" | "users" | "updatePermissions" | "exports";

interface WithTwoFAOptions<T> {
  /** Optional cache key; if provided, successful result will be cached for current 30s slice */
  cacheKey?: string;
  /** If true, reuse cached result when available without re-executing action */
  useResultCache?: boolean;
  /** Optional transform to decide if a result is cacheable */
  cachePredicate?: (result: T) => boolean;
}

// Local module-level cache: key -> { slice, value }
const _exportCache: Record<string, { slice: number; value: unknown }> = {};
const currentSlice = () => Math.floor(Date.now() / 1000 / 30);

export function useWithTwoFAExport(scope: TwoFASessionScope = "exports") {
  const { obtainSession } = useTwoFASession();
  const { toaster } = useNotification();

  return async <T>(
    action: (sessionToken: string) => Promise<T>,
    options?: WithTwoFAOptions<T>
  ): Promise<T | undefined> => {
    const slice = currentSlice();
    if (options?.cacheKey && options.useResultCache) {
      const existing = _exportCache[options.cacheKey];
      if (existing && existing.slice === slice) {
        return existing.value as T;
      }
    }

    const sessionToken = await obtainSession(scope);
    if (!sessionToken) {
      toaster("2FA verification cancelled", { variant: "info" });
      return undefined;
    }
    const result = await action(sessionToken);
    if (options?.cacheKey) {
      const ok = options.cachePredicate ? options.cachePredicate(result) : true;
      if (ok) {
        _exportCache[options.cacheKey] = { slice, value: result };
      }
    }
    return result;
  };
}

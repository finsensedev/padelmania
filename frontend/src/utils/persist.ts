export function stripAuthFromPersistedState() {
  const persistedRoot = localStorage.getItem("persist:root");
  if (!persistedRoot) {
    return;
  }

  try {
    const data = JSON.parse(persistedRoot);
    if (!data || typeof data !== "object") {
      localStorage.removeItem("persist:root");
      return;
    }
    const { _persist, ...rest } = data as Record<string, unknown>;

    delete rest.userState;
    delete rest.userSession;

    const cleaned: Record<string, unknown> = { ...rest };
    if (_persist) {
      cleaned._persist = _persist;
    }

    const keys = Object.keys(cleaned);
    if (keys.length === 0) {
      if (_persist) {
        localStorage.setItem("persist:root", JSON.stringify({ _persist }));
      } else {
        localStorage.removeItem("persist:root");
      }
      return;
    }

    localStorage.setItem("persist:root", JSON.stringify(cleaned));
  } catch {
    localStorage.removeItem("persist:root");
  }
}

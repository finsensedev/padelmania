import { useDispatch, useSelector } from "react-redux";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import type { RootState } from "../redux/store";
import { useEffect, useMemo, useRef, useCallback } from "react";
import { useSessionStorage } from "usehooks-ts";

import { ModalProvider } from "src/contexts/ModalProvider";
import { PermissionProvider } from "src/contexts/PermissionProvider";

import useNotification from "src/hooks/useNotification";
import { clearSession } from "src/redux/slicers/sessionSlice";
import { logout } from "src/redux/slicers/userSlice";
import type { AppDispatch } from "src/redux/store";
import { stripAuthFromPersistedState } from "src/utils/persist";
import NotificationProvider from "src/contexts/NotificationProvider";
import { SystemConfigProvider } from "src/contexts/SystemConfigProvider";

function PrivateRoutes() {
  const { user } = useSelector((state: RootState) => state.userState);
  const location = useLocation();
  const [, setRedirect] = useSessionStorage("redirect", "/");
  const { toaster } = useNotification();
  const dispatch = useDispatch<AppDispatch>();

  // Memoize authentication result to avoid recomputation each render unless inputs change
  const { sessionActive, expiresAt } = useSelector(
    (state: RootState) => state.userSession
  );

  const sessionValid = useMemo(() => {
    if (!sessionActive) return false;
    if (typeof expiresAt === "number") {
      return expiresAt > Date.now();
    }
    return true;
  }, [sessionActive, expiresAt]);

  const isAuthenticated = !!user && sessionValid;

  // One-time token expiry check on mount + when token reference changes in store
  const hasDisplayedExpiry = useRef(false);
  const forceLogout = useCallback(
    (showToast = false) => {
      dispatch(clearSession());
      dispatch(logout());
      stripAuthFromPersistedState();
      if (showToast) {
        toaster("Session expired. Please log in again.", {
          variant: "error",
        });
      }
    },
    [dispatch, toaster]
  );

  useEffect(() => {
    if (!user) {
      hasDisplayedExpiry.current = false;
      return;
    }

    if (!sessionActive) {
      return;
    }

    if (typeof expiresAt !== "number") {
      hasDisplayedExpiry.current = false;
      return;
    }

    if (Date.now() >= expiresAt) {
      if (!hasDisplayedExpiry.current) {
        forceLogout(true);
        hasDisplayedExpiry.current = true;
      }
    } else {
      hasDisplayedExpiry.current = false;
    }
  }, [sessionActive, expiresAt, user, forceLogout]);

  useEffect(() => {
    setRedirect(location.pathname);
  }, [location.pathname, setRedirect]);

  return isAuthenticated ? (
    <ModalProvider>
      <NotificationProvider>
        <PermissionProvider>
          <SystemConfigProvider>
            <Outlet />
          </SystemConfigProvider>
        </PermissionProvider>
      </NotificationProvider>
    </ModalProvider>
  ) : (
    <Navigate to={"/login"} replace />
  );
}
export default PrivateRoutes;

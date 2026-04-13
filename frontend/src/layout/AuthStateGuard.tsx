import { useEffect } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "src/redux/store";
import authService from "src/services/authService";

const AuthStateGuard = () => {
  const { user } = useSelector((state: RootState) => state.userState);
  const { sessionActive, expiresAt } = useSelector(
    (state: RootState) => state.userSession
  );

  useEffect(() => {
    if (!user) {
      return;
    }

    if (!sessionActive) {
      authService.clearAllAuthData();
      return;
    }

    if (typeof expiresAt === "number" && expiresAt <= Date.now()) {
      authService.clearAllAuthData();
    }
  }, [sessionActive, expiresAt, user]);

  return null;
};

export default AuthStateGuard;

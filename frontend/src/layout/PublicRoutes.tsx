import { useSelector } from "react-redux";
import { Outlet, Navigate } from "react-router-dom";
import type { RootState } from "../redux/store";
import { useSessionStorage } from "usehooks-ts";
import { resolvePostLoginPath } from "src/lib/route";

function PublicRoutes() {
  const { user } = useSelector((state: RootState) => state.userState);
  const { sessionActive, expiresAt } = useSelector(
    (state: RootState) => state.userSession
  );

  const [redirect] = useSessionStorage("redirect", "/");

  const sessionValid = sessionActive && (!expiresAt || expiresAt > Date.now());

  if (!user || !sessionValid) return <Outlet />;

  const target = resolvePostLoginPath(user.role, redirect);
  return <Navigate to={target} replace />;
}

export default PublicRoutes;

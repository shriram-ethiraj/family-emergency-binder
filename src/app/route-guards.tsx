import { Navigate, Outlet, useLocation } from "react-router";
import { FullScreenLoading } from "@/components/shared/loading";
import { useSession } from "@/app/session-context";

export function RootRedirect() {
  const { session, loading, vault } = useSession();
  if (loading) return <FullScreenLoading />;
  return <Navigate to={session ? "/documents" : vault.unlocked ? "/profiles" : "/login"} replace />;
}

export function PublicOnlyRoute() {
  const { session, loading, recoveryKey, vault } = useSession();
  if (loading) return <FullScreenLoading />;
  if (session && !recoveryKey && locationPath() !== "/profiles") return <Navigate to="/documents" replace />;
  if (vault.unlocked && !recoveryKey && locationPath() !== "/profiles") return <Navigate to="/profiles" replace />;
  return <Outlet />;
}

export function ProtectedRoute() {
  const { session, loading, lockReason, vault } = useSession();
  const location = useLocation();
  if (loading) return <FullScreenLoading />;
  if (!session) {
    if (vault.unlocked) return <Navigate to="/profiles" replace />;
    if (lockReason) return <Navigate to={`/login?reason=${lockReason}`} replace />;
    const destination = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?redirect=${encodeURIComponent(destination)}`} replace />;
  }
  return <Outlet />;
}

function locationPath() { return window.location.hash.replace(/^#/, "").split("?")[0] || "/"; }

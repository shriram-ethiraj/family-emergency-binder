import { Navigate, Outlet, useLocation } from "react-router";
import { FullScreenLoading } from "@/components/shared/loading";
import { useSession } from "@/app/session-context";

export function RootRedirect() {
  const { session, loading } = useSession();
  if (loading) return <FullScreenLoading />;
  return <Navigate to={session ? "/documents" : "/login"} replace />;
}

export function PublicOnlyRoute() {
  const { session, loading, recoveryKey } = useSession();
  if (loading) return <FullScreenLoading />;
  return session && !recoveryKey ? <Navigate to="/documents" replace /> : <Outlet />;
}

export function ProtectedRoute() {
  const { session, loading, lockReason } = useSession();
  const location = useLocation();
  if (loading) return <FullScreenLoading />;
  if (!session) {
    if (lockReason) return <Navigate to={`/login?reason=${lockReason}`} replace />;
    const destination = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?redirect=${encodeURIComponent(destination)}`} replace />;
  }
  return <Outlet />;
}

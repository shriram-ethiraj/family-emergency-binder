import { useQuery } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { ApiError, api, json, setCsrf } from "@/lib/api";
import type { SessionInfo } from "@/lib/domain";
import { clearSensitiveQueries, queryClient, queryKeys } from "@/lib/query-client";

export const SESSION_INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
const SESSION_KEEP_ALIVE_INTERVAL_MS = 5 * 60 * 1000;

interface SessionContextValue {
  session: SessionInfo | null;
  loading: boolean;
  recoveryKey: string | null;
  lockReason: "locked" | "expired" | "deleted" | null;
  activate: (session: SessionInfo) => void;
  updateSession: (session: SessionInfo) => void;
  setRecoveryKey: (key: string | null) => void;
  lock: (reason?: "locked" | "expired") => Promise<void>;
  clearSession: (reason: "deleted") => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

async function readSession() {
  try {
    const result = await api<{ session: SessionInfo }>("/session");
    setCsrf(result.session.csrfToken);
    return result.session;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [lockReason, setLockReason] = useState<"locked" | "expired" | "deleted" | null>(null);
  const [sessionOverride, setSessionOverride] = useState<SessionInfo | null | undefined>(undefined);
  const sessionQuery = useQuery({
    queryKey: queryKeys.session,
    queryFn: readSession,
    staleTime: Infinity,
    retry: false,
  });

  const session = sessionOverride === undefined ? sessionQuery.data ?? null : sessionOverride;
  const activate = useCallback((next: SessionInfo) => {
    setCsrf(next.csrfToken);
    setLockReason(null);
    setSessionOverride(next);
    queryClient.setQueryData(queryKeys.session, next);
  }, []);
  const updateSession = activate;

  const clearSession = useCallback((reason: "deleted") => {
    setLockReason(reason);
    navigate(`/login?reason=${reason}`, { replace: true, flushSync: true });
    setCsrf();
    clearSensitiveQueries();
    setSessionOverride(null);
    queryClient.setQueryData(queryKeys.session, null);
    setRecoveryKey(null);
  }, [navigate]);

  const lock = useCallback(async (reason: "locked" | "expired" = "locked") => {
    if (queryClient.getQueryData(queryKeys.session)) {
      try { await api("/session/lock", json("POST", {})); } catch { /* A server-expired session is already locked. */ }
    }
    setLockReason(reason);
    navigate(`/login?reason=${reason}`, { replace: true, flushSync: true });
    setCsrf();
    clearSensitiveQueries();
    setSessionOverride(null);
    queryClient.setQueryData(queryKeys.session, null);
    setRecoveryKey(null);
  }, [navigate]);

  useEffect(() => {
    if (!session) return;
    let lastActivityAt = Date.now();
    let activitySinceKeepAlive = false;
    let keepAliveInFlight = false;
    let expirationRequested = false;
    const expire = () => {
      if (expirationRequested) return;
      expirationRequested = true;
      void lock("expired");
    };
    let timer = window.setTimeout(expire, SESSION_INACTIVITY_TIMEOUT_MS);

    const keepAlive = async () => {
      if (!activitySinceKeepAlive || keepAliveInFlight) return;
      activitySinceKeepAlive = false;
      keepAliveInFlight = true;
      try {
        await api("/session/keepalive", json("POST", {}));
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) expire();
        else activitySinceKeepAlive = true;
      } finally {
        keepAliveInFlight = false;
      }
    };
    const reset = () => {
      if (Date.now() - lastActivityAt >= SESSION_INACTIVITY_TIMEOUT_MS) {
        expire();
        return;
      }
      lastActivityAt = Date.now();
      activitySinceKeepAlive = true;
      window.clearTimeout(timer);
      timer = window.setTimeout(expire, SESSION_INACTIVITY_TIMEOUT_MS);
    };
    const keepAliveTimer = window.setInterval(() => void keepAlive(), SESSION_KEEP_ALIVE_INTERVAL_MS);
    const events = ["pointerdown", "pointermove", "keydown", "input", "scroll"] as const;
    events.forEach((event) => window.addEventListener(event, reset, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(keepAliveTimer);
      events.forEach((event) => window.removeEventListener(event, reset));
    };
  }, [lock, session]);

  const value = useMemo(() => ({
    session,
    loading: sessionQuery.isPending,
    recoveryKey,
    lockReason,
    activate,
    updateSession,
    setRecoveryKey,
    lock,
    clearSession,
  }), [activate, clearSession, lock, lockReason, recoveryKey, session, sessionQuery.isPending, updateSession]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}

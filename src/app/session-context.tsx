import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import type { ProfileSummary, SessionInfo, VaultStatus } from "@/lib/domain";
import { clearSensitiveQueries, queryClient, queryKeys } from "@/lib/query-client";
import { vaultClient } from "@/lib/vault-client";

export const SESSION_INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;

interface SessionContextValue {
  session: SessionInfo | null;
  loading: boolean;
  recoveryKey: string | null;
  lockReason: "locked" | "expired" | "deleted" | null;
  vault: VaultStatus;
  profiles: ProfileSummary[];
  supported: boolean;
  directSave: boolean;
  chooseVault(): Promise<void>;
  createVault(password: string): Promise<void>;
  unlockVault(password: string): Promise<void>;
  recoverVault(recoveryKey: string, newPassword: string): Promise<void>;
  selectProfile(profileId: string): Promise<void>;
  refreshProfiles(): Promise<void>;
  activate(session: SessionInfo): void;
  updateSession(session: SessionInfo): void;
  setRecoveryKey(key: string | null): void;
  saveCopy(): Promise<void>;
  lock(reason?: "locked" | "expired"): Promise<void>;
  clearSession(reason: "deleted"): void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [lockReason, setLockReason] = useState<"locked" | "expired" | "deleted" | null>(null);
  const [vault, setVault] = useState<VaultStatus>(vaultClient.snapshot());
  useEffect(() => vaultClient.subscribe(setVault), []);

  const refreshProfiles = useCallback(async () => {
    if (!vaultClient.snapshot().unlocked) { setProfiles([]); return; }
    const result = await vaultClient.call<{ profiles: ProfileSummary[] }>("/profiles", "GET"); setProfiles(result.profiles);
  }, []);
  const chooseVault = useCallback(async () => { await vaultClient.chooseVault(); setSession(null); setProfiles([]); setRecoveryKey(null); setLockReason(null); }, []);
  const createVault = useCallback(async (password: string) => { const result = await vaultClient.createVault(password); setRecoveryKey(result.recoveryKey); setProfiles(result.profiles); setSession(null); setLockReason(null); }, []);
  const unlockVault = useCallback(async (password: string) => { const result = await vaultClient.unlock(password); setProfiles(result.profiles); setSession(null); setLockReason(null); }, []);
  const recoverVault = useCallback(async (key: string, password: string) => { const result = await vaultClient.recover(key, password); setProfiles(result.profiles); setSession(null); setLockReason(null); }, []);
  const selectProfile = useCallback(async (profileId: string) => { const result = await vaultClient.call<{ session: SessionInfo }>("/session/select", "POST", { profileId }); setSession(result.session); queryClient.setQueryData(queryKeys.session, result.session); clearSensitiveQueries(); }, []);
  const updateSession = useCallback((next: SessionInfo) => { if (session?.profileId !== next.profileId) clearSensitiveQueries(); setSession(next); queryClient.setQueryData(queryKeys.session, next); }, [session]);
  const clearSession = useCallback((reason: "deleted") => { setSession(null); setLockReason(reason); clearSensitiveQueries(); void refreshProfiles(); navigate("/profiles", { replace: true }); }, [navigate, refreshProfiles]);
  const saveCopy = useCallback(async () => { await vaultClient.saveCopy(); }, []);
  const lock = useCallback(async (reason: "locked" | "expired" = "locked") => {
    await vaultClient.waitForSave();
    await vaultClient.lock(); setSession(null); setProfiles([]); setRecoveryKey(null); setLockReason(reason); clearSensitiveQueries(); queryClient.clear(); navigate(`/login?reason=${reason}`, { replace: true });
  }, [navigate]);

  useEffect(() => {
    if (!session) return;
    let timer = window.setTimeout(() => void lock("expired"), SESSION_INACTIVITY_TIMEOUT_MS);
    const reset = () => { window.clearTimeout(timer); timer = window.setTimeout(() => void lock("expired"), SESSION_INACTIVITY_TIMEOUT_MS); };
    const events = ["pointerdown", "keydown", "input", "scroll"] as const; events.forEach((event) => window.addEventListener(event, reset, { passive: true }));
    return () => { window.clearTimeout(timer); events.forEach((event) => window.removeEventListener(event, reset)); };
  }, [lock, session]);

  useEffect(() => {
    if (vault.saveState === "saved") return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [vault.saveState]);

  const value = useMemo(() => ({ session, loading: false, recoveryKey, lockReason, vault, profiles, supported: vaultClient.supported(), directSave: vaultClient.directSaveSupported(), chooseVault, createVault, unlockVault, recoverVault, selectProfile, refreshProfiles, activate: updateSession, updateSession, setRecoveryKey, saveCopy, lock, clearSession }), [chooseVault, clearSession, createVault, lock, lockReason, profiles, recoverVault, recoveryKey, refreshProfiles, saveCopy, selectProfile, session, unlockVault, updateSession, vault]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() { const value = useContext(SessionContext); if (!value) throw new Error("useSession must be used inside SessionProvider"); return value; }

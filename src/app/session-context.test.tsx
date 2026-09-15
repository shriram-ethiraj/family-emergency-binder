import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_INACTIVITY_TIMEOUT_MS, SessionProvider, useSession } from "@/app/session-context";
import type { SessionInfo } from "@/lib/domain";
import { queryClient, queryKeys } from "@/lib/query-client";

const testSession: SessionInfo = {
  profileId: "fictional-profile",
  profileName: "Fictional Profile",
  passwordEpoch: 1,
  profileRevision: 1,
  profile: { fullName: "Fictional Person" },
  csrfToken: "test-csrf-token",
  expiresAt: "2026-09-13T12:30:00.000Z",
};

function SessionProbe() {
  const { activate, session } = useSession();
  const activated = useRef(false);
  useEffect(() => {
    if (activated.current) return;
    activated.current = true;
    activate(testSession);
  }, [activate]);
  return <span>{session ? "Profile active" : "Profile locked"}</span>;
}

function SwitchProbe({ next }: { next: SessionInfo }) {
  const { activate, session } = useSession();
  const activated = useRef(false);
  useEffect(() => {
    if (activated.current) return;
    activated.current = true;
    activate(testSession);
  }, [activate]);
  return <button onClick={() => activate(next)}>{session?.profileId ?? "none"}</button>;
}

describe("session inactivity", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    queryClient.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps active form work unlocked and locks after 30 minutes of inactivity", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <SessionProvider><SessionProbe /></SessionProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText("Profile active")).toBeInTheDocument();

    await act(async () => { await vi.advanceTimersByTimeAsync(20 * 60 * 1000); });
    fireEvent.input(document.body);
    await act(async () => { await vi.advanceTimersByTimeAsync(SESSION_INACTIVITY_TIMEOUT_MS - 1); });
    expect(screen.getByText("Profile active")).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(screen.getByText("Profile locked")).toBeInTheDocument();
  });

  it("clears cached documents when the active profile changes", async () => {
    const next = { ...testSession, profileId: "fictional-other-profile", profileName: "Other Fictional Profile" };
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <SessionProvider><SwitchProbe next={next} /></SessionProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole("button")).toHaveTextContent("fictional-profile");
    queryClient.setQueryData(queryKeys.documents, [{ id: "stale-document" }]);

    await act(async () => { fireEvent.click(screen.getByRole("button")); });
    expect(queryClient.getQueryData(queryKeys.documents)).toBeUndefined();
  });
});

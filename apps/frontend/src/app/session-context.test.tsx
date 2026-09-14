import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_INACTIVITY_TIMEOUT_MS, SessionProvider, useSession } from "@/app/session-context";
import type { SessionInfo } from "@/lib/domain";
import { queryClient } from "@/lib/query-client";

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

describe("session inactivity", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    queryClient.clear();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/session/keepalive")) return new Response(JSON.stringify({ expiresAt: "2026-09-13T13:00:00.000Z" }), { status: 200, headers: { "Content-Type": "application/json" } });
      if (url.endsWith("/api/session/lock")) return new Response(JSON.stringify({ locked: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      if (url.endsWith("/api/session")) return new Response(JSON.stringify({ error: "Profile is locked" }), { status: 401, headers: { "Content-Type": "application/json" } });
      throw new Error(`Unexpected request: ${url}`);
    }));
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
    expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).endsWith("/api/session/keepalive"))).toBe(true);

    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(screen.getByText("Profile locked")).toBeInTheDocument();
  });
});

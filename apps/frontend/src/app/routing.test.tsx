import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RouterProvider, createMemoryRouter } from "react-router";
import { AppProviders } from "@/app/providers";
import { appRoutes } from "@/app/router";
import { queryClient } from "@/lib/query-client";

describe("application routing", () => {
  beforeEach(() => {
    queryClient.clear();
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/session")) return new Response(JSON.stringify({ error: "Profile is locked" }), { status: 401, headers: { "Content-Type": "application/json" } });
      if (url.endsWith("/api/profiles")) return new Response(JSON.stringify({ profiles: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
      throw new Error(`Unexpected request: ${url}`);
    }));
  });

  it("redirects a protected deep link to login and preserves its local destination", async () => {
    const router = createMemoryRouter(appRoutes, { initialEntries: ["/documents/example/edit"] });
    render(<AppProviders><RouterProvider router={router} /></AppProviders>);
    expect(await screen.findByRole("heading", { name: "Unlock your profile" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");
    expect(new URLSearchParams(router.state.location.search).get("redirect")).toBe("/documents/example/edit");
    expect(screen.getByRole("link", { name: "Create a profile" })).toHaveAttribute("href", "/register");
    expect(screen.getAllByText("Binder Creator")).toHaveLength(2);
    expect(document.title).toBe("Family Emergency Binder Creator");
  });
});

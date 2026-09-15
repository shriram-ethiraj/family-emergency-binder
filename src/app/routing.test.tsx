import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { RouterProvider, createMemoryRouter } from "react-router";
import { AppProviders } from "@/app/providers";
import { appRoutes } from "@/app/router";
import { APP_VERSION } from "@/lib/branding";
import { queryClient } from "@/lib/query-client";

describe("application routing", () => {
  beforeEach(() => {
    queryClient.clear();
    localStorage.clear();
  });

  it("renders the browser vault entry route", async () => {
    const router = createMemoryRouter(appRoutes, { initialEntries: ["/login"] });
    render(<AppProviders><RouterProvider router={router} /></AppProviders>);
    expect(await screen.findByRole("heading", { name: "Open your family vault" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");
    expect(screen.getByRole("link", { name: "Create one" })).toHaveAttribute("href", "/register");
    expect(screen.getAllByText("Binder Creator")).toHaveLength(2);
    expect(screen.getByText(`Private by design · No telemetry · Runs from one local file · v${APP_VERSION}`)).toBeInTheDocument();
    expect(screen.getByText(`Runs from one local file · v${APP_VERSION}`)).toBeInTheDocument();
    expect(document.title).toBe("Family Emergency Binder Creator");
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RouterProvider, createMemoryRouter } from "react-router";
import { AppProviders } from "@/app/providers";
import { appRoutes } from "@/app/router";
import { APP_VERSION } from "@/lib/branding";
import { queryClient } from "@/lib/query-client";

describe("application routing", () => {
  beforeEach(() => {
    queryClient.clear();
    localStorage.clear();
    vi.stubGlobal("Request", class {
      url: string;
      method: string;
      signal: AbortSignal | undefined;
      headers = new Headers();
      constructor(input: string | URL, init: RequestInit = {}) {
        this.url = String(input);
        this.method = init.method ?? "GET";
        this.signal = init.signal ?? undefined;
      }
    });
  });

  it("requires templates before rendering the browser vault entry route", async () => {
    const router = createMemoryRouter(appRoutes, { initialEntries: ["/login"] });
    render(<AppProviders><RouterProvider router={router} /></AppProviders>);
    expect(await screen.findByRole("heading", { name: "Load your print templates" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/setup/templates");
    const contents = readFileSync(resolve("definitions/templates/employer-contacts/v1.0.0.json"), "utf8");
    const file = { name: "v1.0.0.json", size: contents.length, lastModified: 1, webkitRelativePath: "templates/employer-contacts/v1.0.0.json", text: async () => contents } as File;
    fireEvent.change(screen.getByLabelText("Template directory"), { target: { files: [file] } });
    expect(await screen.findByRole("heading", { name: "Open your family vault" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");
    expect(screen.getByRole("link", { name: "Create one" })).toHaveAttribute("href", "/register");
    expect(screen.getAllByText("Binder Creator")).toHaveLength(2);
    expect(screen.getByText(`Private by design · No telemetry · Runs from a local folder · v${APP_VERSION}`)).toBeInTheDocument();
    expect(screen.getByText(`Runs from a local folder · v${APP_VERSION}`)).toBeInTheDocument();
    expect(document.title).toBe("Family Emergency Binder Creator");
  });
});

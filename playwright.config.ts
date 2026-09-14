import { defineConfig, devices } from "@playwright/test";

const runDirectory = `.playwright-data/run-${Date.now()}`;
const webPort = process.env.E2E_WEB_PORT ?? "4180";
const apiPort = process.env.E2E_API_PORT ?? "4181";
const baseURL = `http://127.0.0.1:${webPort}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm build && pnpm start",
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { WEB_PORT: webPort, API_PORT: apiPort, HOST: "127.0.0.1", VAULT_DIR: `${runDirectory}/vault`, OUTPUT_DIR: `${runDirectory}/output` },
  },
});

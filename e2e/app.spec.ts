import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const httpArtifact = "/family-emergency-binder.html";

async function loadTemplates(page: import("@playwright/test").Page, artifact = httpArtifact) {
  await page.goto(`${artifact}#/setup/templates`);
  await page.getByLabel("Template directory").setInputFiles(resolve("definitions/templates"));
  await expect(page.getByRole("heading", { name: "Open your family vault" })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const vaultName = "playwright-family.febvault";
    Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: async (options?: { suggestedName?: string }) => {
      const root = await navigator.storage.getDirectory();
      return root.getFileHandle(options?.suggestedName?.endsWith(".pdf") ? options.suggestedName : vaultName, { create: true });
    } });
    Object.defineProperty(window, "showOpenFilePicker", { configurable: true, value: async () => {
      const root = await navigator.storage.getDirectory(); return [await root.getFileHandle(vaultName)];
    } });
  });
});

test("creates, encrypts, locks, and reopens a portable vault", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Writable-handle mode is a Chromium workflow");
  const password = "fictional test vault password";
  await loadTemplates(page);
  await page.getByRole("link", { name: "Create one" }).click();
  await expect(page).toHaveTitle("Family Emergency Binder Creator");
  await page.getByLabel("Vault password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Choose location and create vault" }).click();
  await expect(page.getByRole("heading", { name: "Save this recovery key now" })).toBeVisible();
  await page.getByLabel("I copied this recovery key and stored it safely.").check();
  await page.getByRole("button", { name: "Continue to profiles" }).click();
  await page.getByLabel("Full name").fill("Fictional E2E Family");
  await page.getByRole("button", { name: "Create profile" }).click();
  await expect(page.getByRole("heading", { name: "No documents yet" })).toBeVisible();
  await expect(page.getByText("Updates synced to vault", { exact: true })).toBeVisible();
  await expect(page.getByText("playwright-family.febvault", { exact: true })).toBeVisible();
  await expect(page.getByText(/^Version \d+\.\d+\.\d+$/, { exact: true })).toBeVisible();

  const plaintextPresent = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory(); const file = await (await root.getFileHandle("playwright-family.febvault")).getFile();
    return (await file.text()).includes("Fictional E2E Family");
  });
  expect(plaintextPresent).toBe(false);

  await page.getByRole("button", { name: "Lock vault" }).click();
  await expect(page.getByRole("heading", { name: "Open your family vault" })).toBeVisible();
  await page.getByRole("button", { name: "Choose vault file" }).click();
  await page.getByLabel("Vault password").fill(password);
  await page.getByRole("button", { name: "Unlock vault" }).click();
  await page.getByRole("button", { name: "Fictional E2E Family" }).click();
  await expect(page.getByRole("heading", { name: "No documents yet" })).toBeVisible();
  await page.getByRole("link", { name: "Create document", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Choose a template" })).toBeVisible();
  const preview = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Preview" }).first().click();
  const previewPage = await preview;
  await expect(page.getByText("Preview opened in a new tab")).toBeVisible();
  await previewPage.close();
});

test("persists newly added credit-card networks", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Writable-handle mode is a Chromium workflow");
  const password = "fictional card network password";
  await loadTemplates(page);
  await page.getByRole("link", { name: "Create one" }).click();
  await page.getByLabel("Vault password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Choose location and create vault" }).click();
  await page.getByLabel("I copied this recovery key and stored it safely.").check();
  await page.getByRole("button", { name: "Continue to profiles" }).click();
  await page.getByLabel("Full name").fill("Fictional Card Family");
  await page.getByRole("button", { name: "Create profile" }).click();

  await page.getByRole("link", { name: "Create document" }).click();
  await page.getByRole("heading", { name: "Credit cards" }).locator("..").getByRole("link", { name: "Use template" }).click();
  await page.getByLabel("Document label").fill("Fictional cards");
  await page.getByLabel("Issuing bank / provider").first().fill("Example Bank");
  await page.getByLabel("Credit-card number").first().fill("SAMPLE-CARD-0001");
  await page.getByLabel("Valid through (MM/YY)").first().fill("03/29");
  await page.getByLabel("Card network").first().click();
  await page.getByRole("option", { name: "JCB" }).click();
  await expect(page.getByLabel("Card network").first()).toContainText("JCB");
  await page.getByRole("button", { name: "Create document" }).click();

  await page.getByRole("link", { name: "Fictional cards" }).click();
  await expect(page.getByLabel("Issuing bank / provider").first()).toHaveValue("Example Bank");
  await expect(page.getByLabel("Card network").first()).toContainText("JCB");
  await page.getByLabel("Card network").first().click();
  await page.getByRole("option", { name: "Maestro" }).click();
  await page.getByRole("button", { name: "Save new revision" }).click();

  await page.getByRole("link", { name: "Fictional cards" }).click();
  await expect(page.getByLabel("Card network").first()).toContainText("Maestro");
});

test("opens the portable artifact directly from file://", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  const artifact = pathToFileURL(resolve("dist/family-emergency-binder/family-emergency-binder.html"));
  await loadTemplates(page, artifact.href);
  await page.getByRole("link", { name: "Create one" }).click();
  await expect(page).toHaveTitle("Family Emergency Binder Creator");
  await expect(page.getByRole("heading", { name: "Create an encrypted vault" })).toBeVisible();
  expect(await page.evaluate(() => Boolean((window as typeof window & { pdfMake?: unknown; __FEBC_PDF_FONTS__?: unknown }).pdfMake && (window as typeof window & { __FEBC_PDF_FONTS__?: unknown }).__FEBC_PDF_FONTS__))).toBe(true);
  await expect.poll(() => page.evaluate(() => window.isSecureContext)).toBe(true);
  await page.waitForTimeout(250);
  expect(browserErrors.filter((message) => /content security policy|cross-origin redirects.*worker|worker script/i.test(message))).toEqual([]);
});

test("creates and downloads a vault in compatibility mode", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "showOpenFilePicker", { configurable: true, value: undefined });
    Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: undefined });
    Object.defineProperty(window, "FileSystemFileHandle", { configurable: true, value: undefined });
  });
  const artifact = pathToFileURL(resolve("dist/family-emergency-binder/family-emergency-binder.html"));
  await loadTemplates(page, artifact.href);
  await page.getByRole("link", { name: "Create one" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Compatibility mode" })).toBeVisible();
  await page.getByLabel("Vault password", { exact: true }).fill("fictional compatibility password");
  await page.getByLabel("Confirm password").fill("fictional compatibility password");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Create and download vault" }).click();
  await expect((await download).suggestedFilename()).toBe("family-emergency-binder.febvault");
  await expect(page.getByRole("heading", { name: "Save this recovery key now" })).toBeVisible();
  await page.getByLabel("I copied this recovery key and stored it safely.").check();
  await page.getByRole("button", { name: "Continue to profiles" }).click();
  await page.getByLabel("Full name").fill("Fictional Compatibility Family");
  await page.getByRole("button", { name: "Create profile" }).click();
  await expect(page.getByText("Updates need download", { exact: true })).toBeVisible();
  const updatedDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download updated vault" }).click();
  const updatedPath = await (await updatedDownload).path();
  expect(updatedPath).toBeTruthy();
  await expect(page.getByText("Downloaded vault is current", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Lock vault" }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose vault file" }).click();
  await (await chooser).setFiles(updatedPath!);
  await page.getByLabel("Vault password").fill("fictional compatibility password");
  await page.getByRole("button", { name: "Unlock vault" }).click();
  await expect(page.getByRole("button", { name: "Fictional Compatibility Family" })).toBeVisible();
});

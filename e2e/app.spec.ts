import { expect, test } from "@playwright/test";

test("critical vault workflow remains route driven", async ({ page }) => {
  const profileName = `E2E Family ${Date.now()}`;
  const password = "safe test password";
  await page.goto("/register");
  await expect(page).toHaveTitle("Family Emergency Binder Creator");
  await page.getByLabel("Full name").fill(profileName);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create profile" }).click();
  await expect(page).toHaveURL(/\/recovery-key$/);
  await expect(page.getByRole("heading", { name: "Save this recovery key now" })).toBeVisible();
  await page.getByLabel("I copied this recovery key and stored it safely.").check();
  await page.getByRole("button", { name: "Continue to the vault" }).click();
  await expect(page).toHaveURL(/\/documents$/);
  await expect(page.getByRole("heading", { name: "No documents yet" })).toBeVisible();

  await page.getByRole("button", { name: "Use dark theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("link", { name: "Create document" }).first().click();
  await expect(page).toHaveURL(/\/documents\/new$/);
  await page.locator('a[href*="template=health-insurance"]').click();
  await page.getByLabel("Document label").fill("E2E Health Policy");
  await page.getByLabel("Policyholder name*").fill(profileName);
  await page.getByLabel("Policy type*").click();
  await page.getByRole("option", { name: "Family Floater" }).click();
  await page.getByLabel("Member 1 name*").fill(profileName);
  await page.getByLabel("Member 1 health-card / member number").fill("E2E-CARD-001");
  await page.getByLabel("Member 2 name").fill("Playwright Test Member");
  await page.getByLabel("Member 2 health-card / member number").fill("E2E-CARD-002");
  await page.getByLabel("Insurance company*").fill("Example Health Insurer");
  await page.getByLabel("Plan name*").fill("Family Health Secure");
  await page.getByLabel("Policy number*").fill("E2E-HEALTH-001");
  await page.getByLabel("Policy start date*").fill("2026-01-15");
  await page.getByLabel("Renewal due date*").fill("2027-01-15");
  await page.getByLabel("Sum insured*").fill("1000000");
  await page.getByLabel("Claim / emergency phone*").fill("1800 000 000");
  await page.getByRole("button", { name: "Create document" }).click();
  await expect(page).toHaveURL(/\/documents$/);
  await expect(page.getByRole("link", { name: "E2E Health Policy", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Actions for E2E Health Policy", exact: true }).click();
  await page.getByRole("menuitem", { name: "Copy document", exact: true }).click();
  await expect(page).toHaveURL(/\/documents\/[^/]+\/edit$/);
  await expect(page.getByLabel("Document label")).toHaveValue("E2E Health Policy (Copy)");
  await page.getByRole("link", { name: "Cancel", exact: true }).click();
  await expect(page).toHaveURL(/\/documents$/);

  await page.getByRole("link", { name: "E2E Health Policy", exact: true }).click();
  await expect(page).toHaveURL(/\/documents\/[^/]+\/edit$/);
  await page.getByLabel("Policy type*").click();
  await page.getByRole("option", { name: "Family Floater" }).click();
  await page.getByLabel("Important notes").fill("Updated by the end-to-end test.");
  await page.getByRole("button", { name: "Save new revision" }).click();
  await expect(page).toHaveURL(/\/documents$/);

  await page.getByRole("button", { name: "Actions for E2E Health Policy" }).click();
  await page.getByRole("menuitem", { name: "Revision history" }).click();
  await expect(page).toHaveURL(/\/documents\/[^/]+\/revisions$/);
  await expect(page.getByRole("heading", { name: "Revision history" })).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();

  const originalRow = page.getByRole("row").filter({ has: page.getByRole("link", { name: "E2E Health Policy", exact: true }) });
  await originalRow.getByRole("link", { name: "Generate PDF", exact: true }).click();
  await page.getByLabel("Current profile password").fill(password);
  await page.getByRole("button", { name: "Generate protected PDF" }).click();
  await expect(page.getByRole("heading", { name: "Document ready" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("link", { name: "Generated PDFs" }).click();
  await expect(page).toHaveURL(/\/generated-files$/);
  await expect(page.getByText(/\.pdf$/).first()).toBeVisible();
  await page.getByRole("button", { name: /Remove .* from list/ }).click();
  await expect(page.getByRole("heading", { name: "Remove PDF from list?" })).toBeVisible();
  await page.getByRole("button", { name: "Remove from list" }).click();
  await expect(page.getByRole("heading", { name: "No generated PDFs" })).toBeVisible();
  await page.getByRole("link", { name: "Profile settings" }).click();
  await page.getByRole("button", { name: "Delete profile" }).click();
  await page.getByLabel(`Type ${profileName} to confirm`).fill(profileName);
  await page.getByLabel("Confirm profile password").fill(password);
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page).toHaveURL(/\/login\?reason=deleted$/);
  await expect(page.getByText("Profile deleted")).toBeVisible();
});

test("profile selector presents local profiles in a popover below the login field", async ({ page, request }) => {
  const password = "safe test password";
  for (const name of ["Profile One", "Profile Two"]) {
    const response = await request.post("/api/profiles", {
      data: { password, identity: { fullName: name } }
    });
    expect(response.ok()).toBeTruthy();
  }

  await page.goto("/login");
  const profileSelect = page.locator("button#profile");
  await profileSelect.click();
  const profileOptions = page.getByRole("option");
  await expect(page.getByRole("option", { name: "Profile One" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Profile Two" })).toBeVisible();
  const [triggerBox, firstOptionBox] = await Promise.all([profileSelect.boundingBox(), profileOptions.first().boundingBox()]);
  expect(triggerBox).not.toBeNull();
  expect(firstOptionBox).not.toBeNull();
  expect(firstOptionBox!.y).toBeGreaterThan(triggerBox!.y);
});

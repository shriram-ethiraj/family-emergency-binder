import { afterEach, describe, expect, it } from "vitest";
import { cp, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { PAPER_SIZES, TemplateCatalog } from "./definitions.js";

const temporary: string[] = [];

afterEach(async () => Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

describe("template catalog", () => {
  it("loads and validates self-contained templates", async () => {
    const cacheDir = await mkdtemp(resolve(tmpdir(), "febc-template-cache-")); temporary.push(cacheDir);
    const catalog = new TemplateCatalog(resolve("../../definitions"), { cacheDir }); await catalog.load();
    const template = catalog.get("term-insurance", "1.2.0");
    expect(catalog.latest()).toHaveLength(9);
    for (const entry of catalog.latest()) {
      expect(entry.template.footer).toBe("Last generated: {{system.generatedAt}}");
      expect(entry.template.nodes.some((node) => node.type === "text" && node.text?.includes("Last generated"))).toBe(false);
    }
    expect(catalog.latest().map((entry) => entry.template.templateId).sort()).toEqual([
      "bank-accounts", "credit-cards", "demat-account", "employer-contacts", "fixed-deposits",
      "health-insurance", "nps-account", "provident-fund", "term-insurance"
    ]);
    expect(template.template.templateId).toBe("term-insurance"); expect(template.template.page.size).toBe("A4");
    for (const entry of catalog.latest()) expect(entry.template.page).toEqual({ size: "A4", marginsMm: [10, 8, 10, 8] });
    expect(template.template.thumbnail).toMatch(/\.png$/); expect(template.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(template.template.schema.properties).toHaveProperty("fullName");
    expect(template.template.ui.sections[1].fields.map((field) => field.path)).toEqual(["insuranceCompany", "planName", "policyNumber", "sumAssured", "policyStartDate", "policyEndDateOrTerm", "premiumAmount", "premiumFrequency"]);
    const thumbnail = await readFile(template.thumbnailPath);
    expect(thumbnail.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(thumbnail.readUInt32BE(16)).toBe(1200); expect(thumbnail.readUInt32BE(20)).toBe(900);
    const firstMtime = (await stat(template.thumbnailPath)).mtimeMs;
    await catalog.load();
    expect((await stat(catalog.get("term-insurance", "1.2.0").thumbnailPath)).mtimeMs).toBe(firstMtime);
    expect(() => catalog.validateData(template.template, template.template.syntheticData)).not.toThrow();
    expect(() => catalog.validateData(template.template, {})).toThrow("Document data is invalid");

    const health = catalog.get("health-insurance", "1.2.0");
    expect(health.template.name).toBe("Health insurance");
    expect(health.template.page).toEqual({ size: "A4", marginsMm: [10, 8, 10, 8] });
    expect(health.template.ui.sections.map((section) => section.title)).toEqual(["POLICY HOLDER", "COVERED MEMBERS & HEALTH-CARD NUMBERS", "POLICY DETAILS", "COVERAGE SUMMARY", "CLAIM & DOCUMENTS"]);
    expect(health.template.schema.required).toEqual([
      "policyholderName", "coverageType", "member1Name", "insuranceCompany", "planName", "policyNumber",
      "policyStartDate", "renewalDueDate", "sumInsured", "claimPhone"
    ]);
    expect(health.template.schema.properties).toMatchObject({ coverageType: { enum: ["Individual", "Family Floater"] } });
    expect(health.template.nodes).toContainEqual(expect.objectContaining({
      type: "pairedTable",
      title: "COVERED MEMBERS & HEALTH-CARD NUMBERS",
      rows: expect.arrayContaining([{ left: "member1Name", right: "member1HealthCardNumber" }, { left: "member6Name", right: "member6HealthCardNumber" }])
    }));
    const memberTable = health.template.nodes.find((node) => node.type === "pairedTable");
    expect(memberTable && memberTable.rows).toHaveLength(6);
    expect(() => catalog.validateData(health.template, health.template.syntheticData)).not.toThrow();
    expect(() => catalog.validateData(health.template, { ...health.template.syntheticData, coverageType: "Group" })).toThrow("Document data is invalid");
    expect(() => catalog.validateData(health.template, { ...health.template.syntheticData, policyStartDate: "15/01/2026" })).toThrow("Document data is invalid");
    expect(() => catalog.validateData(health.template, { ...health.template.syntheticData, sumInsured: -1 })).toThrow("Document data is invalid");

    const bank = catalog.get("bank-accounts", "1.1.0");
    expect(bank.template.ui.sections).toHaveLength(6);
    expect(bank.template.schema.required).toEqual(["bankName1", "accountNumber1", "branch1", "ifscCode1", "balance1"]);
    expect(bank.template.schema.properties).toMatchObject({
      accountNumber1: { type: "string" },
      ifscCode1: { type: "string" },
      balance1: { type: "number", minimum: 0 }
    });
    expect(bank.template.ui.sections.flatMap((section) => section.fields).find((field) => field.path === "accountNumber1")).toMatchObject({ input: "text" });
    expect(() => catalog.validateData(bank.template, bank.template.syntheticData)).not.toThrow();
    expect(() => catalog.validateData(bank.template, { ...bank.template.syntheticData, accountNumber1: "" })).toThrow("Document data is invalid");

    const legacyCards = catalog.get("credit-cards", "1.0.0");
    expect(legacyCards.template.ui.sections).toHaveLength(6);
    const cards = catalog.get("credit-cards", "1.5.0");
    expect(catalog.latest().find((entry) => entry.template.templateId === "credit-cards")?.template.version).toBe("1.5.1");
    expect(cards.template.ui.sections).toHaveLength(7);
    expect(cards.template.ui.sections.map((section) => section.title)).toEqual(["CREDIT CARD 1", "CREDIT CARD 2", "CREDIT CARD 3", "CREDIT CARD 4", "CREDIT CARD 5", "CREDIT CARD 6", "CREDIT CARD 7"]);
    expect(cards.template.schema.required).toEqual(["issuingBank1", "cardNumber1", "validThrough1", "cardNetwork1"]);
    expect(cards.template.schema.properties).toMatchObject({ cardNetwork1: { type: "string", enum: ["Visa", "Mastercard", "RuPay"] }, cardNetwork7: { type: "string", enum: ["Visa", "Mastercard", "RuPay"] } });
    expect(Object.keys(cards.template.schema.properties as Record<string, unknown>)).not.toEqual(expect.arrayContaining([expect.stringMatching(/cvv|cvc|pin/i)]));
    expect(cards.template.ui.sections.flatMap((section) => section.fields.map((field) => field.path))).not.toEqual(expect.arrayContaining([expect.stringMatching(/cvv|cvc|pin/i)]));
    expect(cards.template.ui.sections.flatMap((section) => section.fields).find((field) => field.path === "cardNumber1")).toMatchObject({ input: "text" });
    expect(() => catalog.validateData(cards.template, cards.template.syntheticData)).not.toThrow();
    expect(() => catalog.validateData(cards.template, { ...cards.template.syntheticData, cardNetwork1: "Amex" })).toThrow("Document data is invalid");

    const deposits = catalog.get("fixed-deposits", "1.1.2");
    expect(deposits.template.ui.sections).toHaveLength(5);
    expect(deposits.template.ui.sections.map((section) => section.title)).toEqual([
      "FIXED DEPOSIT 1", "FIXED DEPOSIT 2", "FIXED DEPOSIT 3", "FIXED DEPOSIT 4", "FIXED DEPOSIT 5"
    ]);
    expect(deposits.template.schema.required).toEqual(["bank1", "fixedDepositNumber1", "amount1", "maturityAmount1", "depositDate1", "maturityDate1"]);
    expect(deposits.template.schema.properties).toMatchObject({
      amount1: { type: "number", minimum: 0 },
      maturityAmount1: { type: "number", minimum: 0 },
      depositDate1: { type: "string", format: "date" },
      maturityDate1: { type: "string", format: "date" }
    });
    for (const [index, section] of deposits.template.ui.sections.entries()) {
      const suffix = String(index + 1);
      expect(section.fields.map((field) => field.path)).toEqual([
        `bank${suffix}`, `fixedDepositNumber${suffix}`, `amount${suffix}`, `maturityAmount${suffix}`, `depositDate${suffix}`, `maturityDate${suffix}`
      ]);
    }
    expect(deposits.template.schema.properties).not.toHaveProperty("bank6");
    expect(() => catalog.validateData(deposits.template, deposits.template.syntheticData)).not.toThrow();
    expect(() => catalog.validateData(deposits.template, { ...deposits.template.syntheticData, maturityDate1: "03/04/2027" })).toThrow("Document data is invalid");

    const demat = catalog.get("demat-account", "1.0.0");
    expect(demat.template.schema.required).toEqual(["accountHolderName", "brokerOrDp", "dematAccountId", "stocksValue", "mutualFundsValue", "valueAsOfDate"]);
    expect(demat.template.schema.properties).toMatchObject({
      stocksValue: { type: "number", minimum: 0 },
      mutualFundsValue: { type: "number", minimum: 0 },
      valueAsOfDate: { type: "string", format: "date" }
    });
    expect(() => catalog.validateData(demat.template, { ...demat.template.syntheticData, stocksValue: -1 })).toThrow("Document data is invalid");

    const nps = catalog.get("nps-account", "1.0.1");
    expect(nps.template.schema.required).toEqual(["subscriberName", "pran", "craOrProvider", "tierOneValue"]);
    expect(nps.template.schema.properties).toMatchObject({ tierOneValue: { type: "number", minimum: 0 } });
    expect(nps.template.schema.properties).not.toHaveProperty("valueAsOfDate");
    expect(nps.template.ui.sections.find((section) => section.title === "APPROXIMATE VALUES")?.fields.map((field) => field.path)).toEqual(["tierOneValue", "tierTwoValue"]);
    expect(() => catalog.validateData(nps.template, { ...nps.template.syntheticData, valueAsOfDate: "01/09/2026" })).toThrow("Document data is invalid");

    const providentFund = catalog.get("provident-fund", "1.0.0");
    expect(providentFund.template.schema.required).toEqual(["memberName", "uan", "pfAdministrator", "epfBalance", "valueAsOfDate"]);
    expect(providentFund.template.schema.properties).toMatchObject({
      pfAdministrator: { enum: ["EPFO", "Exempted PF trust", "Other / not verified"] },
      epfBalance: { type: "number", minimum: 0 }
    });
    expect(() => catalog.validateData(providentFund.template, { ...providentFund.template.syntheticData, pfAdministrator: "Broker" })).toThrow("Document data is invalid");

    const employerContacts = catalog.get("employer-contacts", "1.0.0");
    expect(employerContacts.template.schema.required).toEqual(["employeeName", "companyLegalName", "employeeId"]);
    expect(employerContacts.template.ui.sections.map((section) => section.title)).toEqual([
      "EMPLOYMENT DETAILS", "MANAGER", "HUMAN RESOURCES", "PAYROLL / BENEFITS CONTACT", "COMPANY & DOCUMENTS"
    ]);

    for (const entry of [demat, nps, providentFund, employerContacts]) {
      expect(() => catalog.validateData(entry.template, entry.template.syntheticData)).not.toThrow();
      const fieldIds = Object.keys(entry.template.schema.properties as Record<string, unknown>);
      expect(fieldIds.some((field) => /password|otp|tpin|loginPin|accountPin|tradingPin/i.test(field))).toBe(false);
    }
  });
  it("supports named paper sizes and confines assets", async () => {
    const cacheDir = await mkdtemp(resolve(tmpdir(), "febc-template-cache-")); temporary.push(cacheDir);
    const catalog = new TemplateCatalog(resolve("../../definitions"), { cacheDir }); await catalog.load();
    expect(PAPER_SIZES).toContain("A4"); expect(PAPER_SIZES).toContain("LETTER"); expect(PAPER_SIZES).toContain("LEGAL");
    expect(() => catalog.assertAsset(catalog.latest()[0].directory, "../../secret.png")).toThrow("escapes");
  });

  it("rejects duplicate layout references and protects published versions", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "febc-template-")); temporary.push(root);
    await cp(resolve("../../definitions/assets"), resolve(root, "assets"), { recursive: true });
    const templateDir = resolve(root, "templates", "sample");
    await (await import("node:fs/promises")).mkdir(templateDir, { recursive: true });
    const source = { templateId: "sample", version: "1.0.0", name: "Sample", description: "Sample", fields: { name: { label: "Name", type: "string", example: "Example" } }, layout: [{ type: "section", title: "Details", fields: ["name", "name"] }] };
    await writeFile(resolve(templateDir, "v1.0.0.json"), JSON.stringify(source));
    await expect(new TemplateCatalog(root, { cacheDir: resolve(root, "cache") }).load()).rejects.toThrow("duplicate field reference");
    source.layout[0].fields = ["name"];
    await writeFile(resolve(templateDir, "v1.0.0.json"), JSON.stringify(source));
    const cache = resolve(root, "cache"); await new TemplateCatalog(root, { cacheDir: cache }).load();
    await writeFile(resolve(templateDir, "another-name.json"), JSON.stringify(source));
    await expect(new TemplateCatalog(root, { cacheDir: resolve(root, "duplicate-cache") }).load()).rejects.toThrow("declared by more than one JSON file");
    await rm(resolve(templateDir, "another-name.json"));
    source.fields.name.example = "Changed";
    await writeFile(resolve(templateDir, "v1.0.0.json"), JSON.stringify(source));
    await expect(new TemplateCatalog(root, { cacheDir: cache }).load()).rejects.toThrow("without a version change");
  });
});

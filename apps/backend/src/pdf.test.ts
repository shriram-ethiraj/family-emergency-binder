import { describe, expect, it } from "vitest";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { TemplateCatalog } from "./definitions.js";
import { persistPdf, renderPdf } from "./pdf.js";

const password = "test profile password";
const cacheDir = resolve("../../runtime-data/template-cache");

async function loadCatalog() {
  const catalog = new TemplateCatalog(resolve("../../definitions"), { cacheDir });
  await catalog.load();
  return catalog;
}

describe("protected PDF renderer", () => {
  it.each([{ size: "A4" as const, width: 595.28, height: 841.89 }, { size: "LETTER" as const, width: 612, height: 792 }])("creates an encrypted $size PDF using template data", async ({ size, width, height }) => {
    const catalog = await loadCatalog(); const loaded = catalog.get("term-insurance", "1.2.1");
    const template = { ...loaded.template, page: { ...loaded.template.page, size } };
    const buffer = await renderPdf(template, { document: { ...template.syntheticData, fullName: "Test Policy Holder" }, system: { generatedAt: "2026-09-10T10:00:00.000Z", documentRevision: 1, profileRevision: 1 } }, password, loaded.directory);
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-"); expect(buffer.includes(Buffer.from("SAMPLE-2026-0001"))).toBe(false);
    Object.assign(globalThis, { DOMMatrix: class DOMMatrix {}, ImageData: class ImageData {}, Path2D: class Path2D {} });
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    await expect(getDocument({ data: new Uint8Array(buffer), password: "wrong password" }).promise).rejects.toBeTruthy();
    const document = await getDocument({ data: new Uint8Array(buffer), password }).promise; const page = await document.getPage(1); const view = page.getViewport({ scale: 1 });
    const metadata = await document.getMetadata();
    expect(metadata.info).toMatchObject({ Author: "Family Emergency Binder Creator", Creator: "Family Emergency Binder Creator", Producer: "Family Emergency Binder Creator" });
    expect(view.width).toBeCloseTo(width, 0); expect(view.height).toBeCloseTo(height, 0);
    const text = (await page.getTextContent()).items.map((item) => "str" in item ? item.str : "").join(" ").replace(/\s+/g, " ").replace(/\s*-\s*/g, "-");
    expect(text).toContain("TERM INSURANCE POLICY RECORD"); expect(text).toContain("Test Policy Holder"); expect(text).toContain("SAMPLE-2026-0001");
    expect(text).toContain("Last generated: 2026-09-10T10:00:00.000Z"); expect(text).not.toContain("Document revision"); expect(text).not.toContain("1 / 1"); expect(text).not.toContain("Keep this sheet");
    await document.destroy();
  }, 20_000);

  it("renders the health insurance summary as one A4 page with exact identifiers", async () => {
    const catalog = await loadCatalog(); const loaded = catalog.get("health-insurance", "1.2.0");
    const buffer = await renderPdf(loaded.template, {
      document: {
        ...loaded.template.syntheticData,
        member1Name: "Person One",
        member1HealthCardNumber: "CARDNUMBER0001",
        member2Name: "Person Two",
        member2HealthCardNumber: "CARDNUMBER0002",
        member3Name: "Person Three",
        member3HealthCardNumber: "CARDNUMBER0003",
        member4Name: "Person Four",
        member4HealthCardNumber: "CARDNUMBER0004",
        member5Name: "Person Five",
        member5HealthCardNumber: "CARDNUMBER0005",
        member6Name: "Person Six",
        member6HealthCardNumber: "CARDNUMBER0006"
      },
      system: { generatedAt: "2026-09-12T10:00:00.000Z", documentRevision: 1, profileRevision: 1 }
    }, password, loaded.directory);

    Object.assign(globalThis, { DOMMatrix: class DOMMatrix {}, ImageData: class ImageData {}, Path2D: class Path2D {} });
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const document = await getDocument({ data: new Uint8Array(buffer), password }).promise;
    expect(document.numPages).toBe(1);
    const page = await document.getPage(1);
    const text = (await page.getTextContent()).items.map((item) => "str" in item ? item.str : "").join(" ").replace(/\s+/g, "");
    expect(text).toContain("HEALTHINSURANCEPOLICYRECORD");
    expect(text).toContain("PersonSix");
    expect(text).toContain("CARDNUMBER0006");
    await document.destroy();
  }, 20_000);

  it("leaves empty fields blank instead of rendering dash placeholders", async () => {
    const catalog = await loadCatalog(); const loaded = catalog.get("health-insurance", "1.2.0");
    const buffer = await renderPdf(loaded.template, {
      document: {
        ...loaded.template.syntheticData,
        member2Name: "",
        member2HealthCardNumber: "",
        tpaName: "",
        claimEmail: ""
      },
      system: { generatedAt: "2026-09-13T10:00:00.000Z", documentRevision: 1, profileRevision: 1 }
    }, password, loaded.directory);

    Object.assign(globalThis, { DOMMatrix: class DOMMatrix {}, ImageData: class ImageData {}, Path2D: class Path2D {} });
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const document = await getDocument({ data: new Uint8Array(buffer), password }).promise;
    const page = await document.getPage(1);
    const text = (await page.getTextContent()).items.map((item) => "str" in item ? item.str : "").join(" ");
    expect(text).not.toContain("—");
    await document.destroy();
  }, 20_000);

  it("creates lowercase, sanitized generated filenames", async () => {
    const root = await mkdtemp(join(tmpdir(), "febc-pdf-name-"));
    try {
      const catalog = await loadCatalog(); const loaded = catalog.get("term-insurance", "1.2.1");
      const template = { ...loaded, template: { ...loaded.template, name: "Family Finance Summary" } };
      const receipt = await persistPdf({
        buffer: Buffer.from("fictional PDF bytes"), outputDir: root, template,
        profileName: "Élodie O'Connor (Family)", profileRevision: 1, documentId: "fictional-document-id", documentLabel: "Policy_Name.v2",
        documentRevision: 2, passwordEpoch: 1, generationNumber: 7
      });
      expect(receipt.filename).toMatch(/^family-finance-summary_elodie-o-connor-family_policy-name-v2_\d{8}_007_[a-f0-9]{8}\.pdf$/);
      expect(receipt.filename).toBe(receipt.filename.toLowerCase());
      expect(receipt.filename).toMatch(/^[a-z0-9_-]+\.pdf$/);
      await expect(access(join(root, receipt.filename))).resolves.toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 20_000);

  it.each([
    { templateId: "bank-accounts", version: "1.1.1", marker: "SAMPLE-ACCOUNT-0006", formatted: "15,600.00", pageCount: 1 },
    { templateId: "credit-cards", version: "1.5.1", marker: "SAMPLE-CARD-0007", formatted: "04/31", pageCount: 1 },
    { templateId: "fixed-deposits", version: "1.1.2", marker: "SAMPLE-FD-0005", formatted: "05 May 2028", pageCount: 1 },
    { templateId: "demat-account", version: "1.0.0", marker: "SAMPLE-DEMAT-0001", formatted: "8,75,000.00", pageCount: 1 },
    { templateId: "nps-account", version: "1.0.1", marker: "SAMPLE-PRAN-0001", formatted: "6,40,000.00", pageCount: 1 },
    { templateId: "provident-fund", version: "1.0.0", marker: "SAMPLE-UAN-0001", formatted: "9,20,000.00", pageCount: 1 },
    { templateId: "employer-contacts", version: "1.0.0", marker: "SAMPLE-EMP-0001", formatted: "payroll@example.invalid", pageCount: 1 }
  ])("renders the $templateId records in the expected A4 page count", async ({ templateId, version = "1.0.0", marker, formatted, pageCount }) => {
    const catalog = await loadCatalog(); const loaded = catalog.get(templateId, version);
    const buffer = await renderPdf(loaded.template, {
      document: loaded.template.syntheticData,
      system: { generatedAt: "2026-09-13T10:00:00.000Z", documentRevision: 1, profileRevision: 1 }
    }, password, loaded.directory);

    Object.assign(globalThis, { DOMMatrix: class DOMMatrix {}, ImageData: class ImageData {}, Path2D: class Path2D {} });
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const document = await getDocument({ data: new Uint8Array(buffer), password }).promise;
    expect(document.numPages).toBe(pageCount);
    const pages = await Promise.all(Array.from({ length: document.numPages }, async (_, index) => {
      const page = await document.getPage(index + 1);
      return (await page.getTextContent()).items.map((item) => "str" in item ? item.str : "").join(" ");
    }));
    const text = pages.join(" ").replace(/\s+/g, " ").replace(/\s*-\s*/g, "-");
    expect(text).toContain(marker);
    expect(text).toContain(formatted);
    await document.destroy();
  }, 20_000);
});

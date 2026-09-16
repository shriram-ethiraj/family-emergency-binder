import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { loadTemplateFiles, TEMPLATE_LIMITS, type TemplateFileLike } from "@/lib/template-catalog";

function source(name: string, version = "1.0.0") {
  return JSON.stringify({
    templateId: "fictional-contact",
    version,
    name,
    description: "An obviously fictional template used for tests.",
    fields: { contactName: { label: "Contact name", type: "string", required: true, example: "Fictional Person" } },
    layout: [{ type: "section", title: "CONTACT", fields: ["contactName"] }],
  });
}

function templateFile(path: string, contents: string, lastModified = 1): TemplateFileLike {
  return { name: path.split("/").at(-1)!, webkitRelativePath: path, size: new TextEncoder().encode(contents).byteLength, lastModified, text: async () => contents };
}

describe("runtime template catalog", () => {
  it("loads every repository template through the runtime contract", async () => {
    const root = resolve("definitions/templates");
    const paths = walk(root);
    const result = await loadTemplateFiles(paths.map((path) => {
      const contents = readFileSync(path, "utf8");
      return templateFile(`templates/${relative(root, path)}`, contents, statSync(path).mtimeMs);
    }));
    expect(result.templates).toHaveLength(paths.length);
    expect(result.diagnostics).toEqual([]);
  });

  it("loads nested JSON templates and reports invalid neighbors", async () => {
    const result = await loadTemplateFiles([
      templateFile("templates/fictional-contact/v1.0.0.json", source("Fictional contacts")),
      templateFile("templates/broken.json", "not-json"),
      templateFile("templates/readme.txt", "ignored"),
    ]);
    expect(result.folderName).toBe("templates");
    expect(result.templates).toHaveLength(1);
    expect(result.templates[0].name).toBe("Fictional contacts");
    expect(result.diagnostics).toEqual([expect.objectContaining({ level: "error", path: "templates/broken.json" })]);
  });

  it("uses the newest duplicate and breaks timestamp ties by path", async () => {
    const result = await loadTemplateFiles([
      templateFile("templates/z-old.json", source("Older"), 10),
      templateFile("templates/b-new.json", source("Newer"), 20),
      templateFile("templates/a-tie.json", source("Tie winner"), 20),
    ]);
    expect(result.templates).toHaveLength(1);
    expect(result.templates[0].name).toBe("Tie winner");
    expect(result.diagnostics.filter((item) => item.level === "warning")).toHaveLength(2);
  });

  it("rejects an empty, oversized, or wholly invalid selection", async () => {
    await expect(loadTemplateFiles([])).rejects.toThrow("at least one JSON template");
    await expect(loadTemplateFiles([{ ...templateFile("templates/large.json", source("Large")), size: TEMPLATE_LIMITS.maximumFileBytes + 1 }])).rejects.toThrow("No valid templates");
    await expect(loadTemplateFiles([templateFile("templates/invalid.json", "{}")])).rejects.toThrow("No valid templates");
  });
});

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : entry.isFile() && entry.name.endsWith(".json") ? [path] : [];
  });
}

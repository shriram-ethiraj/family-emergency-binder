import { describe, expect, it } from "vitest";
import { initials, safeRedirect } from "./format";

describe("safeRedirect", () => {
  it("keeps local application paths", () => expect(safeRedirect("/documents/abc/edit?from=test")).toBe("/documents/abc/edit?from=test"));
  it.each([null, "https://evil.example", "//evil.example", "documents"])("rejects unsafe destination %s", (value) => expect(safeRedirect(value)).toBe("/documents"));
});

describe("initials", () => {
  it("uses at most two words", () => expect(initials("Family Vault Owner")).toBe("FV"));
});

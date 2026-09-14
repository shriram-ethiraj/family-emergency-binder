import { describe, expect, it } from "vitest";
import { safeOutputName } from "./utils.js";

describe("safe output names", () => {
  it.each([
    ["Élodie O'Connor (Family)", "elodie-o-connor-family"],
    ["Policy_Name.v2", "policy-name-v2"]
  ])("normalizes %s to %s", (value, expected) => {
    expect(safeOutputName(value)).toBe(expected);
  });

  it("uses a safe fallback when a name has no usable characters", () => {
    expect(safeOutputName("!!!")).toBe("document");
  });
});

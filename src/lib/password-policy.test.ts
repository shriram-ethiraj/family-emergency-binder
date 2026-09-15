import { describe, expect, it } from "vitest";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, assertPassword } from "@/lib/password-policy";

describe("vault password policy", () => {
  it("accepts four-character passwords", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(4);
    expect(() => assertPassword("1234")).not.toThrow();
  });

  it("rejects passwords outside the allowed length", () => {
    expect(() => assertPassword("123")).toThrow(/4 to 128 characters/);
    expect(() => assertPassword("a".repeat(PASSWORD_MAX_LENGTH + 1))).toThrow(/4 to 128 characters/);
  });
});

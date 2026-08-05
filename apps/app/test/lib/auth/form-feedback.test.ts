import { describe, expect, it } from "vitest";

import { PASSWORD_PATTERN, getPasswordRequirementStates } from "@/lib/auth/form-feedback";

const t = (key: string) => key;

describe("password form feedback", () => {
  it("tracks each password requirement independently", () => {
    expect(getPasswordRequirementStates("short", t)).toEqual([
      { key: "length", label: "auth:PASSWORD_REQUIREMENT_LENGTH", met: false },
      { key: "lowercase", label: "auth:PASSWORD_REQUIREMENT_LOWERCASE", met: true },
      { key: "uppercase", label: "auth:PASSWORD_REQUIREMENT_UPPERCASE", met: false },
      { key: "number", label: "auth:PASSWORD_REQUIREMENT_NUMBER", met: false },
    ]);
  });

  it("requires uppercase, lowercase, and number characters", () => {
    expect(PASSWORD_PATTERN.test("lowercase123")).toBe(false);
    expect(PASSWORD_PATTERN.test("UPPERCASE123")).toBe(false);
    expect(PASSWORD_PATTERN.test("Password")).toBe(false);
    expect(PASSWORD_PATTERN.test("Password1")).toBe(true);
  });
});

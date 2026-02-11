import { describe, expect, test } from "vitest";

import { resolveLoginMode } from "@/lib/auth-mode";

describe("resolveLoginMode", () => {
  test("keeps register mode when public register is enabled", () => {
    expect(resolveLoginMode("register", true)).toBe("register");
  });

  test("forces login mode when public register is disabled", () => {
    expect(resolveLoginMode("register", false)).toBe("login");
  });

  test("keeps login mode regardless of register capability", () => {
    expect(resolveLoginMode("login", false)).toBe("login");
    expect(resolveLoginMode("login", true)).toBe("login");
  });
});

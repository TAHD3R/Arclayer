import { describe, expect, it } from "vitest";
import type { i18n as I18nInstance } from "i18next";

import { requiredTranslation } from "@/lib/i18n/required-translation";

function i18nWith(values: Readonly<Record<string, string>>): I18nInstance {
  return {
    exists: (key: string) => key in values,
    t: (key: string) => values[key] ?? key,
  } as I18nInstance;
}

describe("requiredTranslation", () => {
  it("returns the exact localized resource", () => {
    expect(
      requiredTranslation(i18nWith({ "settings:NAME": "名称" }), "settings:NAME", "name"),
    ).toBe("名称");
  });

  it("rejects a missing key instead of using backend copy", () => {
    expect(() => requiredTranslation(i18nWith({}), "settings:MISSING", "name")).toThrow(
      "Missing translation for name",
    );
  });

  it("rejects an unresolved raw key", () => {
    const i18n = {
      exists: () => true,
      t: (key: string) => key,
    } as unknown as I18nInstance;
    expect(() => requiredTranslation(i18n, "settings:RAW", "name")).toThrow(
      "Invalid translation for name",
    );
  });
});

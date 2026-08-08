import { beforeAll, describe, expect, it } from "vitest";

import {
  applyPlatformLanguageCatalog,
  getPlatformLanguageCatalog,
  i18n,
  initializePlatformI18n,
} from "@/lib/i18n";

beforeAll(async () => {
  await initializePlatformI18n("en-US");
});

describe("Platform i18n runtime", () => {
  it("disables cross-language fallback and exposes missing keys explicitly", () => {
    expect(i18n.options.fallbackLng).toBe(false);
    expect(i18n.t("common:TRANSLATION_DOES_NOT_EXIST")).toBe(
      "[missing Platform translation: TRANSLATION_DOES_NOT_EXIST]",
    );
  });

  it("applies the published catalog to the active runtime and persists it", () => {
    const original = getPlatformLanguageCatalog();
    applyPlatformLanguageCatalog(
      original.map((language) => ({
        ...language,
        enabled: language.locale === "zh-CN",
        is_default: language.locale === "zh-CN",
      })),
    );
    expect(
      getPlatformLanguageCatalog().find((language) => language.locale === "en-US")?.enabled,
    ).toBe(false);
    expect(i18n.language).toBe("zh-CN");
    expect(window.localStorage.getItem("arclayer:platform:language-catalog")).toContain("zh-CN");
    applyPlatformLanguageCatalog(original);
  });
});

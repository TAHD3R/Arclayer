import { beforeAll, describe, expect, it } from "vitest";

import { i18n, initializePlatformI18n } from "@/lib/i18n";

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
});

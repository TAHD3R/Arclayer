import { beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_LOCALE, initI18n, i18n } from "@/lib/i18n";

beforeAll(async () => {
  await initI18n(DEFAULT_LOCALE);
});

describe("assets i18n", () => {
  it("uses a localized zh-CN label for the alt name field", async () => {
    expect(i18n.t("assets:ASSET_EDIT_ALT_NAME")).toBe("替代名称");

    await i18n.changeLanguage("en-US");
    expect(i18n.t("assets:ASSET_EDIT_ALT_NAME")).toBe("Alt name");
    await i18n.changeLanguage(DEFAULT_LOCALE);
  });
});

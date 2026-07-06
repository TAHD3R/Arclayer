import { beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_LOCALE, initI18n, i18n } from "@/lib/i18n";

beforeAll(async () => {
  await initI18n(DEFAULT_LOCALE);
});

describe("assets i18n", () => {
  it("uses a localized zh-CN label for the alt name field", async () => {
    expect(i18n.t("assets:ASSET_EDIT_ALT_NAME")).toBe("替代名称");
    expect(i18n.t("assets:ASSET_EDIT_ALT_NAME_HELP")).toBe(
      "给资源补充一个更易读的名称，方便后续在页面搭建和内容编排中快速识别。",
    );
    expect(i18n.t("assets:ASSET_EDIT_ALT_NAME_TOOLTIP")).toBe(
      "原文件名通常来自上传文件。替代名称会在资源选择、替换和插入时作为辅助识别名称展示给编辑者。",
    );
    expect(i18n.t("assets:ASSET_PURPOSE_ARTICLE_COVER")).toBe("内容封面");

    await i18n.changeLanguage("en-US");
    expect(i18n.t("assets:ASSET_EDIT_ALT_NAME")).toBe("Alt name");
    expect(i18n.t("assets:ASSET_EDIT_ALT_NAME_HELP")).toBe(
      "Add a clearer display name so this asset is easier to identify in future page building and content workflows.",
    );
    expect(i18n.t("assets:ASSET_EDIT_ALT_NAME_TOOLTIP")).toBe(
      "Original filenames usually come from the uploaded file. Alt name appears as a clearer reference when editors choose, replace, and insert this asset.",
    );
    expect(i18n.t("assets:ASSET_PURPOSE_ARTICLE_COVER")).toBe("Content cover");
    await i18n.changeLanguage(DEFAULT_LOCALE);
  });
});

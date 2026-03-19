import { describe, expect, it, vi } from "vitest";

import {
  buildLocaleDisplaySummary,
  buildSupportedLocaleOptions,
  getLocaleMetadata,
} from "@/lib/i18n/locale-metadata";

describe("locale-metadata", () => {
  const t = vi.fn((key: string) => key);

  it("returns semantic metadata for known app locales", () => {
    expect(getLocaleMetadata("zh-CN", t)).toMatchObject({
      code: "zh-CN",
      label: "account:ACCOUNT_LANGUAGE_ZH",
      flagCountryCode: "cn",
    });
    expect(getLocaleMetadata("en-US", t)).toMatchObject({
      code: "en-US",
      label: "account:ACCOUNT_LANGUAGE_EN",
      flagCountryCode: "us",
    });
  });

  it("formats a locale summary with a two-tag cap", () => {
    expect(buildLocaleDisplaySummary("zh-CN,en-US,fr-FR", t)).toMatchObject({
      visible: ["zh-CN", "en-US"],
      remainingCount: 1,
    });
  });

  it("builds supported locale options from shared metadata", () => {
    expect(buildSupportedLocaleOptions(["zh-CN", "en-US"], t)).toEqual([
      { value: "zh-CN", label: "account:ACCOUNT_LANGUAGE_ZH" },
      { value: "en-US", label: "account:ACCOUNT_LANGUAGE_EN" },
    ]);
  });
});

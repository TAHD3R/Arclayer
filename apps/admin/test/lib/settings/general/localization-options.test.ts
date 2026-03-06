import { describe, expect, it } from "vitest";

import { DEFAULT_DATE_FORMAT, DEFAULT_TIMEZONE, FULL_DATE_TIME_FORMAT } from "@/constants/datetime";
import { DEFAULT_LOCALE } from "@/lib/i18n";
import {
  buildDateFormatOptions,
  buildLocaleOptions,
  buildTimezoneOptions,
  resolveDateFormatLabel,
} from "@/lib/settings/general/localization-options";

describe("localization options helpers", () => {
  it("builds locale options with i18n labels", () => {
    const t = (key: string): string => {
      if (key === "account:ACCOUNT_LANGUAGE_ZH") return "简体中文";
      if (key === "account:ACCOUNT_LANGUAGE_EN") return "English";
      return key;
    };

    const options = buildLocaleOptions(t);

    expect(options).toEqual([
      { value: "zh-CN", label: "简体中文" },
      { value: "en-US", label: "English" },
    ]);
    expect(DEFAULT_LOCALE).toBe("zh-CN");
  });

  it("keeps current timezone selectable and deduplicates list", () => {
    const options = buildTimezoneOptions("Asia/Shanghai");
    expect(options[0]).toEqual({ value: "Asia/Shanghai", label: "Asia/Shanghai" });

    const custom = buildTimezoneOptions("Asia/Seoul");
    expect(custom[0]).toEqual({ value: "Asia/Seoul", label: "Asia/Seoul" });
    expect(custom.some((item) => item.value === DEFAULT_TIMEZONE)).toBe(true);
  });

  it("builds date format options and resolves labels", () => {
    const dateFormatOptions = buildDateFormatOptions();

    expect(dateFormatOptions.length).toBeGreaterThan(0);
    expect(dateFormatOptions.some((item) => item.value === DEFAULT_DATE_FORMAT)).toBe(true);
    expect(dateFormatOptions.some((item) => item.value === FULL_DATE_TIME_FORMAT)).toBe(true);
    expect(resolveDateFormatLabel("MM/DD/YYYY")).toContain("MM/DD/YYYY");
    expect(resolveDateFormatLabel(FULL_DATE_TIME_FORMAT)).not.toBe(FULL_DATE_TIME_FORMAT);
    expect(resolveDateFormatLabel("custom-format")).toBe("custom-format");
  });
});

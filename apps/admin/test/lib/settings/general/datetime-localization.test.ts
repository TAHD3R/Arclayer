import { describe, expect, it } from "vitest";

import {
  resolveLocalizationDateFormatSummary,
  resolveLocalizationTimeZoneSummary,
} from "@/lib/settings/general/datetime-localization";

describe("datetime localization helpers", () => {
  it("shows relative summary when relative datetime is enabled", () => {
    expect(
      resolveLocalizationDateFormatSummary({
        dateFormat: "YYYY-MM-DD",
        useRelativeDateTime: true,
      }),
    ).toBe("Relative time");
  });

  it("shows browser timezone summary when automatic timezone is enabled", () => {
    expect(
      resolveLocalizationTimeZoneSummary({
        timeZone: "Asia/Shanghai",
        browserTimeZone: "America/Denver",
        useBrowserTimeZone: true,
      }),
    ).toBe("Auto (America/Denver)");
  });
});

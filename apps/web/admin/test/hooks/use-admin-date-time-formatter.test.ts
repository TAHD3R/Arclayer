import { describe, expect, it } from "vitest";

import { resolveAdminLocalizationSnapshot } from "@/hooks/use-admin-date-time-formatter";

describe("resolveAdminLocalizationSnapshot", () => {
  it("prefers workspace localization when it is available", () => {
    const resolved = resolveAdminLocalizationSnapshot({
      workspaceLocalization: {
        locale: "zh-CN",
        timeZone: "Asia/Shanghai",
        dateFormat: "YYYY/MM/DD",
      },
      organizationLocalization: {
        locale: "en-US",
        timeZone: "America/New_York",
        dateFormat: "MM/DD/YYYY",
      },
      preferencesLocale: "en-US",
      browserTimeZone: "America/Los_Angeles",
    });

    expect(resolved).toEqual({
      locale: "zh-CN",
      timeZone: "Asia/Shanghai",
      dateFormat: "YYYY/MM/DD",
    });
  });

  it("falls back to organization localization when workspace is missing", () => {
    const resolved = resolveAdminLocalizationSnapshot({
      workspaceLocalization: {},
      organizationLocalization: {
        locale: "en-US",
        timeZone: "Europe/Berlin",
        dateFormat: "DD/MM/YYYY",
      },
      preferencesLocale: "zh-CN",
      browserTimeZone: "Asia/Tokyo",
    });

    expect(resolved).toEqual({
      locale: "en-US",
      timeZone: "Europe/Berlin",
      dateFormat: "DD/MM/YYYY",
    });
  });

  it("supports per-field fallback from workspace to organization", () => {
    const resolved = resolveAdminLocalizationSnapshot({
      workspaceLocalization: {
        locale: "zh-CN",
      },
      organizationLocalization: {
        locale: "en-US",
        timeZone: "Europe/London",
        dateFormat: "YYYY-MM-DD",
      },
      preferencesLocale: "en-US",
      browserTimeZone: "America/Chicago",
    });

    expect(resolved).toEqual({
      locale: "zh-CN",
      timeZone: "Europe/London",
      dateFormat: "YYYY-MM-DD",
    });
  });

  it("falls back to user preference and browser defaults when org/workspace are absent", () => {
    const resolved = resolveAdminLocalizationSnapshot({
      workspaceLocalization: {},
      organizationLocalization: {},
      preferencesLocale: "en-US",
      browserTimeZone: "America/Denver",
    });

    expect(resolved).toEqual({
      locale: "en-US",
      timeZone: "America/Denver",
      dateFormat: undefined,
    });
  });
});

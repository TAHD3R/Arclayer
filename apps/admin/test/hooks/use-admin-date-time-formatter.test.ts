import { afterEach, describe, expect, it, vi } from "vitest";

import {
  formatAdminDateTimeValue,
  resolveAdminDateTimeWorkspaceId,
  resolveAdminLocalizationSnapshot,
} from "@/hooks/use-admin-date-time-formatter";

afterEach(() => {
  vi.useRealTimers();
});

describe("formatAdminDateTimeValue", () => {
  it("uses relative time for datetime fields when enabled", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-06T00:00:00Z"));

    const formatted = formatAdminDateTimeValue({
      date: new Date("2026-03-04T00:00:00Z"),
      localization: {
        locale: "en-US",
        timeZone: "UTC",
        dateFormat: "YYYY-MM-DD",
        useBrowserTimeZone: true,
        useRelativeDateTime: true,
      },
    });

    expect(formatted).toBe("2 days ago");
  });

  it("keeps absolute formatting for date-only fields", () => {
    const formatted = formatAdminDateTimeValue({
      date: new Date("2026-03-04T00:00:00Z"),
      localization: {
        locale: "en-US",
        timeZone: "UTC",
        dateFormat: "YYYY-MM-DD",
        useBrowserTimeZone: true,
        useRelativeDateTime: true,
      },
      options: { includeTime: false },
    });

    expect(formatted).toBe("2026-03-04");
  });
});

describe("resolveAdminLocalizationSnapshot", () => {
  it("honors an explicit null workspace scope override", () => {
    expect(resolveAdminDateTimeWorkspaceId({ workspaceId: null }, "ws-from-store")).toBeNull();
  });

  it("falls back to the current workspace when no override is provided", () => {
    expect(resolveAdminDateTimeWorkspaceId(undefined, "ws-from-store")).toBe("ws-from-store");
  });

  it("uses current UI locale while keeping workspace date settings", () => {
    const resolved = resolveAdminLocalizationSnapshot({
      workspaceLocalization: {
        locale: "zh-CN",
        timeZone: "Asia/Shanghai",
        dateFormat: "YYYY/MM/DD",
        useBrowserTimeZone: false,
        useRelativeDateTime: true,
      },
      preferencesLocale: "en-US",
      preferencesTimeZone: null,
      browserTimeZone: "America/Los_Angeles",
    });

    expect(resolved).toEqual({
      locale: "en-US",
      timeZone: "Asia/Shanghai",
      dateFormat: "YYYY/MM/DD",
      useBrowserTimeZone: false,
      useRelativeDateTime: true,
    });
  });

  it("prefers current UI locale over workspace locale for date text", () => {
    const resolved = resolveAdminLocalizationSnapshot({
      workspaceLocalization: {
        locale: "zh-CN",
        timeZone: "Asia/Shanghai",
        dateFormat: "YYYY/MM/DD",
        useBrowserTimeZone: false,
        useRelativeDateTime: true,
      },
      preferencesLocale: "en-US",
      preferencesTimeZone: null,
      browserTimeZone: "America/Los_Angeles",
    });

    expect(resolved).toEqual({
      locale: "en-US",
      timeZone: "Asia/Shanghai",
      dateFormat: "YYYY/MM/DD",
      useBrowserTimeZone: false,
      useRelativeDateTime: true,
    });
  });

  it("uses browser defaults when workspace date settings are absent", () => {
    const resolved = resolveAdminLocalizationSnapshot({
      workspaceLocalization: {},
      preferencesLocale: "zh-CN",
      preferencesTimeZone: null,
      browserTimeZone: "Asia/Tokyo",
    });

    expect(resolved).toEqual({
      locale: "zh-CN",
      timeZone: "Asia/Tokyo",
      dateFormat: undefined,
      useBrowserTimeZone: true,
      useRelativeDateTime: true,
    });
  });

  it("supports per-field defaults for non-locale date settings", () => {
    const resolved = resolveAdminLocalizationSnapshot({
      workspaceLocalization: {
        locale: "zh-CN",
      },
      preferencesLocale: "en-US",
      preferencesTimeZone: null,
      browserTimeZone: "America/Chicago",
    });

    expect(resolved).toEqual({
      locale: "en-US",
      timeZone: "America/Chicago",
      dateFormat: undefined,
      useBrowserTimeZone: true,
      useRelativeDateTime: true,
    });
  });

  it("falls back to user preference and browser defaults when org/workspace are absent", () => {
    const resolved = resolveAdminLocalizationSnapshot({
      workspaceLocalization: {},
      preferencesLocale: "en-US",
      preferencesTimeZone: null,
      browserTimeZone: "America/Denver",
    });

    expect(resolved).toEqual({
      locale: "en-US",
      timeZone: "America/Denver",
      dateFormat: undefined,
      useBrowserTimeZone: true,
      useRelativeDateTime: true,
    });
  });

  it("prefers explicit user timezone over browser-timezone defaults", () => {
    const resolved = resolveAdminLocalizationSnapshot({
      workspaceLocalization: {
        locale: "zh-CN",
        timeZone: "Asia/Shanghai",
        dateFormat: "YYYY-MM-DD",
        useBrowserTimeZone: true,
      },
      preferencesLocale: "en-US",
      preferencesTimeZone: "America/New_York",
      browserTimeZone: "America/Denver",
    });

    expect(resolved.timeZone).toBe("America/New_York");
    expect(resolved.useBrowserTimeZone).toBe(true);
  });
});

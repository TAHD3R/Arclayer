import { describe, expect, it } from "vitest";

import { formatDateTimeWithPattern } from "@/lib/time/date-time";

describe("formatDateTimeWithPattern", () => {
  it("formats YYYY-MM-DD with time in UTC", () => {
    const out = formatDateTimeWithPattern({
      date: new Date("2026-02-03T04:05:00Z"),
      locale: "en-US",
      timeZone: "UTC",
      dateFormat: "YYYY-MM-DD",
      includeTime: true,
    });
    expect(out).toBe("2026-02-03 04:05");
  });

  it("formats MM/DD/YYYY with time in UTC", () => {
    const out = formatDateTimeWithPattern({
      date: new Date("2026-02-03T04:05:00Z"),
      locale: "en-US",
      timeZone: "UTC",
      dateFormat: "MM/DD/YYYY",
      includeTime: true,
    });
    expect(out).toBe("02/03/2026 04:05");
  });

  it("formats date-only when includeTime=false", () => {
    const out = formatDateTimeWithPattern({
      date: new Date("2026-02-03T04:05:00Z"),
      locale: "en-US",
      timeZone: "UTC",
      dateFormat: "YYYY/MM/DD",
      includeTime: false,
    });
    expect(out).toBe("2026/02/03");
  });

  it("respects timeZone conversion (Asia/Shanghai)", () => {
    const out = formatDateTimeWithPattern({
      date: new Date("2026-02-03T04:05:00Z"),
      locale: "en-US",
      timeZone: "Asia/Shanghai",
      dateFormat: "YYYY-MM-DD",
      includeTime: true,
    });
    // UTC+8
    expect(out).toBe("2026-02-03 12:05");
  });

  it("formats FULL_DATE_TIME using locale-aware absolute date time", () => {
    const date = new Date("2026-02-03T04:05:00Z");
    const out = formatDateTimeWithPattern({
      date,
      locale: "en-US",
      timeZone: "UTC",
      dateFormat: "FULL_DATE_TIME",
      includeTime: true,
    });

    const expected = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);

    expect(out).toBe(expected);
  });
});

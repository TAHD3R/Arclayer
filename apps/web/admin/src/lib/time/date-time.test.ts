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
});

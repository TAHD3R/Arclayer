import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: Record<string, unknown>) => config,
  lazyRouteComponent: () => () => null,
}));
vi.mock("@/pages/system/overview/page", () => ({
  SystemPlatformOverviewPage: () => null,
}));

import { Route } from "@/routes/system/overview/index";

describe("system overview route", () => {
  it("keeps supported ranges URL-addressable and rejects unsupported values", () => {
    const validateSearch = (
      Route as unknown as {
        validateSearch: (search: Record<string, unknown>) => { days?: number };
      }
    ).validateSearch;

    expect(validateSearch({ days: "14" })).toEqual({ days: 14 });
    expect(validateSearch({ days: 30 })).toEqual({ days: 30 });
    expect(validateSearch({ days: 365 })).toEqual({});
    expect(validateSearch({ days: "invalid" })).toEqual({});
  });
});

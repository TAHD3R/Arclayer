import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: Record<string, unknown>) => config,
  lazyRouteComponent: () => () => null,
}));
vi.mock("@/pages/system/observability/requests/page", () => ({
  SystemObservabilityRequestsPage: () => null,
}));
vi.mock("@/pages/system/observability/ai-usage/page", () => ({
  SystemObservabilityAIUsagePage: () => null,
}));
vi.mock("@/pages/system/observability/activity/page", () => ({
  SystemObservabilityActivityPage: () => null,
}));
vi.mock("@/pages/system/audit-log/page", () => ({
  SystemAuditLogPage: () => null,
}));

import { Route as ActivityRoute } from "@/routes/system/observability/activity/index";
import { Route as AIUsageRoute } from "@/routes/system/observability/ai-usage/index";
import { Route as RequestsRoute } from "@/routes/system/observability/requests/index";
import { Route as AuditLogRoute } from "@/routes/system/audit-log/index";

type SearchRoute = {
  validateSearch: (search: Record<string, unknown>) => { days?: number; view?: string };
};

const periodRoutes = [RequestsRoute, AIUsageRoute, ActivityRoute, AuditLogRoute] as SearchRoute[];

describe("system observability period routes", () => {
  it.each(periodRoutes)("accepts every supported period", (route) => {
    expect(route.validateSearch({ days: "7" })).toMatchObject({ days: 7 });
    expect(route.validateSearch({ days: 14 })).toMatchObject({ days: 14 });
    expect(route.validateSearch({ days: "30" })).toMatchObject({ days: 30 });
    expect(route.validateSearch({ days: 90 })).toMatchObject({ days: 90 });
  });

  it.each(periodRoutes)("rejects unsupported and malformed periods", (route) => {
    expect(route.validateSearch({ days: 1 })).not.toHaveProperty("days");
    expect(route.validateSearch({ days: 365 })).not.toHaveProperty("days");
    expect(route.validateSearch({ days: "invalid" })).not.toHaveProperty("days");
  });

  it("validates the Audit Log view independently from its period", () => {
    const route = AuditLogRoute as SearchRoute;
    expect(route.validateSearch({ view: "events", days: "14" })).toEqual({
      view: "events",
      days: 14,
    });
    expect(route.validateSearch({ view: "unknown", days: "14" })).toEqual({ days: 14 });
  });
});

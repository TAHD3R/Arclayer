import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: Record<string, unknown>) => config,
  lazyRouteComponent: () => null,
}));
import { Route } from "@/routes/settings/workspace/members/index";

describe("workspace members settings route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the current workspace context without route-time guard logic", () => {
    const beforeLoad = (Route as unknown as { beforeLoad?: unknown }).beforeLoad;
    expect(beforeLoad).toBeUndefined();
  });
});

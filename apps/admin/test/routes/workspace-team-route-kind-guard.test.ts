import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: Record<string, unknown>) => config,
}));
import { Route } from "@/routes/w/$workspaceId/team/index";

describe("workspace team route kind guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("drops the obsolete workspace-kind guard from the team route", () => {
    const beforeLoad = (Route as unknown as { beforeLoad?: unknown }).beforeLoad;
    expect(beforeLoad).toBeUndefined();
  });
});

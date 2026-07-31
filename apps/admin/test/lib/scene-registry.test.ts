import { describe, expect, it, vi } from "vitest";

vi.mock("@/layouts/admin-layout", () => ({ AdminLayout: () => null }));
vi.mock("@/layouts/auth-layout", () => ({ AuthLayout: () => null }));
vi.mock("@/layouts/creation-layout", () => ({ CreationLayout: () => null }));
vi.mock("@/layouts/global-layout", () => ({ GlobalLayout: () => null }));
vi.mock("@/layouts/invite-layout", () => ({ InviteLayout: () => null }));

import { resolveSceneKey } from "@/lib/routing/scene-registry";

describe("resolveSceneKey", () => {
  it("uses the notifications source path to preserve the source scene", () => {
    expect(resolveSceneKey("/notifications", "?sourceKind=global&sourcePath=%2F")).toBe("global");
    expect(
      resolveSceneKey(
        "/notifications",
        "?sourceKind=workspace&sourcePath=%2Fprojects%2Fproject-alpha%2Fassets",
      ),
    ).toBe("admin");
  });

  it("keeps invalid or absent notification sources in the default admin scene", () => {
    expect(resolveSceneKey("/notifications")).toBe("admin");
    expect(
      resolveSceneKey("/notifications", "?sourceKind=global&sourcePath=https%3A%2F%2Fevil.example"),
    ).toBe("admin");
  });
});

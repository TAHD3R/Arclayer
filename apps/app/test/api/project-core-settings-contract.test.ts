import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/http", () => ({
  api: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

import { api } from "@/lib/http";
import { getProjectCoreSettings, patchProjectCoreSettings } from "@/api/settings";
import type { ProjectSettingsDetail } from "@arclayer/openapi";

describe("api/project core settings contracts", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.patch).mockReset();
  });

  it("accepts the project settings detail shape", () => {
    const detail: ProjectSettingsDetail = {
      namespace: "core",
      value: { site: { name: "Arclayer" } },
      secrets: {},
      updatedAt: null,
    };

    expect(detail.namespace).toBe("core");
    expect(detail.value?.site).toEqual({ name: "Arclayer" });
  });

  it("calls project settings endpoints with project-native contracts", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      namespace: "core",
      value: { site: { name: "Arclayer" } },
      secrets: {},
      updatedAt: "2026-04-22T00:00:00Z",
    });
    vi.mocked(api.patch).mockResolvedValueOnce({
      namespace: "core",
      value: { site: { name: "Renamed" } },
      secrets: {},
      updatedAt: "2026-04-22T00:00:01Z",
    });

    const detail = await getProjectCoreSettings("project-1");
    const patched = await patchProjectCoreSettings("project-1", {
      site: { name: "Renamed" },
    });

    expect(detail.value?.site).toEqual({ name: "Arclayer" });
    expect(patched.value?.site).toEqual({ name: "Renamed" });
    expect(api.get).toHaveBeenCalledWith("/projects/project-1/settings/core");
    expect(api.patch).toHaveBeenCalledWith("/projects/project-1/settings/core", {
      patch: { site: { name: "Renamed" } },
    });
  });
});

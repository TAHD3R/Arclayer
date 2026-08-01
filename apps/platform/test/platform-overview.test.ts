import { beforeEach, describe, expect, it, vi } from "vitest";

import { getPlatformCapabilityCatalog } from "@/capabilities/catalog-api";
import { listOperationalSignals } from "@/operations/operations-api";
import { loadPlatformOverview } from "@/overview/overview-api";

vi.mock("@/capabilities/catalog-api", () => ({
  getPlatformCapabilityCatalog: vi.fn(),
}));
vi.mock("@/operations/operations-api", () => ({
  listOperationalSignals: vi.fn(),
}));

const page = {
  items: [],
  next: null,
  page: 1,
  pages: 1,
  prev: null,
  size: 5,
  total: 0,
};

beforeEach(() => {
  vi.mocked(getPlatformCapabilityCatalog).mockReset();
  vi.mocked(listOperationalSignals).mockReset();
});

describe("Platform Overview aggregation", () => {
  it("keeps available real sources and marks a failed source as partial", async () => {
    vi.mocked(getPlatformCapabilityCatalog).mockResolvedValue({ items: [] });
    vi.mocked(listOperationalSignals)
      .mockRejectedValueOnce(new Error("conditions unavailable"))
      .mockResolvedValueOnce(page);

    const result = await loadPlatformOverview();

    expect(result.catalog).toEqual({ status: "ready", data: { items: [] } });
    expect(result.attention.status).toBe("error");
    expect(result.recovered).toEqual({ status: "ready", data: page });
  });

  it("fails visibly when no overview source can be read", async () => {
    vi.mocked(getPlatformCapabilityCatalog).mockRejectedValue(new Error("catalog unavailable"));
    vi.mocked(listOperationalSignals).mockRejectedValue(new Error("conditions unavailable"));

    await expect(loadPlatformOverview()).rejects.toThrow("PLATFORM_OVERVIEW_UNAVAILABLE");
  });

  it("requests unresolved and recovered conditions separately", async () => {
    vi.mocked(getPlatformCapabilityCatalog).mockResolvedValue({ items: [] });
    vi.mocked(listOperationalSignals).mockResolvedValue(page);

    await loadPlatformOverview();

    expect(listOperationalSignals).toHaveBeenNthCalledWith(
      1,
      { sourceLifecycle: "unresolved", includeReminded: false, page: 1, size: 5 },
      undefined,
    );
    expect(listOperationalSignals).toHaveBeenNthCalledWith(
      2,
      { sourceLifecycle: "resolved", includeReminded: true, page: 1, size: 5 },
      undefined,
    );
  });
});

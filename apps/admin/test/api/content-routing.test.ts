import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/http", () => ({
  api: {
    get: vi.fn(),
    put: vi.fn(),
  },
}));

import { api } from "@/lib/http";
import {
  listWorkspaceContentHierarchyNodes,
  listWorkspaceContentRouteBindings,
  upsertWorkspaceContentHierarchyNode,
  upsertWorkspaceContentRouteBinding,
} from "@/api/content-routing";

describe("api/content-routing wrappers", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.put).mockReset();
  });

  it("lists canonical routing bindings and hierarchy nodes", async () => {
    vi.mocked(api.get).mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await listWorkspaceContentRouteBindings("ws-1");
    await listWorkspaceContentHierarchyNodes("ws-1");

    expect(api.get).toHaveBeenNthCalledWith(1, "/workspaces/ws-1/content/routing/bindings");
    expect(api.get).toHaveBeenNthCalledWith(2, "/workspaces/ws-1/content/routing/hierarchy");
  });

  it("upserts canonical routing and hierarchy records", async () => {
    vi.mocked(api.put).mockResolvedValueOnce({}).mockResolvedValueOnce({});

    await upsertWorkspaceContentRouteBinding("ws-1", "item-1", {
      path: "/blog/hello-world",
      isActive: false,
      locale: "en-US",
    });
    await upsertWorkspaceContentHierarchyNode("ws-1", "item-1", {
      parentItemId: "parent-1",
      sortOrder: 4,
    });

    expect(api.put).toHaveBeenNthCalledWith(1, "/workspaces/ws-1/content/routing/bindings/item-1", {
      locale: "en-US",
      path: "/blog/hello-world",
      isActive: false,
    });
    expect(api.put).toHaveBeenNthCalledWith(
      2,
      "/workspaces/ws-1/content/routing/hierarchy/item-1",
      {
        parentItemId: "parent-1",
        sortOrder: 4,
      },
    );
  });
});

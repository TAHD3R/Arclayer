import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/http", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import { api } from "@/lib/http";
import {
  archiveWorkspaceContentItemVersion,
  createWorkspaceContentItem,
  listWorkspaceContentItems,
  publishWorkspaceContentItemVersion,
} from "@/api/content-items";

describe("api/content-items wrappers", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
  });

  it("lists canonical items from /content/items", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      size: 20,
      pages: 0,
      next: null,
      prev: null,
    });

    await listWorkspaceContentItems("ws-1", { page: 2, size: 10, modelKey: "article" });

    expect(api.get).toHaveBeenCalledWith(
      "/workspaces/ws-1/content/items?page=2&size=10&modelKey=article",
    );
  });

  it("creates canonical items without legacy entry payloads", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      id: "item-1",
      modelKey: "article",
      slug: "hello-world",
    });

    await createWorkspaceContentItem("ws-1", {
      modelKey: "article",
      slug: "hello-world",
      title: "Hello world",
      locale: "en-US",
      status: "draft",
      visibility: "public",
    });

    expect(api.post).toHaveBeenCalledWith("/workspaces/ws-1/content/items", {
      modelKey: "article",
      slug: "hello-world",
      title: "Hello world",
      locale: "en-US",
      status: "draft",
      visibility: "public",
    });
  });

  it("publishes and archives item versions through canonical version transitions", async () => {
    vi.mocked(api.post)
      .mockResolvedValueOnce({ versionNumber: 3 })
      .mockResolvedValueOnce({ versionNumber: 2 });

    await publishWorkspaceContentItemVersion("ws-1", "item-1", 3);
    await archiveWorkspaceContentItemVersion("ws-1", "item-1", 2);

    expect(api.post).toHaveBeenNthCalledWith(
      1,
      "/workspaces/ws-1/content/items/item-1/versions/3/publish",
      {},
    );
    expect(api.post).toHaveBeenNthCalledWith(
      2,
      "/workspaces/ws-1/content/items/item-1/versions/2/archive",
      {},
    );
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/http", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import { api } from "@/lib/http";
import { createWorkspaceContentModel, listWorkspaceContentModels } from "@/api/content-models";

describe("api/content-models wrappers", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
  });

  it("lists canonical content models from /content/models", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      size: 20,
      pages: 0,
      next: null,
      prev: null,
    });

    await listWorkspaceContentModels("ws-1", { page: 2, size: 10 });

    expect(api.get).toHaveBeenCalledWith("/workspaces/ws-1/content/models?page=2&size=10");
  });

  it("creates blank-first canonical models without legacy kind truth", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      id: "model-1",
      key: "article",
      name: "Article",
    });

    await createWorkspaceContentModel("ws-1", {
      key: "article",
      name: "Article",
      category: "content_library",
      description: "Editorial article model",
      capabilities: ["publishable", "versioned"],
      defaultEditor: "rich_text",
      fieldSchema: {
        version: 1,
        fields: [{ key: "title", label: "Title", type: "text" }],
      },
      relationSchema: {
        author: { target: "author", kind: "many_to_one" },
      },
      routingSchema: {
        mode: "single",
        slugField: "slug",
      },
      presentationSchema: {
        layouts: ["article"],
      },
      workflowPolicy: {
        states: ["draft", "review", "published"],
        initialState: "draft",
      },
      viewSchema: {
        views: [{ key: "table", label: "Table", type: "table" }],
      },
    });

    expect(api.post).toHaveBeenCalledWith("/workspaces/ws-1/content/models", {
      key: "article",
      name: "Article",
      description: "Editorial article model",
      category: "content_library",
      defaultEditor: "rich_text",
      capabilities: ["publishable", "versioned"],
      fields: [{ key: "title", label: "Title", scalar: "text" }],
      relations: [{ key: "author", targetModelKey: "author", relation: "many_to_one" }],
      routing: { mode: "single", slugField: "slug" },
      workflow: {
        states: ["draft", "review", "published"],
        initialState: "draft",
      },
      views: [{ key: "table", label: "Table", type: "table" }],
      presentation: {
        layouts: ["article"],
      },
      seo: null,
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  apiGet,
  listWorkspaceContentModels,
  listWorkspaceContentItems,
  createWorkspaceContentItem,
  publishWorkspaceContentItemVersion,
  archiveWorkspaceContentItemVersion,
  listWorkspaceContentRouteBindings,
  listWorkspaceContentHierarchyNodes,
  upsertWorkspaceContentRouteBinding,
  upsertWorkspaceContentHierarchyNode,
  getWorkspacePublishImpact,
} = vi.hoisted(() => ({
  apiGet: vi.fn(),
  listWorkspaceContentModels: vi.fn(),
  listWorkspaceContentItems: vi.fn(),
  createWorkspaceContentItem: vi.fn(),
  publishWorkspaceContentItemVersion: vi.fn(),
  archiveWorkspaceContentItemVersion: vi.fn(),
  listWorkspaceContentRouteBindings: vi.fn(),
  listWorkspaceContentHierarchyNodes: vi.fn(),
  upsertWorkspaceContentRouteBinding: vi.fn(),
  upsertWorkspaceContentHierarchyNode: vi.fn(),
  getWorkspacePublishImpact: vi.fn(),
}));

vi.mock("@/lib/http", () => ({
  api: {
    get: apiGet,
  },
}));

vi.mock("@/api/content-models", () => ({
  listWorkspaceContentModels,
}));

vi.mock("@/api/content-items", () => ({
  listWorkspaceContentItems,
  createWorkspaceContentItem,
  publishWorkspaceContentItemVersion,
  archiveWorkspaceContentItemVersion,
}));

vi.mock("@/api/content-routing", () => ({
  listWorkspaceContentRouteBindings,
  listWorkspaceContentHierarchyNodes,
  upsertWorkspaceContentRouteBinding,
  upsertWorkspaceContentHierarchyNode,
}));

vi.mock("@/api/content-publish", () => ({
  getWorkspacePublishImpact,
}));

import {
  createSiteBuilderStructureNode,
  createSiteBuilderRouteTemplate,
  getSiteBuilderPublishImpact,
  listSiteBuilderGlobalSections,
  listSiteBuilderStructureTree,
  listSiteBuilderRouteTemplates,
  publishSiteBuilderStructureNode,
  toggleSiteBuilderRouteTemplateActive,
  unpublishSiteBuilderStructureNode,
} from "@/api/content/site-builder";

const MODELS_PAGE = {
  items: [
    {
      key: "page",
      category: "site_builder",
      name: "Page",
      capabilities: ["routable", "visual_editable"],
    },
    {
      key: "article",
      category: "content_library",
      name: "Article",
      capabilities: ["routable", "rich_text_editable"],
    },
  ],
};

const ITEMS_PAGE = {
  items: [
    {
      id: "page-home",
      modelKey: "page",
      slug: "home",
      title: "Homepage",
      draftVersion: 3,
      publishedVersion: 2,
    },
    {
      id: "article-hello",
      modelKey: "article",
      slug: "hello-world",
      title: "Hello world",
      draftVersion: 5,
      publishedVersion: 4,
    },
    {
      id: "page-pricing",
      modelKey: "page",
      slug: "pricing",
      title: "Pricing",
      draftVersion: 2,
      publishedVersion: null,
    },
  ],
};

describe("api/content/site-builder adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listWorkspaceContentModels.mockResolvedValue(MODELS_PAGE);
    listWorkspaceContentItems.mockResolvedValue(ITEMS_PAGE);
    listWorkspaceContentRouteBindings.mockResolvedValue([
      { id: "binding-home", itemId: "page-home", path: "/", isActive: true },
      { id: "binding-pricing", itemId: "page-pricing", path: "/pricing", isActive: true },
      { id: "binding-article", itemId: "article-hello", path: "/blog/hello-world", isActive: true },
    ]);
    listWorkspaceContentHierarchyNodes.mockResolvedValue([
      { id: "node-home", itemId: "page-home", parentItemId: null, sortOrder: 0 },
      { id: "node-pricing", itemId: "page-pricing", parentItemId: "page-home", sortOrder: 1 },
      { id: "node-article", itemId: "article-hello", parentItemId: null, sortOrder: 2 },
    ]);
    apiGet.mockResolvedValue({ items: [{ id: "global-1" }] });
  });

  it("builds the structure tree from canonical items, bindings, and hierarchy", async () => {
    const result = await listSiteBuilderStructureTree("ws-1");

    expect(result.items).toEqual([
      {
        id: "page-home",
        title: "Homepage",
        modelKey: "page",
        path: "/",
        parentId: null,
        sortOrder: 0,
        draftRevision: 3,
        publishedRevision: 2,
        children: [
          {
            id: "page-pricing",
            title: "Pricing",
            modelKey: "page",
            path: "/pricing",
            parentId: "page-home",
            sortOrder: 1,
            draftRevision: 2,
            publishedRevision: null,
            children: [],
          },
        ],
      },
      {
        id: "article-hello",
        title: "Hello world",
        modelKey: "article",
        path: "/blog/hello-world",
        parentId: null,
        sortOrder: 2,
        draftRevision: 5,
        publishedRevision: 4,
        children: [],
      },
    ]);
  });

  it("maps route templates from canonical route bindings", async () => {
    const result = await listSiteBuilderRouteTemplates("ws-1");

    expect(result.items).toEqual([
      {
        id: "binding-home",
        itemId: "page-home",
        itemTitle: "Homepage",
        pathPattern: "/",
        entryTypeCode: "page",
        isActive: true,
      },
      {
        id: "binding-pricing",
        itemId: "page-pricing",
        itemTitle: "Pricing",
        pathPattern: "/pricing",
        entryTypeCode: "page",
        isActive: true,
      },
      {
        id: "binding-article",
        itemId: "article-hello",
        itemTitle: "Hello world",
        pathPattern: "/blog/hello-world",
        entryTypeCode: "article",
        isActive: true,
      },
    ]);
  });

  it("creates canonical structure nodes and route templates without workspace-site page truth", async () => {
    createWorkspaceContentItem.mockResolvedValueOnce({
      id: "page-about",
      title: "About",
      modelKey: "page",
      draftVersion: 1,
      publishedVersion: null,
    });
    upsertWorkspaceContentRouteBinding.mockResolvedValueOnce({
      id: "binding-about",
      itemId: "page-about",
      path: "/about",
      isActive: true,
    });
    upsertWorkspaceContentHierarchyNode.mockResolvedValueOnce({
      id: "node-about",
      itemId: "page-about",
      parentItemId: null,
      sortOrder: 0,
    });

    const node = await createSiteBuilderStructureNode("ws-1", {
      title: "About",
      path: "/about",
      modelKey: "page",
    });

    expect(createWorkspaceContentItem).toHaveBeenCalledWith("ws-1", {
      modelKey: "page",
      title: "About",
      slug: "about",
    });
    expect(upsertWorkspaceContentRouteBinding).toHaveBeenCalledWith("ws-1", "page-about", {
      path: "/about",
      isActive: true,
    });
    expect(upsertWorkspaceContentHierarchyNode).toHaveBeenCalledWith("ws-1", "page-about", {});
    expect(node.path).toBe("/about");

    upsertWorkspaceContentRouteBinding.mockResolvedValueOnce({
      id: "binding-pricing",
      itemId: "page-pricing",
      path: "/pricing",
      isActive: false,
    });

    const route = await createSiteBuilderRouteTemplate("ws-1", {
      itemId: "page-pricing",
      pathPattern: "/pricing",
      isActive: false,
    });

    expect(route).toEqual({
      id: "binding-pricing",
      itemId: "page-pricing",
      itemTitle: null,
      pathPattern: "/pricing",
      entryTypeCode: "",
      isActive: false,
    });
  });

  it("passes publish lifecycle through canonical adapters and reads global sections from content structure", async () => {
    publishWorkspaceContentItemVersion.mockResolvedValueOnce({ versionNumber: 3 });
    archiveWorkspaceContentItemVersion.mockResolvedValueOnce({ versionNumber: 2 });
    upsertWorkspaceContentRouteBinding.mockResolvedValueOnce({
      id: "binding-home",
      itemId: "page-home",
      path: "/",
      isActive: false,
    });
    getWorkspacePublishImpact.mockResolvedValueOnce({
      missingRoutes: ["/blog/:slug"],
      unresolvedRelations: [],
      unpublishedDependencies: [],
    });

    await expect(
      publishSiteBuilderStructureNode("ws-1", "page-home", { revision: 3 }),
    ).resolves.toEqual({
      itemId: "page-home",
      revision: 3,
    });
    await expect(unpublishSiteBuilderStructureNode("ws-1", "page-home", 2)).resolves.toEqual({
      itemId: "page-home",
      revision: 2,
    });
    await expect(
      toggleSiteBuilderRouteTemplateActive("ws-1", {
        id: "binding-home",
        itemId: "page-home",
        pathPattern: "/",
        isActive: true,
      }),
    ).resolves.toEqual({
      id: "binding-home",
      itemId: "page-home",
      pathPattern: "/",
      isActive: false,
    });
    await expect(getSiteBuilderPublishImpact("ws-1")).resolves.toEqual({
      missingRoutes: ["/blog/:slug"],
      unresolvedRelations: [],
      unpublishedDependencies: [],
    });
    await expect(listSiteBuilderGlobalSections("ws-1")).resolves.toEqual({
      items: [{ id: "global-1" }],
    });
    expect(apiGet).toHaveBeenCalledWith("/workspaces/ws-1/content/structure/global-slots");
  });
});

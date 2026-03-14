import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { WorkspaceSiteBuilderPage } from "@/pages/workspaces/content/site-builder/page";
import { ApiError } from "@/lib/http";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

const {
  listSiteBuilderPagesTree,
  listSiteBuilderGlobalSections,
  listSiteBuilderRouteTemplates,
  getSiteBuilderPublishImpact,
  createSiteBuilderPage,
  createSiteBuilderRouteTemplate,
  toggleSiteBuilderRouteTemplateActive,
  publishSiteBuilderPage,
  repairSiteBuilderPagesRouteTree,
  unpublishSiteBuilderPage,
  openStudioPageEditor,
} = vi.hoisted(() => ({
  listSiteBuilderPagesTree: vi.fn(),
  listSiteBuilderGlobalSections: vi.fn(),
  listSiteBuilderRouteTemplates: vi.fn(),
  getSiteBuilderPublishImpact: vi.fn(),
  createSiteBuilderPage: vi.fn(),
  createSiteBuilderRouteTemplate: vi.fn(),
  toggleSiteBuilderRouteTemplateActive: vi.fn(),
  publishSiteBuilderPage: vi.fn(),
  repairSiteBuilderPagesRouteTree: vi.fn(),
  unpublishSiteBuilderPage: vi.fn(),
  openStudioPageEditor: vi.fn(),
}));

vi.mock("@/api/content/site-builder", () => ({
  siteBuilderQueryKeys: {
    pages: (workspaceId: string | null | undefined) => [
      "content",
      "site-builder",
      "pages",
      workspaceId,
    ],
    globals: (workspaceId: string | null | undefined) => [
      "content",
      "site-builder",
      "globals",
      workspaceId,
    ],
    routes: (workspaceId: string | null | undefined) => [
      "content",
      "site-builder",
      "routes",
      workspaceId,
    ],
    publishImpact: (workspaceId: string | null | undefined) => [
      "content",
      "site-builder",
      "publish-impact",
      workspaceId,
    ],
  },
  listSiteBuilderPagesTree,
  listSiteBuilderGlobalSections,
  listSiteBuilderRouteTemplates,
  getSiteBuilderPublishImpact,
  createSiteBuilderPage,
  createSiteBuilderRouteTemplate,
  toggleSiteBuilderRouteTemplateActive,
  publishSiteBuilderPage,
  repairSiteBuilderPagesRouteTree,
  unpublishSiteBuilderPage,
}));

vi.mock("@/lib/routing/studio-editor", () => ({
  openStudioPageEditor,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const tokens = {
        "nav:NAV_CONTENT_SITE_BUILDER": "Site Builder",
        "content_library:SITE_BUILDER_PAGE_DESC":
          "Organize the key structures that shape your site experience.",
        "content_library:SITE_BUILDER_EMPTY_DESC":
          "Create your first page to start assembling the site builder workspace.",
        "content_library:SITE_BUILDER_PAGES_TITLE": "Pages",
        "content_library:SITE_BUILDER_GLOBALS_TITLE": "Global sections",
        "content_library:SITE_BUILDER_METRIC_PUBLISHED": "Published pages",
        "content_library:SITE_BUILDER_METRIC_DRAFT": "Draft pages",
        "content_library:SITE_BUILDER_METRIC_ROUTES": "Route templates",
        "content_library:SITE_BUILDER_MANAGE_PAGES": "Manage pages",
        "content_library:SITE_BUILDER_STRUCTURE_MAP_TITLE": "Structure map",
        "content_library:SITE_BUILDER_STRUCTURE_MAP_DESC":
          "Track page hierarchy and publish state from one place.",
        "content_library:SITE_BUILDER_COMPOSITION_PANEL_TITLE": "Composition panel",
        "content_library:SITE_BUILDER_COMPOSITION_PANEL_DESC":
          "Review global sections that compose every page experience.",
        "content_library:SITE_BUILDER_ROUTE_BINDINGS_TITLE": "Route bindings",
        "content_library:SITE_BUILDER_ROUTE_BINDINGS_DESC":
          "Bind dynamic route patterns to routable content models.",
        "content_library:SITE_BUILDER_PUBLISH_IMPACT_TITLE": "Publish impact",
        "content_library:SITE_BUILDER_PUBLISH_IMPACT_DESC":
          "Review blockers before publishing structure changes.",
        "content_library:SITE_BUILDER_PUBLISH_IMPACT_VIEW_DETAILS": "View details",
        "content_library:SITE_BUILDER_PUBLISH_IMPACT_MISSING_ROUTES": "Missing routes",
        "content_library:SITE_BUILDER_PUBLISH_IMPACT_UNRESOLVED_RELATIONS": "Unresolved relations",
        "content_library:SITE_BUILDER_PUBLISH_IMPACT_UNPUBLISHED_DEPENDENCIES":
          "Unpublished dependencies",
        "content_library:SITE_BUILDER_PUBLISH_IMPACT_NONE": "No blockers in this category.",
        "content_library:SITE_BUILDER_PUBLISH_IMPACT_TOTAL": `Total blockers ${String(options?.count ?? 0)}`,
        "content_library:SITE_BUILDER_OPEN_EDITOR": "Open editor",
        "content_library:SITE_BUILDER_STATUS_DRAFT": "Draft",
        "content_library:SITE_BUILDER_STATUS_PUBLISHED": "Published",
        "content_library:SITE_BUILDER_ACTION_PUBLISH": "Publish",
        "content_library:SITE_BUILDER_ACTION_UNPUBLISH": "Unpublish",
        "content_library:SITE_BUILDER_TOAST_PUBLISH_SUCCESS": "Page published",
        "content_library:SITE_BUILDER_TOAST_UNPUBLISH_SUCCESS": "Page unpublished",
        "content_library:SITE_BUILDER_REVISION_DRAFT": "Draft",
        "content_library:SITE_BUILDER_REVISION_PUBLISHED": "Published",
        "content_library:SITE_BUILDER_GLOBAL_ENABLED": "Enabled",
        "content_library:SITE_BUILDER_GLOBAL_DISABLED": "Disabled",
        "content_library:SITE_BUILDER_GLOBALS_EMPTY": "No global sections yet",
        "content_library:SITE_BUILDER_ROUTES_EMPTY": "No route templates yet.",
        "content_library:SITE_BUILDER_MANAGE_ROUTES": "Manage routes",
        "content_library:SITE_BUILDER_ROUTE_ACTIVE": "Active",
        "content_library:SITE_BUILDER_ROUTE_INACTIVE": "Inactive",
        "content_library:SITE_BUILDER_ROUTE_ACTION_ENABLE": "Enable",
        "content_library:SITE_BUILDER_ROUTE_ACTION_DISABLE": "Disable",
        "content_library:SITE_BUILDER_ROUTE_TREE_REPAIR_TITLE": "Repair page route metadata",
        "content_library:SITE_BUILDER_ROUTE_TREE_REPAIR_DESC":
          "Legacy pages are missing Route/Tree metadata. Run a one-time repair to backfill and reload.",
        "content_library:SITE_BUILDER_ROUTE_TREE_REPAIR_ACTION": "Repair and reload",
        "content_library:SITE_BUILDER_ROUTE_TREE_REPAIR_TOAST_SUCCESS":
          "Repair complete: backfilled {{routes}} routes and {{nodes}} tree nodes.",
        "content_library:SITE_BUILDER_ROUTE_DIALOG_TITLE": "Create route template",
        "content_library:SITE_BUILDER_ROUTE_DIALOG_DESC": "Map a route pattern to a content model.",
        "content_library:SITE_BUILDER_ROUTE_DIALOG_SUBMIT": "Create route",
        "content_library:SITE_BUILDER_ROUTE_FIELD_PATH_LABEL": "Path pattern",
        "content_library:SITE_BUILDER_ROUTE_FIELD_PATH_DESC":
          "Use dynamic segments like /blog/:slug.",
        "content_library:SITE_BUILDER_ROUTE_FIELD_PATH_PLACEHOLDER": "/blog/:slug",
        "content_library:SITE_BUILDER_ROUTE_FIELD_TYPE_LABEL": "Model key",
        "content_library:SITE_BUILDER_ROUTE_FIELD_TYPE_DESC":
          "Use a routable model key such as post or legal_document.",
        "content_library:SITE_BUILDER_ROUTE_FIELD_TYPE_PLACEHOLDER": "post",
        "content_library:SITE_BUILDER_ROUTE_FIELD_ACTIVE_LABEL": "Active route",
        "content_library:SITE_BUILDER_ROUTE_FIELD_ACTIVE_DESC":
          "Inactive templates are ignored during route resolve.",
        "content_library:SITE_BUILDER_TOAST_ROUTE_CREATE_SUCCESS": "Route template created",
        "content_library:SITE_BUILDER_TOAST_ROUTE_ENABLED": "Route template enabled",
        "content_library:SITE_BUILDER_TOAST_ROUTE_DISABLED": "Route template disabled",
        "content_library:SITE_BUILDER_DIALOG_TITLE": "Create page",
        "content_library:SITE_BUILDER_DIALOG_DESC": "Add a new page to your site structure.",
        "content_library:SITE_BUILDER_DIALOG_SUBMIT": "Create page",
        "content_library:SITE_BUILDER_FIELD_TITLE_LABEL": "Title",
        "content_library:SITE_BUILDER_FIELD_TITLE_DESC":
          "Set the page label shown in navigation and tables.",
        "content_library:SITE_BUILDER_FIELD_TITLE_PLACEHOLDER": "Pricing",
        "content_library:SITE_BUILDER_FIELD_PATH_LABEL": "Path",
        "content_library:SITE_BUILDER_FIELD_PATH_DESC": "Choose the route path for this page.",
        "content_library:SITE_BUILDER_FIELD_PATH_PLACEHOLDER": "/pricing",
        "content_library:SITE_BUILDER_TOAST_CREATE_SUCCESS": "Page created",
        "common:CANCEL": "Cancel",
        "common:RETRY": "Retry",
      } as Record<string, string>;
      return tokens[key] ?? key;
    },
  }),
}));

vi.mock("@/components/common/default-page", () => ({
  DefaultPage: (props: {
    title?: React.ReactNode;
    description?: React.ReactNode;
    action?: React.ReactNode;
    children?: React.ReactNode;
  }) => (
    <div>
      <h1>{props.title}</h1>
      <p>{props.description}</p>
      {props.action}
      <div>{props.children}</div>
    </div>
  ),
}));

vi.mock("@celestial/ui/setting-dialog", () => ({
  SettingDialog: (props: {
    open: boolean;
    title?: React.ReactNode;
    description?: React.ReactNode;
    children?: React.ReactNode;
    footer?: React.ReactNode;
  }) =>
    props.open ? (
      <div>
        <h2>{props.title}</h2>
        <p>{props.description}</p>
        <div>{props.children}</div>
        <div>{props.footer}</div>
      </div>
    ) : null,
}));

async function renderWithQuery() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  await act(async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <WorkspaceSiteBuilderPage />
      </QueryClientProvider>,
    );
  });
}

describe("WorkspaceSiteBuilderPage", () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ currentWorkspaceId: "ws-1", lastWorkspaceId: "ws-1" });
    listSiteBuilderPagesTree.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      size: 20,
      pages: 0,
      next: null,
      prev: null,
    });
    listSiteBuilderGlobalSections.mockResolvedValue({ items: [] });
    listSiteBuilderRouteTemplates.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      size: 50,
      pages: 0,
      next: null,
      prev: null,
    });
    getSiteBuilderPublishImpact.mockResolvedValue({
      missingRoutes: ["/blog/:slug"],
      unresolvedRelations: ["post.author"],
      unpublishedDependencies: ["hero-banner"],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.setState({ currentWorkspaceId: null, lastWorkspaceId: null });
  });

  test("renders structure/composition/publish-impact layers and hides model-creation entry", async () => {
    listSiteBuilderPagesTree.mockResolvedValue({
      items: [
        {
          id: "page-home",
          path: "/",
          title: "Homepage",
          children: [],
        },
        {
          id: "page-pricing",
          path: "/pricing",
          title: "Pricing",
          children: [],
        },
      ],
      total: 2,
      page: 1,
      size: 20,
      pages: 1,
      next: null,
      prev: null,
    });

    await renderWithQuery();

    expect(await screen.findByText("Site Builder")).toBeInTheDocument();
    expect(await screen.findByText("Structure map")).toBeInTheDocument();
    expect(screen.getByText("Composition panel")).toBeInTheDocument();
    expect(screen.getByText("Publish impact")).toBeInTheDocument();
    expect(screen.getByText("Route bindings")).toBeInTheDocument();
    expect(screen.getByText("Missing routes 1")).toBeInTheDocument();
    expect(screen.getByText("Unresolved relations 1")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create model from blank" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Create content model")).not.toBeInTheDocument();
    expect(screen.getByText("Homepage")).toBeInTheDocument();
    expect(screen.getByText("Pricing")).toBeInTheDocument();
  });

  test("opens the visual editor from a page affordance", async () => {
    listSiteBuilderPagesTree.mockResolvedValue({
      items: [
        {
          id: "page-home",
          path: "/",
          title: "Homepage",
          children: [],
        },
      ],
      total: 1,
      page: 1,
      size: 20,
      pages: 1,
      next: null,
      prev: null,
    });

    await renderWithQuery();

    const buttons = await screen.findAllByRole("button", { name: "Open editor" });
    fireEvent.click(buttons[buttons.length - 1]!);

    expect(openStudioPageEditor).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      pageId: "page-home",
    });
  });

  test("creates a page and refreshes the overview", async () => {
    const user = userEvent.setup();
    listSiteBuilderPagesTree
      .mockResolvedValueOnce({
        items: [],
        total: 0,
        page: 1,
        size: 20,
        pages: 0,
        next: null,
        prev: null,
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: "page-pricing",
            path: "/pricing",
            title: "Pricing",
            children: [],
          },
        ],
        total: 1,
        page: 1,
        size: 20,
        pages: 1,
        next: null,
        prev: null,
      });
    createSiteBuilderPage.mockResolvedValue(undefined);

    await renderWithQuery();

    await user.click(await screen.findByRole("button", { name: "Manage pages" }));
    await user.type(screen.getByPlaceholderText("Pricing"), "Pricing");
    await user.clear(screen.getByPlaceholderText("/pricing"));
    await user.type(screen.getByPlaceholderText("/pricing"), "/pricing");
    await user.click(screen.getByRole("button", { name: "Create page" }));

    await waitFor(() => {
      expect(createSiteBuilderPage).toHaveBeenCalledWith("ws-1", {
        title: "Pricing",
        path: "/pricing",
      });
    });
    expect(await screen.findByText("Pricing")).toBeInTheDocument();
  });

  test("publishes and unpublishes a page from site builder structure map", async () => {
    const user = userEvent.setup();
    listSiteBuilderPagesTree
      .mockResolvedValueOnce({
        items: [
          {
            id: "page-home",
            path: "/",
            title: "Homepage",
            draftRevision: 2,
            publishedRevision: null,
            children: [],
          },
        ],
        total: 1,
        page: 1,
        size: 20,
        pages: 1,
        next: null,
        prev: null,
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: "page-home",
            path: "/",
            title: "Homepage",
            draftRevision: 2,
            publishedRevision: 2,
            children: [],
          },
        ],
        total: 1,
        page: 1,
        size: 20,
        pages: 1,
        next: null,
        prev: null,
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: "page-home",
            path: "/",
            title: "Homepage",
            draftRevision: 3,
            publishedRevision: null,
            children: [],
          },
        ],
        total: 1,
        page: 1,
        size: 20,
        pages: 1,
        next: null,
        prev: null,
      });
    publishSiteBuilderPage.mockResolvedValue({
      siteId: "site-1",
      pageId: "page-home",
      path: "/",
      revision: 2,
      publishedAtMs: 1741330800000,
    });
    unpublishSiteBuilderPage.mockResolvedValue({
      siteId: "site-1",
      pageId: "page-home",
      path: "/",
      unpublishedAtMs: 1741330900000,
    });

    await renderWithQuery();

    await user.click(await screen.findByRole("button", { name: "Publish" }));
    await waitFor(() => {
      expect(publishSiteBuilderPage).toHaveBeenCalledWith("ws-1", "page-home", {
        revision: 2,
      });
    });

    await user.click(await screen.findByRole("button", { name: "Unpublish" }));
    await waitFor(() => {
      expect(unpublishSiteBuilderPage).toHaveBeenCalledWith("ws-1", "page-home");
    });
  });

  test("creates route template from route bindings panel", async () => {
    const user = userEvent.setup();
    createSiteBuilderRouteTemplate.mockResolvedValue({
      id: "route-1",
      siteId: "site-1",
      pathPattern: "/blog/:slug",
      entryTypeId: "et-1",
      entryTypeCode: "post",
      isActive: true,
    });

    await renderWithQuery();

    await user.click(await screen.findByRole("button", { name: "Manage routes" }));
    await user.clear(screen.getByPlaceholderText("/blog/:slug"));
    await user.type(screen.getByPlaceholderText("/blog/:slug"), "/blog/:slug");
    await user.type(screen.getByPlaceholderText("post"), "post");
    await user.click(screen.getByRole("button", { name: "Create route" }));

    await waitFor(() => {
      expect(createSiteBuilderRouteTemplate).toHaveBeenCalledWith("ws-1", {
        pathPattern: "/blog/:slug",
        entryTypeCode: "post",
        isActive: true,
      });
    });
  });

  test("toggles route template active status", async () => {
    const user = userEvent.setup();
    listSiteBuilderRouteTemplates.mockResolvedValue({
      items: [
        {
          id: "route-1",
          siteId: "site-1",
          pathPattern: "/blog/:slug",
          entryTypeId: "et-1",
          entryTypeCode: "post",
          isActive: true,
        },
      ],
      total: 1,
      page: 1,
      size: 50,
      pages: 1,
      next: null,
      prev: null,
    });
    toggleSiteBuilderRouteTemplateActive.mockResolvedValue({
      id: "route-1",
      siteId: "site-1",
      pathPattern: "/blog/:slug",
      entryTypeId: "et-1",
      entryTypeCode: "post",
      isActive: false,
    });

    await renderWithQuery();
    await user.click(await screen.findByRole("button", { name: "Disable" }));

    await waitFor(() => {
      expect(toggleSiteBuilderRouteTemplateActive).toHaveBeenCalledWith(
        "ws-1",
        expect.objectContaining({
          id: "route-1",
          isActive: true,
        }),
      );
    });
  });

  test("offers a one-time repair when legacy pages are missing route/tree metadata", async () => {
    const user = userEvent.setup();
    listSiteBuilderPagesTree.mockRejectedValueOnce(
      new ApiError({
        status: 409,
        message: "Page route missing",
        error: "PAGE_ROUTE_MISSING",
      }),
    );
    repairSiteBuilderPagesRouteTree.mockResolvedValue({
      missingRoutes: 1,
      missingTreeNodes: 1,
      repairedRoutes: 1,
      repairedTreeNodes: 1,
      orphanParentsDetached: 0,
    });

    await renderWithQuery();

    expect(await screen.findByText("Repair page route metadata")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Legacy pages are missing Route/Tree metadata. Run a one-time repair to backfill and reload.",
      ),
    ).toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: "Repair and reload" }));
    await waitFor(() => {
      expect(repairSiteBuilderPagesRouteTree).toHaveBeenCalledWith("ws-1");
    });
  });
});

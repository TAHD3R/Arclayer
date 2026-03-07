import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { WorkspaceSiteBuilderPage } from "@/pages/workspaces/content/site-builder/page";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

const {
  listWorkspaceSitePagesTree,
  listWorkspaceSiteGlobalSections,
  createWorkspaceSitePage,
  publishWorkspaceSitePage,
  unpublishWorkspaceSitePage,
  openStudioPageEditor,
} = vi.hoisted(() => ({
  listWorkspaceSitePagesTree: vi.fn(),
  listWorkspaceSiteGlobalSections: vi.fn(),
  createWorkspaceSitePage: vi.fn(),
  publishWorkspaceSitePage: vi.fn(),
  unpublishWorkspaceSitePage: vi.fn(),
  openStudioPageEditor: vi.fn(),
}));

vi.mock("@/api/workspace-site", () => ({
  listWorkspaceSitePagesTree,
  listWorkspaceSiteGlobalSections,
  createWorkspaceSitePage,
  publishWorkspaceSitePage,
  unpublishWorkspaceSitePage,
}));

vi.mock("@/lib/routing/studio-editor", () => ({
  openStudioPageEditor,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        ({
          "nav:NAV_CONTENT_SITE_BUILDER": "Site Builder",
          "content_library:SITE_BUILDER_PAGE_DESC":
            "Organize the key structures that shape your site experience.",
          "content_library:SITE_BUILDER_EMPTY_TITLE": "No site structure yet",
          "content_library:SITE_BUILDER_EMPTY_DESC":
            "Create your first page to start assembling the site builder workspace.",
          "content_library:SITE_BUILDER_OVERVIEW_TITLE": "Structure overview",
          "content_library:SITE_BUILDER_PAGES_TITLE": "Pages",
          "content_library:SITE_BUILDER_PAGES_DESC": "Manage routeable pages and their hierarchy.",
          "content_library:SITE_BUILDER_GLOBALS_TITLE": "Global sections",
          "content_library:SITE_BUILDER_GLOBALS_DESC":
            "Headers footers and announcement bars will live here next.",
          "content_library:SITE_BUILDER_GLOBALS_EMPTY": "No global sections yet",
          "content_library:SITE_BUILDER_LIST_TITLE": "Recent pages",
          "content_library:SITE_BUILDER_OPEN_EDITOR": "Open editor",
          "content_library:SITE_BUILDER_MANAGE_PAGES": "Manage pages",
          "content_library:SITE_BUILDER_STATUS_DRAFT": "Draft",
          "content_library:SITE_BUILDER_STATUS_PUBLISHED": "Published",
          "content_library:SITE_BUILDER_ACTION_PUBLISH": "Publish",
          "content_library:SITE_BUILDER_ACTION_UNPUBLISH": "Unpublish",
          "content_library:SITE_BUILDER_TOAST_PUBLISH_SUCCESS": "Page published",
          "content_library:SITE_BUILDER_TOAST_UNPUBLISH_SUCCESS": "Page unpublished",
          "content_library:SITE_BUILDER_METRIC_PUBLISHED": "Published pages",
          "content_library:SITE_BUILDER_METRIC_DRAFT": "Draft pages",
          "content_library:SITE_BUILDER_REVISION_DRAFT": "Draft",
          "content_library:SITE_BUILDER_REVISION_PUBLISHED": "Published",
          "content_library:SITE_BUILDER_GLOBAL_ENABLED": "Enabled",
          "content_library:SITE_BUILDER_GLOBAL_DISABLED": "Disabled",
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
        }) as Record<string, string>
      )[key] ?? key,
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
    listWorkspaceSiteGlobalSections.mockResolvedValue({ items: [] });
  });

  afterEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.setState({ currentWorkspaceId: null, lastWorkspaceId: null });
  });

  test("renders structure overview when pages exist", async () => {
    listWorkspaceSitePagesTree.mockResolvedValue({
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
    expect(await screen.findByText("Published pages")).toBeInTheDocument();
    expect(await screen.findByText("Draft pages")).toBeInTheDocument();
    expect(screen.getByText("Recent pages")).toBeInTheDocument();
    expect(screen.getByText("Homepage")).toBeInTheDocument();
    expect(screen.getByText("Pricing")).toBeInTheDocument();
  });

  test("opens the visual editor from a page affordance", async () => {
    listWorkspaceSitePagesTree.mockResolvedValue({
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
    listWorkspaceSitePagesTree
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
    createWorkspaceSitePage.mockResolvedValue(undefined);

    await renderWithQuery();

    await user.click(await screen.findByRole("button", { name: "Manage pages" }));
    await user.type(screen.getByPlaceholderText("Pricing"), "Pricing");
    await user.clear(screen.getByPlaceholderText("/pricing"));
    await user.type(screen.getByPlaceholderText("/pricing"), "/pricing");
    await user.click(screen.getByRole("button", { name: "Create page" }));

    await waitFor(() => {
      expect(createWorkspaceSitePage).toHaveBeenCalledWith("ws-1", {
        title: "Pricing",
        path: "/pricing",
      });
    });
    expect(await screen.findByText("Pricing")).toBeInTheDocument();
  });

  test("publishes and unpublishes a page from site builder overview", async () => {
    const user = userEvent.setup();
    listWorkspaceSitePagesTree
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
    publishWorkspaceSitePage.mockResolvedValue({
      siteId: "site-1",
      pageId: "page-home",
      path: "/",
      revision: 2,
      publishedAtMs: 1741330800000,
    });
    unpublishWorkspaceSitePage.mockResolvedValue({
      siteId: "site-1",
      pageId: "page-home",
      path: "/",
      unpublishedAtMs: 1741330900000,
    });

    await renderWithQuery();

    await user.click(await screen.findByRole("button", { name: "Publish" }));
    await waitFor(() => {
      expect(publishWorkspaceSitePage).toHaveBeenCalledWith("ws-1", "page-home", {
        revision: 2,
      });
    });

    await user.click(await screen.findByRole("button", { name: "Unpublish" }));
    await waitFor(() => {
      expect(unpublishWorkspaceSitePage).toHaveBeenCalledWith("ws-1", "page-home");
    });
  });
});

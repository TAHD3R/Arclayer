import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { WorkspaceContentLibraryPage } from "@/pages/workspaces/content/library/page";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

const {
  listWorkspaceContentModels,
  listWorkspaceSiteEntries,
  createWorkspaceSiteEntry,
  publishWorkspaceSiteEntry,
  unpublishWorkspaceSiteEntry,
} = vi.hoisted(() => ({
  listWorkspaceContentModels: vi.fn(),
  listWorkspaceSiteEntries: vi.fn(),
  createWorkspaceSiteEntry: vi.fn(),
  publishWorkspaceSiteEntry: vi.fn(),
  unpublishWorkspaceSiteEntry: vi.fn(),
}));

vi.mock("@/api/content-models", () => ({
  listWorkspaceContentModels,
}));

vi.mock("@/api/workspace-site", () => ({
  listWorkspaceSiteEntries,
  createWorkspaceSiteEntry,
  publishWorkspaceSiteEntry,
  unpublishWorkspaceSiteEntry,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      (
        ({
          "content_library:LIBRARY_PAGE_TITLE": "Content Library",
          "content_library:LIBRARY_PAGE_DESC":
            "Browse content-ready models and manage their entries from one place.",
          "content_library:LIBRARY_CREATE_ACTION": "New entry",
          "content_library:LIBRARY_EMPTY_TITLE": "No content library models yet",
          "content_library:LIBRARY_EMPTY_DESC":
            "Create or enable a content-focused model before managing entries here.",
          "content_library:LIBRARY_SWITCHER_LABEL": "Content type",
          "content_library:LIBRARY_TABLE_TITLE": "Title",
          "content_library:LIBRARY_TABLE_SLUG": "Slug",
          "content_library:LIBRARY_TABLE_STATUS": "Status",
          "content_library:LIBRARY_TABLE_UPDATED": "Updated",
          "content_library:LIBRARY_TABLE_DRAFT_REVISION": "Draft",
          "content_library:LIBRARY_TABLE_PUBLISHED_REVISION": "Published",
          "content_library:LIBRARY_TABLE_ACTIONS": "Actions",
          "content_library:LIBRARY_TABLE_EMPTY": "Entries will appear here.",
          "content_library:LIBRARY_METRIC_TOTAL": "Total entries",
          "content_library:LIBRARY_METRIC_DRAFT": "Draft only",
          "content_library:LIBRARY_METRIC_PUBLISHED": "Published",
          "content_library:LIBRARY_STATUS_DRAFT": "Draft",
          "content_library:LIBRARY_STATUS_PUBLISHED": "Published",
          "content_library:LIBRARY_ACTION_PUBLISH": "Publish",
          "content_library:LIBRARY_ACTION_UNPUBLISH": "Unpublish",
          "content_library:LIBRARY_TOAST_PUBLISH_SUCCESS": "Entry published",
          "content_library:LIBRARY_TOAST_UNPUBLISH_SUCCESS": "Entry unpublished",
          "content_library:LIBRARY_DIALOG_TITLE": "Create entry",
          "content_library:LIBRARY_DIALOG_DESC": `Add a new entry to ${String(params?.modelName ?? "this model")}.`,
          "content_library:LIBRARY_DIALOG_SUBMIT": "Create entry",
          "content_library:LIBRARY_FIELD_TITLE_LABEL": "Title",
          "content_library:LIBRARY_FIELD_TITLE_DESC":
            "Set the main title used in tables and content references.",
          "content_library:LIBRARY_FIELD_TITLE_PLACEHOLDER": "Hello world",
          "content_library:LIBRARY_FIELD_SLUG_LABEL": "Slug",
          "content_library:LIBRARY_FIELD_SLUG_DESC":
            "Use a stable slug for routing and content lookup.",
          "content_library:LIBRARY_FIELD_SLUG_PLACEHOLDER": "hello-world",
          "content_library:LIBRARY_TOAST_CREATE_SUCCESS": "Entry created",
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
    extra?: React.ReactNode;
    children?: React.ReactNode;
  }) => (
    <div>
      <h1>{props.title}</h1>
      <p>{props.description}</p>
      {props.action}
      {props.extra}
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

function installMatchMedia() {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function installComputedStyle() {
  Object.defineProperty(window, "getComputedStyle", {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      getPropertyValue: vi.fn(() => ""),
      overflowX: "auto",
      overflowY: "auto",
    })),
  });
}

async function renderWithQuery() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  await act(async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <WorkspaceContentLibraryPage />
      </QueryClientProvider>,
    );
  });
}

describe("WorkspaceContentLibraryPage", () => {
  beforeEach(() => {
    installMatchMedia();
    installComputedStyle();
    useWorkspaceStore.setState({ currentWorkspaceId: "ws-1", lastWorkspaceId: "ws-1" });
  });

  afterEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.setState({ currentWorkspaceId: null, lastWorkspaceId: null });
  });

  test("renders empty state when no content library models exist", async () => {
    listWorkspaceContentModels.mockResolvedValue({
      items: [
        {
          id: "model-page",
          workspaceId: "ws-1",
          siteId: "site-1",
          key: "page",
          name: "Page",
          category: "site_builder",
          capabilities: ["versioned", "routable", "visual_editable"],
          defaultEditor: "visual",
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

    expect(await screen.findByText("No content library models yet")).toBeInTheDocument();
  });

  test("renders type switcher and entry table scaffold when models exist", async () => {
    listWorkspaceContentModels.mockResolvedValue({
      items: [
        {
          id: "model-article",
          workspaceId: "ws-1",
          siteId: "site-1",
          key: "article",
          name: "Article",
          category: "content_library",
          capabilities: ["versioned", "routable", "rich_text_editable"],
          defaultEditor: "rich_text",
        },
        {
          id: "model-faq",
          workspaceId: "ws-1",
          siteId: "site-1",
          key: "faq",
          name: "FAQ",
          category: "content_library",
          capabilities: ["versioned", "has_relations"],
          defaultEditor: "form",
        },
      ],
      total: 2,
      page: 1,
      size: 20,
      pages: 1,
      next: null,
      prev: null,
    });
    listWorkspaceSiteEntries.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      size: 20,
      pages: 0,
      next: null,
      prev: null,
    });

    await renderWithQuery();

    expect(await screen.findByText("Content Library")).toBeInTheDocument();
    expect(await screen.findByText("Content type")).toBeInTheDocument();
    expect(await screen.findByText("Total entries")).toBeInTheDocument();
    expect(await screen.findByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Slug")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getAllByText("Draft").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Published").length).toBeGreaterThan(0);
    expect(screen.getByText("Actions")).toBeInTheDocument();
    expect(screen.getByText("Entries will appear here.")).toBeInTheDocument();
  });

  test("creates an entry and refreshes the table", async () => {
    const user = userEvent.setup();
    listWorkspaceContentModels.mockResolvedValue({
      items: [
        {
          id: "model-article",
          workspaceId: "ws-1",
          siteId: "site-1",
          key: "article",
          name: "Article",
          category: "content_library",
          capabilities: ["versioned", "routable", "rich_text_editable"],
          defaultEditor: "rich_text",
        },
      ],
      total: 1,
      page: 1,
      size: 20,
      pages: 1,
      next: null,
      prev: null,
    });
    listWorkspaceSiteEntries
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
            id: "entry-1",
            siteId: "site-1",
            entryTypeId: "type-1",
            entryTypeCode: "article",
            slug: "hello-world",
            title: "Hello world",
            status: "draft",
            updatedAt: "2026-03-07T09:45:00Z",
            draftRevision: 1,
            publishedRevision: null,
          },
        ],
        total: 1,
        page: 1,
        size: 20,
        pages: 1,
        next: null,
        prev: null,
      });
    createWorkspaceSiteEntry.mockResolvedValue(undefined);

    await renderWithQuery();

    await user.click(await screen.findByRole("button", { name: "New entry" }));
    await user.type(screen.getByPlaceholderText("Hello world"), "Hello world");
    await user.type(screen.getByPlaceholderText("hello-world"), "hello-world");
    await user.click(screen.getByRole("button", { name: "Create entry" }));

    await waitFor(() => {
      expect(createWorkspaceSiteEntry).toHaveBeenCalledWith("ws-1", {
        entryTypeCode: "article",
        title: "Hello world",
        slug: "hello-world",
      });
    });
    expect(await screen.findByText("Hello world")).toBeInTheDocument();
  });

  test("publishes and unpublishes an entry from the library table", async () => {
    const user = userEvent.setup();
    listWorkspaceContentModels.mockResolvedValue({
      items: [
        {
          id: "model-article",
          workspaceId: "ws-1",
          siteId: "site-1",
          key: "article",
          name: "Article",
          category: "content_library",
          capabilities: ["versioned", "routable", "rich_text_editable", "publishable"],
          defaultEditor: "rich_text",
        },
      ],
      total: 1,
      page: 1,
      size: 20,
      pages: 1,
      next: null,
      prev: null,
    });
    listWorkspaceSiteEntries
      .mockResolvedValueOnce({
        items: [
          {
            id: "entry-1",
            siteId: "site-1",
            entryTypeId: "type-1",
            entryTypeCode: "article",
            slug: "hello-world",
            title: "Hello world",
            status: "draft",
            updatedAt: "2026-03-07T09:45:00Z",
            draftRevision: 3,
            publishedRevision: null,
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
            id: "entry-1",
            siteId: "site-1",
            entryTypeId: "type-1",
            entryTypeCode: "article",
            slug: "hello-world",
            title: "Hello world",
            status: "published",
            updatedAt: "2026-03-07T09:45:00Z",
            draftRevision: 3,
            publishedRevision: 3,
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
            id: "entry-1",
            siteId: "site-1",
            entryTypeId: "type-1",
            entryTypeCode: "article",
            slug: "hello-world",
            title: "Hello world",
            status: "draft",
            updatedAt: "2026-03-07T09:45:00Z",
            draftRevision: 4,
            publishedRevision: null,
          },
        ],
        total: 1,
        page: 1,
        size: 20,
        pages: 1,
        next: null,
        prev: null,
      });
    publishWorkspaceSiteEntry.mockResolvedValue({
      siteId: "site-1",
      entryId: "entry-1",
      entryTypeCode: "article",
      slug: "hello-world",
      revision: 3,
      publishedAtMs: 1741330800000,
    });
    unpublishWorkspaceSiteEntry.mockResolvedValue({
      siteId: "site-1",
      entryId: "entry-1",
      entryTypeCode: "article",
      slug: "hello-world",
      unpublishedAtMs: 1741330900000,
    });

    await renderWithQuery();

    await user.click(await screen.findByRole("button", { name: "Publish" }));
    await waitFor(() => {
      expect(publishWorkspaceSiteEntry).toHaveBeenCalledWith("ws-1", {
        entryTypeCode: "article",
        slug: "hello-world",
        revision: 3,
      });
    });

    await user.click(await screen.findByRole("button", { name: "Unpublish" }));
    await waitFor(() => {
      expect(unpublishWorkspaceSiteEntry).toHaveBeenCalledWith("ws-1", {
        entryTypeCode: "article",
        slug: "hello-world",
      });
    });
  });
});

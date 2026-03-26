import type { ReactElement, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ContentLibraryPage } from "@/pages/workspaces/content/library/page";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

const mocked = vi.hoisted(() => ({
  listAllContentItems: vi.fn(),
  listAllContentModels: vi.fn(),
  getContentItemVersion: vi.fn(),
  getContentSeoProfile: vi.fn(),
  getWorkspacePublishImpact: vi.fn(),
  getContentLibraryViews: vi.fn(),
  createContentLibraryView: vi.fn(),
  updateContentLibraryView: vi.fn(),
  moveContentLibraryView: vi.fn(),
  deleteContentLibraryView: vi.fn(),
  archiveContentItem: vi.fn(),
  deleteContentItem: vi.fn(),
  duplicateContentItem: vi.fn(),
  unarchiveContentItem: vi.fn(),
  issueWorkspaceSitePreviewToken: vi.fn(),
  locationAssign: vi.fn(),
  navigate: vi.fn(),
  routeSearch: { current: {} as Record<string, unknown> },
}));

vi.mock("@/api/content", () => ({
  listAllContentItems: (...args: unknown[]) => mocked.listAllContentItems(...args),
  listAllContentModels: (...args: unknown[]) => mocked.listAllContentModels(...args),
  getContentItemVersion: (...args: unknown[]) => mocked.getContentItemVersion(...args),
  getContentSeoProfile: (...args: unknown[]) => mocked.getContentSeoProfile(...args),
  getWorkspacePublishImpact: (...args: unknown[]) => mocked.getWorkspacePublishImpact(...args),
  getContentLibraryViews: (...args: unknown[]) => mocked.getContentLibraryViews(...args),
  createContentLibraryView: (...args: unknown[]) => mocked.createContentLibraryView(...args),
  updateContentLibraryView: (...args: unknown[]) => mocked.updateContentLibraryView(...args),
  moveContentLibraryView: (...args: unknown[]) => mocked.moveContentLibraryView(...args),
  deleteContentLibraryView: (...args: unknown[]) => mocked.deleteContentLibraryView(...args),
  archiveContentItem: (...args: unknown[]) => mocked.archiveContentItem(...args),
  deleteContentItem: (...args: unknown[]) => mocked.deleteContentItem(...args),
  duplicateContentItem: (...args: unknown[]) => mocked.duplicateContentItem(...args),
  unarchiveContentItem: (...args: unknown[]) => mocked.unarchiveContentItem(...args),
}));

vi.mock("@/api/workspace-site", () => ({
  issueWorkspaceSitePreviewToken: (...args: unknown[]) =>
    mocked.issueWorkspaceSitePreviewToken(...args),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocked.navigate,
  useSearch: () => mocked.routeSearch.current,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/hooks/use-workspace-date-time-formatter", () => ({
  useWorkspaceDateTimeFormatter: () => ({
    formatDateTimeOrNull: (value: string | null | undefined) => value ?? null,
  }),
}));

vi.mock("@/components/common/data-table-tools-labels", () => ({
  buildDataTableToolsLabels: () => ({
    columns: "columns",
    density: "density",
    viewOptions: "viewOptions",
    refresh: "refresh",
    reset: "reset",
  }),
}));

vi.mock("@arclayer/ui/data-table", async () => {
  const React = await import("react");

  return {
    useDataTable: (props: {
      fetcher: (params: {
        page?: number;
        size?: number;
        q?: string;
        ordering?: string;
      }) => Promise<{
        items: unknown[];
        total: number;
        page: number;
        size: number;
        pages: number;
        next: number | null;
        prev: number | null;
      }>;
      queryOptions?: { enabled?: boolean };
      extraQuery?: { fingerprint?: string };
    }) => {
      const [searchInput, setSearchInput] = React.useState("");
      const [sorting, setSorting] = React.useState<Array<{ id: string; desc: boolean }>>([]);
      const [columnVisibility, setColumnVisibility] = React.useState<Record<string, boolean>>({});
      const [columnOrder, setColumnOrder] = React.useState<string[]>([]);
      const [pageData, setPageData] = React.useState<{
        items: unknown[];
        total: number;
        page: number;
        size: number;
        pages: number;
        next: number | null;
        prev: number | null;
      }>({
        items: [],
        total: 0,
        page: 1,
        size: 10,
        pages: 0,
        next: null,
        prev: null,
      });

      React.useEffect(() => {
        if (props.queryOptions?.enabled === false) return;
        let active = true;
        void props.fetcher({ page: 1, size: 10, q: searchInput, ordering: "" }).then((next) => {
          if (active) setPageData(next);
        });
        return () => {
          active = false;
        };
      }, [props.extraQuery?.fingerprint, props.queryOptions?.enabled, props.fetcher, searchInput]);

      return {
        table: {
          getState: () => ({ columnVisibility, columnOrder }),
          setColumnVisibility,
          setColumnOrder,
        },
        pageData,
        searchInput,
        setSearchInput,
        sorting,
        setSorting,
        isFetching: false,
        resetColumnVisibility: vi.fn(),
      };
    },
    useDataTableRowHeightPreference: () => ["medium", vi.fn()] as const,
    useDataTableWrapHeadersPreference: () => [false, vi.fn()] as const,
  };
});

vi.mock("@/layouts/page-shell/default-page", () => ({
  DefaultPage: (props: {
    title: ReactNode;
    description?: ReactNode;
    action?: ReactNode;
    children: ReactNode;
  }) => (
    <div>
      <h1>{props.title}</h1>
      {props.description ? <p>{props.description}</p> : null}
      <div data-testid="page-action">{props.action}</div>
      {props.children}
    </div>
  ),
}));

vi.mock("@/layouts/page-shell/admin-data-table-section", () => ({
  AdminDataTableSection: (props: {
    toolbar?: ReactNode;
    pageData?: { items?: Array<{ id: string; name: string }> };
    onRowClick?: (row: { original: { id: string; name: string } }, index: number) => void;
  }) => (
    <div>
      <div data-testid="content-library-toolbar-slot">{props.toolbar}</div>
      <div>
        {(props.pageData?.items ?? []).map((row, index) => (
          <button
            key={row.id}
            type="button"
            aria-label={`row:${row.name}`}
            onClick={() => props.onRowClick?.({ original: row }, index)}
          >
            {row.name}
          </button>
        ))}
      </div>
    </div>
  ),
}));

vi.mock("@/pages/workspaces/content/library/components/content-library-toolbar", () => ({
  ContentLibraryToolbar: (props: {
    viewMode?: "card" | "table";
    searchInput?: string;
    onSearchInputChange?: (next: string) => void;
    onViewModeChange?: (next: "card" | "table") => void;
    filters?: { role?: string; editWith?: string };
    onFiltersChange?: (next: { role?: string; editWith?: string }) => void;
    views?: Array<{
      id: string;
      label: string;
      active?: boolean;
      onSelect?: () => void;
      onMoveForward?: () => void;
      moveForwardDisabled?: boolean;
      onMoveBackward?: () => void;
      moveBackwardDisabled?: boolean;
      onEdit?: () => void;
      onSaveAs?: () => void;
      onUpdate?: () => void;
      updateDisabled?: boolean;
      updateDisabledReason?: string;
      onDelete?: () => void;
    }>;
    onCreateView?: (draft: {
      name: string;
      visibility: "private" | "workspace";
      isDefault: boolean;
    }) => void;
  }) => (
    <div data-testid="content-library-toolbar">
      {(props.views ?? []).map((view) => (
        <div key={view.id}>
          <button
            type="button"
            data-active={view.active ? "true" : "false"}
            onClick={view.onSelect}
          >
            {view.label}
          </button>
          {view.onEdit ? (
            <button type="button" onClick={view.onEdit}>
              mock-edit-{view.id}
            </button>
          ) : null}
          {view.onMoveForward ? (
            <button type="button" disabled={view.moveForwardDisabled} onClick={view.onMoveForward}>
              mock-move-forward-{view.id}
            </button>
          ) : null}
          {view.onMoveBackward ? (
            <button
              type="button"
              disabled={view.moveBackwardDisabled}
              onClick={view.onMoveBackward}
            >
              mock-move-backward-{view.id}
            </button>
          ) : null}
          {view.onSaveAs ? (
            <button type="button" onClick={view.onSaveAs}>
              mock-save-as-{view.id}
            </button>
          ) : null}
          {view.onUpdate ? (
            <button type="button" disabled={view.updateDisabled} onClick={view.onUpdate}>
              mock-update-{view.id}
            </button>
          ) : null}
          {view.onDelete ? (
            <button type="button" onClick={view.onDelete}>
              mock-delete-{view.id}
            </button>
          ) : null}
        </div>
      ))}
      {props.onCreateView ? (
        <button
          type="button"
          onClick={() =>
            props.onCreateView?.({
              name: "Editorial queue",
              visibility: "private",
              isDefault: true,
            })
          }
        >
          content:CONTENT_LIBRARY_ACTION_CREATE_VIEW
        </button>
      ) : null}
      <button
        type="button"
        data-active={props.filters?.role === "page" ? "true" : "false"}
        onClick={() => props.onFiltersChange?.({ role: "page" })}
      >
        content:CONTENT_LIBRARY_ROLE_PAGE
      </button>
      <button type="button" onClick={() => props.onSearchInputChange?.("editorial")}>
        mock-search-editorial
      </button>
      <button
        type="button"
        data-active={props.filters?.editWith === "writing" ? "true" : "false"}
        onClick={() => props.onFiltersChange?.({ editWith: "writing" })}
      >
        content:CONTENT_LIBRARY_EDIT_WITH_WRITING
      </button>
      <button
        type="button"
        data-active={props.viewMode === "card" ? "true" : "false"}
        onClick={() => props.onViewModeChange?.("card")}
      >
        common:VIEW_MODE_CARD
      </button>
      <button
        type="button"
        data-active={props.viewMode === "table" ? "true" : "false"}
        onClick={() => props.onViewModeChange?.("table")}
      >
        common:VIEW_MODE_TABLE
      </button>
    </div>
  ),
}));

vi.mock("@/pages/workspaces/content/library/components/content-library-action-dialogs", () => ({
  ContentLibraryActionDialogs: () => null,
}));

vi.mock("@/pages/workspaces/content/library/components/content-library-new-content-button", () => ({
  ContentLibraryNewContentButton: (props: { onClick: () => void }) => (
    <button type="button" onClick={props.onClick}>
      CONTENT_LIBRARY_ACTION_NEW_CONTENT
    </button>
  ),
}));

function renderWithQuery(node: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

function getByI18nTail(key: string) {
  return screen.getByText((_, node) =>
    Boolean(
      node &&
      node.textContent &&
      (node.textContent === key || node.textContent === `content:${key}`) &&
      node.children.length === 0,
    ),
  );
}

function getAllByI18nTail(key: string) {
  return screen.getAllByText((_, node) =>
    Boolean(
      node &&
      node.textContent &&
      (node.textContent === key || node.textContent === `content:${key}`) &&
      node.children.length === 0,
    ),
  );
}

function setMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches,
      media: "(max-width: 960px)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("ContentLibraryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMatchMedia(false);
    mocked.routeSearch.current = {};
    mocked.navigate.mockImplementation((input: { search?: Record<string, unknown> }) => {
      if (!input?.search) return;
      mocked.routeSearch.current = {
        ...mocked.routeSearch.current,
        ...input.search,
      };
    });
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...window.location,
        assign: mocked.locationAssign,
      },
    });
    useWorkspaceStore.setState({ currentWorkspaceId: "ws-1", lastWorkspaceId: "ws-1" });
    mocked.issueWorkspaceSitePreviewToken.mockResolvedValue({
      siteId: "site-1",
      token: "preview-token",
      expiresAtMs: 123,
    });
    mocked.getContentItemVersion.mockImplementation(
      async (_workspaceId: string, itemId: string, versionNumber: number) => ({
        itemId,
        versionNumber,
        state: versionNumber === 3 ? "draft" : "published",
        createdAt: versionNumber === 3 ? "2026-03-26T08:00:00Z" : "2026-03-20T08:00:00Z",
        changeSummary:
          versionNumber === 3
            ? "Refined hero copy and CTA grouping"
            : "Published homepage baseline",
      }),
    );
    mocked.getContentSeoProfile.mockResolvedValue({
      metaTitle: "Homepage | Arclayer",
      metaDescription: "Primary landing page for the workspace site.",
      canonicalUrl: "https://example.com/homepage",
      robotsDirective: "index,follow",
      payload: null,
    });
    mocked.getWorkspacePublishImpact.mockResolvedValue({
      missingRoutes: [],
      unresolvedRelations: ["content-1"],
      unpublishedDependencies: ["content-1"],
    });
    const initialViewsState = {
      items: [] as Array<Record<string, unknown>>,
      defaultViewId: null as string | null,
    };
    mocked.getContentLibraryViews.mockResolvedValue(initialViewsState);
    mocked.createContentLibraryView.mockImplementation(
      async (_workspaceId: string, payload: Record<string, unknown>) => {
        const nextState = {
          items: [
            {
              id: "view-1",
              name: payload.name,
              baseViewId: payload.baseViewId,
              query: payload.query,
              filters: payload.filters,
              sorting: payload.sorting ?? [],
              viewMode: payload.viewMode,
              columns: payload.columns,
              visibility: payload.visibility,
              pinned: true,
              isDefault: payload.isDefault,
            },
          ],
          defaultViewId: payload.isDefault ? "view-1" : null,
        };
        mocked.getContentLibraryViews.mockResolvedValue(nextState);
        return nextState;
      },
    );
    mocked.updateContentLibraryView.mockImplementation(async () => mocked.getContentLibraryViews());
    mocked.moveContentLibraryView.mockImplementation(async () => mocked.getContentLibraryViews());
    mocked.deleteContentLibraryView.mockImplementation(async () => mocked.getContentLibraryViews());
    mocked.listAllContentModels.mockResolvedValue([
      {
        id: "model-page",
        workspaceId: "ws-1",
        siteId: "site-1",
        key: "page",
        name: "Page",
        description: "Primary site pages and landing flows",
        category: "site_builder",
        capabilities: ["visual_editable", "publishable", "routable"],
        defaultEditor: "visual",
      },
      {
        id: "model-article",
        workspaceId: "ws-1",
        siteId: "site-1",
        key: "article",
        name: "Article",
        description: "Long-form editorial records",
        category: "content_library",
        capabilities: ["rich_text_editable", "publishable"],
        defaultEditor: "rich_text",
      },
    ]);
    mocked.listAllContentItems.mockResolvedValue([
      {
        id: "content-1",
        workspaceId: "ws-1",
        siteId: "site-1",
        modelId: "model-page",
        modelKey: "page",
        slug: "homepage",
        title: "Homepage",
        status: "draft",
        visibility: "private",
        locale: "en-US",
        bootstrapPresetKey: "page",
        bootstrapPresetState: "selected",
        capabilityPackIds: ["publishable"],
        draftVersion: 3,
        publishedVersion: 2,
        updatedAt: "2026-03-26T00:00:00Z",
      },
      {
        id: "content-2",
        workspaceId: "ws-1",
        siteId: "site-1",
        modelId: "model-article",
        modelKey: "article",
        slug: "launch-note",
        title: "Launch note",
        status: "published",
        visibility: "public",
        locale: "en-US",
        bootstrapPresetKey: "post",
        bootstrapPresetState: "selected",
        capabilityPackIds: ["publishable"],
        draftVersion: 2,
        publishedVersion: 2,
        updatedAt: "2026-03-25T00:00:00Z",
      },
    ]);
  });

  test("renders the agreed system preset views above the workbench", async () => {
    renderWithQuery(<ContentLibraryPage />);

    await screen.findByRole("button", { name: "row:Homepage" });

    expect(getByI18nTail("CONTENT_LIBRARY_VIEW_ALL")).toBeInTheDocument();
    expect(getByI18nTail("CONTENT_LIBRARY_VIEW_DRAFT")).toBeInTheDocument();
    expect(getByI18nTail("CONTENT_LIBRARY_VIEW_PUBLISHED")).toBeInTheDocument();
    expect(screen.queryByText("content:CONTENT_LIBRARY_VIEW_SITE_CONTENT")).not.toBeInTheDocument();
    expect(
      screen.queryByText("content:CONTENT_LIBRARY_VIEW_NEEDS_ATTENTION"),
    ).not.toBeInTheDocument();
  });

  test("hydrates the active view from route search and persists a new selection", async () => {
    const user = userEvent.setup();
    mocked.routeSearch.current = { view: "published" };

    renderWithQuery(<ContentLibraryPage />);

    const publishedButton = await screen.findByRole("button", {
      name: "content:CONTENT_LIBRARY_VIEW_PUBLISHED",
    });
    expect(publishedButton).toHaveAttribute("data-active", "true");

    await user.click(screen.getByRole("button", { name: "content:CONTENT_LIBRARY_VIEW_DRAFT" }));

    expect(mocked.navigate).toHaveBeenCalledWith({
      replace: true,
      search: { view: "draft" },
    });
  });

  test("hydrates the default saved view from the views API when route search is absent", async () => {
    mocked.getContentLibraryViews.mockResolvedValue({
      items: [
        {
          id: "view-1",
          name: "Published launch",
          baseViewId: "published",
          query: "launch",
          filters: { status: "published" },
          sorting: [],
          viewMode: "table",
          columns: { rowHeight: "medium", wrapHeaders: false },
          visibility: "private",
          pinned: true,
          isDefault: true,
        },
      ],
      defaultViewId: "view-1",
    });

    renderWithQuery(<ContentLibraryPage />);

    expect(await screen.findByRole("button", { name: "Published launch" })).toHaveAttribute(
      "data-active",
      "true",
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "row:Launch note" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "row:Homepage" })).not.toBeInTheDocument();
    });
  });

  test("keeps the routed state on the default saved view instead of downgrading to its base system view", async () => {
    mocked.getContentLibraryViews.mockResolvedValue({
      items: [
        {
          id: "view-1",
          name: "Published launch",
          baseViewId: "published",
          query: "launch",
          filters: { status: "published" },
          sorting: [],
          viewMode: "table",
          columns: { rowHeight: "medium", wrapHeaders: false },
          visibility: "private",
          pinned: true,
          isDefault: true,
        },
      ],
      defaultViewId: "view-1",
    });

    renderWithQuery(<ContentLibraryPage />);

    await screen.findByRole("button", { name: "Published launch" });

    await waitFor(() => {
      expect(mocked.navigate).toHaveBeenLastCalledWith({
        replace: true,
        search: { view: "saved:view-1" },
      });
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Published launch" })).toHaveAttribute(
        "data-active",
        "true",
      );
      expect(
        screen.getByRole("button", { name: "content:CONTENT_LIBRARY_VIEW_PUBLISHED" }),
      ).toHaveAttribute("data-active", "false");
    });
  });

  test("normalizes a deleted saved-view route to the surviving default saved view", async () => {
    mocked.routeSearch.current = { view: "saved:view-deleted" };
    mocked.getContentLibraryViews.mockResolvedValue({
      items: [
        {
          id: "view-2",
          name: "Published launch",
          baseViewId: "published",
          query: "launch",
          filters: { status: "published" },
          sorting: [],
          viewMode: "table",
          columns: { rowHeight: "medium", wrapHeaders: false },
          visibility: "private",
          pinned: true,
          isDefault: true,
        },
      ],
      defaultViewId: "view-2",
    });

    renderWithQuery(<ContentLibraryPage />);

    await waitFor(() => {
      expect(mocked.navigate).toHaveBeenLastCalledWith({
        replace: true,
        search: { view: "saved:view-2" },
      });
    });

    expect(screen.getByRole("button", { name: "Published launch" })).toHaveAttribute(
      "data-active",
      "true",
    );
  });

  test("creates a persisted saved view from the toolbar action", async () => {
    const user = userEvent.setup();

    renderWithQuery(<ContentLibraryPage />);

    await user.click(
      await screen.findByRole("button", { name: "content:CONTENT_LIBRARY_ACTION_CREATE_VIEW" }),
    );

    await waitFor(() => {
      expect(mocked.createContentLibraryView).toHaveBeenCalledWith("ws-1", {
        name: "Editorial queue",
        baseViewId: "all",
        query: "",
        filters: {},
        sorting: [],
        viewMode: "table",
        columns: { rowHeight: "medium", wrapHeaders: false },
        visibility: "private",
        pinned: true,
        isDefault: true,
      });
    });

    expect(screen.getByRole("button", { name: "Editorial queue" })).toBeInTheDocument();
  });

  test("bundles system view state into the saved-view payload", async () => {
    const user = userEvent.setup();

    renderWithQuery(<ContentLibraryPage />);

    await screen.findByRole("button", { name: "row:Homepage" });
    await user.click(screen.getByRole("button", { name: "content:CONTENT_LIBRARY_VIEW_DRAFT" }));
    await user.click(
      screen.getByRole("button", { name: "content:CONTENT_LIBRARY_ACTION_CREATE_VIEW" }),
    );

    await waitFor(() => {
      expect(mocked.createContentLibraryView).toHaveBeenCalledWith("ws-1", {
        name: "Editorial queue",
        baseViewId: "draft",
        query: "",
        filters: { status: "draft" },
        sorting: [],
        viewMode: "table",
        columns: { rowHeight: "medium", wrapHeaders: false },
        visibility: "private",
        pinned: true,
        isDefault: true,
      });
    });
  });

  test("clears saved-view search state when switching back to a system view", async () => {
    const user = userEvent.setup();

    mocked.getContentLibraryViews.mockResolvedValue({
      items: [
        {
          id: "view-1",
          name: "Published launch",
          baseViewId: "published",
          query: "launch",
          filters: { status: "published" },
          sorting: [],
          viewMode: "table",
          columns: { rowHeight: "medium", wrapHeaders: false },
          visibility: "private",
          pinned: true,
          isDefault: false,
        },
      ],
      defaultViewId: null,
    });

    renderWithQuery(<ContentLibraryPage />);

    await screen.findByRole("button", { name: "row:Homepage" });
    await user.click(screen.getByRole("button", { name: "Published launch" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "row:Launch note" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "row:Homepage" })).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "content:CONTENT_LIBRARY_VIEW_ALL" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "row:Homepage" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "row:Launch note" })).toBeInTheDocument();
    });
  });

  test("updates a saved view from the current workbench state", async () => {
    const user = userEvent.setup();

    mocked.getContentLibraryViews.mockResolvedValue({
      items: [
        {
          id: "view-1",
          name: "Published launch",
          baseViewId: "published",
          query: "launch",
          filters: { status: "published" },
          sorting: [],
          viewMode: "table",
          columns: { rowHeight: "medium", wrapHeaders: false },
          visibility: "private",
          pinned: true,
          isDefault: false,
        },
      ],
      defaultViewId: null,
    });
    mocked.updateContentLibraryView.mockImplementation(
      async (_workspaceId: string, _viewId: string, payload: Record<string, unknown>) => ({
        items: [
          {
            id: "view-1",
            name: "Published launch",
            baseViewId: payload.baseViewId,
            query: payload.query,
            filters: payload.filters,
            sorting: payload.sorting ?? [],
            viewMode: payload.viewMode,
            columns: payload.columns,
            visibility: "private",
            pinned: true,
            isDefault: false,
          },
        ],
        defaultViewId: null,
      }),
    );

    renderWithQuery(<ContentLibraryPage />);

    await screen.findByRole("button", { name: "row:Homepage" });
    await user.click(screen.getByRole("button", { name: "Published launch" }));
    await user.click(screen.getByRole("button", { name: "content:CONTENT_LIBRARY_ROLE_PAGE" }));
    await user.click(screen.getByRole("button", { name: "mock-update-view-1" }));

    expect(
      await screen.findByText("content:CONTENT_LIBRARY_UPDATE_VIEW_DIALOG_TITLE"),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "content:CONTENT_LIBRARY_ACTION_UPDATE_VIEW" }),
    );

    await waitFor(() => {
      expect(mocked.updateContentLibraryView).toHaveBeenCalledWith("ws-1", "view-1", {
        baseViewId: "published",
        query: "launch",
        filters: { role: "page" },
        sorting: [],
        viewMode: "table",
        columns: { rowHeight: "medium", wrapHeaders: false },
      });
    });
  });

  test("keeps an active saved view selected while its filters and search diverge", async () => {
    const user = userEvent.setup();

    mocked.getContentLibraryViews.mockResolvedValue({
      items: [
        {
          id: "view-1",
          name: "Published launch",
          baseViewId: "published",
          query: "launch",
          filters: { status: "published" },
          sorting: [],
          viewMode: "table",
          columns: { rowHeight: "medium", wrapHeaders: false },
          visibility: "private",
          pinned: true,
          isDefault: false,
        },
      ],
      defaultViewId: null,
    });

    renderWithQuery(<ContentLibraryPage />);

    await screen.findByRole("button", { name: "row:Homepage" });
    await user.click(screen.getByRole("button", { name: "Published launch" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Published launch" })).toHaveAttribute(
        "data-active",
        "true",
      );
    });

    await user.click(screen.getByRole("button", { name: "content:CONTENT_LIBRARY_ROLE_PAGE" }));
    await user.click(screen.getByRole("button", { name: "mock-search-editorial" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Published launch" })).toHaveAttribute(
        "data-active",
        "true",
      );
      expect(
        screen.getByRole("button", { name: "content:CONTENT_LIBRARY_VIEW_ALL" }),
      ).toHaveAttribute("data-active", "false");
    });
  });

  test("activates a saved view without entering a reapply loop", async () => {
    const user = userEvent.setup();

    mocked.getContentLibraryViews.mockResolvedValue({
      items: [
        {
          id: "view-1",
          name: "Published launch",
          baseViewId: "published",
          query: "launch",
          filters: { status: "published" },
          sorting: [],
          viewMode: "table",
          columns: { rowHeight: "medium", wrapHeaders: false },
          visibility: "private",
          pinned: true,
          isDefault: false,
        },
      ],
      defaultViewId: null,
    });

    renderWithQuery(<ContentLibraryPage />);

    await screen.findByRole("button", { name: "row:Homepage" });
    await user.click(screen.getByRole("button", { name: "Published launch" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Published launch" })).toHaveAttribute(
        "data-active",
        "true",
      );
      expect(screen.getByRole("button", { name: "row:Launch note" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "row:Homepage" })).not.toBeInTheDocument();
    });
  });

  test("edits saved view metadata including visibility and default state", async () => {
    const user = userEvent.setup();

    mocked.getContentLibraryViews.mockResolvedValue({
      items: [
        {
          id: "view-1",
          name: "Published launch",
          baseViewId: "published",
          query: "launch",
          filters: { status: "published" },
          sorting: [],
          viewMode: "table",
          columns: { rowHeight: "medium", wrapHeaders: false },
          visibility: "private",
          pinned: true,
          isDefault: false,
        },
      ],
      defaultViewId: null,
    });
    mocked.updateContentLibraryView.mockImplementation(
      async (_workspaceId: string, _viewId: string, payload: Record<string, unknown>) => ({
        items: [
          {
            id: "view-1",
            name: payload.name ?? "Published launch",
            baseViewId: "published",
            query: "launch",
            filters: { status: "published" },
            sorting: [],
            viewMode: "table",
            columns: { rowHeight: "medium", wrapHeaders: false },
            visibility: payload.visibility ?? "private",
            pinned: true,
            isDefault: payload.isDefault ?? false,
          },
        ],
        defaultViewId: payload.isDefault ? "view-1" : null,
      }),
    );

    renderWithQuery(<ContentLibraryPage />);

    await screen.findByRole("button", { name: "row:Homepage" });
    await user.click(screen.getByRole("button", { name: "mock-edit-view-1" }));

    const nameInput = await screen.findByLabelText("CONTENT_LIBRARY_VIEW_CREATE_NAME");
    await user.clear(nameInput);
    await user.type(nameInput, "Shared launch board");
    await user.click(
      screen.getByRole("combobox", { name: "CONTENT_LIBRARY_VIEW_VISIBILITY_LABEL" }),
    );
    await user.click(
      screen.getByRole("option", { name: "CONTENT_LIBRARY_VIEW_VISIBILITY_WORKSPACE" }),
    );
    await user.click(screen.getByRole("switch", { name: "CONTENT_LIBRARY_VIEW_DEFAULT_LABEL" }));
    await user.click(screen.getByRole("button", { name: "CONTENT_LIBRARY_ACTION_UPDATE_VIEW" }));

    await waitFor(() => {
      expect(mocked.updateContentLibraryView).toHaveBeenCalledWith("ws-1", "view-1", {
        name: "Shared launch board",
        visibility: "workspace",
        isDefault: true,
      });
    });
  });

  test("saves a custom view as a new persisted copy", async () => {
    const user = userEvent.setup();

    mocked.getContentLibraryViews.mockResolvedValue({
      items: [
        {
          id: "view-1",
          name: "Published launch",
          baseViewId: "published",
          query: "launch",
          filters: { status: "published" },
          sorting: [],
          viewMode: "table",
          columns: { rowHeight: "medium", wrapHeaders: false },
          visibility: "private",
          pinned: true,
          isDefault: false,
        },
      ],
      defaultViewId: null,
    });
    mocked.createContentLibraryView.mockImplementation(
      async (_workspaceId: string, payload: Record<string, unknown>) => ({
        items: [
          {
            id: "view-1",
            name: "Published launch",
            baseViewId: "published",
            query: "launch",
            filters: { status: "published" },
            sorting: [],
            viewMode: "table",
            columns: { rowHeight: "medium", wrapHeaders: false },
            visibility: "private",
            pinned: true,
            isDefault: false,
          },
          {
            id: "view-2",
            name: payload.name,
            baseViewId: payload.baseViewId,
            query: payload.query,
            filters: payload.filters,
            sorting: payload.sorting ?? [],
            viewMode: payload.viewMode,
            columns: payload.columns,
            visibility: payload.visibility,
            pinned: payload.pinned,
            isDefault: payload.isDefault,
          },
        ],
        defaultViewId: payload.isDefault ? "view-2" : null,
      }),
    );

    renderWithQuery(<ContentLibraryPage />);

    await screen.findByRole("button", { name: "row:Homepage" });
    await user.click(screen.getByRole("button", { name: "mock-save-as-view-1" }));

    const nameInput = await screen.findByLabelText("CONTENT_LIBRARY_VIEW_CREATE_NAME");
    await user.clear(nameInput);
    await user.type(nameInput, "Published launch copy");
    await user.click(screen.getByRole("button", { name: "CONTENT_LIBRARY_ACTION_SAVE_AS_VIEW" }));

    await waitFor(() => {
      expect(mocked.createContentLibraryView).toHaveBeenCalledWith("ws-1", {
        name: "Published launch copy",
        baseViewId: "published",
        query: "launch",
        filters: { status: "published" },
        sorting: [],
        viewMode: "table",
        columns: { rowHeight: "medium", wrapHeaders: false },
        visibility: "private",
        pinned: true,
        isDefault: false,
      });
    });
  });

  test("disables save as when the duplicated view keeps the same name", async () => {
    const user = userEvent.setup();

    mocked.getContentLibraryViews.mockResolvedValue({
      items: [
        {
          id: "view-1",
          name: "Published launch",
          baseViewId: "published",
          query: "launch",
          filters: { status: "published" },
          sorting: [],
          viewMode: "table",
          columns: { rowHeight: "medium", wrapHeaders: false },
          visibility: "private",
          pinned: true,
          isDefault: false,
        },
      ],
      defaultViewId: null,
    });

    renderWithQuery(<ContentLibraryPage />);

    await screen.findByRole("button", { name: "row:Homepage" });
    await user.click(screen.getByRole("button", { name: "mock-save-as-view-1" }));

    const nameInput = screen.getByRole("textbox", {
      name: "CONTENT_LIBRARY_VIEW_CREATE_NAME",
    });
    expect(
      screen.getByRole("button", { name: "CONTENT_LIBRARY_ACTION_SAVE_AS_VIEW" }),
    ).toBeDisabled();
    expect(nameInput).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("CONTENT_LIBRARY_SAVE_AS_UNCHANGED_NAME_HINT")).toBeInTheDocument();
    expect(nameInput.nextElementSibling).toHaveTextContent(
      "CONTENT_LIBRARY_SAVE_AS_UNCHANGED_NAME_HINT",
    );
    expect(mocked.createContentLibraryView).not.toHaveBeenCalled();
  });

  test("confirms before deleting a saved view", async () => {
    const user = userEvent.setup();

    mocked.getContentLibraryViews.mockResolvedValue({
      items: [
        {
          id: "view-1",
          name: "Published launch",
          baseViewId: "published",
          query: "launch",
          filters: { status: "published" },
          sorting: [],
          viewMode: "table",
          columns: { rowHeight: "medium", wrapHeaders: false },
          visibility: "private",
          pinned: true,
          isDefault: false,
        },
      ],
      defaultViewId: null,
    });
    mocked.deleteContentLibraryView.mockResolvedValue({
      items: [],
      defaultViewId: null,
    });

    renderWithQuery(<ContentLibraryPage />);

    await screen.findByRole("button", { name: "row:Homepage" });
    await user.click(screen.getByRole("button", { name: "mock-delete-view-1" }));

    expect(
      await screen.findByText("content:CONTENT_LIBRARY_DELETE_VIEW_DIALOG_TITLE"),
    ).toBeInTheDocument();
    expect(mocked.deleteContentLibraryView).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "content:CONTENT_LIBRARY_ACTION_DELETE_VIEW" }),
    );

    await waitFor(() => {
      expect(mocked.deleteContentLibraryView).toHaveBeenCalledWith("ws-1", "view-1");
    });
  });

  test("auto-opens the created draft drawer when the library receives focused return context", async () => {
    mocked.routeSearch.current = { view: "draft", focusItemId: "content-1" };

    renderWithQuery(<ContentLibraryPage />);

    expect(await screen.findByText("CONTENT_LIBRARY_RECORD_DRAWER_TITLE")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_LIBRARY_FIELD_ROLE")).toBeInTheDocument();
    expect(
      screen.getByText("content:CONTENT_LIBRARY_VIEW_DRAFT").closest("button"),
    ).toHaveAttribute("data-active", "true");
  });

  test("opens a summary drawer scaffold on row click instead of navigating away immediately", async () => {
    const user = userEvent.setup();

    renderWithQuery(<ContentLibraryPage />);

    await user.click(await screen.findByRole("button", { name: "row:Homepage" }));

    expect(getByI18nTail("CONTENT_LIBRARY_RECORD_DRAWER_TITLE")).toBeInTheDocument();
    expect(getByI18nTail("CONTENT_LIBRARY_ACTION_CONTINUE")).toBeInTheDocument();
    expect(getByI18nTail("CONTENT_LIBRARY_FIELD_ROLE")).toBeInTheDocument();
    expect(mocked.navigate).not.toHaveBeenCalled();
  });

  test("shows quick metadata and next-surface summary in the record drawer", async () => {
    const user = userEvent.setup();

    renderWithQuery(<ContentLibraryPage />);

    await user.click(await screen.findByRole("button", { name: "row:Homepage" }));

    expect(getByI18nTail("CONTENT_LIBRARY_FIELD_ADDRESS")).toBeInTheDocument();
    expect(screen.getByText("/homepage")).toBeInTheDocument();
    expect(getByI18nTail("CONTENT_LIBRARY_FIELD_LOCALE")).toBeInTheDocument();
    expect(screen.getAllByText("en-US").length).toBeGreaterThan(0);
    expect(getByI18nTail("CONTENT_LIBRARY_FIELD_VISIBILITY")).toBeInTheDocument();
    expect(getByI18nTail("CONTENT_LIBRARY_VISIBILITY_PRIVATE")).toBeInTheDocument();
    expect(getByI18nTail("CONTENT_LIBRARY_FIELD_NEXT_SURFACE")).toBeInTheDocument();
    expect(getAllByI18nTail("CONTENT_LIBRARY_EDIT_WITH_CANVAS").length).toBeGreaterThan(0);
    expect(screen.getByText("Primary site pages and landing flows")).toBeInTheDocument();
  });

  test("shows version SEO and publish-impact secondary workspace context in the drawer", async () => {
    const user = userEvent.setup();

    renderWithQuery(<ContentLibraryPage />);

    await user.click(await screen.findByRole("button", { name: "row:Homepage" }));

    expect(
      await screen.findByText("CONTENT_LIBRARY_RECORD_DRAWER_SECTION_VERSIONS"),
    ).toBeInTheDocument();
    expect(screen.getByText("CONTENT_LIBRARY_VERSION_DRAFT")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_LIBRARY_VERSION_PUBLISHED")).toBeInTheDocument();
    expect(screen.getByText("Refined hero copy and CTA grouping")).toBeInTheDocument();

    expect(screen.getByText("CONTENT_LIBRARY_RECORD_DRAWER_SECTION_SEO")).toBeInTheDocument();
    expect(screen.getByText("Homepage | Arclayer")).toBeInTheDocument();
    expect(screen.getByText("https://example.com/homepage")).toBeInTheDocument();

    expect(
      screen.getByText("CONTENT_LIBRARY_RECORD_DRAWER_SECTION_PUBLISH_IMPACT"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("CONTENT_LIBRARY_PUBLISH_IMPACT_UNRESOLVED_RELATIONS"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("CONTENT_LIBRARY_PUBLISH_IMPACT_UNPUBLISHED_DEPENDENCIES"),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(mocked.getContentItemVersion).toHaveBeenCalledWith("ws-1", "content-1", 3);
      expect(mocked.getContentItemVersion).toHaveBeenCalledWith("ws-1", "content-1", 2);
      expect(mocked.getContentSeoProfile).toHaveBeenCalledWith("ws-1", "content-1", 3);
      expect(mocked.getWorkspacePublishImpact).toHaveBeenCalledWith("ws-1");
    });
  });

  test("filters the workbench by role without splitting the surface into separate pages", async () => {
    const user = userEvent.setup();

    renderWithQuery(<ContentLibraryPage />);

    await screen.findByRole("button", { name: "row:Homepage" });
    await user.click(screen.getByRole("button", { name: "content:CONTENT_LIBRARY_ROLE_PAGE" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "row:Homepage" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "row:Launch note" })).not.toBeInTheDocument();
    });
  });

  test("filters the workbench by editing surface", async () => {
    const user = userEvent.setup();

    renderWithQuery(<ContentLibraryPage />);

    await screen.findByRole("button", { name: "row:Homepage" });
    await user.click(
      screen.getByRole("button", { name: "content:CONTENT_LIBRARY_EDIT_WITH_WRITING" }),
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "row:Launch note" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "row:Homepage" })).not.toBeInTheDocument();
    });
  });

  test("switches to a card list on narrow windows while keeping continue actions", async () => {
    setMatchMedia(true);

    renderWithQuery(<ContentLibraryPage />);

    expect(await screen.findByTestId("content-library-card-list")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "row:Homepage" })).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "CONTENT_LIBRARY_ACTION_CONTINUE" }).length,
    ).toBeGreaterThan(0);
    expect(getAllByI18nTail("CONTENT_LIBRARY_EDIT_WITH_CANVAS").length).toBeGreaterThan(0);
  });

  test("lets the user switch between table and card modes from the toolbar", async () => {
    const user = userEvent.setup();

    renderWithQuery(<ContentLibraryPage />);

    await screen.findByRole("button", { name: "row:Homepage" });
    expect(screen.queryByTestId("content-library-card-list")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "common:VIEW_MODE_CARD" }));
    expect(await screen.findByTestId("content-library-card-list")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "common:VIEW_MODE_TABLE" }));
    expect(await screen.findByRole("button", { name: "row:Homepage" })).toBeInTheDocument();
    expect(screen.queryByTestId("content-library-card-list")).not.toBeInTheDocument();
  });

  test("continues through a preview-backed editor URL from the summary drawer", async () => {
    const user = userEvent.setup();

    renderWithQuery(<ContentLibraryPage />);

    await user.click(await screen.findByRole("button", { name: "row:Homepage" }));
    await user.click(
      screen.getAllByRole("button", { name: "CONTENT_LIBRARY_ACTION_CONTINUE" })[0]!,
    );

    await waitFor(() => {
      expect(mocked.issueWorkspaceSitePreviewToken).toHaveBeenCalledWith("ws-1");
      expect(mocked.locationAssign).toHaveBeenCalledWith(
        expect.stringContaining(
          "/editor/site/site-1?token=preview-token&source=admin&itemId=content-1",
        ),
      );
    });
  });
});

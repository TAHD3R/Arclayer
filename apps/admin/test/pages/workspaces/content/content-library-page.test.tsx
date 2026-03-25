import type { ReactElement, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ContentLibraryPage } from "@/pages/workspaces/content/library/page";
import {
  contentLibrarySavedViewsStorageKey,
  contentLibraryViewStorageKey,
} from "@/pages/workspaces/content/library/utils";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

const mocked = vi.hoisted(() => ({
  listAllContentItems: vi.fn(),
  listAllContentModels: vi.fn(),
  getContentItemVersion: vi.fn(),
  getContentSeoProfile: vi.fn(),
  getWorkspacePublishImpact: vi.fn(),
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
        table: {},
        pageData,
        searchInput,
        setSearchInput,
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
    onViewModeChange?: (next: "card" | "table") => void;
    filters?: { role?: string; editWith?: string };
    onFiltersChange?: (next: { role?: string; editWith?: string }) => void;
    views?: Array<{ id: string; label: string; active?: boolean; onSelect?: () => void }>;
    onOpenViewsManager?: () => void;
  }) => (
    <div data-testid="content-library-toolbar">
      {(props.views ?? []).map((view) => (
        <button
          key={view.id}
          type="button"
          data-active={view.active ? "true" : "false"}
          onClick={view.onSelect}
        >
          {view.label}
        </button>
      ))}
      {props.onOpenViewsManager ? (
        <button type="button" onClick={props.onOpenViewsManager}>
          content:CONTENT_LIBRARY_ACTION_MANAGE_VIEWS
        </button>
      ) : null}
      <button
        type="button"
        data-active={props.filters?.role === "page" ? "true" : "false"}
        onClick={() => props.onFiltersChange?.({ role: "page" })}
      >
        content:CONTENT_LIBRARY_ROLE_PAGE
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
  return screen.getByText(
    (_, node) => node?.textContent === key || node?.textContent === `content:${key}`,
  );
}

function getAllByI18nTail(key: string) {
  return screen.getAllByText(
    (_, node) => node?.textContent === key || node?.textContent === `content:${key}`,
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
    window.localStorage.clear();
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
    expect(getByI18nTail("CONTENT_LIBRARY_VIEW_SITE_CONTENT")).toBeInTheDocument();
    expect(getByI18nTail("CONTENT_LIBRARY_VIEW_DRAFT")).toBeInTheDocument();
    expect(getByI18nTail("CONTENT_LIBRARY_VIEW_PUBLISHED")).toBeInTheDocument();
    expect(getByI18nTail("CONTENT_LIBRARY_VIEW_NEEDS_ATTENTION")).toBeInTheDocument();
  });

  test("hydrates the active view from route search and persists a new selection", async () => {
    const user = userEvent.setup();
    mocked.routeSearch.current = { view: "published" };

    renderWithQuery(<ContentLibraryPage />);

    const publishedButton = await screen.findByRole("button", {
      name: "content:CONTENT_LIBRARY_VIEW_PUBLISHED",
    });
    expect(publishedButton).toHaveAttribute("data-active", "true");

    await user.click(
      screen.getByRole("button", { name: "content:CONTENT_LIBRARY_VIEW_SITE_CONTENT" }),
    );

    expect(mocked.navigate).toHaveBeenCalled();
    expect(window.localStorage.getItem(contentLibraryViewStorageKey("ws-1"))).toBe("site-content");
  });

  test("recovers the persisted view when route search is absent", async () => {
    window.localStorage.setItem(contentLibraryViewStorageKey("ws-1"), "draft");

    renderWithQuery(<ContentLibraryPage />);

    expect(
      await screen.findByRole("button", { name: "content:CONTENT_LIBRARY_VIEW_DRAFT" }),
    ).toHaveAttribute("data-active", "true");
  });

  test("renders pinned saved views and applies their workbench state when selected", async () => {
    const user = userEvent.setup();

    window.localStorage.setItem(
      contentLibrarySavedViewsStorageKey("ws-1"),
      JSON.stringify([
        {
          id: "view-1",
          name: "Published launch",
          baseViewId: "published",
          query: "launch",
          filters: { status: "published" },
          pinned: true,
        },
      ]),
    );

    renderWithQuery(<ContentLibraryPage />);

    await user.click(await screen.findByRole("button", { name: "Published launch" }));

    await waitFor(() => {
      expect(mocked.navigate).toHaveBeenCalled();
    });

    expect(screen.getByRole("button", { name: "row:Launch note" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "row:Homepage" })).not.toBeInTheDocument();
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

  test("applies grouped surface pivots from the views manager", async () => {
    const user = userEvent.setup();

    renderWithQuery(<ContentLibraryPage />);

    await screen.findByRole("button", { name: "row:Homepage" });
    await user.click(
      screen.getByRole("button", { name: "content:CONTENT_LIBRARY_ACTION_MANAGE_VIEWS" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "content:CONTENT_LIBRARY_EDIT_WITH_WRITING" }),
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

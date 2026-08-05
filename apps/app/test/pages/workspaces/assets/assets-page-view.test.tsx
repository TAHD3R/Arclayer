import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AssetsPageView } from "@/pages/workspaces/assets/components/assets-page-view";

const mocked = vi.hoisted(() => ({
  getMyProjectAuthz: vi.fn(),
  listProjectPermissionActions: vi.fn(),
}));
const controllerState = { current: createControllerStub() };
const tableControllerState = { current: createTableControllerStub() };

vi.mock("@/layouts/page-shell/columns-page", () => ({
  ColumnsPage: ({
    title,
    action,
    extra,
    overlay,
    footer,
    sideSlots,
    children,
  }: Record<string, unknown>) => (
    <div>
      <div data-testid="columns-page-title">{title as React.ReactNode}</div>
      <div data-testid="columns-page-action">{action as React.ReactNode}</div>
      <div data-testid="columns-page-extra">{extra as React.ReactNode}</div>
      <div data-testid="columns-page-overlay">{overlay as React.ReactNode}</div>
      <div data-testid="columns-page-footer">{footer as React.ReactNode}</div>
      <div data-testid="columns-page-left-side">
        {
          (
            sideSlots as
              | {
                  left?: { content?: React.ReactNode };
                }
              | undefined
          )?.left?.content
        }
      </div>
      <div>{children as React.ReactNode}</div>
    </div>
  ),
}));

vi.mock("@/pages/workspaces/assets/hooks/use-assets-view-controller", () => ({
  useAssetsViewController: (projectId: string) => ({
    ...controllerState.current,
    projectId,
  }),
}));

vi.mock("@/pages/workspaces/assets/components/assets-view-table-section", () => ({
  AssetsViewTableSection: () => <div>table-section</div>,
  useAssetsViewTableController: () => tableControllerState.current,
}));

vi.mock("@/pages/workspaces/assets/components/assets-folder-strip", () => ({
  AssetsFolderStrip: ({
    canManageAssets,
    assetLibraryHasContent,
    folderEntries,
  }: {
    canManageAssets?: boolean;
    assetLibraryHasContent?: boolean;
    folderEntries?: unknown[];
  }) => (
    <div
      data-testid="assets-folder-strip"
      data-can-manage-assets={String(canManageAssets)}
      data-asset-library-has-content={String(assetLibraryHasContent)}
      data-folder-entry-count={String(folderEntries?.length ?? 0)}
    />
  ),
}));

vi.mock("@/pages/workspaces/assets/components/assets-folder-rail-recent-section", () => ({
  AssetsFolderRailRecentSection: ({ recentAssets }: { recentAssets?: unknown[] }) => (
    <div
      data-testid="assets-recent-sidebar"
      data-recent-count={String(recentAssets?.length ?? 0)}
    />
  ),
}));

vi.mock("@/pages/workspaces/assets/components/assets-view-dnd-surface", () => ({
  AssetsViewDndSurface: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/pages/workspaces/assets/components/assets-view-header", () => ({
  AssetsViewHeader: ({
    viewMode,
    onViewModeChange,
  }: {
    viewMode: "card" | "table";
    onViewModeChange: (next: "card" | "table") => void;
  }) => (
    <div>
      <div data-testid="assets-view-mode">{viewMode}</div>
      <button type="button" onClick={() => onViewModeChange("card")}>
        switch-card
      </button>
      <button type="button" onClick={() => onViewModeChange("table")}>
        switch-table
      </button>
    </div>
  ),
}));

vi.mock("@/pages/workspaces/assets/components/assets-view-masonry-section", () => ({
  AssetsViewMasonrySection: () => <div>masonry-section</div>,
}));

vi.mock("@/pages/workspaces/assets/components/assets-view-overlays", () => ({
  AssetsSelectionToolbar: ({
    t,
    selectedCount,
    canManageAssets,
    onClearSelection,
  }: {
    t: (key: string) => string;
    selectedCount: number;
    canManageAssets?: boolean;
    onClearSelection: () => void;
  }) =>
    selectedCount > 0 ? (
      <button
        type="button"
        data-can-manage-assets={String(canManageAssets)}
        onClick={onClearSelection}
      >
        {t("assets:ASSET_CLEAR_SELECTION")}
      </button>
    ) : null,
  AssetsViewOverlays: ({ canManageAssets }: { canManageAssets?: boolean }) => (
    <div data-testid="assets-view-overlays" data-can-manage-assets={String(canManageAssets)} />
  ),
}));

vi.mock("@/api/workspaces", () => ({
  getMyProjectAuthz: (...args: unknown[]) => mocked.getMyProjectAuthz(...args),
}));

vi.mock("@/api/rbac", () => ({
  listProjectPermissionActions: (...args: unknown[]) =>
    mocked.listProjectPermissionActions(...args),
}));

function renderWithQueryClient(component: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{component}</QueryClientProvider>);
}

function createMutationStub() {
  return {
    isPending: false,
    mutateAsync: vi.fn(),
  };
}

function createControllerStub(overrides: Record<string, unknown> = {}) {
  return {
    t: (key: string) => key,
    queryClient: { invalidateQueries: vi.fn() },
    projectId: "project-1",
    scope: null,
    scopeKey: "project:project-1",
    active: null,
    setActive: vi.fn(),
    openAssetDetails: vi.fn(),
    setSelection: vi.fn(),
    selectedIds: new Set<string>(),
    uploadOpen: false,
    setUploadOpen: vi.fn(),
    moveModalOpen: false,
    setMoveModalOpen: vi.fn(),
    bulkDeleteOpen: false,
    setBulkDeleteOpen: vi.fn(),
    createFolderOpen: false,
    setCreateFolderOpen: vi.fn(),
    createFolderParentId: null,
    setCreateFolderParentId: vi.fn(),
    createFolderSeedAssetIds: [],
    setCreateFolderSeedAssetIds: vi.fn(),
    createFolderSeedAssetCount: 0,
    editFolderOpen: false,
    setEditFolderOpen: vi.fn(),
    editFolderTarget: null,
    setEditFolderTarget: vi.fn(),
    moveFolderOpen: false,
    setMoveFolderOpen: vi.fn(),
    moveFolderTarget: null,
    setMoveFolderTarget: vi.fn(),
    deleteFolderOpen: false,
    setDeleteFolderOpen: vi.fn(),
    deleteFolderTarget: null,
    editAccessOpen: false,
    setEditAccessOpen: vi.fn(),
    editAccessMode: "bulk",
    editAccessCurrent: {},
    searchInput: "",
    setSearchInput: vi.fn(),
    currentFolderId: null,
    setCurrentFolderId: vi.fn(),
    setFocusedFolderId: vi.fn(),
    filters: {},
    setFilters: vi.fn(),
    ordering: "-created_at",
    setOrdering: vi.fn(),
    foldersQuery: {
      data: { items: [] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    },
    tagsQuery: {
      data: { items: [] },
      isLoading: false,
    },
    recentAssets: [],
    removeRecentAsset: vi.fn(),
    clearRecentAssets: vi.fn(),
    editAssetOpen: false,
    setEditAssetOpen: vi.fn(),
    editAssetTarget: null,
    assetDeleteOpen: false,
    setAssetDeleteOpen: vi.fn(),
    assetDeleteTarget: null,
    assetDeleteMutation: createMutationStub(),
    assetEditAccessOpen: false,
    setAssetEditAccessOpen: vi.fn(),
    assetEditAccessTarget: null,
    singleAssetAccessMutation: createMutationStub(),
    bulkMoveMutation: createMutationStub(),
    bulkDeleteMutation: createMutationStub(),
    bulkUpdateMutation: createMutationStub(),
    createFolderMutation: createMutationStub(),
    updateFolderMutation: createMutationStub(),
    deleteFolderMutation: createMutationStub(),
    openEditAssetDialog: vi.fn(),
    openEditAccessDialog: vi.fn(),
    createParentLabel: "",
    openBulkDeleteDialog: vi.fn(),
    openDeleteFolderDialog: vi.fn(),
    items: [],
    folderPath: [],
    dropSuccessPulse: null,
    draggingFolderId: null,
    draggingAssetIds: [],
    folderEntries: [],
    masonryEntries: [],
    assetLibraryHasAssets: true,
    assetLibraryHasContent: true,
    pagedAssetsQuery: {
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
      data: null,
    },
    assetsQuery: {
      isLoading: false,
      refetch: vi.fn(),
      data: { pages: [{ total: 1 }] },
    },
    explicitFilterActive: false,
    ...overrides,
  };
}

function createTableControllerStub(overrides: Record<string, unknown> = {}) {
  return {
    table: { getState: () => ({}) },
    rowHeight: "medium",
    setRowHeight: vi.fn(),
    wrapHeaders: false,
    setWrapHeaders: vi.fn(),
    toolsLabels: {
      columns: "columns",
      density: "density",
      viewOptions: "viewOptions",
      refresh: "refresh",
      reset: "reset",
    },
    resetColumnVisibility: vi.fn(),
    refreshing: false,
    onRowClick: vi.fn(),
    ...overrides,
  };
}

describe("AssetsPageView", () => {
  beforeEach(() => {
    window.localStorage.clear();
    controllerState.current = createControllerStub();
    tableControllerState.current = createTableControllerStub();
    mocked.getMyProjectAuthz.mockReset();
    mocked.listProjectPermissionActions.mockReset();
    mocked.getMyProjectAuthz.mockResolvedValue({
      projectId: "project-1",
      isSuperuser: false,
      permissionCodes: ["project:assets:read", "project:assets:manage"],
    });
    mocked.listProjectPermissionActions.mockResolvedValue([
      {
        code: "project:assets:manage",
        description: "Manage asset library files and folders.",
        subjectKinds: ["project_member"],
        permissionCodes: ["project:assets:manage"],
      },
    ]);
  });

  it("moves folder creation into the header action before upload", async () => {
    const user = userEvent.setup();
    const setCreateFolderParentId = vi.fn();
    const setCreateFolderOpen = vi.fn();
    controllerState.current = createControllerStub({
      currentFolderId: "folder-1",
      setCreateFolderParentId,
      setCreateFolderOpen,
    });

    renderWithQueryClient(<AssetsPageView projectId="project-1" />);

    const actions = within(screen.getByTestId("columns-page-action")).getAllByRole("button");
    expect(actions[0]).toHaveAttribute("aria-label", "common:SIDEBAR_TOGGLE");
    expect(actions[0]).toHaveClass("border");
    expect(actions[1]).toHaveTextContent("assets:ASSET_ACTION_CREATE_FOLDER");
    expect(actions[1]).toHaveClass("border");
    expect(actions[2]).toHaveTextContent("assets:ASSET_ACTION_UPLOAD");
    expect(screen.getByRole("button", { name: "assets:ASSET_ACTION_UPLOAD" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "assets:ASSET_ACTION_CREATE_FOLDER" }));

    expect(setCreateFolderParentId).toHaveBeenCalledWith("folder-1");
    expect(setCreateFolderOpen).toHaveBeenCalledWith(true);
  });

  it("keeps the recent-files sidebar behind the header toggle", async () => {
    const user = userEvent.setup();
    controllerState.current = createControllerStub({
      recentAssets: [{ key: "asset-1", asset: { id: "asset-1" }, visitedAt: "2026-04-27" }],
    });

    renderWithQueryClient(<AssetsPageView projectId="project-1" />);

    expect(screen.getByTestId("assets-recent-sidebar")).toHaveAttribute("data-recent-count", "1");

    await user.click(screen.getByRole("button", { name: "common:SIDEBAR_TOGGLE" }));

    expect(screen.queryByTestId("assets-recent-sidebar")).not.toBeInTheDocument();
  });

  it("uses the current folder name as the page title", () => {
    controllerState.current = createControllerStub({
      currentFolderId: "folder-1",
      folderPath: [
        {
          id: "folder-1",
          name: "Campaign assets",
          createdAt: "2026-04-27T00:00:00Z",
        },
      ],
    });

    renderWithQueryClient(<AssetsPageView projectId="project-1" />);

    expect(screen.getByTestId("columns-page-title")).toHaveTextContent("Campaign assets");
  });

  it("passes folder entries and asset existence into the main-pane folder strip", () => {
    controllerState.current = createControllerStub({
      assetLibraryHasAssets: false,
      assetLibraryHasContent: true,
      folderEntries: [{ kind: "folder", folder: { id: "folder-1", name: "Campaign" } }],
    });

    renderWithQueryClient(<AssetsPageView projectId="project-1" />);

    expect(screen.getByTestId("assets-folder-strip")).toHaveAttribute(
      "data-asset-library-has-content",
      "true",
    );
    expect(screen.getByTestId("assets-folder-strip")).toHaveAttribute(
      "data-folder-entry-count",
      "1",
    );
  });

  it("keeps the main-pane folder strip exclusive to card mode", async () => {
    const user = userEvent.setup();
    controllerState.current = createControllerStub({
      folderEntries: [{ kind: "folder", folder: { id: "folder-1", name: "Campaign" } }],
    });

    renderWithQueryClient(<AssetsPageView projectId="project-1" />);

    expect(screen.getByTestId("assets-folder-strip")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "switch-table" }));

    expect(screen.queryByTestId("assets-folder-strip")).not.toBeInTheDocument();
  });

  it("keeps the bulk selection toolbar visible after switching to table mode", async () => {
    const user = userEvent.setup();
    controllerState.current = createControllerStub({
      selectedIds: new Set(["asset-1"]),
      assetsQuery: {
        isLoading: false,
        refetch: vi.fn(),
        data: { pages: [{ total: 2 }] },
      },
    });

    renderWithQueryClient(<AssetsPageView projectId="project-1" />);

    await user.click(screen.getByRole("button", { name: "switch-table" }));

    expect(screen.getByTestId("assets-view-mode")).toHaveTextContent("table");
    expect(screen.getByTestId("columns-page-overlay")).toBeEmptyDOMElement();
    expect(screen.getByTestId("columns-page-footer")).not.toBeEmptyDOMElement();
    expect(
      screen.getByRole("button", { name: "assets:ASSET_CLEAR_SELECTION" }),
    ).toBeInTheDocument();
  });

  it("clears selection from the footer toolbar action", async () => {
    const user = userEvent.setup();
    const setSelection = vi.fn();
    controllerState.current = createControllerStub({
      selectedIds: new Set(["asset-1"]),
      setSelection,
      assetsQuery: {
        isLoading: false,
        refetch: vi.fn(),
        data: { pages: [{ total: 2 }] },
      },
    });

    renderWithQueryClient(<AssetsPageView projectId="project-1" />);

    await user.click(screen.getByRole("button", { name: "assets:ASSET_CLEAR_SELECTION" }));

    expect(setSelection).toHaveBeenCalledTimes(1);
    expect(setSelection).toHaveBeenCalledWith(expect.any(Function));
  });

  it("enters read-only mode when asset management access is missing", async () => {
    controllerState.current = createControllerStub({
      scope: { type: "project", id: "project-1" },
      selectedIds: new Set(["asset-1"]),
    });
    mocked.getMyProjectAuthz.mockResolvedValue({
      projectId: "project-1",
      isSuperuser: false,
      permissionCodes: ["project:assets:read"],
    });

    renderWithQueryClient(<AssetsPageView projectId="project-1" />);

    expect(await screen.findByTestId("assets-read-only-notice")).toHaveTextContent(
      "assets:ASSET_LIBRARY_NO_ACCESS_DESC",
    );
    expect(screen.getByRole("button", { name: "assets:ASSET_ACTION_UPLOAD" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "assets:ASSET_ACTION_CREATE_FOLDER" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "assets:ASSET_CLEAR_SELECTION" })).toHaveAttribute(
      "data-can-manage-assets",
      "false",
    );
    expect(screen.getByTestId("assets-folder-strip")).toHaveAttribute(
      "data-can-manage-assets",
      "false",
    );
    expect(screen.getByTestId("assets-view-overlays")).toHaveAttribute(
      "data-can-manage-assets",
      "false",
    );
  });

  it("adds bottom breathing room to the assets content region", () => {
    const { container } = renderWithQueryClient(<AssetsPageView projectId="project-1" />);

    expect(
      container.querySelector(".overflow-x-hidden.overflow-y-auto.pb-8.scrollbar-none"),
    ).not.toBeNull();
  });

  it("clears selection before opening the asset preview dialog", async () => {
    const setSelection = vi.fn();
    const setActive = vi.fn();
    const openAssetDetails = vi.fn();
    controllerState.current = createControllerStub({
      items: [
        {
          id: "asset-1",
          name: "Hero image",
          previewUrl: "https://cdn.example.com/hero.png",
        },
      ],
      selectedIds: new Set(["asset-1"]),
      setSelection,
      setActive,
      openAssetDetails,
    });

    renderWithQueryClient(<AssetsPageView projectId="project-1" initialAssetId="asset-1" />);

    await waitFor(() => {
      expect(openAssetDetails).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "asset-1",
        }),
      );
    });
    expect(setSelection).not.toHaveBeenCalled();
    expect(setActive).not.toHaveBeenCalled();
  });
});

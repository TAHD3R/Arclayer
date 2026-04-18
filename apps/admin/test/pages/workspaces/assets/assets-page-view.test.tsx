import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { STORAGE_KEYS } from "@/constants/storage";
import { AssetsPageView } from "@/pages/workspaces/assets/components/assets-page-view";

const controllerState = { current: createControllerStub() };
const tableControllerState = { current: createTableControllerStub() };

vi.mock("@/layouts/page-shell/columns-page", () => ({
  ColumnsPage: ({
    action,
    extra,
    overlay,
    footer,
    sideSlots,
    children,
  }: Record<string, unknown>) => (
    <div>
      <div data-testid="columns-page-action">{action as React.ReactNode}</div>
      <div data-testid="columns-page-extra">{extra as React.ReactNode}</div>
      <div data-testid="columns-page-overlay">{overlay as React.ReactNode}</div>
      <div data-testid="columns-page-footer">{footer as React.ReactNode}</div>
      <div data-testid="columns-page-right-slot">
        {sideSlots && typeof sideSlots === "object" && "right" in sideSlots ? "visible" : "hidden"}
      </div>
      <div data-testid="columns-page-right-slot-sticky">
        {sideSlots &&
        typeof sideSlots === "object" &&
        "right" in sideSlots &&
        sideSlots.right &&
        typeof sideSlots.right === "object" &&
        "sticky" in sideSlots.right
          ? String(sideSlots.right.sticky)
          : "false"}
      </div>
      <div data-testid="columns-page-right-slot-content">
        {sideSlots &&
        typeof sideSlots === "object" &&
        "right" in sideSlots &&
        sideSlots.right &&
        typeof sideSlots.right === "object" &&
        "content" in sideSlots.right
          ? (sideSlots.right.content as React.ReactNode)
          : null}
      </div>
      <div>{children as React.ReactNode}</div>
    </div>
  ),
}));

vi.mock("@/pages/workspaces/assets/hooks/use-assets-view-controller", () => ({
  useAssetsViewController: () => controllerState.current,
}));

vi.mock("@/pages/workspaces/assets/components/assets-view-table-section", () => ({
  AssetsViewTableSection: () => <div>table-section</div>,
  useAssetsViewTableController: () => tableControllerState.current,
}));

vi.mock("@/pages/workspaces/assets/components/assets-folder-rail", () => ({
  AssetsFolderRail: () => <div>folder-rail</div>,
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
  }: {
    t: (key: string) => string;
    selectedCount: number;
  }) =>
    selectedCount > 0 ? <button type="button">{t("assets:ASSET_CLEAR_SELECTION")}</button> : null,
  AssetsViewOverlays: () => null,
}));

vi.mock("@/api/workspaces", () => ({
  getWorkspaceDetail: vi.fn().mockResolvedValue({
    id: "ws-1",
    name: "Workspace Alpha",
    iconMode: "initials",
    iconColor: "#337ea9",
    iconGlyph: null,
    iconEmoji: null,
    iconUrl: null,
  }),
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
    scope: null,
    scopeKey: "workspace:ws-1",
    active: null,
    setActive: vi.fn(),
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
    masonryEntries: [],
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
    controllerState.current = createControllerStub();
    tableControllerState.current = createTableControllerStub();
    window.localStorage.removeItem(STORAGE_KEYS.assetsFolderRailOpen);
  });

  it("shows the folder rail by default and persists the user's collapse choice", async () => {
    const user = userEvent.setup();

    renderWithQueryClient(<AssetsPageView />);

    expect(screen.getByRole("button", { name: "common:SIDEBAR_TOGGLE" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "assets:ASSET_ACTION_UPLOAD" })).toBeInTheDocument();
    expect(screen.getByTestId("columns-page-right-slot")).toHaveTextContent("visible");
    expect(screen.getByTestId("columns-page-right-slot-sticky")).toHaveTextContent("true");
    expect(window.localStorage.getItem(STORAGE_KEYS.assetsFolderRailOpen)).toBeNull();

    await user.click(screen.getByRole("button", { name: "common:SIDEBAR_TOGGLE" }));

    expect(screen.getByTestId("columns-page-right-slot")).toHaveTextContent("hidden");
    expect(window.localStorage.getItem(STORAGE_KEYS.assetsFolderRailOpen)).toBe("false");
  });

  it("honors a persisted collapsed rail preference on revisit", () => {
    window.localStorage.setItem(STORAGE_KEYS.assetsFolderRailOpen, "false");

    renderWithQueryClient(<AssetsPageView />);

    expect(screen.getByTestId("columns-page-right-slot")).toHaveTextContent("hidden");
  });

  it("hides the card-mode sidebar entirely when the root library is empty", () => {
    controllerState.current = createControllerStub({
      assetsQuery: {
        isLoading: false,
        refetch: vi.fn(),
        data: { pages: [{ total: 0 }] },
      },
      items: [],
      currentFolderId: null,
      explicitFilterActive: false,
    });

    renderWithQueryClient(<AssetsPageView />);

    expect(screen.getByTestId("columns-page-right-slot")).toHaveTextContent("hidden");
    expect(screen.queryByRole("button", { name: "common:SIDEBAR_TOGGLE" })).not.toBeInTheDocument();
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

    renderWithQueryClient(<AssetsPageView />);

    await user.click(screen.getByRole("button", { name: "switch-table" }));

    expect(screen.getByTestId("assets-view-mode")).toHaveTextContent("table");
    expect(screen.getByTestId("columns-page-right-slot")).toHaveTextContent("hidden");
    expect(screen.getByTestId("columns-page-overlay")).toBeEmptyDOMElement();
    expect(screen.getByTestId("columns-page-footer")).not.toBeEmptyDOMElement();
    expect(
      screen.getByRole("button", { name: "assets:ASSET_CLEAR_SELECTION" }),
    ).toBeInTheDocument();
  });

  it("adds bottom breathing room to the assets content region", () => {
    const { container } = renderWithQueryClient(<AssetsPageView />);

    expect(
      container.querySelector(".overflow-x-hidden.overflow-y-auto.pb-8.scrollbar-none"),
    ).not.toBeNull();
  });
});

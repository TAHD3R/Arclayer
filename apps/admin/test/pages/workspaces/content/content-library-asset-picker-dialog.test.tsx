import * as React from "react";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  explorer: {
    assetsListQueryKey: ["assets", "list"],
    currentFolderId: null as string | null,
    folderById: new Map<string, { id: string; parentId?: string | null }>(),
    folderPath: [] as Array<{ id: string; name: string }>,
    filters: {
      createdFrom: undefined,
      createdTo: undefined,
      mimePrefix: "image/",
      tagIds: [],
      visibility: "public",
    },
    focusedFolderId: null as string | null,
    infiniteAssetsQuery: {
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetching: false,
      isFetchingNextPage: false,
      isLoading: false,
    },
    items: [
      {
        id: "asset-1",
        mimeType: "image/png",
        name: "hero.png",
        previewUrl: "https://cdn.example/hero.png",
        purpose: "library",
        sizeText: "240 KB",
        visibility: "public",
      },
    ],
    masonryEntries: [
      {
        asset: {
          id: "asset-1",
          mimeType: "image/png",
          name: "hero.png",
          previewUrl: "https://cdn.example/hero.png",
          purpose: "library",
          sizeText: "240 KB",
          visibility: "public",
        },
        kind: "asset",
      },
    ],
    ordering: "-created_at",
    page: 1,
    pageSize: 12,
    pagedAssetsQuery: {
      data: { items: [] },
      isFetching: false,
      isLoading: false,
    },
    searchInput: "",
    searchQuery: "",
    setCurrentFolderId: vi.fn(),
    setFilters: vi.fn(),
    setFocusedFolderId: vi.fn(),
    setOrdering: vi.fn(),
    setPage: vi.fn(),
    setPageSize: vi.fn(),
    setSearchInput: vi.fn(),
    setSearchQuery: vi.fn(),
    tagsQuery: {
      data: { items: [] },
      isLoading: false,
    },
    total: 1,
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      typeof options?.count === "number" ? `${key}:${options.count}` : key,
  }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

vi.mock("masonic", () => ({
  Masonry: ({
    items,
    render: renderItem,
  }: {
    items: Array<{ key: string; data: unknown }>;
    render: (item: { data: unknown }) => React.ReactNode;
  }) => (
    <div>
      {items.map((item) => (
        <div key={item.key}>{renderItem({ data: item })}</div>
      ))}
    </div>
  ),
}));

vi.mock("@/pages/workspaces/assets/components/explorer/use-assets-explorer-controller", () => ({
  useAssetsExplorerController: () => mocked.explorer,
}));

vi.mock("@/pages/workspaces/assets/components/asset-upload-dialog", () => ({
  AssetUploadDialog: () => null,
}));

vi.mock("@/pages/workspaces/assets/components/assets-filter-popover", () => ({
  AssetsFilterPopover: () => <div>filters</div>,
}));

vi.mock("@/components/common/data-pagination-controls", () => ({
  DataPaginationControls: () => <div>pagination</div>,
}));

vi.mock("@/pages/workspaces/assets/components/lazy-asset-image", () => ({
  LazyAssetImage: ({ alt, className, src }: { alt?: string; className?: string; src?: string }) => (
    <img alt={alt} className={className} src={src} />
  ),
}));

vi.mock("@/pages/workspaces/assets/components/asset-masonry-card", () => ({
  AssetMasonryTile: ({
    asset,
    onSelect,
  }: {
    asset: { name: string };
    onSelect: (event: { detail: number }) => void;
  }) => (
    <button type="button" onClick={() => onSelect({ detail: 1 })}>
      {asset.name}
    </button>
  ),
}));

vi.mock("@/pages/workspaces/assets/components/asset-masonry-tile", () => ({
  getMimeLabel: () => "Image",
  getPurposeLabel: () => "Library",
  getVisibilityLabel: () => "Public",
}));

vi.mock("@/pages/workspaces/assets/components/explorer/assets-explorer-folder-tiles", () => ({
  AssetsExplorerFolderTile: () => <div>folder</div>,
  AssetsExplorerFolderUpTile: () => <div>up</div>,
}));

vi.mock("@arclayer/ui/setting-dialog", () => ({
  SettingDialog: ({
    children,
    footer,
    open,
  }: {
    children?: React.ReactNode;
    footer?: React.ReactNode;
    open: boolean;
  }) =>
    open ? (
      <div>
        {children}
        {footer}
      </div>
    ) : null,
}));

vi.mock("@arclayer/ui/chrome-tabs", () => ({
  ChromeTabs: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  ChromeTabsContent: ({ children }: { children?: React.ReactNode; value?: string }) => (
    <div>{children}</div>
  ),
  ChromeTabsList: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  ChromeTabsTrigger: ({ children, value }: { children?: React.ReactNode; value?: string }) => (
    <button type="button">{children ?? value}</button>
  ),
}));

import { AssetPickerDialog } from "@/pages/workspaces/assets/components/asset-picker-dialog";

describe("content-library-asset-picker-dialog", () => {
  beforeEach(() => {
    mocked.explorer.infiniteAssetsQuery.fetchNextPage.mockReset();
    mocked.explorer.setCurrentFolderId.mockReset();
    mocked.explorer.setFilters.mockReset();
    mocked.explorer.setFocusedFolderId.mockReset();
    mocked.explorer.setOrdering.mockReset();
    mocked.explorer.setSearchInput.mockReset();
    mocked.explorer.setSearchQuery.mockReset();
  });

  it("renders library and upload tabs with selectable assets", () => {
    render(
      <AssetPickerDialog
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        scope={{ id: "ws-1", type: "workspace" }}
        value={{ assetIds: ["asset-1"] }}
      />,
    );

    expect(
      screen.getByRole("button", { name: "assets:ASSET_PURPOSE_LIBRARY" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "assets:ASSET_ACTION_UPLOAD" }).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "hero.png" })).toBeInTheDocument();
  });

  it("confirms the selected asset using the picker contract", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <AssetPickerDialog
        open
        onOpenChange={vi.fn()}
        onConfirm={onConfirm}
        scope={{ id: "ws-1", type: "workspace" }}
        value={{ assetIds: ["asset-1"] }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "hero.png" }));
    await user.click(screen.getByRole("button", { name: "common:CONFIRM" }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith({ assetIds: ["asset-1"] });
    });
  });
});

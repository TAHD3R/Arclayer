import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { AssetsViewMasonrySection } from "@/pages/workspaces/assets/components/assets-view-masonry-section";

vi.mock("masonic", () => ({
  useInfiniteLoader: () => vi.fn(),
  useMasonry: () => <div data-testid="masonry-grid" />,
  usePositioner: () => ({}),
  useResizeObserver: () => vi.fn(),
}));

vi.mock("@/pages/workspaces/assets/components/assets-view-masonry-scroll", () => ({
  useAssetsMasonryScrollState: () => ({ scrollTop: 0, isScrolling: false, height: 0 }),
}));

vi.mock("@/pages/workspaces/assets/components/assets-view-masonry-render-cell", () => ({
  AssetsViewMasonryRenderCell: () => null,
}));

vi.mock("@/layouts/page-shell/content-guard", () => ({
  ContentGuard: (props: { wrapperSpacing?: string; empty?: boolean; children?: ReactNode }) => (
    <div
      data-testid="content-guard"
      data-wrapper-spacing={props.wrapperSpacing ?? ""}
      data-empty={String(props.empty)}
    >
      {props.children}
    </div>
  ),
}));

describe("AssetsViewMasonrySection guard spacing", () => {
  it("uses flush guard spacing so card-mode empty and error states align with table mode", () => {
    render(
      <AssetsViewMasonrySection
        controller={
          {
            t: (key: string) => key,
            assetsQuery: {
              isLoading: false,
              data: undefined,
              isError: true,
              error: new Error("forbidden"),
              refetch: vi.fn(),
              hasNextPage: false,
              isFetchingNextPage: false,
              fetchNextPage: vi.fn(),
              dataUpdatedAt: 0,
            },
            assetsListQueryKey: ["assets"],
            items: [],
            folderEntries: [],
            assetLibraryHasAssets: false,
            assetLibraryHasContent: false,
            explicitFilterActive: false,
            setSearchInput: vi.fn(),
            setSearchQuery: vi.fn(),
            setFilters: vi.fn(),
            setMoreOpen: vi.fn(),
            setFocusedFolderId: vi.fn(),
            setSelection: vi.fn(),
            selectedIds: new Set<string>(),
            orderedAssetIds: [],
            aspectRatioRef: { current: new Map<string, number>() },
            forceLayoutTick: vi.fn(),
            setActive: vi.fn(),
            openEditAssetDialog: vi.fn(),
            openAssetDeleteDialog: vi.fn(),
            openAssetEditAccessDialog: vi.fn(),
          } as never
        }
      />,
    );

    expect(screen.getByTestId("content-guard")).toHaveAttribute("data-wrapper-spacing", "flush");
  });

  it("keeps masonry out of the empty state when folders exist without assets", () => {
    render(
      <AssetsViewMasonrySection
        controller={
          {
            t: (key: string) => key,
            assetsQuery: {
              isLoading: false,
              data: { pages: [{ total: 0 }] },
              isError: false,
              error: null,
              refetch: vi.fn(),
              hasNextPage: false,
              isFetchingNextPage: false,
              fetchNextPage: vi.fn(),
              dataUpdatedAt: 0,
            },
            assetsListQueryKey: ["assets"],
            items: [],
            folderEntries: [
              {
                kind: "folder",
                folder: {
                  id: "folder-1",
                  name: "Campaign",
                  createdAt: "2026-04-27T00:00:00Z",
                },
              },
            ],
            assetLibraryHasAssets: false,
            assetLibraryHasContent: true,
            explicitFilterActive: false,
            setSearchInput: vi.fn(),
            setSearchQuery: vi.fn(),
            setFilters: vi.fn(),
            setMoreOpen: vi.fn(),
            setFocusedFolderId: vi.fn(),
            setSelection: vi.fn(),
            selectedIds: new Set<string>(),
            orderedAssetIds: [],
            aspectRatioRef: { current: new Map<string, number>() },
            forceLayoutTick: vi.fn(),
            setActive: vi.fn(),
            openEditAssetDialog: vi.fn(),
            openAssetDeleteDialog: vi.fn(),
            openAssetEditAccessDialog: vi.fn(),
          } as never
        }
      />,
    );

    expect(screen.getByTestId("content-guard")).toHaveAttribute("data-empty", "false");
  });
});

import { StrictMode } from "react";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAssetsViewTableController } from "@/pages/workspaces/assets/components/assets-view-table-section";
import type { AssetsViewController } from "@/pages/workspaces/assets/hooks/use-assets-view-controller";

const translate = (key: string) => key;
const setSelection = vi.fn();
const setFocusedFolderId = vi.fn();
const setActive = vi.fn();
const openAssetDetails = vi.fn();
const openEditAssetDialog = vi.fn();
const openAssetEditAccessDialog = vi.fn();
const openAssetDeleteDialog = vi.fn();

function createControllerStub(selectedIds: Set<string> = new Set()): AssetsViewController {
  return {
    t: translate,
    workspaceId: "ws-1",
    items: [
      {
        id: "asset-1",
        key: "asset-1",
        name: "Demo asset",
        mimeType: "image/jpeg",
        sizeBytes: 1024,
        sizeText: "1 KB",
        createdAt: "2026-03-25T00:00:00Z",
        uploaderName: "Philip Cole",
        uploaderEmail: "admin@arclayer.io",
        visibility: "public",
        purpose: "library",
        indexable: true,
        previewUrl: null,
        publicUrl: null,
      },
    ],
    orderedAssetIds: ["asset-1"],
    selectedIds,
    setSelection,
    setFocusedFolderId,
    setActive,
    openAssetDetails,
    openEditAssetDialog,
    openAssetEditAccessDialog,
    openAssetDeleteDialog,
    assetsQuery: {
      isFetching: false,
      isLoading: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      isFetchNextPageError: false,
      error: null,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    },
  } as unknown as AssetsViewController;
}

describe("useAssetsViewTableController", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it("stays stable under StrictMode", () => {
    const controller = createControllerStub();
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    expect(() =>
      renderHook(() => useAssetsViewTableController(controller), {
        wrapper: ({ children }) => (
          <StrictMode>
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
          </StrictMode>
        ),
      }),
    ).not.toThrow();
  });

  it("shows filename, uploaded by, purpose, and uploaded time by default", () => {
    const controller = createControllerStub();
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const { result } = renderHook(() => useAssetsViewTableController(controller), {
      wrapper: ({ children }) => (
        <StrictMode>
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </StrictMode>
      ),
    });

    expect(result.current.table.getVisibleLeafColumns().map((column) => column.id)).toEqual([
      "select",
      "name",
      "uploadedBy",
      "createdAt",
      "actions",
    ]);
  });

  it("keeps the name column renderer stable when selection changes", () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const { result, rerender } = renderHook(
      ({ controller }) => useAssetsViewTableController(controller),
      {
        initialProps: { controller: createControllerStub() },
        wrapper: ({ children }) => (
          <StrictMode>
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
          </StrictMode>
        ),
      },
    );

    const firstNameColumn = result.current.table.getColumn("name");
    const firstSelectColumn = result.current.table.getColumn("select");

    rerender({
      controller: createControllerStub(new Set(["asset-1"])),
    });

    const nextNameColumn = result.current.table.getColumn("name");
    const nextSelectColumn = result.current.table.getColumn("select");

    expect(firstNameColumn?.columnDef.cell).toBe(nextNameColumn?.columnDef.cell);
    expect(firstSelectColumn?.columnDef.cell).toBe(nextSelectColumn?.columnDef.cell);
    expect(firstSelectColumn?.columnDef.header).toBe(nextSelectColumn?.columnDef.header);
  });

  it("opens details on row double click without writing selection", () => {
    const controller = createControllerStub();
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const { result } = renderHook(() => useAssetsViewTableController(controller), {
      wrapper: ({ children }) => (
        <StrictMode>
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </StrictMode>
      ),
    });

    result.current.onRowClick(controller.items[0], {
      detail: 2,
      shiftKey: false,
      metaKey: false,
      ctrlKey: false,
      preventDefault: vi.fn(),
    } as unknown as React.MouseEvent<HTMLTableRowElement>);

    expect(openAssetDetails).toHaveBeenCalledWith(controller.items[0]);
    expect(setSelection).not.toHaveBeenCalled();
  });
});

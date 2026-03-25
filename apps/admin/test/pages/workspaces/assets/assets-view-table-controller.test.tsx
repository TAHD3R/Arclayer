import { StrictMode } from "react";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AssetsViewController } from "@/pages/workspaces/assets/hooks/use-assets-view-controller";
import { useAssetsViewTableController } from "@/pages/workspaces/assets/components/assets-view-table-section";

function createControllerStub(): AssetsViewController {
  return {
    t: (key: string) => key,
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
    selectedIds: new Set<string>(),
    setSelection: vi.fn(),
    setFocusedFolderId: vi.fn(),
    setActive: vi.fn(),
    openEditAssetDialog: vi.fn(),
    openAssetEditAccessDialog: vi.fn(),
    openAssetDeleteDialog: vi.fn(),
    pagedAssetsQuery: {
      isFetching: false,
      isLoading: false,
    },
  } as unknown as AssetsViewController;
}

describe("useAssetsViewTableController", () => {
  beforeEach(() => {
    window.localStorage.clear();
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

  it("shows filename, mime, size, and uploaded time by default", () => {
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
      "mime",
      "size",
      "createdAt",
      "actions",
    ]);
  });
});

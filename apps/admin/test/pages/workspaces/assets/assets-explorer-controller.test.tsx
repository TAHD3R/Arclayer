import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type React from "react";

import { useAssetsExplorerController } from "@/pages/workspaces/assets/components/explorer/use-assets-explorer-controller";
import type { AdminAssetFolder, AdminAssetSummary, PageData } from "@/types/api";

const mocked = vi.hoisted(() => ({
  listAssets: vi.fn(),
  listAssetFolders: vi.fn(),
  listAssetTags: vi.fn(),
  listOrganizationAssets: vi.fn(),
  listOrganizationAssetFolders: vi.fn(),
  listOrganizationAssetTags: vi.fn(),
}));

vi.mock("@/api/assets", () => ({
  listAssets: (...args: unknown[]) => mocked.listAssets(...args),
  listAssetFolders: (...args: unknown[]) => mocked.listAssetFolders(...args),
  listAssetTags: (...args: unknown[]) => mocked.listAssetTags(...args),
  listOrganizationAssets: (...args: unknown[]) => mocked.listOrganizationAssets(...args),
  listOrganizationAssetFolders: (...args: unknown[]) =>
    mocked.listOrganizationAssetFolders(...args),
  listOrganizationAssetTags: (...args: unknown[]) => mocked.listOrganizationAssetTags(...args),
}));

function page<T>(items: T[], total = items.length): PageData<T> {
  return {
    items,
    total,
    page: 1,
    size: Math.max(items.length, 1),
    pages: total > 0 ? 1 : 0,
    next: null,
    prev: null,
  };
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return function Wrapper(props: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>;
  };
}

describe("useAssetsExplorerController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.listAssets.mockResolvedValue(page<AdminAssetSummary>([], 0));
    mocked.listAssetFolders.mockResolvedValue(page([], 0));
    mocked.listAssetTags.mockResolvedValue(page([], 0));
    mocked.listOrganizationAssets.mockResolvedValue(page<AdminAssetSummary>([], 0));
    mocked.listOrganizationAssetFolders.mockResolvedValue(page([], 0));
    mocked.listOrganizationAssetTags.mockResolvedValue(page([], 0));
  });

  it("shows all assets at root and includes child assets inside a folder", async () => {
    const { result } = renderHook(
      () =>
        useAssetsExplorerController({
          scope: { type: "project", id: "project-1" },
          pagination: "infinite",
          purpose: "library",
          defaultVisibility: "public",
        }),
      {
        wrapper: createWrapper(),
      },
    );

    const rootParams = result.current.assetsListQueryKey.at(-1) as Record<string, unknown>;
    expect(rootParams).not.toHaveProperty("folderIsNull");
    expect(rootParams).not.toHaveProperty("folderId");

    await waitFor(() =>
      expect(mocked.listAssets).toHaveBeenCalledWith(
        "project-1",
        expect.not.objectContaining({
          folderIsNull: true,
        }),
      ),
    );

    act(() => {
      result.current.setCurrentFolderId("folder-1");
    });

    const folderParams = result.current.assetsListQueryKey.at(-1) as Record<string, unknown>;
    expect(folderParams).toMatchObject({
      folderId: "folder-1",
      includeChildren: true,
    });
    expect(folderParams).not.toHaveProperty("folderIsNull");

    await waitFor(() =>
      expect(mocked.listAssets).toHaveBeenCalledWith(
        "project-1",
        expect.objectContaining({
          folderId: "folder-1",
          includeChildren: true,
        }),
      ),
    );
  });

  it("treats folders as library content when there are no assets", async () => {
    mocked.listAssets.mockResolvedValue(page<AdminAssetSummary>([], 0));
    mocked.listAssetFolders.mockResolvedValue(
      page<AdminAssetFolder>([
        {
          id: "folder-1",
          name: "Campaign",
          description: null,
          createdAt: "2026-04-27T00:00:00Z",
        },
      ]),
    );

    const { result } = renderHook(
      () =>
        useAssetsExplorerController({
          scope: { type: "project", id: "project-1" },
          pagination: "infinite",
          purpose: "library",
          defaultVisibility: "public",
        }),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => expect(result.current.folderEntries).toHaveLength(1));

    expect(result.current.assetLibraryHasAssets).toBe(false);
    expect(result.current.assetLibraryHasContent).toBe(true);
  });
});

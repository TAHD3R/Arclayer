import { StrictMode } from "react";
import { flexRender } from "@tanstack/react-table";
import { render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAssetsViewTableController } from "@/pages/workspaces/assets/components/assets-view-table-section";
import type { AssetsViewController } from "@/pages/workspaces/assets/hooks/use-assets-view-controller";

const translate = (key: string) => key;
const setSelection = vi.fn();
const setFocusedFolderId = vi.fn();
const setActive = vi.fn();
const setCurrentFolderId = vi.fn();
const setEditFolderTarget = vi.fn();
const setEditFolderOpen = vi.fn();
const setMoveFolderTarget = vi.fn();
const setMoveFolderOpen = vi.fn();
const openDeleteFolderDialog = vi.fn();
const openAssetDetails = vi.fn();
const openEditAssetDialog = vi.fn();
const openAssetEditAccessDialog = vi.fn();
const openAssetDeleteDialog = vi.fn();

function createControllerStub(selectedIds: Set<string> = new Set()): AssetsViewController {
  return {
    t: translate,
    projectId: "project-1",
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
    assetLibraryHasAssets: true,
    assetLibraryHasContent: true,
    currentFolderId: null,
    folderPath: [],
    folderEntries: [],
    selectedIds,
    setSelection,
    setCurrentFolderId,
    setFocusedFolderId,
    setActive,
    setEditFolderTarget,
    setEditFolderOpen,
    setMoveFolderTarget,
    setMoveFolderOpen,
    openDeleteFolderDialog,
    dropSuccessPulse: null,
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

  it("prepends folder rows and enters folders from table row clicks", () => {
    const controller = {
      ...createControllerStub(),
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
    } as AssetsViewController;
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

    const rows = result.current.table.getRowModel().rows;
    expect(rows.map((row) => row.original.kind)).toEqual(["folder", "asset"]);

    result.current.onRowClick(rows[0].original, {
      detail: 1,
      shiftKey: false,
      metaKey: false,
      ctrlKey: false,
      preventDefault: vi.fn(),
    } as unknown as React.MouseEvent<HTMLTableRowElement>);

    expect(setCurrentFolderId).toHaveBeenCalledWith("folder-1");
    expect(setFocusedFolderId).toHaveBeenCalledWith("folder-1");
    expect(setActive).toHaveBeenCalledWith(null);
  });

  it("keeps folder rows visible when folders exist without assets", () => {
    const controller = {
      ...createControllerStub(),
      items: [],
      orderedAssetIds: [],
      assetLibraryHasAssets: false,
      assetLibraryHasContent: true,
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
    } as AssetsViewController;
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

    expect(result.current.table.getRowModel().rows.map((row) => row.original.kind)).toEqual([
      "folder",
    ]);
  });

  it("renders the folder action group for folder rows", async () => {
    const user = userEvent.setup();
    const controller = {
      ...createControllerStub(),
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
    } as AssetsViewController;
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

    const folderRow = result.current.table.getRowModel().rows[0];
    const actionsCell = folderRow.getVisibleCells().find((cell) => cell.column.id === "actions");

    expect(actionsCell).toBeTruthy();
    render(<>{flexRender(actionsCell!.column.columnDef.cell, actionsCell!.getContext())}</>);

    await user.click(screen.getByRole("button", { name: "common:MORE" }));
    await user.click(screen.getByRole("menuitem", { name: "assets:ASSET_ACTION_EDIT_FOLDER" }));

    expect(setEditFolderTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "folder-1",
      }),
    );
    expect(setEditFolderOpen).toHaveBeenCalledWith(true);
  });

  it("uses the same visible icon background for folder and parent folder rows", () => {
    const controller = {
      ...createControllerStub(),
      currentFolderId: "folder-2",
      folderPath: [
        {
          id: "folder-1",
          name: "Campaign",
          createdAt: "2026-04-27T00:00:00Z",
        },
        {
          id: "folder-2",
          name: "Hero",
          createdAt: "2026-04-27T00:00:00Z",
        },
      ],
      folderEntries: [
        {
          kind: "folderUp",
        },
        {
          kind: "folder",
          folder: {
            id: "folder-3",
            name: "Exports",
            createdAt: "2026-04-27T00:00:00Z",
          },
        },
      ],
    } as AssetsViewController;
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

    const [folderUpRow, folderRow] = result.current.table.getRowModel().rows;
    const folderUpNameCell = folderUpRow
      .getVisibleCells()
      .find((cell) => cell.column.id === "name");
    const folderNameCell = folderRow.getVisibleCells().find((cell) => cell.column.id === "name");

    expect(folderUpNameCell).toBeTruthy();
    expect(folderNameCell).toBeTruthy();

    const { container: folderUpContainer } = render(
      <>{flexRender(folderUpNameCell!.column.columnDef.cell, folderUpNameCell!.getContext())}</>,
    );
    const folderUpIconShell = folderUpContainer.querySelector("svg")?.parentElement;

    expect(folderUpIconShell).toHaveClass(
      "rounded-md",
      "bg-black/5",
      "dark:bg-white/5",
      "text-label-secondary",
      "dark:text-label-primary",
    );

    const { container: folderContainer } = render(
      <>{flexRender(folderNameCell!.column.columnDef.cell, folderNameCell!.getContext())}</>,
    );
    const folderIconShell = folderContainer.querySelector("svg")?.parentElement;

    expect(folderIconShell).toHaveClass(
      "rounded-md",
      "bg-black/5",
      "dark:bg-white/5",
      "text-label-secondary",
      "dark:text-label-primary",
    );
  });

  it("renders dashes for folder rows in asset-only value columns", () => {
    const controller = {
      ...createControllerStub(),
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
    } as AssetsViewController;
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

    const folderRow = result.current.table.getRowModel().rows[0];
    const uploadedByCell = folderRow
      .getVisibleCells()
      .find((cell) => cell.column.id === "uploadedBy");

    expect(uploadedByCell).toBeTruthy();
    render(<>{flexRender(uploadedByCell!.column.columnDef.cell, uploadedByCell!.getContext())}</>);

    expect(screen.getByText("-")).toBeInTheDocument();
  });
});

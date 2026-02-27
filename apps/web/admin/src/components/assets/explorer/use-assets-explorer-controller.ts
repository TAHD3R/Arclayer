import { keepPreviousData, useInfiniteQuery, useQueries, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { listAssetFolders, listAssetTags, listAssets } from "@/api/assets";
import type { AdminAssetFolder, AdminAssetSummary } from "@/types/api";
import { filterFoldersByContentCheck } from "@/lib/assets/folder-visibility";
import { isExplicitAssetsFilterActive } from "@/lib/assets/assets-filtering";
import { toMasonryItem } from "@/lib/assets/to-masonry-item";
import type { AssetsFilters } from "@/components/assets/assets-filter-popover";
import type { AssetsExplorerEntry, AssetsExplorerPagination } from "@/types/assets-explorer";

type UseAssetsExplorerControllerOptions = {
  workspaceId: string | number | null;
  pagination: AssetsExplorerPagination;

  purpose?: string;
  defaultVisibility?: string;
  defaultOrdering?: string;
  initialFilters?: Partial<AssetsFilters>;

  /**
   * Optional aspect ratio overrides for Masonry; maintained by the view via onAspectRatio callback.
   */
  aspectRatioById?: ReadonlyMap<string, number>;
  /**
   * Optional tick to force recalculating mapped items when aspect ratio changes.
   */
  layoutTick?: number;

  /**
   * When explicit filters are active, we run a cheap per-folder existence check (size=1) to hide folders
   * that have no matching items. This can be N+1 in the current level, so we must cap it to avoid
   * request storms on large folder lists.
   *
   * Default: 40.
   */
  maxFolderMatchChecks?: number;

  /**
   * For paged mode only.
   */
  initialPageSize?: number;
};

export function useAssetsExplorerController(opts: UseAssetsExplorerControllerOptions) {
  const workspaceId = opts.workspaceId ? String(opts.workspaceId) : null;
  const maxFolderMatchChecks = opts.maxFolderMatchChecks ?? 40;

  // Search / filters / ordering
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [focusedFolderId, setFocusedFolderId] = useState<string | null>(null);
  const [filters, setFilters] = useState<AssetsFilters>(() => ({
    visibility: opts.defaultVisibility ?? "public",
    ...opts.initialFilters,
  }));
  const [ordering, setOrdering] = useState<string>(opts.defaultOrdering ?? "-created_at");

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, 350);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  const explicitFilterActive = useMemo(
    () =>
      isExplicitAssetsFilterActive({
        searchQuery,
        mimePrefix: filters.mimePrefix,
        visibility: filters.visibility,
        createdFrom: filters.createdFrom,
        createdTo: filters.createdTo,
        tagIds: filters.tagIds,
      }),
    [
      filters.createdFrom,
      filters.createdTo,
      filters.mimePrefix,
      filters.tagIds,
      filters.visibility,
      searchQuery,
    ],
  );

  const foldersQuery = useQuery({
    queryKey: ["assets", "folders", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => listAssetFolders(String(workspaceId), { size: 200 }),
    staleTime: 60 * 1000,
  });

  const tagsQuery = useQuery({
    queryKey: ["assets", "tags", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => listAssetTags(String(workspaceId)),
    staleTime: 60 * 1000,
  });

  const assetsListQueryKey = useMemo(
    () => [
      "assets",
      "list",
      workspaceId,
      {
        purpose: opts.purpose,
        q: searchQuery || undefined,
        mimePrefix: filters.mimePrefix,
        folderId: currentFolderId || undefined,
        folderIsNull: currentFolderId ? undefined : true,
        visibility: filters.visibility,
        createdFrom: filters.createdFrom,
        createdTo: filters.createdTo,
        tagIds: filters.tagIds,
        ordering,
      },
    ],
    [
      currentFolderId,
      filters.createdFrom,
      filters.createdTo,
      filters.mimePrefix,
      filters.tagIds,
      filters.visibility,
      ordering,
      opts.purpose,
      searchQuery,
      workspaceId,
    ],
  );

  const infiniteAssetsQuery = useInfiniteQuery({
    queryKey: assetsListQueryKey,
    queryFn: async ({ pageParam }) =>
      workspaceId
        ? listAssets(String(workspaceId), {
            page: typeof pageParam === "number" ? pageParam : 1,
            size: 24,
            purpose: opts.purpose,
            q: searchQuery || undefined,
            mimePrefix: filters.mimePrefix,
            folderId: currentFolderId || undefined,
            folderIsNull: currentFolderId ? undefined : true,
            visibility: filters.visibility,
            createdFrom: filters.createdFrom,
            createdTo: filters.createdTo,
            tagIds: filters.tagIds,
            ordering,
          })
        : Promise.reject(new Error("WORKSPACE_NOT_SELECTED")),
    enabled: Boolean(workspaceId) && opts.pagination === "infinite",
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.next ?? undefined,
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
    meta: { silent: true },
  });

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(opts.initialPageSize ?? 24);

  useEffect(() => {
    // Filters changed => reset pagination in paged mode.
    if (opts.pagination !== "paged") return;
    setPage(1);
  }, [
    currentFolderId,
    filters.createdFrom,
    filters.createdTo,
    filters.mimePrefix,
    filters.tagIds,
    filters.visibility,
    ordering,
    opts.pagination,
    searchQuery,
  ]);

  const pagedAssetsQuery = useQuery({
    queryKey: [
      "assets",
      "paged",
      workspaceId,
      {
        purpose: opts.purpose,
        q: searchQuery || undefined,
        mimePrefix: filters.mimePrefix,
        folderId: currentFolderId || undefined,
        folderIsNull: currentFolderId ? undefined : true,
        visibility: filters.visibility,
        createdFrom: filters.createdFrom,
        createdTo: filters.createdTo,
        tagIds: filters.tagIds,
        ordering,
        page,
        size: pageSize,
      },
    ],
    enabled: Boolean(workspaceId) && opts.pagination === "paged",
    queryFn: async () =>
      workspaceId
        ? listAssets(String(workspaceId), {
            page,
            size: pageSize,
            purpose: opts.purpose,
            q: searchQuery || undefined,
            mimePrefix: filters.mimePrefix,
            folderId: currentFolderId || undefined,
            folderIsNull: currentFolderId ? undefined : true,
            visibility: filters.visibility,
            createdFrom: filters.createdFrom,
            createdTo: filters.createdTo,
            tagIds: filters.tagIds,
            ordering,
          })
        : Promise.reject(new Error("WORKSPACE_NOT_SELECTED")),
    staleTime: 10 * 1000,
    placeholderData: (prev) => prev,
    meta: { silent: true },
  });

  const aspectRatioById = opts.aspectRatioById;
  const layoutTick = opts.layoutTick ?? 0;

  const items = useMemo(() => {
    const mapRows = (rows: AdminAssetSummary[]) =>
      rows.map((row) =>
        toMasonryItem(row, { aspectRatioOverride: aspectRatioById?.get(String(row.id)) }),
      );

    if (opts.pagination === "paged") {
      const rows = pagedAssetsQuery.data?.items ?? [];
      return mapRows(rows);
    }

    if (!infiniteAssetsQuery.data) return [];
    const rows = infiniteAssetsQuery.data.pages.flatMap((p) => p.items);
    return mapRows(rows);
  }, [
    aspectRatioById,
    infiniteAssetsQuery.data,
    layoutTick,
    opts.pagination,
    pagedAssetsQuery.data,
  ]);

  const orderedAssetIds = useMemo(() => items.map((it) => it.id), [items]);

  const visibleFolders = useMemo<AdminAssetFolder[]>(() => {
    const folders = (foldersQuery.data?.items ?? []) as AdminAssetFolder[];
    const isRoot = !currentFolderId;
    return folders.filter((f) =>
      isRoot ? !f.parentId : String(f.parentId || "") === String(currentFolderId),
    );
  }, [currentFolderId, foldersQuery.data]);

  const canRunFolderMatchChecks = useMemo(() => {
    if (!explicitFilterActive) return false;
    // Avoid N+1: if there are too many folders at the current level, do not fan out requests.
    if (visibleFolders.length > maxFolderMatchChecks) return false;
    return true;
  }, [explicitFilterActive, maxFolderMatchChecks, visibleFolders.length]);

  const folderHasMatchQueries = useQueries({
    queries: (canRunFolderMatchChecks ? visibleFolders : []).map((folder) => ({
      queryKey: [
        "assets",
        "folderHasMatch",
        workspaceId,
        String(folder.id),
        {
          purpose: opts.purpose,
          q: searchQuery || undefined,
          mimePrefix: filters.mimePrefix,
          visibility: filters.visibility,
          createdFrom: filters.createdFrom,
          createdTo: filters.createdTo,
          tagIds: filters.tagIds,
        },
      ],
      enabled: Boolean(workspaceId) && visibleFolders.length > 0 && explicitFilterActive,
      staleTime: 30 * 1000,
      queryFn: async () => {
        if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
        // Cheap existence check: fetch 1 item only.
        return listAssets(String(workspaceId), {
          page: 1,
          size: 1,
          purpose: opts.purpose,
          q: searchQuery || undefined,
          mimePrefix: filters.mimePrefix,
          visibility: filters.visibility,
          createdFrom: filters.createdFrom,
          createdTo: filters.createdTo,
          tagIds: filters.tagIds,
          folderId: String(folder.id),
          includeChildren: true,
        });
      },
    })),
  });

  const filteredVisibleFolders = useMemo(() => {
    if (!explicitFilterActive) return visibleFolders;
    if (!canRunFolderMatchChecks) return visibleFolders;

    const byId = new Map<string, boolean | undefined>();
    for (let i = 0; i < visibleFolders.length; i += 1) {
      const folder = visibleFolders[i];
      const q = folderHasMatchQueries[i];
      if (!q || q.isError || !q.data) {
        byId.set(String(folder.id), undefined);
        continue;
      }
      byId.set(String(folder.id), (q.data.total || 0) > 0);
    }
    return filterFoldersByContentCheck(visibleFolders, byId);
  }, [canRunFolderMatchChecks, explicitFilterActive, folderHasMatchQueries, visibleFolders]);

  const folderEntries = useMemo<AssetsExplorerEntry[]>(() => {
    const isRoot = !currentFolderId;
    const out: AssetsExplorerEntry[] = [];
    if (!isRoot) out.push({ kind: "folderUp" });
    for (const f of filteredVisibleFolders) out.push({ kind: "folder", folder: f });
    return out;
  }, [currentFolderId, filteredVisibleFolders]);

  const masonryEntries = useMemo<AssetsExplorerEntry[]>(() => {
    return [
      ...folderEntries,
      ...items.map((asset): AssetsExplorerEntry => ({ kind: "asset", asset })),
    ];
  }, [folderEntries, items]);

  const folderById = useMemo(() => {
    const folders = (foldersQuery.data?.items ?? []) as AdminAssetFolder[];
    const mp = new Map<string, AdminAssetFolder>();
    for (const f of folders) mp.set(String(f.id), f);
    return mp;
  }, [foldersQuery.data]);

  const folderPath = useMemo(() => {
    const folders = (foldersQuery.data?.items ?? []) as AdminAssetFolder[];
    const byId = new Map<string, AdminAssetFolder>();
    for (const f of folders) byId.set(String(f.id), f);

    if (!currentFolderId) return [] as AdminAssetFolder[];
    const out: AdminAssetFolder[] = [];
    let cur = byId.get(String(currentFolderId));
    // Cap to 10 levels to avoid infinite loops if parentId data is malformed.
    for (let i = 0; i < 10 && cur; i += 1) {
      out.unshift(cur);
      const pid = cur.parentId ? String(cur.parentId) : "";
      cur = pid ? byId.get(pid) : undefined;
    }
    return out;
  }, [currentFolderId, foldersQuery.data]);

  const assetsQuery =
    opts.pagination === "paged"
      ? (pagedAssetsQuery as typeof pagedAssetsQuery)
      : infiniteAssetsQuery;

  const total = opts.pagination === "paged" ? (pagedAssetsQuery.data?.total ?? 0) : 0;

  return {
    workspaceId,

    searchInput,
    setSearchInput,
    searchQuery,
    setSearchQuery,

    currentFolderId,
    setCurrentFolderId,
    focusedFolderId,
    setFocusedFolderId,

    filters,
    setFilters,
    ordering,
    setOrdering,

    explicitFilterActive,

    foldersQuery,
    tagsQuery,
    assetsListQueryKey,
    items,
    orderedAssetIds,
    folderEntries,
    masonryEntries,
    folderById,
    folderPath,

    assetsQuery,
    infiniteAssetsQuery,
    pagedAssetsQuery,

    // paged mode only
    page,
    pageSize,
    setPage,
    setPageSize,
    total,
  };
}

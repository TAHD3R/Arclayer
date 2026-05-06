import { keepPreviousData, useInfiniteQuery, useQueries, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import {
  listAssetFolders,
  listAssetTags,
  listAssets,
  listOrganizationAssetFolders,
  listOrganizationAssetTags,
  listOrganizationAssets,
} from "@/api/assets";
import type { AdminAssetFolder, AdminAssetSummary } from "@arclayer/openapi/admin-types";
import { filterFoldersByContentCheck } from "@/lib/assets/folder-visibility";
import { isExplicitAssetsFilterActive } from "@/lib/assets/assets-filtering";
import { toMasonryItem } from "@/lib/assets/to-masonry-item";
import { assetScopeKey, type AssetScopeRef } from "@/lib/assets/asset-scope";
import type { AssetsExplorerEntry, AssetsExplorerPagination } from "@/types/assets-explorer";
import type { AssetsFilters } from "../assets-filter-popover";

type UseAssetsExplorerControllerOptions = {
  scope: AssetScopeRef | null;
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

const DEFAULT_PAGED_PAGE_SIZE = 10;

function buildFolderAssetQuery(currentFolderId: string | null) {
  if (!currentFolderId) return {};
  return {
    folderId: currentFolderId,
    includeChildren: true,
  };
}

function dedupeAssetsById(rows: AdminAssetSummary[]) {
  const seen = new Set<string>();
  const out: AdminAssetSummary[] = [];
  for (const row of rows) {
    const id = String(row.id);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}

export function useAssetsExplorerController(opts: UseAssetsExplorerControllerOptions) {
  const scope = opts.scope;
  const scopeId = scope?.id ? String(scope.id) : null;
  const scopeKey = scope ? assetScopeKey(scope) : null;
  const maxFolderMatchChecks = opts.maxFolderMatchChecks ?? 40;
  const scopeSupported = scope?.type === "project" || scope?.type === "organization";
  const hasScope = Boolean(scope && scopeId);

  // Search / filters / ordering
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [focusedFolderId, setFocusedFolderId] = useState<string | null>(null);
  const [filters, setFilters] = useState<AssetsFilters>(() => ({
    ...opts.initialFilters,
  }));
  const [ordering, setOrdering] = useState<string>(opts.defaultOrdering ?? "-created_at");
  const effectiveVisibility = filters.visibility ?? opts.defaultVisibility;

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
    queryKey: ["assets", "folders", scopeKey],
    enabled: Boolean(scopeId) && scopeSupported,
    queryFn: async () => {
      if (!scopeId || !scope) throw new Error("ASSET_SCOPE_NOT_SELECTED");
      if (scope.type === "organization")
        return listOrganizationAssetFolders(scopeId, { size: 200 });
      if (scope.type === "project") return listAssetFolders(scopeId, { size: 200 });
      throw new Error("ASSET_SCOPE_UNSUPPORTED");
    },
    staleTime: 60 * 1000,
  });

  const tagsQuery = useQuery({
    queryKey: ["assets", "tags", scopeKey],
    enabled: Boolean(scopeId) && scopeSupported,
    queryFn: async () => {
      if (!scopeId || !scope) throw new Error("ASSET_SCOPE_NOT_SELECTED");
      if (scope.type === "organization") return listOrganizationAssetTags(scopeId);
      if (scope.type === "project") return listAssetTags(scopeId);
      throw new Error("ASSET_SCOPE_UNSUPPORTED");
    },
    staleTime: 60 * 1000,
  });

  const globalAssetsQuery = useQuery({
    queryKey: [
      "assets",
      "globalAssetCount",
      scopeKey,
      {
        purpose: opts.purpose,
        visibility: opts.defaultVisibility,
      },
    ],
    enabled: Boolean(scopeId) && scopeSupported,
    queryFn: async () => {
      if (!scopeId || !scope) throw new Error("ASSET_SCOPE_NOT_SELECTED");
      const listFn = scope.type === "organization" ? listOrganizationAssets : listAssets;
      return listFn(String(scopeId), {
        page: 1,
        size: 1,
        purpose: opts.purpose,
        visibility: opts.defaultVisibility,
      });
    },
    staleTime: 30 * 1000,
    meta: { silent: true },
  });

  const assetsListQueryKey = useMemo(
    () => [
      "assets",
      "list",
      scopeKey,
      {
        purpose: opts.purpose,
        q: searchQuery || undefined,
        mimePrefix: filters.mimePrefix,
        ...buildFolderAssetQuery(currentFolderId),
        visibility: effectiveVisibility,
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
      effectiveVisibility,
      ordering,
      opts.purpose,
      searchQuery,
      scopeKey,
    ],
  );

  const infiniteAssetsQuery = useInfiniteQuery({
    queryKey: assetsListQueryKey,
    queryFn: async ({ pageParam }) =>
      scopeId && scope && scopeSupported
        ? (scope.type === "organization" ? listOrganizationAssets : listAssets)(String(scopeId), {
            page: typeof pageParam === "number" ? pageParam : 1,
            size: 24,
            purpose: opts.purpose,
            q: searchQuery || undefined,
            mimePrefix: filters.mimePrefix,
            ...buildFolderAssetQuery(currentFolderId),
            visibility: effectiveVisibility,
            createdFrom: filters.createdFrom,
            createdTo: filters.createdTo,
            tagIds: filters.tagIds,
            ordering,
          })
        : Promise.reject(
            new Error(hasScope ? "ASSET_SCOPE_UNSUPPORTED" : "ASSET_SCOPE_NOT_SELECTED"),
          ),
    enabled: Boolean(scopeId) && scopeSupported && opts.pagination === "infinite",
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.next ?? undefined,
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
    meta: { silent: true },
  });

  const defaultPagedPageSize = opts.initialPageSize ?? DEFAULT_PAGED_PAGE_SIZE;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(opts.pagination === "paged" ? defaultPagedPageSize : 24);

  useEffect(() => {
    if (opts.pagination !== "paged") return;
    setPage(1);
    setPageSize((prev) => (prev === defaultPagedPageSize ? prev : defaultPagedPageSize));
  }, [defaultPagedPageSize, opts.pagination]);

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
    effectiveVisibility,
    ordering,
    opts.pagination,
    searchQuery,
  ]);

  const pagedAssetsQuery = useQuery({
    queryKey: [
      "assets",
      "paged",
      scopeKey,
      {
        purpose: opts.purpose,
        q: searchQuery || undefined,
        mimePrefix: filters.mimePrefix,
        ...buildFolderAssetQuery(currentFolderId),
        visibility: effectiveVisibility,
        createdFrom: filters.createdFrom,
        createdTo: filters.createdTo,
        tagIds: filters.tagIds,
        ordering,
        page,
        size: pageSize,
      },
    ],
    enabled: Boolean(scopeId) && scopeSupported && opts.pagination === "paged",
    queryFn: async () =>
      scopeId && scope && scopeSupported
        ? (scope.type === "organization" ? listOrganizationAssets : listAssets)(String(scopeId), {
            page,
            size: pageSize,
            purpose: opts.purpose,
            q: searchQuery || undefined,
            mimePrefix: filters.mimePrefix,
            ...buildFolderAssetQuery(currentFolderId),
            visibility: effectiveVisibility,
            createdFrom: filters.createdFrom,
            createdTo: filters.createdTo,
            tagIds: filters.tagIds,
            ordering,
          })
        : Promise.reject(
            new Error(hasScope ? "ASSET_SCOPE_UNSUPPORTED" : "ASSET_SCOPE_NOT_SELECTED"),
          ),
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
      return mapRows(dedupeAssetsById(rows));
    }

    if (!infiniteAssetsQuery.data) return [];
    const rows = dedupeAssetsById(infiniteAssetsQuery.data.pages.flatMap((p) => p.items));
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
        scopeKey,
        String(folder.id),
        {
          purpose: opts.purpose,
          q: searchQuery || undefined,
          mimePrefix: filters.mimePrefix,
          visibility: effectiveVisibility,
          createdFrom: filters.createdFrom,
          createdTo: filters.createdTo,
          tagIds: filters.tagIds,
        },
      ],
      enabled:
        Boolean(scopeId) && scopeSupported && visibleFolders.length > 0 && explicitFilterActive,
      staleTime: 30 * 1000,
      queryFn: async () => {
        if (!scopeId || !scope) throw new Error("ASSET_SCOPE_NOT_SELECTED");
        // Cheap existence check: fetch 1 item only.
        const listFn = scope.type === "organization" ? listOrganizationAssets : listAssets;
        return listFn(String(scopeId), {
          page: 1,
          size: 1,
          purpose: opts.purpose,
          q: searchQuery || undefined,
          mimePrefix: filters.mimePrefix,
          visibility: effectiveVisibility,
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
  const currentQueryTotal =
    opts.pagination === "paged"
      ? (pagedAssetsQuery.data?.total ?? 0)
      : (infiniteAssetsQuery.data?.pages?.[0]?.total ?? 0);
  const assetLibraryHasAssets =
    (globalAssetsQuery.data?.total ?? 0) > 0 || currentQueryTotal > 0 || items.length > 0;
  const assetLibraryHasContent =
    assetLibraryHasAssets || (foldersQuery.data?.total ?? 0) > 0 || folderEntries.length > 0;

  return {
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
    effectiveVisibility,
    ordering,
    setOrdering,

    explicitFilterActive,

    foldersQuery,
    globalAssetsQuery,
    tagsQuery,
    assetsListQueryKey,
    items,
    orderedAssetIds,
    folderEntries,
    masonryEntries,
    assetLibraryHasAssets,
    assetLibraryHasContent,
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

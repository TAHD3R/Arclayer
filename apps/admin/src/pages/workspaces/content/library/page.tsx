import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  useDataTable,
  useDataTableRowHeightPreference,
  useDataTableWrapHeadersPreference,
} from "@arclayer/ui/data-table";
import {
  archiveContentItem,
  deleteContentItem,
  duplicateContentItem,
  getContentItemVersion,
  getContentSeoProfile,
  getWorkspacePublishImpact,
  // Content items stay sourced from the admin API. Continue routing uses site preview tokens below.
  listAllContentItems,
  listAllContentModels,
  unarchiveContentItem,
} from "@/api/content";
import { issueWorkspaceSitePreviewToken } from "@/api/workspace-site";
import { AdminDataTableSection } from "@/layouts/page-shell/admin-data-table-section";
import { buildDataTableToolsLabels } from "@/components/common/data-table-tools-labels";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { useWorkspaceDateTimeFormatter } from "@/hooks/use-workspace-date-time-formatter";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import type { AdminContentModel } from "@/types/api";
import {
  buildWorkspaceContentEditorUrl,
  workspaceContentCreatePath,
  workspaceContentLibraryPath,
} from "@/lib/routing/workspace-content-routing";
import { useContentLibraryTableColumns } from "./content-library-table-columns";
import { ContentLibraryActionDialogs } from "./components/content-library-action-dialogs";
import { ContentLibraryCardList } from "./components/content-library-card-list";
import { ContentLibraryNewContentButton } from "./components/content-library-new-content-button";
import { ContentLibraryRecordDrawer } from "./components/content-library-record-drawer";
import { ContentLibraryToolbar } from "./components/content-library-toolbar";
import { type ContentLibraryViewMode } from "./components/content-library-view-mode-toggle";
import { ContentLibraryViewsManager } from "./components/content-library-views-manager";
import type {
  ContentLibraryEditWith,
  ContentLibraryRole,
  ContentLibrarySavedView,
  ContentLibraryTableRow,
  ContentLibraryToolbarFilters,
  ContentLibraryViewState,
} from "./types";
import {
  areContentLibraryToolbarFiltersEqual,
  buildContentLibrarySavedView,
  buildContentItemsQueryKey,
  buildContentLibraryEditWithFacetOptions,
  buildContentLibraryPageData,
  buildContentLibraryRoleFacetOptions,
  buildContentLibrarySystemViews,
  buildContentLibraryRows,
  buildContentModelsQueryKey,
  CONTENT_LIBRARY_DEFAULT_VIEW_STATE,
  contentLibraryTableId,
  deleteContentLibrarySavedView,
  findContentLibrarySavedView,
  moveContentLibrarySavedView,
  normalizeContentLibraryViewState,
  parseContentLibraryViewState,
  readPersistedContentLibrarySavedViews,
  readPersistedContentLibraryViewState,
  renameContentLibrarySavedView,
  resolveContentLibrarySystemViewId,
  serializeContentLibraryViewState,
  togglePinnedContentLibrarySavedView,
  writePersistedContentLibrarySavedViews,
  writePersistedContentLibraryViewState,
} from "./utils";

function ContentLibraryPrimaryAction(props: {
  workspaceId: string | null;
  onNavigate: () => void;
}) {
  if (!props.workspaceId) return null;
  return <ContentLibraryNewContentButton onClick={props.onNavigate} />;
}

type ArchiveDialogState = {
  row: ContentLibraryTableRow;
  mode: "archive" | "unarchive";
};

const CONTENT_LIBRARY_CARD_MODE_QUERY = "(max-width: 960px)";

function getContentLibraryCardMode(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(CONTENT_LIBRARY_CARD_MODE_QUERY).matches;
}

function useContentLibraryCardMode() {
  const [cardMode, setCardMode] = React.useState(getContentLibraryCardMode);

  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mediaQueryList = window.matchMedia(CONTENT_LIBRARY_CARD_MODE_QUERY);
    const handleChange = (event: MediaQueryListEvent) => {
      setCardMode(event.matches);
    };

    setCardMode(mediaQueryList.matches);
    mediaQueryList.addEventListener("change", handleChange);
    return () => mediaQueryList.removeEventListener("change", handleChange);
  }, []);

  return cardMode;
}

export function ContentLibraryPage() {
  const { t } = useTranslation(["content", "common", "nav", "team"]);
  const navigate = useNavigate({ from: "/w/$workspaceId/content/library/" });
  const search = useSearch({ from: "/w/$workspaceId/content/library/" });
  const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const queryClient = useQueryClient();
  const dateTime = useWorkspaceDateTimeFormatter();
  const autoCardMode = useContentLibraryCardMode();
  const [manualViewMode, setManualViewMode] = React.useState<ContentLibraryViewMode | null>(null);
  const [toolbarFilters, setToolbarFilters] = React.useState<ContentLibraryToolbarFilters>({});
  const [viewsManagerOpen, setViewsManagerOpen] = React.useState(false);
  const [savedViews, setSavedViews] = React.useState<ContentLibrarySavedView[]>(() =>
    readPersistedContentLibrarySavedViews(workspaceId ? String(workspaceId) : null),
  );
  const [viewState, setViewState] = React.useState<ContentLibraryViewState>(() =>
    search.view
      ? parseContentLibraryViewState(search.view)
      : readPersistedContentLibraryViewState(workspaceId ? String(workspaceId) : null),
  );
  const [selectedRow, setSelectedRow] = React.useState<ContentLibraryTableRow | null>(null);
  const [handledFocusItemId, setHandledFocusItemId] = React.useState<string | null>(null);
  const [duplicateRow, setDuplicateRow] = React.useState<ContentLibraryTableRow | null>(null);
  const [deleteRow, setDeleteRow] = React.useState<ContentLibraryTableRow | null>(null);
  const [archiveDialog, setArchiveDialog] = React.useState<ArchiveDialogState | null>(null);
  const dataTableId = React.useMemo(
    () => contentLibraryTableId(workspaceId ? String(workspaceId) : null),
    [workspaceId],
  );
  const [rowHeight, setRowHeight] = useDataTableRowHeightPreference({ tableId: dataTableId });
  const [wrapHeaders, setWrapHeaders] = useDataTableWrapHeadersPreference({ tableId: dataTableId });
  const viewMode: ContentLibraryViewMode = manualViewMode ?? (autoCardMode ? "card" : "table");
  const modelsQuery = useQuery({
    queryKey: buildContentModelsQueryKey(workspaceId ? String(workspaceId) : null),
    enabled: Boolean(workspaceId),
    queryFn: async () => listAllContentModels(String(workspaceId)),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });
  const itemsQuery = useQuery({
    queryKey: buildContentItemsQueryKey(workspaceId ? String(workspaceId) : null),
    enabled: Boolean(workspaceId),
    queryFn: async () => listAllContentItems(String(workspaceId)),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });
  const models = React.useMemo<AdminContentModel[]>(
    () => [...(modelsQuery.data ?? [])].sort((left, right) => left.name.localeCompare(right.name)),
    [modelsQuery.data],
  );
  const rows = React.useMemo<ContentLibraryTableRow[]>(
    () => buildContentLibraryRows(itemsQuery.data ?? [], models),
    [itemsQuery.data, models],
  );
  const draftVersionQuery = useQuery({
    queryKey: [
      "content-library",
      "version",
      workspaceId,
      selectedRow?.id,
      "draft",
      selectedRow?.draftVersion,
    ],
    enabled: Boolean(workspaceId && selectedRow && selectedRow.draftVersion > 0),
    queryFn: async () =>
      getContentItemVersion(String(workspaceId), selectedRow!.id, selectedRow!.draftVersion),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });
  const publishedVersionQuery = useQuery({
    queryKey: [
      "content-library",
      "version",
      workspaceId,
      selectedRow?.id,
      "published",
      selectedRow?.publishedVersion,
    ],
    enabled: Boolean(workspaceId && selectedRow && selectedRow.publishedVersion),
    queryFn: async () =>
      getContentItemVersion(
        String(workspaceId),
        selectedRow!.id,
        Number(selectedRow!.publishedVersion),
      ),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });
  const seoVersionNumber = React.useMemo(() => {
    if (!selectedRow) return null;
    return selectedRow.draftVersion || selectedRow.publishedVersion || null;
  }, [selectedRow]);
  const seoSupported = React.useMemo(
    () =>
      Boolean(
        selectedRow &&
        (selectedRow.modelCapabilities.includes("seo_managed") ||
          selectedRow.modelCapabilities.includes("routable") ||
          selectedRow.capabilityPackIds.includes("seo_managed") ||
          selectedRow.capabilityPackIds.includes("routable")),
      ),
    [selectedRow],
  );
  const seoQuery = useQuery({
    queryKey: ["content-library", "seo", workspaceId, selectedRow?.id, seoVersionNumber],
    enabled: Boolean(workspaceId && selectedRow && seoVersionNumber && seoSupported),
    queryFn: async () =>
      getContentSeoProfile(String(workspaceId), selectedRow!.id, Number(seoVersionNumber)),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });
  const publishImpactQuery = useQuery({
    queryKey: ["content-library", "publish-impact", workspaceId],
    enabled: Boolean(workspaceId && selectedRow),
    queryFn: async () => getWorkspacePublishImpact(String(workspaceId)),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });
  const selectedVersions = React.useMemo(
    () => ({
      draft: draftVersionQuery.data ?? null,
      published: publishedVersionQuery.data ?? null,
      loading: draftVersionQuery.isLoading || publishedVersionQuery.isLoading,
      error: draftVersionQuery.isError || publishedVersionQuery.isError,
    }),
    [
      draftVersionQuery.data,
      draftVersionQuery.isError,
      draftVersionQuery.isLoading,
      publishedVersionQuery.data,
      publishedVersionQuery.isError,
      publishedVersionQuery.isLoading,
    ],
  );
  const selectedSeo = React.useMemo(
    () => ({
      supported: seoSupported,
      data: seoQuery.data ?? null,
      loading: seoQuery.isLoading,
      error: seoQuery.isError,
    }),
    [seoQuery.data, seoQuery.isError, seoQuery.isLoading, seoSupported],
  );
  const selectedPublishImpact = React.useMemo(() => {
    const rowId = selectedRow?.id;
    const source = publishImpactQuery.data ?? null;
    const missingRoute = Boolean(rowId && source?.missingRoutes.includes(rowId));
    const unresolvedRelations = Boolean(rowId && source?.unresolvedRelations.includes(rowId));
    const unpublishedDependencies = Boolean(
      rowId && source?.unpublishedDependencies.includes(rowId),
    );
    return {
      missingRoute,
      unresolvedRelations,
      unpublishedDependencies,
      loading: publishImpactQuery.isLoading,
      error: publishImpactQuery.isError,
      hasBlockers: missingRoute || unresolvedRelations || unpublishedDependencies,
      source,
    };
  }, [
    publishImpactQuery.data,
    publishImpactQuery.isError,
    publishImpactQuery.isLoading,
    selectedRow,
  ]);
  const effectiveSystemViewId = React.useMemo(
    () => resolveContentLibrarySystemViewId(viewState, savedViews),
    [savedViews, viewState],
  );
  const activeSavedView = React.useMemo(
    () =>
      viewState.kind === "saved" ? findContentLibrarySavedView(savedViews, viewState.viewId) : null,
    [savedViews, viewState],
  );

  React.useEffect(() => {
    if (!workspaceId) {
      setSavedViews([]);
      return;
    }
    setSavedViews(readPersistedContentLibrarySavedViews(String(workspaceId)));
  }, [workspaceId]);

  React.useEffect(() => {
    if (!workspaceId) return;
    const workspaceKey = String(workspaceId);
    const routeView = typeof search.view === "string" ? search.view : undefined;
    const parsed = routeView
      ? parseContentLibraryViewState(routeView)
      : readPersistedContentLibraryViewState(workspaceKey);
    const next = normalizeContentLibraryViewState(parsed, savedViews);
    const nextSerialized = serializeContentLibraryViewState(next);

    setViewState((prev) => (prev.kind === next.kind && prev.viewId === next.viewId ? prev : next));
    writePersistedContentLibraryViewState(workspaceKey, next);

    if (routeView && routeView !== nextSerialized) {
      void navigate({
        search: { view: nextSerialized },
        replace: true,
      });
      return;
    }

    if (
      !routeView &&
      nextSerialized !== serializeContentLibraryViewState(CONTENT_LIBRARY_DEFAULT_VIEW_STATE)
    ) {
      void navigate({
        search: { view: nextSerialized },
        replace: true,
      });
    }
  }, [navigate, savedViews, search.view, workspaceId]);
  React.useEffect(() => {
    const focusItemId =
      typeof search.focusItemId === "string" && search.focusItemId.trim()
        ? search.focusItemId.trim()
        : null;
    if (!focusItemId) {
      setHandledFocusItemId(null);
      return;
    }
    if (handledFocusItemId === focusItemId) return;
    const focusRow = rows.find((row) => row.id === focusItemId);
    if (!focusRow) return;
    setSelectedRow(focusRow);
    setHandledFocusItemId(focusItemId);
  }, [handledFocusItemId, rows, search.focusItemId]);
  React.useEffect(() => {
    if (!toolbarFilters.modelKey) return;
    if (models.some((model) => model.key === toolbarFilters.modelKey)) return;
    setToolbarFilters((prev) => ({ ...prev, modelKey: undefined }));
  }, [models, toolbarFilters.modelKey]);
  const archiveMutation = useMutation({
    mutationFn: async (dialog: ArchiveDialogState) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      if (dialog.mode === "unarchive") {
        return unarchiveContentItem(String(workspaceId), dialog.row.id);
      }
      return archiveContentItem(String(workspaceId), dialog.row.id);
    },
    onSuccess: async (_, dialog) => {
      notifySuccessText(
        dialog.mode === "unarchive"
          ? t("content:CONTENT_LIBRARY_UNARCHIVE_SUCCESS")
          : t("content:CONTENT_LIBRARY_ARCHIVE_SUCCESS"),
      );
      setArchiveDialog(null);
      await queryClient.invalidateQueries({
        queryKey: buildContentItemsQueryKey(workspaceId ? String(workspaceId) : null),
      });
    },
    onError: (error) => notifyError(error),
  });
  const duplicateMutation = useMutation({
    mutationFn: async (row: ContentLibraryTableRow) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return duplicateContentItem(String(workspaceId), row.id);
    },
    onSuccess: async () => {
      notifySuccessText(t("content:CONTENT_LIBRARY_DUPLICATE_SUCCESS"));
      setDuplicateRow(null);
      await queryClient.invalidateQueries({
        queryKey: buildContentItemsQueryKey(workspaceId ? String(workspaceId) : null),
      });
    },
    onError: (error) => notifyError(error),
  });
  const deleteMutation = useMutation({
    mutationFn: async (row: ContentLibraryTableRow) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      await deleteContentItem(String(workspaceId), row.id);
    },
    onSuccess: async () => {
      notifySuccessText(t("content:CONTENT_LIBRARY_DELETE_SUCCESS"));
      setDeleteRow(null);
      await queryClient.invalidateQueries({
        queryKey: buildContentItemsQueryKey(workspaceId ? String(workspaceId) : null),
      });
    },
    onError: (error) => notifyError(error),
  });
  const continueMutation = useMutation({
    mutationFn: async (row: ContentLibraryTableRow) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      const preview = await issueWorkspaceSitePreviewToken(String(workspaceId));
      const url = buildWorkspaceContentEditorUrl({
        siteId: row.siteId,
        itemId: row.id,
        token: preview.token,
        returnTo: workspaceContentLibraryPath(String(workspaceId)),
      });
      window.location.assign(url);
      return url;
    },
    onError: (error) => notifyError(error),
  });
  const handleContinue = React.useCallback(
    (row: ContentLibraryTableRow) => {
      continueMutation.mutate(row);
    },
    [continueMutation],
  );
  const columns = useContentLibraryTableColumns({
    formatDateTimeOrNull: dateTime.formatDateTimeOrNull,
    actionPending:
      archiveMutation.isPending ||
      duplicateMutation.isPending ||
      deleteMutation.isPending ||
      continueMutation.isPending,
    onContinue: handleContinue,
    onDuplicate: setDuplicateRow,
    onDelete: setDeleteRow,
    onArchive: (row) => setArchiveDialog({ row, mode: "archive" }),
    onUnarchive: (row) => setArchiveDialog({ row, mode: "unarchive" }),
  });
  const dataReady = Boolean(workspaceId) && !modelsQuery.isLoading && !itemsQuery.isLoading;
  const dataError = modelsQuery.error ?? itemsQuery.error;
  const persistActiveView = React.useCallback(
    (next: ContentLibraryViewState) => {
      setViewState(next);
      if (!workspaceId) return;
      writePersistedContentLibraryViewState(String(workspaceId), next);
      void navigate({
        search: { view: serializeContentLibraryViewState(next) },
        replace: true,
      });
    },
    [navigate, workspaceId],
  );
  const fingerprint = React.useMemo(
    () =>
      [
        serializeContentLibraryViewState(viewState),
        effectiveSystemViewId,
        toolbarFilters.status || "",
        toolbarFilters.modelKey || "",
        toolbarFilters.role || "",
        toolbarFilters.editWith || "",
        rows.length,
        modelsQuery.dataUpdatedAt,
        itemsQuery.dataUpdatedAt,
      ].join("|"),
    [
      effectiveSystemViewId,
      itemsQuery.dataUpdatedAt,
      modelsQuery.dataUpdatedAt,
      rows.length,
      toolbarFilters,
      viewState,
    ],
  );
  const tableHook = useDataTable<ContentLibraryTableRow, { fingerprint: string }>({
    tableId: dataTableId,
    columns,
    extraQuery: { fingerprint },
    fetcher: async (params) =>
      buildContentLibraryPageData(rows, params, effectiveSystemViewId, toolbarFilters),
    queryOptions: {
      enabled: dataReady && !dataError,
      retry: false,
      meta: { silent: true },
    },
  });
  const setActiveView = React.useCallback(
    (next: ContentLibraryViewState) => {
      if (next.kind === "saved") {
        const savedView = findContentLibrarySavedView(savedViews, next.viewId);
        if (savedView) {
          setToolbarFilters(savedView.filters);
          tableHook.setSearchInput(savedView.query);
        }
      }
      persistActiveView(next);
    },
    [persistActiveView, savedViews, tableHook],
  );
  const applySavedViews = React.useCallback(
    (next: ContentLibrarySavedView[]) => {
      setSavedViews(next);
      if (workspaceId) {
        writePersistedContentLibrarySavedViews(String(workspaceId), next);
      }
    },
    [workspaceId],
  );
  const createSavedView = React.useCallback(
    (name: string) => {
      const next = [
        ...savedViews,
        buildContentLibrarySavedView({
          name,
          baseViewId: effectiveSystemViewId,
          query: tableHook.searchInput,
          filters: toolbarFilters,
        }),
      ];
      applySavedViews(next);
    },
    [applySavedViews, effectiveSystemViewId, savedViews, tableHook.searchInput, toolbarFilters],
  );
  const renameSavedView = React.useCallback(
    (viewId: string, name: string) => {
      applySavedViews(renameContentLibrarySavedView(savedViews, viewId, name));
    },
    [applySavedViews, savedViews],
  );
  const togglePinnedView = React.useCallback(
    (viewId: string) => {
      applySavedViews(togglePinnedContentLibrarySavedView(savedViews, viewId));
    },
    [applySavedViews, savedViews],
  );
  const moveSavedView = React.useCallback(
    (viewId: string, direction: "up" | "down") => {
      applySavedViews(moveContentLibrarySavedView(savedViews, viewId, direction));
    },
    [applySavedViews, savedViews],
  );
  const deleteSavedView = React.useCallback(
    (viewId: string) => {
      const next = deleteContentLibrarySavedView(savedViews, viewId);
      applySavedViews(next);
      if (viewState.kind === "saved" && viewState.viewId === viewId) {
        persistActiveView({ kind: "system", viewId: effectiveSystemViewId });
      }
    },
    [applySavedViews, effectiveSystemViewId, persistActiveView, savedViews, viewState],
  );
  React.useEffect(() => {
    if (!activeSavedView) return;
    if (
      activeSavedView.query === tableHook.searchInput &&
      areContentLibraryToolbarFiltersEqual(activeSavedView.filters, toolbarFilters)
    ) {
      return;
    }
    persistActiveView({ kind: "system", viewId: activeSavedView.baseViewId });
  }, [activeSavedView, persistActiveView, tableHook.searchInput, toolbarFilters]);
  const systemViews = React.useMemo(
    () =>
      buildContentLibrarySystemViews().map((view) => ({
        id: view.id,
        label: t(`content:${view.labelKey}`),
        active: viewState.kind === "system" && viewState.viewId === view.id,
        onSelect: () => setActiveView({ kind: "system", viewId: view.id }),
      })),
    [setActiveView, t, viewState],
  );
  const pinnedSavedViews = React.useMemo(
    () =>
      savedViews
        .filter((view) => view.pinned)
        .map((view) => ({
          id: view.id,
          label: view.name,
          active: viewState.kind === "saved" && viewState.viewId === view.id,
          onSelect: () => setActiveView({ kind: "saved", viewId: view.id }),
        })),
    [savedViews, setActiveView, viewState],
  );
  const applyEditWithFacet = React.useCallback((editWith: ContentLibraryEditWith) => {
    setToolbarFilters((prev) => ({
      ...prev,
      role: undefined,
      editWith,
    }));
  }, []);
  const applyRoleFacet = React.useCallback((role: ContentLibraryRole) => {
    setToolbarFilters((prev) => ({
      ...prev,
      editWith: undefined,
      role,
    }));
  }, []);
  const facetGroups = React.useMemo(
    () => [
      {
        id: "surface",
        title: t("content:CONTENT_LIBRARY_VIEWS_MANAGER_SECTION_SURFACES"),
        items: buildContentLibraryEditWithFacetOptions().map((option) => ({
          id: option.id,
          label: t(`content:${option.labelKey}`),
          active: toolbarFilters.editWith === option.id,
          onSelect: () => {
            applyEditWithFacet(option.id);
            setViewsManagerOpen(false);
          },
        })),
      },
      {
        id: "role",
        title: t("content:CONTENT_LIBRARY_VIEWS_MANAGER_SECTION_ROLES"),
        items: buildContentLibraryRoleFacetOptions().map((option) => ({
          id: option.id,
          label: t(`content:${option.labelKey}`),
          active: toolbarFilters.role === option.id,
          onSelect: () => {
            applyRoleFacet(option.id);
            setViewsManagerOpen(false);
          },
        })),
      },
    ],
    [applyEditWithFacet, applyRoleFacet, t, toolbarFilters.editWith, toolbarFilters.role],
  );
  const views = React.useMemo(
    () => [...systemViews, ...pinnedSavedViews],
    [pinnedSavedViews, systemViews],
  );
  const isInitialEmptyState = !modelsQuery.isLoading && !itemsQuery.isLoading && rows.length === 0;
  const toolsLabels = React.useMemo(() => buildDataTableToolsLabels(t), [t]);
  const refreshing =
    tableHook.isFetching ||
    modelsQuery.isFetching ||
    itemsQuery.isFetching ||
    archiveMutation.isPending ||
    continueMutation.isPending;
  const toolbarNode = (
    <ContentLibraryToolbar
      table={tableHook.table}
      searchInput={tableHook.searchInput}
      onSearchInputChange={tableHook.setSearchInput}
      filters={toolbarFilters}
      onFiltersChange={setToolbarFilters}
      rowHeight={rowHeight}
      onRowHeightChange={setRowHeight}
      wrapHeaders={wrapHeaders}
      onWrapHeadersChange={setWrapHeaders}
      refreshing={refreshing}
      onRefresh={() => {
        void Promise.all([modelsQuery.refetch(), itemsQuery.refetch()]);
      }}
      onResetColumnVisibility={tableHook.resetColumnVisibility}
      toolsLabels={toolsLabels}
      modelOptions={models.map((model) => ({ value: model.key, label: model.name }))}
      viewMode={viewMode}
      onViewModeChange={setManualViewMode}
      views={views}
      onOpenViewsManager={() => setViewsManagerOpen(true)}
    />
  );

  return (
    <DefaultPage
      title={t("nav:NAV_CONTENT_LIBRARY")}
      description={t("content:CONTENT_LIBRARY_DESC")}
      className="h-full"
      contentClassName="min-h-0 flex flex-col"
      action={
        <ContentLibraryPrimaryAction
          workspaceId={workspaceId ? String(workspaceId) : null}
          onNavigate={() => void navigate({ to: workspaceContentCreatePath(String(workspaceId)) })}
        />
      }
    >
      <>
        {viewMode === "card" && (tableHook.pageData?.items.length ?? 0) > 0 ? (
          <div className="flex min-h-0 flex-col gap-4">
            {toolbarNode}
            <ContentLibraryCardList
              rows={tableHook.pageData?.items ?? []}
              onCardClick={setSelectedRow}
              onContinue={handleContinue}
              onDuplicate={setDuplicateRow}
              onDelete={setDeleteRow}
              onArchive={(row) => setArchiveDialog({ row, mode: "archive" })}
              onUnarchive={(row) => setArchiveDialog({ row, mode: "unarchive" })}
              formatDateTimeOrNull={dateTime.formatDateTimeOrNull}
              pending={
                archiveMutation.isPending ||
                duplicateMutation.isPending ||
                deleteMutation.isPending ||
                continueMutation.isPending
              }
            />
          </div>
        ) : (
          <AdminDataTableSection
            table={tableHook.table}
            emptyText={t("content:CONTENT_LIBRARY_EMPTY_TABLE")}
            emptyTitle={
              isInitialEmptyState
                ? t("content:CONTENT_LIBRARY_EMPTY_INITIAL_TITLE")
                : t("content:CONTENT_LIBRARY_EMPTY_FILTERED_TITLE")
            }
            emptyDescription={
              isInitialEmptyState
                ? t("content:CONTENT_LIBRARY_EMPTY_INITIAL_DESC")
                : t("content:CONTENT_LIBRARY_EMPTY_FILTERED_DESC")
            }
            loading={modelsQuery.isLoading || itemsQuery.isLoading}
            error={dataError}
            onRetry={() => {
              void Promise.all([modelsQuery.refetch(), itemsQuery.refetch()]);
            }}
            pageData={tableHook.pageData}
            onPaginationChange={(nextPage, nextSize) => {
              if (nextSize !== tableHook.table.getState().pagination.pageSize) {
                tableHook.table.setPageSize(nextSize);
              }
              tableHook.table.setPageIndex(Math.max(0, nextPage - 1));
            }}
            t={t}
            rowHeight={rowHeight}
            wrapHeaders={wrapHeaders}
            refreshing={refreshing && !modelsQuery.isLoading && !itemsQuery.isLoading}
            onRowClick={(row) => setSelectedRow(row.original)}
            toolbar={toolbarNode}
          />
        )}
        <ContentLibraryRecordDrawer
          row={selectedRow}
          open={Boolean(selectedRow)}
          onOpenChange={(open) => {
            if (!open) setSelectedRow(null);
          }}
          onContinue={handleContinue}
          continuePending={continueMutation.isPending}
          formatDateTimeOrNull={dateTime.formatDateTimeOrNull}
          versions={selectedVersions}
          seo={selectedSeo}
          publishImpact={selectedPublishImpact}
        />
        <ContentLibraryViewsManager
          open={viewsManagerOpen}
          onOpenChange={setViewsManagerOpen}
          systemViews={systemViews}
          facetGroups={facetGroups}
          savedViews={savedViews}
          onSelectSavedView={(viewId) => {
            setViewsManagerOpen(false);
            setActiveView({ kind: "saved", viewId });
          }}
          onCreateSavedView={createSavedView}
          onRenameSavedView={renameSavedView}
          onTogglePinSavedView={togglePinnedView}
          onMoveSavedView={moveSavedView}
          onDeleteSavedView={deleteSavedView}
        />
        <ContentLibraryActionDialogs
          duplicateDialog={{
            row: duplicateRow,
            pending: duplicateMutation.isPending,
            onOpenChange: (open) => {
              if (!open && !duplicateMutation.isPending) setDuplicateRow(null);
            },
            onConfirm: () => {
              if (!duplicateRow) return;
              duplicateMutation.mutate(duplicateRow);
            },
          }}
          deleteDialog={{
            row: deleteRow,
            pending: deleteMutation.isPending,
            onOpenChange: (open) => {
              if (!open && !deleteMutation.isPending) setDeleteRow(null);
            },
            onConfirm: () => {
              if (!deleteRow) return;
              deleteMutation.mutate(deleteRow);
            },
          }}
          archiveDialog={{
            row: archiveDialog?.row ?? null,
            mode: archiveDialog?.mode ?? "archive",
            pending: archiveMutation.isPending,
            onOpenChange: (open) => {
              if (!open && !archiveMutation.isPending) setArchiveDialog(null);
            },
            onConfirm: () => {
              if (!archiveDialog) return;
              archiveMutation.mutate(archiveDialog);
            },
          }}
        />
      </>
    </DefaultPage>
  );
}

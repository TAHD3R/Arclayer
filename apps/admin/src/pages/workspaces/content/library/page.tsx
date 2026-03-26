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
  createContentLibraryView,
  deleteContentLibraryView,
  deleteContentItem,
  duplicateContentItem,
  getContentLibraryViews,
  getContentItemVersion,
  getContentSeoProfile,
  getWorkspacePublishImpact,
  // Content items stay sourced from the admin API. Continue routing uses site preview tokens below.
  listAllContentItems,
  listAllContentModels,
  moveContentLibraryView,
  updateContentLibraryView,
  unarchiveContentItem,
} from "@/api/content";
import { issueWorkspaceSitePreviewToken } from "@/api/workspace-site";
import { AdminDataTableSection } from "@/layouts/page-shell/admin-data-table-section";
import { buildDataTableToolsLabels } from "@/components/common/data-table-tools-labels";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { useWorkspaceDateTimeFormatter } from "@/hooks/use-workspace-date-time-formatter";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import type {
  AdminContentLibraryViewsState,
  AdminContentModel,
  CreateAdminContentLibraryViewPayload,
} from "@/types/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@arclayer/ui/alert-dialog";
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
import { ContentLibraryViewFormDialog } from "./components/content-library-view-form-dialog";
import { type ContentLibraryViewMode } from "./components/content-library-view-mode-toggle";
import {
  type ContentLibraryPrototypeViewDraft,
  createContentLibraryPrototypeViewDraft,
} from "./components/content-library-view-form";
import type {
  ContentLibrarySavedView,
  ContentLibrarySystemViewId,
  ContentLibraryTableRow,
  ContentLibraryToolbarFilters,
  ContentLibraryViewState,
} from "./types";
import {
  areContentLibraryToolbarFiltersEqual,
  buildContentItemsQueryKey,
  buildContentLibraryPageData,
  buildContentLibrarySystemViews,
  buildContentLibraryRows,
  buildContentModelsQueryKey,
  CONTENT_LIBRARY_DEFAULT_VIEW_STATE,
  contentLibraryTableId,
  findContentLibrarySavedView,
  isSameContentLibraryViewState,
  normalizeContentLibraryViewState,
  parseContentLibraryViewState,
  resolveContentLibraryDefaultViewState,
  serializeContentLibraryViewState,
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

type ContentLibraryViewDialogState = {
  mode: "edit" | "saveAs";
  viewId: string;
};

type ContentLibraryViewWorkbenchState = Pick<
  CreateAdminContentLibraryViewPayload,
  "baseViewId" | "query" | "filters" | "sorting" | "viewMode" | "columns"
>;

type ContentLibraryViewDiffItem = {
  id: string;
  label: string;
  savedValue: string;
  nextValue: string;
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

function normalizeSavedViewSorting(value: ContentLibrarySavedView["sorting"] | undefined) {
  return (value ?? [])
    .filter((item) => item?.id)
    .map((item) => ({ id: item.id, desc: Boolean(item.desc) }));
}

function normalizeSavedViewColumns(value: ContentLibrarySavedView["columns"] | undefined) {
  const visibility =
    value?.visibility && Object.keys(value.visibility).length
      ? Object.fromEntries(
          Object.entries(value.visibility).sort(([left], [right]) => left.localeCompare(right)),
        )
      : undefined;
  const order = value?.order?.length ? [...value.order] : undefined;

  if (!visibility && !order && !value?.rowHeight && typeof value?.wrapHeaders === "undefined") {
    return undefined;
  }

  return {
    ...(visibility ? { visibility } : {}),
    ...(order ? { order } : {}),
    ...(value?.rowHeight ? { rowHeight: value.rowHeight } : {}),
    ...(typeof value?.wrapHeaders === "boolean" ? { wrapHeaders: value.wrapHeaders } : {}),
  };
}

function areSavedViewSortingEqual(
  left: ContentLibrarySavedView["sorting"] | undefined,
  right: ContentLibrarySavedView["sorting"] | undefined,
) {
  return (
    JSON.stringify(normalizeSavedViewSorting(left)) ===
    JSON.stringify(normalizeSavedViewSorting(right))
  );
}

function areSavedViewColumnsEqual(
  left: ContentLibrarySavedView["columns"] | undefined,
  right: ContentLibrarySavedView["columns"] | undefined,
) {
  return (
    JSON.stringify(normalizeSavedViewColumns(left)) ===
    JSON.stringify(normalizeSavedViewColumns(right))
  );
}

function resolveSystemViewStatusFilter(
  viewId: ContentLibraryViewState["viewId"] | ContentLibrarySystemViewId,
): ContentLibraryToolbarFilters["status"] | undefined {
  if (viewId === "draft") return "draft";
  if (viewId === "published") return "published";
  return undefined;
}

function withSystemViewFilters(
  filters: ContentLibraryToolbarFilters,
  viewId: ContentLibrarySystemViewId,
): ContentLibraryToolbarFilters {
  const nextStatus = resolveSystemViewStatusFilter(viewId);
  if (nextStatus) {
    return { ...filters, status: nextStatus };
  }

  const { status: _status, ...rest } = filters;
  return rest;
}

function buildSystemViewWorkbenchFilters(
  viewId: ContentLibrarySystemViewId,
): ContentLibraryToolbarFilters {
  return withSystemViewFilters({}, viewId);
}

function resolveWorkbenchSystemViewId(
  state: ContentLibraryViewState,
  savedViews: ContentLibrarySavedView[],
  filters: ContentLibraryToolbarFilters,
): ContentLibrarySystemViewId {
  if (state.kind === "saved") {
    return findContentLibrarySavedView(savedViews, state.viewId)?.baseViewId ?? "all";
  }
  if (filters.status === "draft") return "draft";
  if (filters.status === "published") return "published";
  return "all";
}

function doesSavedViewMatchWorkbench(
  savedView: ContentLibrarySavedView,
  currentWorkbench: ContentLibraryViewWorkbenchState,
) {
  return (
    savedView.baseViewId === currentWorkbench.baseViewId &&
    savedView.query === currentWorkbench.query &&
    areContentLibraryToolbarFiltersEqual(savedView.filters, currentWorkbench.filters) &&
    areSavedViewSortingEqual(savedView.sorting, currentWorkbench.sorting) &&
    (!savedView.viewMode || savedView.viewMode === currentWorkbench.viewMode) &&
    (!savedView.columns || areSavedViewColumnsEqual(savedView.columns, currentWorkbench.columns))
  );
}

function summarizeViewBaseView(viewId: ContentLibrarySystemViewId, t: (key: string) => string) {
  if (viewId === "draft") return t("content:CONTENT_LIBRARY_VIEW_DRAFT");
  if (viewId === "published") return t("content:CONTENT_LIBRARY_VIEW_PUBLISHED");
  return t("content:CONTENT_LIBRARY_VIEW_ALL");
}

function summarizeViewFilters(filters: ContentLibraryToolbarFilters, t: (key: string) => string) {
  const items: string[] = [];
  if (filters.status) {
    items.push(
      `${t("content:CONTENT_LIBRARY_FILTER_FIELD_STATUS")}: ${t(
        `content:CONTENT_LIBRARY_STATUS_${filters.status.toUpperCase()}`,
      )}`,
    );
  }
  if (filters.modelKey) {
    items.push(`${t("content:CONTENT_LIBRARY_FILTER_FIELD_CONTENT_TYPE")}: ${filters.modelKey}`);
  }
  if (filters.role) {
    items.push(
      `${t("content:CONTENT_LIBRARY_FILTER_FIELD_ROLE")}: ${t(`content:CONTENT_LIBRARY_ROLE_${filters.role.toUpperCase().replace(/-/g, "_")}`)}`,
    );
  }
  if (filters.editWith) {
    items.push(
      `${t("content:CONTENT_LIBRARY_FILTER_FIELD_EDIT_WITH")}: ${t(
        `content:CONTENT_LIBRARY_EDIT_WITH_${filters.editWith.toUpperCase()}`,
      )}`,
    );
  }
  return items.length ? items.join(" · ") : t("content:CONTENT_LIBRARY_UPDATE_VIEW_DIFF_NONE");
}

function summarizeViewSorting(
  sorting: ContentLibraryViewWorkbenchState["sorting"] | ContentLibrarySavedView["sorting"],
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const items = (sorting ?? []).map((item) =>
    t(
      item.desc
        ? "content:CONTENT_LIBRARY_UPDATE_VIEW_DIFF_SORT_DESC"
        : "content:CONTENT_LIBRARY_UPDATE_VIEW_DIFF_SORT_ASC",
      { id: item.id },
    ),
  );
  return items.length ? items.join(" · ") : t("content:CONTENT_LIBRARY_UPDATE_VIEW_DIFF_NONE");
}

function summarizeViewMode(
  viewMode: ContentLibraryViewWorkbenchState["viewMode"] | ContentLibrarySavedView["viewMode"],
  t: (key: string) => string,
) {
  if (viewMode === "card") return t("common:VIEW_MODE_CARD");
  if (viewMode === "table") return t("common:VIEW_MODE_TABLE");
  return t("content:CONTENT_LIBRARY_UPDATE_VIEW_DIFF_EMPTY_VALUE");
}

function summarizeViewColumns(
  columns: ContentLibraryViewWorkbenchState["columns"] | ContentLibrarySavedView["columns"],
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (!columns) return t("content:CONTENT_LIBRARY_UPDATE_VIEW_DIFF_EMPTY_VALUE");
  const parts: string[] = [];
  const visibilityValues = Object.values(columns.visibility ?? {});
  const hiddenCount = visibilityValues.filter((visible) => visible === false).length;
  if (hiddenCount > 0) {
    parts.push(
      t("content:CONTENT_LIBRARY_UPDATE_VIEW_DIFF_HIDDEN_COLUMNS", { count: hiddenCount }),
    );
  }
  if (columns.order?.length) {
    parts.push(
      t("content:CONTENT_LIBRARY_UPDATE_VIEW_DIFF_ORDERED_COLUMNS", {
        count: columns.order.length,
      }),
    );
  }
  if (columns.rowHeight) {
    parts.push(
      t("content:CONTENT_LIBRARY_UPDATE_VIEW_DIFF_ROW_HEIGHT", {
        value: columns.rowHeight,
      }),
    );
  }
  if (typeof columns.wrapHeaders === "boolean") {
    parts.push(
      columns.wrapHeaders
        ? t("content:CONTENT_LIBRARY_UPDATE_VIEW_DIFF_WRAP_HEADERS_ON")
        : t("content:CONTENT_LIBRARY_UPDATE_VIEW_DIFF_WRAP_HEADERS_OFF"),
    );
  }
  return parts.length ? parts.join(" · ") : t("content:CONTENT_LIBRARY_UPDATE_VIEW_DIFF_NONE");
}

function buildViewDiffItems(
  savedView: ContentLibrarySavedView,
  currentWorkbench: ContentLibraryViewWorkbenchState,
  t: (key: string, options?: Record<string, unknown>) => string,
): ContentLibraryViewDiffItem[] {
  const items: Array<ContentLibraryViewDiffItem | null> = [
    savedView.baseViewId !== currentWorkbench.baseViewId
      ? {
          id: "baseViewId",
          label: t("content:CONTENT_LIBRARY_VIEWS_MANAGER_BASE_VIEW"),
          savedValue: summarizeViewBaseView(savedView.baseViewId, t),
          nextValue: summarizeViewBaseView(currentWorkbench.baseViewId, t),
        }
      : null,
    savedView.query !== currentWorkbench.query
      ? {
          id: "query",
          label: t("content:CONTENT_LIBRARY_UPDATE_VIEW_DIFF_QUERY"),
          savedValue: savedView.query || t("content:CONTENT_LIBRARY_UPDATE_VIEW_DIFF_EMPTY_VALUE"),
          nextValue:
            currentWorkbench.query || t("content:CONTENT_LIBRARY_UPDATE_VIEW_DIFF_EMPTY_VALUE"),
        }
      : null,
    !areContentLibraryToolbarFiltersEqual(savedView.filters, currentWorkbench.filters)
      ? {
          id: "filters",
          label: t("content:CONTENT_LIBRARY_UPDATE_VIEW_DIFF_FILTERS"),
          savedValue: summarizeViewFilters(savedView.filters, t),
          nextValue: summarizeViewFilters(currentWorkbench.filters, t),
        }
      : null,
    !areSavedViewSortingEqual(savedView.sorting, currentWorkbench.sorting)
      ? {
          id: "sorting",
          label: t("content:CONTENT_LIBRARY_UPDATE_VIEW_DIFF_SORTING"),
          savedValue: summarizeViewSorting(savedView.sorting, t),
          nextValue: summarizeViewSorting(currentWorkbench.sorting, t),
        }
      : null,
    (savedView.viewMode ?? null) !== currentWorkbench.viewMode
      ? {
          id: "viewMode",
          label: t("content:CONTENT_LIBRARY_UPDATE_VIEW_DIFF_VIEW_MODE"),
          savedValue: summarizeViewMode(savedView.viewMode, t),
          nextValue: summarizeViewMode(currentWorkbench.viewMode, t),
        }
      : null,
    !areSavedViewColumnsEqual(savedView.columns, currentWorkbench.columns)
      ? {
          id: "columns",
          label: t("content:CONTENT_LIBRARY_UPDATE_VIEW_DIFF_COLUMNS"),
          savedValue: summarizeViewColumns(savedView.columns, t),
          nextValue: summarizeViewColumns(currentWorkbench.columns, t),
        }
      : null,
  ];

  return items.filter((item): item is ContentLibraryViewDiffItem => item !== null);
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
  const [viewState, setViewState] = React.useState<ContentLibraryViewState>(
    CONTENT_LIBRARY_DEFAULT_VIEW_STATE,
  );
  const [selectedRow, setSelectedRow] = React.useState<ContentLibraryTableRow | null>(null);
  const [viewDialogState, setViewDialogState] =
    React.useState<ContentLibraryViewDialogState | null>(null);
  const [viewDialogDraft, setViewDialogDraft] = React.useState<ContentLibraryPrototypeViewDraft>(
    () => createContentLibraryPrototypeViewDraft(),
  );
  const [pendingDeleteViewId, setPendingDeleteViewId] = React.useState<string | null>(null);
  const [pendingUpdateViewId, setPendingUpdateViewId] = React.useState<string | null>(null);
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
  const viewsQueryKey = React.useMemo(
    () => ["content-library", "views", workspaceId ? String(workspaceId) : "none"],
    [workspaceId],
  );
  const viewsQuery = useQuery({
    queryKey: viewsQueryKey,
    enabled: Boolean(workspaceId),
    queryFn: async () => getContentLibraryViews(String(workspaceId)),
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
  const savedViews = React.useMemo<ContentLibrarySavedView[]>(
    () => viewsQuery.data?.items ?? [],
    [viewsQuery.data?.items],
  );
  const defaultViewState = React.useMemo(
    () => resolveContentLibraryDefaultViewState(savedViews, viewsQuery.data?.defaultViewId ?? null),
    [savedViews, viewsQuery.data?.defaultViewId],
  );
  const viewsHydrationReady = !workspaceId || viewsQuery.isFetched || viewsQuery.isError;
  const effectiveSystemViewId = React.useMemo(
    () => resolveWorkbenchSystemViewId(viewState, savedViews, toolbarFilters),
    [savedViews, toolbarFilters, viewState],
  );
  const activeSavedView = React.useMemo(
    () =>
      viewState.kind === "saved" ? findContentLibrarySavedView(savedViews, viewState.viewId) : null,
    [savedViews, viewState],
  );
  const dialogTargetView = React.useMemo(
    () => findContentLibrarySavedView(savedViews, viewDialogState?.viewId),
    [savedViews, viewDialogState?.viewId],
  );
  const pendingDeleteView = React.useMemo(
    () => findContentLibrarySavedView(savedViews, pendingDeleteViewId),
    [pendingDeleteViewId, savedViews],
  );
  const pendingUpdateView = React.useMemo(
    () => findContentLibrarySavedView(savedViews, pendingUpdateViewId),
    [pendingUpdateViewId, savedViews],
  );
  const activeSavedViewWorkbenchKey = React.useMemo(() => {
    if (!activeSavedView) return null;
    return JSON.stringify({
      id: activeSavedView.id,
      baseViewId: activeSavedView.baseViewId,
      query: activeSavedView.query,
      filters: activeSavedView.filters,
      sorting: activeSavedView.sorting,
      viewMode: activeSavedView.viewMode,
      columns: activeSavedView.columns,
    });
  }, [activeSavedView]);

  React.useEffect(() => {
    if (!workspaceId) return;
    const routeView = typeof search.view === "string" ? search.view : undefined;
    const parsedRouteView = routeView ? parseContentLibraryViewState(routeView) : null;
    const routeDependsOnSavedViews = !routeView || parsedRouteView?.kind === "saved";
    if (routeDependsOnSavedViews && !viewsHydrationReady) return;
    const parsed = parsedRouteView ?? defaultViewState;
    const next = normalizeContentLibraryViewState(parsed, savedViews, defaultViewState);
    const nextSerialized = serializeContentLibraryViewState(next);

    setViewState((prev) => (prev.kind === next.kind && prev.viewId === next.viewId ? prev : next));

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
  }, [defaultViewState, navigate, savedViews, search.view, viewsHydrationReady, workspaceId]);
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
  const applyViewsState = React.useCallback(
    (next: AdminContentLibraryViewsState) => {
      queryClient.setQueryData(viewsQueryKey, next);
    },
    [queryClient, viewsQueryKey],
  );
  const createViewMutation = useMutation({
    mutationFn: async (payload: CreateAdminContentLibraryViewPayload) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return createContentLibraryView(String(workspaceId), payload);
    },
    onSuccess: (next) => {
      applyViewsState(next);
    },
    onError: (error) => notifyError(error),
  });
  const updateViewMutation = useMutation({
    mutationFn: async (input: {
      viewId: string;
      payload: Parameters<typeof updateContentLibraryView>[2];
    }) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return updateContentLibraryView(String(workspaceId), input.viewId, input.payload);
    },
    onSuccess: (next) => {
      applyViewsState(next);
    },
    onError: (error) => notifyError(error),
  });
  const moveViewMutation = useMutation({
    mutationFn: async (input: { viewId: string; direction: "up" | "down" }) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return moveContentLibraryView(String(workspaceId), input.viewId, {
        direction: input.direction,
      });
    },
    onSuccess: (next) => {
      applyViewsState(next);
    },
    onError: (error) => notifyError(error),
  });
  const deleteViewMutation = useMutation({
    mutationFn: async (viewId: string) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return deleteContentLibraryView(String(workspaceId), viewId);
    },
    onSuccess: (next) => {
      applyViewsState(next);
    },
    onError: (error) => notifyError(error),
  });
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
      void navigate({
        search: { view: serializeContentLibraryViewState(next) },
        replace: true,
      });
    },
    [navigate],
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
  const fetchPageData = React.useCallback(
    async (params: Parameters<typeof buildContentLibraryPageData>[1]) =>
      buildContentLibraryPageData(rows, params, effectiveSystemViewId, toolbarFilters),
    [effectiveSystemViewId, rows, toolbarFilters],
  );
  const tableHook = useDataTable<ContentLibraryTableRow, { fingerprint: string }>({
    tableId: dataTableId,
    columns,
    extraQuery: { fingerprint },
    fetcher: fetchPageData,
    queryOptions: {
      enabled: dataReady && !dataError,
      retry: false,
      meta: { silent: true },
    },
  });
  const buildCurrentViewDefinition = React.useCallback((): ContentLibraryViewWorkbenchState => {
    const tableState = tableHook.table.getState?.();
    const columnVisibility =
      tableState?.columnVisibility && Object.keys(tableState.columnVisibility).length
        ? tableState.columnVisibility
        : undefined;
    const columnOrder = tableState?.columnOrder?.length ? tableState.columnOrder : undefined;

    return {
      baseViewId: effectiveSystemViewId,
      query: tableHook.searchInput,
      filters: toolbarFilters,
      sorting: normalizeSavedViewSorting(tableHook.sorting),
      viewMode,
      columns:
        columnVisibility || columnOrder || rowHeight || typeof wrapHeaders === "boolean"
          ? {
              ...(columnVisibility ? { visibility: columnVisibility } : {}),
              ...(columnOrder ? { order: columnOrder } : {}),
              rowHeight,
              wrapHeaders,
            }
          : undefined,
    };
  }, [
    effectiveSystemViewId,
    rowHeight,
    tableHook.searchInput,
    tableHook.sorting,
    tableHook.table,
    toolbarFilters,
    viewMode,
    wrapHeaders,
  ]);
  const currentWorkbenchDefinition = React.useMemo(
    () => buildCurrentViewDefinition(),
    [buildCurrentViewDefinition],
  );
  const pendingUpdateDiffItems = React.useMemo(
    () =>
      pendingUpdateView ? buildViewDiffItems(pendingUpdateView, currentWorkbenchDefinition, t) : [],
    [currentWorkbenchDefinition, pendingUpdateView, t],
  );
  const applySavedViewWorkbench = React.useCallback(
    (savedView: ContentLibrarySavedView) => {
      setToolbarFilters(savedView.filters);
      tableHook.setSearchInput(savedView.query);
      tableHook.setSorting(savedView.sorting);
      if (savedView.viewMode) setManualViewMode(savedView.viewMode);
      if (savedView.columns?.rowHeight) setRowHeight(savedView.columns.rowHeight);
      if (typeof savedView.columns?.wrapHeaders === "boolean") {
        setWrapHeaders(savedView.columns.wrapHeaders);
      }
      if (savedView.columns) {
        if (savedView.columns.visibility) {
          tableHook.table.setColumnVisibility?.(savedView.columns.visibility);
        } else {
          tableHook.resetColumnVisibility();
        }
        tableHook.table.setColumnOrder?.(savedView.columns.order ?? []);
      }
    },
    [setRowHeight, setWrapHeaders, tableHook],
  );
  const applySavedViewWorkbenchRef = React.useRef(applySavedViewWorkbench);
  React.useEffect(() => {
    applySavedViewWorkbenchRef.current = applySavedViewWorkbench;
  }, [applySavedViewWorkbench]);
  const applySystemViewWorkbench = React.useCallback(
    (viewId: ContentLibrarySystemViewId) => {
      const nextFilters = buildSystemViewWorkbenchFilters(viewId);
      setToolbarFilters((prev) =>
        areContentLibraryToolbarFiltersEqual(prev, nextFilters) ? prev : nextFilters,
      );
      tableHook.setSearchInput("");
      tableHook.setSorting([]);
    },
    [tableHook.setSearchInput, tableHook.setSorting],
  );
  const setActiveView = React.useCallback(
    (next: ContentLibraryViewState) => {
      if (isSameContentLibraryViewState(viewState, next)) return;
      if (next.kind === "system") {
        applySystemViewWorkbench(next.viewId);
      }
      if (next.kind === "saved") {
        const savedView = findContentLibrarySavedView(savedViews, next.viewId);
        if (savedView) {
          applySavedViewWorkbench(savedView);
        }
      }
      persistActiveView(next);
    },
    [
      applySavedViewWorkbench,
      applySystemViewWorkbench,
      persistActiveView,
      savedViews,
      viewState.kind,
      viewState.viewId,
    ],
  );
  const createSavedView = React.useCallback(
    async (payload: CreateAdminContentLibraryViewPayload) => {
      const previousIds = new Set(savedViews.map((view) => view.id));
      const next = await createViewMutation.mutateAsync(payload);
      const createdView = next.items.find((view) => !previousIds.has(view.id));
      if (createdView) {
        applySavedViewWorkbench(createdView);
        persistActiveView({ kind: "saved", viewId: createdView.id });
      }
    },
    [applySavedViewWorkbench, createViewMutation, persistActiveView, savedViews],
  );
  const moveSavedView = React.useCallback(
    async (viewId: string, direction: "up" | "down") => {
      await moveViewMutation.mutateAsync({ viewId, direction });
    },
    [moveViewMutation],
  );
  const deleteSavedView = React.useCallback(
    async (viewId: string) => {
      await deleteViewMutation.mutateAsync(viewId);
    },
    [deleteViewMutation],
  );
  const requestDeleteSavedView = React.useCallback((viewId: string) => {
    setPendingDeleteViewId(viewId);
  }, []);
  const openViewDialog = React.useCallback(
    (mode: "edit" | "saveAs", view: ContentLibrarySavedView) => {
      setViewDialogState({ mode, viewId: view.id });
      setViewDialogDraft(
        createContentLibraryPrototypeViewDraft({
          name: view.name,
          visibility: view.visibility,
          isDefault: view.isDefault,
        }),
      );
    },
    [],
  );
  const closeViewDialog = React.useCallback((open: boolean) => {
    if (open) return;
    setViewDialogState(null);
    setViewDialogDraft(createContentLibraryPrototypeViewDraft());
  }, []);
  const submitViewDialog = React.useCallback(async () => {
    if (!viewDialogState || !dialogTargetView) return;
    const trimmedName = viewDialogDraft.name.trim();
    if (!trimmedName) return;

    if (viewDialogState.mode === "edit") {
      await updateViewMutation.mutateAsync({
        viewId: dialogTargetView.id,
        payload: {
          name: trimmedName,
          visibility: viewDialogDraft.visibility,
          isDefault: viewDialogDraft.isDefault,
        },
      });
    } else {
      await createSavedView({
        name: trimmedName,
        baseViewId: dialogTargetView.baseViewId,
        query: dialogTargetView.query,
        filters: dialogTargetView.filters,
        sorting: dialogTargetView.sorting,
        viewMode: dialogTargetView.viewMode,
        columns: dialogTargetView.columns,
        visibility: viewDialogDraft.visibility,
        pinned: true,
        isDefault: viewDialogDraft.isDefault,
      });
    }

    closeViewDialog(false);
  }, [
    closeViewDialog,
    createSavedView,
    dialogTargetView,
    updateViewMutation,
    viewDialogDraft,
    viewDialogState,
  ]);
  const updateSavedViewDefinition = React.useCallback(async () => {
    if (!pendingUpdateView) return;
    await updateViewMutation.mutateAsync({
      viewId: pendingUpdateView.id,
      payload: buildCurrentViewDefinition(),
    });
    setPendingUpdateViewId(null);
  }, [buildCurrentViewDefinition, pendingUpdateView, updateViewMutation]);
  const syncingSavedViewWorkbenchKeyRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (viewState.kind !== "saved" || !activeSavedView || !activeSavedViewWorkbenchKey) {
      syncingSavedViewWorkbenchKeyRef.current = null;
      return;
    }
    if (syncingSavedViewWorkbenchKeyRef.current === activeSavedViewWorkbenchKey) return;
    syncingSavedViewWorkbenchKeyRef.current = activeSavedViewWorkbenchKey;
    applySavedViewWorkbenchRef.current(activeSavedView);
  }, [activeSavedView, activeSavedViewWorkbenchKey, viewState.kind]);
  React.useEffect(() => {
    if (viewState.kind !== "system") return;
    applySystemViewWorkbench(viewState.viewId);
  }, [applySystemViewWorkbench, viewState.kind, viewState.viewId]);
  React.useEffect(() => {
    if (!activeSavedView || !activeSavedViewWorkbenchKey) return;
    const currentWorkbench = buildCurrentViewDefinition();
    const workbenchMatchesActiveSavedView = doesSavedViewMatchWorkbench(
      activeSavedView,
      currentWorkbench,
    );
    if (syncingSavedViewWorkbenchKeyRef.current === activeSavedViewWorkbenchKey) {
      if (workbenchMatchesActiveSavedView) {
        syncingSavedViewWorkbenchKeyRef.current = null;
      }
      return;
    }
  }, [activeSavedView, activeSavedViewWorkbenchKey, buildCurrentViewDefinition]);
  const systemViews = React.useMemo(
    () =>
      buildContentLibrarySystemViews().map((view) => ({
        id: view.id,
        label: t(`content:${view.labelKey}`),
        active: viewState.kind === "system" && effectiveSystemViewId === view.id,
        onSelect: () => setActiveView({ kind: "system", viewId: view.id }),
      })),
    [effectiveSystemViewId, setActiveView, t, viewState.kind],
  );
  const savedViewChips = React.useMemo(
    () =>
      savedViews.map((view, index) => ({
        id: view.id,
        label: view.name,
        active: viewState.kind === "saved" && viewState.viewId === view.id,
        onSelect: () => setActiveView({ kind: "saved", viewId: view.id }),
        onMoveForward: () => moveSavedView(view.id, "up"),
        moveForwardDisabled: index === 0,
        onMoveBackward: () => moveSavedView(view.id, "down"),
        moveBackwardDisabled: index === savedViews.length - 1,
        onEdit: () => openViewDialog("edit", view),
        onSaveAs: () => openViewDialog("saveAs", view),
        onUpdate: () => setPendingUpdateViewId(view.id),
        updateDisabled: doesSavedViewMatchWorkbench(view, currentWorkbenchDefinition),
        updateDisabledReason: t("content:CONTENT_LIBRARY_UPDATE_VIEW_DISABLED_TOOLTIP"),
        onDelete: () => requestDeleteSavedView(view.id),
      })),
    [
      currentWorkbenchDefinition,
      moveSavedView,
      openViewDialog,
      requestDeleteSavedView,
      savedViews,
      setActiveView,
      t,
      viewState,
    ],
  );
  const views = React.useMemo(
    () => [...systemViews, ...savedViewChips],
    [savedViewChips, systemViews],
  );
  const isInitialEmptyState = !modelsQuery.isLoading && !itemsQuery.isLoading && rows.length === 0;
  const toolsLabels = React.useMemo(() => buildDataTableToolsLabels(t), [t]);
  const refreshing =
    tableHook.isFetching ||
    modelsQuery.isFetching ||
    itemsQuery.isFetching ||
    viewsQuery.isFetching ||
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
      onCreateView={async (draft) =>
        createSavedView({
          name: draft.name,
          ...buildCurrentViewDefinition(),
          visibility: draft.visibility,
          pinned: true,
          isDefault: draft.isDefault,
        })
      }
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
        <ContentLibraryViewFormDialog
          open={Boolean(viewDialogState && dialogTargetView)}
          mode={viewDialogState?.mode ?? "edit"}
          draft={viewDialogDraft}
          originalName={dialogTargetView?.name}
          submitting={createViewMutation.isPending || updateViewMutation.isPending}
          onOpenChange={closeViewDialog}
          onDraftChange={setViewDialogDraft}
          onSubmit={submitViewDialog}
        />
        <AlertDialog
          open={Boolean(pendingUpdateView)}
          onOpenChange={(open) => {
            if (!open && !updateViewMutation.isPending) setPendingUpdateViewId(null);
          }}
        >
          <AlertDialogContent className="sm:max-w-[640px]">
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("content:CONTENT_LIBRARY_UPDATE_VIEW_DIALOG_TITLE")}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-body">
                {t("content:CONTENT_LIBRARY_UPDATE_VIEW_DIALOG_DESC", {
                  name: pendingUpdateView?.name ?? "",
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="grid divide-y divide-border/60 py-1">
              {pendingUpdateDiffItems.map((item) => (
                <div key={item.id} className="grid gap-3 py-4 first:pt-0 last:pb-0">
                  <div className="text-callout font-semibold text-foreground">{item.label}</div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="grid gap-1.5">
                      <div className="text-caption font-medium uppercase tracking-[0.08em] text-label-secondary">
                        {t("content:CONTENT_LIBRARY_UPDATE_VIEW_DIFF_SAVED")}
                      </div>
                      <div className="rounded-lg border border-border/60 bg-background px-3 py-2 text-callout text-label-primary">
                        {item.savedValue}
                      </div>
                    </div>
                    <div className="grid gap-1.5">
                      <div className="text-caption font-medium uppercase tracking-[0.08em] text-label-secondary">
                        {t("content:CONTENT_LIBRARY_UPDATE_VIEW_DIFF_CURRENT")}
                      </div>
                      <div className="rounded-lg border border-border/60 bg-background px-3 py-2 text-callout text-label-primary">
                        {item.nextValue}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={updateViewMutation.isPending}>
                {t("common:CANCEL")}
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={updateViewMutation.isPending}
                onClick={() => {
                  void updateSavedViewDefinition();
                }}
              >
                {t("content:CONTENT_LIBRARY_ACTION_UPDATE_VIEW")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog
          open={Boolean(pendingDeleteView)}
          onOpenChange={(open) => {
            if (!open && !deleteViewMutation.isPending) setPendingDeleteViewId(null);
          }}
        >
          <AlertDialogContent className="sm:max-w-[520px]">
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("content:CONTENT_LIBRARY_DELETE_VIEW_DIALOG_TITLE")}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-body">
                {t("content:CONTENT_LIBRARY_DELETE_VIEW_DIALOG_DESC", {
                  name: pendingDeleteView?.name ?? "",
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteViewMutation.isPending}>
                {t("common:CANCEL")}
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleteViewMutation.isPending}
                onClick={() => {
                  if (!pendingDeleteView) return;
                  void deleteSavedView(pendingDeleteView.id).then(() =>
                    setPendingDeleteViewId(null),
                  );
                }}
              >
                {t("content:CONTENT_LIBRARY_ACTION_DELETE_VIEW")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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

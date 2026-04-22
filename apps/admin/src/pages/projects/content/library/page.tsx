import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { useSidebar } from "@arclayer/ui/sidebar";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useDataTable } from "@arclayer/ui/data-table";
import {
  archiveContentItem,
  createContentLibraryView,
  deleteContentLibraryView,
  deleteContentItem,
  duplicateContentItem,
  moveContentLibraryView,
  updateContentLibraryView,
  unarchiveContentItem,
} from "@/api/content";
import { AdminRouteContainer } from "@/components/layout/admin-route-container";
import { AdminDataTableSection } from "@/layouts/page-shell/admin-data-table-section";
import { buildDataTableToolsLabels } from "@/components/common/data-table-tools-labels";
import { type ViewMode as ContentLibraryViewMode } from "@/components/common/view-mode-toggle";
import { PageMainRegion } from "@/layouts/page-shell/page-main-region";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { useWorkspaceDateTimeFormatter } from "@/hooks/use-workspace-date-time-formatter";
import { useProjectPermissionAccess } from "@/hooks/use-workspace-permission-access";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import type {
  AdminContentLibraryViewColumns,
  AdminContentLibraryViewSorting,
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
import { Button } from "@arclayer/ui/button";
import {
  projectContentLibraryItemPath,
  projectContentModelsPath,
} from "@/lib/routing/project-content-routing";
import { getContentTypeLabel } from "../content-type-presentation";
import { useContentLibraryTableColumns } from "./components/content-library-table-columns";
import { ContentLibraryActionDialogs } from "./components/content-library-action-dialogs";
import { ContentLibraryCardList } from "./components/content-library-card-list";
import { ContentLibraryCreateContentDialog } from "./components/content-library-create-content-dialog";
import {
  ContentLibraryItemSettingsDialogs,
  type ContentLibraryItemSettingsDialogState,
} from "./components/content-library-item-settings-dialogs";
import { ContentLibraryNewContentButton } from "./components/content-library-new-content-button";
import { ContentLibraryPreviewPanel } from "./components/content-library-preview-panel";
import { ContentLibrarySelectionToolbar } from "./components/content-library-selection-toolbar";
import { ContentLibraryToolbar } from "./components/content-library-toolbar";
import { ContentLibraryViewFormDialog } from "./components/content-library-view-form-dialog";
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
  clearSelection,
  rangeSelect,
  selectOnly,
  toggleSelect,
  type AssetSelectionState,
} from "@/lib/assets/asset-selection";
import {
  buildContentLibraryItemsQueryKey,
  buildContentLibraryModelsQueryKey,
  buildContentLibraryViewsQueryKey,
  loadContentLibraryItems,
  loadContentLibraryModels,
  loadContentLibraryViewsState,
} from "./runtime";
import {
  areContentLibraryToolbarFiltersEqual,
  buildContentLibraryPageData,
  buildContentLibrarySystemViews,
  buildContentLibraryRows,
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
  projectId: string | null;
  canManageContent?: boolean;
  onNavigateCreate: () => void;
  onNavigateModels: () => void;
}) {
  const { t } = useTranslation("content");
  if (!props.projectId) return null;
  const canManageContent = props.canManageContent !== false;
  return (
    <div className="flex items-center gap-3">
      <Button
        type="button"
        variant="outline"
        onClick={props.onNavigateModels}
        disabled={!canManageContent}
      >
        {t("CONTENT_LIBRARY_ACTION_MANAGE_TYPES")}
      </Button>
      <ContentLibraryNewContentButton
        onClick={props.onNavigateCreate}
        disabled={!canManageContent}
      />
    </div>
  );
}

type ArchiveDialogState = {
  row: ContentLibraryTableRow;
  mode: "archive" | "unarchive";
};

type BulkActionKind = "archive" | "delete";

type ContentLibraryViewDialogState = {
  mode: "edit" | "saveAs";
  viewId: string;
};

type ContentLibraryViewWorkbenchState = {
  baseViewId: CreateAdminContentLibraryViewPayload["baseViewId"];
  query: string;
  filters: ContentLibraryToolbarFilters;
  sorting: AdminContentLibraryViewSorting[];
  viewMode?: CreateAdminContentLibraryViewPayload["viewMode"];
  columns?: AdminContentLibraryViewColumns;
};

type ContentLibraryViewDiffItem = {
  id: string;
  label: string;
  savedValue: string;
  nextValue: string;
};

const CONTENT_LIBRARY_CARD_MODE_QUERY = "(max-width: 960px)";
const CONTENT_LIBRARY_PREVIEW_SIDEBAR_COLLAPSE_BREAKPOINT = 1280;
const CONTENT_LIBRARY_PREVIEW_MIN_WIDTH_PERCENT = 30;
const CONTENT_LIBRARY_PREVIEW_ROW_CLASS_NAME = "bg-accent/24  hover:bg-accent/30";

function getContentLibraryPreviewWidthDefaults(viewportWidth: number) {
  if (viewportWidth >= 1680) {
    return { defaultPercent: 55, maxPercent: 60 };
  }
  if (viewportWidth >= 1440) {
    return { defaultPercent: 50, maxPercent: 55 };
  }
  if (viewportWidth >= 1200) {
    return { defaultPercent: 40, maxPercent: 50 };
  }
  return { defaultPercent: 40, maxPercent: 45 };
}

function getContentLibraryPreviewWidthDefaultsFromWindow() {
  if (typeof window === "undefined") {
    return { defaultPercent: 42, maxPercent: 45 };
  }
  return getContentLibraryPreviewWidthDefaults(window.innerWidth);
}

function getContentLibraryCardMode(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(CONTENT_LIBRARY_CARD_MODE_QUERY).matches;
}

function getContentLibraryPreservedViewSearch(view: unknown) {
  return typeof view === "string" && view.trim() ? { view: view.trim() } : undefined;
}

function getContentLibraryPreservedSearch(params: {
  view: unknown;
  focusItemId: unknown;
  includeCreate?: boolean;
}) {
  const viewSearch = getContentLibraryPreservedViewSearch(params.view);
  const focusItemId =
    typeof params.focusItemId === "string" && params.focusItemId.trim()
      ? params.focusItemId.trim()
      : undefined;

  return {
    ...viewSearch,
    ...(focusItemId ? { focusItemId } : {}),
    ...(params.includeCreate ? { create: "1" as const } : {}),
  };
}

function shouldAutoCollapseSidebarForPreview(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth < CONTENT_LIBRARY_PREVIEW_SIDEBAR_COLLAPSE_BREAKPOINT;
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

  if (!visibility && !order) {
    return undefined;
  }

  return {
    ...(visibility ? { visibility } : {}),
    ...(order ? { order } : {}),
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
  const savedFilters = savedView.filters ?? {};
  const savedSorting = savedView.sorting ?? [];
  const savedColumns = savedView.columns ?? undefined;

  return (
    savedView.baseViewId === currentWorkbench.baseViewId &&
    (savedView.query ?? "") === currentWorkbench.query &&
    areContentLibraryToolbarFiltersEqual(savedFilters, currentWorkbench.filters) &&
    areSavedViewSortingEqual(savedSorting, currentWorkbench.sorting) &&
    (!savedView.viewMode || savedView.viewMode === currentWorkbench.viewMode) &&
    (!savedColumns || areSavedViewColumnsEqual(savedColumns, currentWorkbench.columns))
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
          savedValue: summarizeViewFilters(savedView.filters ?? {}, t),
          nextValue: summarizeViewFilters(currentWorkbench.filters, t),
        }
      : null,
    !areSavedViewSortingEqual(savedView.sorting, currentWorkbench.sorting)
      ? {
          id: "sorting",
          label: t("content:CONTENT_LIBRARY_UPDATE_VIEW_DIFF_SORTING"),
          savedValue: summarizeViewSorting(savedView.sorting ?? [], t),
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
          savedValue: summarizeViewColumns(savedView.columns ?? undefined, t),
          nextValue: summarizeViewColumns(currentWorkbench.columns, t),
        }
      : null,
  ];

  return items.filter((item): item is ContentLibraryViewDiffItem => item !== null);
}

type ContentLibraryPageProps = {
  projectId?: string;
  search?: {
    view?: string;
    focusItemId?: string;
    create?: "1";
  };
  routeBase?:
    | "/projects/$projectId/content/library/"
    | "/projects/$projectId/content/library/$itemId/";
};

export function ContentLibraryPage(props: ContentLibraryPageProps) {
  const { t } = useTranslation(["content", "common", "nav", "team"]);
  const navigate = useNavigate({
    from: props.routeBase ?? "/projects/$projectId/content/library/",
  });
  const search = props.search ?? {};
  const projectIdFromStore = useWorkspaceStore((state) => state.currentProjectId);
  const projectId = props.projectId ?? projectIdFromStore;
  const sidebar = useSidebar();
  const queryClient = useQueryClient();
  const dateTime = useWorkspaceDateTimeFormatter();
  const permissionAccess = useProjectPermissionAccess(projectId);
  const autoCardMode = useContentLibraryCardMode();
  const [manualViewMode, setManualViewMode] = React.useState<ContentLibraryViewMode | null>(null);
  const [toolbarFilters, setToolbarFilters] = React.useState<ContentLibraryToolbarFilters>({});
  const [viewState, setViewState] = React.useState<ContentLibraryViewState>(
    CONTENT_LIBRARY_DEFAULT_VIEW_STATE,
  );
  const [selection, setSelection] = React.useState<AssetSelectionState>({
    selectedIds: new Set(),
    lastActiveId: null,
  });
  const [previewRowId, setPreviewRowId] = React.useState<string | null>(null);
  const [viewDialogState, setViewDialogState] =
    React.useState<ContentLibraryViewDialogState | null>(null);
  const [viewDialogDraft, setViewDialogDraft] = React.useState<ContentLibraryPrototypeViewDraft>(
    () => createContentLibraryPrototypeViewDraft(),
  );
  const [pendingDeleteViewId, setPendingDeleteViewId] = React.useState<string | null>(null);
  const [pendingUpdateViewId, setPendingUpdateViewId] = React.useState<string | null>(null);
  const [handledFocusItemId, setHandledFocusItemId] = React.useState<string | null>(null);
  const [pendingBulkAction, setPendingBulkAction] = React.useState<BulkActionKind | null>(null);
  const [previewWidthPercent, setPreviewWidthPercent] = React.useState(
    () => getContentLibraryPreviewWidthDefaultsFromWindow().defaultPercent,
  );
  const [previewResizeActive, setPreviewResizeActive] = React.useState(false);
  const [duplicateRow, setDuplicateRow] = React.useState<ContentLibraryTableRow | null>(null);
  const [deleteRow, setDeleteRow] = React.useState<ContentLibraryTableRow | null>(null);
  const [archiveDialog, setArchiveDialog] = React.useState<ArchiveDialogState | null>(null);
  const [itemSettingsDialog, setItemSettingsDialog] =
    React.useState<ContentLibraryItemSettingsDialogState>(null);
  const splitLayoutRef = React.useRef<HTMLDivElement | null>(null);
  const previewResizeCleanupRef = React.useRef<(() => void) | null>(null);
  const dataTableId = React.useMemo(
    () => contentLibraryTableId(projectId ? String(projectId) : null),
    [projectId],
  );
  const createDialogOpen = search.create === "1";
  const viewMode: ContentLibraryViewMode = manualViewMode ?? (autoCardMode ? "card" : "table");
  const permissionReady = !projectId || permissionAccess.authzQuery.isFetched;
  const canManageContent =
    !projectId || !permissionReady || permissionAccess.hasAction("content:items:write");
  const modelsQuery = useQuery({
    queryKey: buildContentLibraryModelsQueryKey(projectId ? String(projectId) : null),
    enabled: Boolean(projectId),
    queryFn: async () => loadContentLibraryModels(String(projectId)),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });
  const itemsQuery = useQuery({
    queryKey: buildContentLibraryItemsQueryKey(projectId ? String(projectId) : null),
    enabled: Boolean(projectId),
    queryFn: async () => loadContentLibraryItems(String(projectId)),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });
  const viewsQueryKey = React.useMemo(
    () => buildContentLibraryViewsQueryKey(projectId ? String(projectId) : null),
    [projectId],
  );
  const viewsQuery = useQuery({
    queryKey: viewsQueryKey,
    enabled: Boolean(projectId),
    queryFn: async () => loadContentLibraryViewsState(String(projectId)),
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
  const previewRow = React.useMemo(
    () => rows.find((row) => row.id === previewRowId) ?? null,
    [previewRowId, rows],
  );
  const orderedRowIds = React.useMemo(() => rows.map((row) => row.id), [rows]);
  const savedViews = React.useMemo<ContentLibrarySavedView[]>(
    () => viewsQuery.data?.items ?? [],
    [viewsQuery.data?.items],
  );
  const defaultViewState = React.useMemo(
    () => resolveContentLibraryDefaultViewState(savedViews, viewsQuery.data?.defaultViewId ?? null),
    [savedViews, viewsQuery.data?.defaultViewId],
  );
  const viewsHydrationReady = !projectId || viewsQuery.isFetched || viewsQuery.isError;
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
    if (!projectId) return;
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
  }, [defaultViewState, navigate, savedViews, search.view, viewsHydrationReady, projectId]);
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
    setPreviewRowId(focusRow.id);
    setHandledFocusItemId(focusItemId);
  }, [handledFocusItemId, rows, search.focusItemId]);
  React.useEffect(() => {
    setSelection((prev) => {
      const nextSelectedIds = new Set(
        Array.from(prev.selectedIds).filter((id) => orderedRowIds.includes(id)),
      );
      const nextLastActiveId =
        prev.lastActiveId && nextSelectedIds.has(prev.lastActiveId) ? prev.lastActiveId : null;
      if (
        nextSelectedIds.size === prev.selectedIds.size &&
        nextLastActiveId === prev.lastActiveId
      ) {
        return prev;
      }
      return {
        selectedIds: nextSelectedIds,
        lastActiveId: nextLastActiveId,
      };
    });
  }, [orderedRowIds]);
  React.useEffect(() => {
    if (!previewRowId) return;
    if (rows.some((row) => row.id === previewRowId)) return;
    setPreviewRowId(null);
  }, [previewRowId, rows]);
  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const handleResize = () => {
      const { maxPercent } = getContentLibraryPreviewWidthDefaults(window.innerWidth);
      setPreviewWidthPercent((prev) =>
        Math.min(maxPercent, Math.max(CONTENT_LIBRARY_PREVIEW_MIN_WIDTH_PERCENT, prev)),
      );
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  React.useEffect(() => {
    return () => {
      previewResizeCleanupRef.current?.();
      previewResizeCleanupRef.current = null;
    };
  }, []);
  const previewOpenRef = React.useRef(false);
  const collapsedSidebarForPreviewRef = React.useRef(false);
  React.useEffect(() => {
    const previewOpen = Boolean(previewRowId);
    if (!sidebar.isMobile && previewOpen && !previewOpenRef.current) {
      const shouldCollapseSidebar =
        sidebar.layoutState === "expanded" && shouldAutoCollapseSidebarForPreview();
      collapsedSidebarForPreviewRef.current = shouldCollapseSidebar;
      if (shouldCollapseSidebar) {
        sidebar.setOpen(false);
      }
    }
    if (!sidebar.isMobile && !previewOpen && previewOpenRef.current) {
      if (collapsedSidebarForPreviewRef.current) {
        sidebar.setOpen(true);
      }
      collapsedSidebarForPreviewRef.current = false;
    }
    previewOpenRef.current = previewOpen;
  }, [previewRowId, sidebar]);
  React.useEffect(() => {
    if (!toolbarFilters.modelKey) return;
    if (models.some((model) => model.key === toolbarFilters.modelKey)) return;
    setToolbarFilters((prev) => ({ ...prev, modelKey: undefined }));
  }, [models, toolbarFilters.modelKey]);
  const archiveMutation = useMutation({
    mutationFn: async (dialog: ArchiveDialogState) => {
      if (!projectId) throw new Error("PROJECT_NOT_SELECTED");
      if (dialog.mode === "unarchive") {
        return unarchiveContentItem(String(projectId), dialog.row.id);
      }
      return archiveContentItem(String(projectId), dialog.row.id);
    },
    onSuccess: async (_, dialog) => {
      notifySuccessText(
        dialog.mode === "unarchive"
          ? t("content:CONTENT_LIBRARY_UNARCHIVE_SUCCESS")
          : t("content:CONTENT_LIBRARY_ARCHIVE_SUCCESS"),
      );
      setArchiveDialog(null);
      await queryClient.invalidateQueries({
        queryKey: buildContentLibraryItemsQueryKey(projectId ? String(projectId) : null),
      });
    },
    onError: (error) => notifyError(error),
  });
  const duplicateMutation = useMutation({
    mutationFn: async (row: ContentLibraryTableRow) => {
      if (!projectId) throw new Error("PROJECT_NOT_SELECTED");
      return duplicateContentItem(String(projectId), row.id);
    },
    onSuccess: async () => {
      notifySuccessText(t("content:CONTENT_LIBRARY_DUPLICATE_SUCCESS"));
      setDuplicateRow(null);
      await queryClient.invalidateQueries({
        queryKey: buildContentLibraryItemsQueryKey(projectId ? String(projectId) : null),
      });
    },
    onError: (error) => notifyError(error),
  });
  const deleteMutation = useMutation({
    mutationFn: async (row: ContentLibraryTableRow) => {
      if (!projectId) throw new Error("PROJECT_NOT_SELECTED");
      await deleteContentItem(String(projectId), row.id);
    },
    onSuccess: async () => {
      notifySuccessText(t("content:CONTENT_LIBRARY_DELETE_SUCCESS"));
      setDeleteRow(null);
      await queryClient.invalidateQueries({
        queryKey: buildContentLibraryItemsQueryKey(projectId ? String(projectId) : null),
      });
    },
    onError: (error) => notifyError(error),
  });
  const archiveSelectionMutation = useMutation({
    mutationFn: async (rowIds: string[]) => {
      if (!projectId) throw new Error("PROJECT_NOT_SELECTED");
      await Promise.all(rowIds.map((rowId) => archiveContentItem(String(projectId), rowId)));
    },
    onSuccess: async () => {
      notifySuccessText(t("content:CONTENT_LIBRARY_BULK_ARCHIVE_SUCCESS"));
      setPendingBulkAction(null);
      setSelection((prev) => clearSelection(prev));
      await queryClient.invalidateQueries({
        queryKey: buildContentLibraryItemsQueryKey(projectId ? String(projectId) : null),
      });
    },
    onError: (error) => notifyError(error),
  });
  const deleteSelectionMutation = useMutation({
    mutationFn: async (rowIds: string[]) => {
      if (!projectId) throw new Error("PROJECT_NOT_SELECTED");
      await Promise.all(rowIds.map((rowId) => deleteContentItem(String(projectId), rowId)));
    },
    onSuccess: async (_, rowIds) => {
      notifySuccessText(t("content:CONTENT_LIBRARY_BULK_DELETE_SUCCESS"));
      setPendingBulkAction(null);
      setSelection((prev) => clearSelection(prev));
      setPreviewRowId((prev) => (prev && rowIds.includes(prev) ? null : prev));
      await queryClient.invalidateQueries({
        queryKey: buildContentLibraryItemsQueryKey(projectId ? String(projectId) : null),
      });
    },
    onError: (error) => notifyError(error),
  });
  const handleOpenPreview = React.useCallback(
    (row: ContentLibraryTableRow) => {
      if (!projectId) return;
      const preservedViewSearch = getContentLibraryPreservedViewSearch(search.view);
      setSelection((prev) => clearSelection(prev));
      setPreviewRowId(row.id);
      void navigate({
        search: preservedViewSearch
          ? { ...preservedViewSearch, focusItemId: row.id }
          : { focusItemId: row.id },
        replace: true,
      });
    },
    [navigate, search.view, projectId],
  );
  const handleClosePreview = React.useCallback(() => {
    setPreviewRowId(null);
    void navigate({
      search: getContentLibraryPreservedSearch({
        view: search.view,
        focusItemId: null,
        includeCreate: createDialogOpen,
      }),
      replace: true,
    });
  }, [createDialogOpen, navigate, search.view]);
  const handleCreateDialogOpenChange = React.useCallback(
    (open: boolean) => {
      void navigate({
        search: getContentLibraryPreservedSearch({
          view: search.view,
          focusItemId: search.focusItemId,
          includeCreate: open,
        }),
        replace: !open,
      });
    },
    [navigate, search.focusItemId, search.view],
  );
  const handlePreviewResizePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const container = splitLayoutRef.current;
      if (!container) return;

      event.preventDefault();
      event.stopPropagation();

      const updatePreviewWidth = (clientX: number) => {
        const rect = container.getBoundingClientRect();
        if (!rect.width) return;
        const { maxPercent } = getContentLibraryPreviewWidthDefaults(window.innerWidth);
        const nextPercent = ((rect.right - clientX) / rect.width) * 100;
        setPreviewWidthPercent(
          Math.min(maxPercent, Math.max(CONTENT_LIBRARY_PREVIEW_MIN_WIDTH_PERCENT, nextPercent)),
        );
      };

      updatePreviewWidth(event.clientX);
      setPreviewResizeActive(true);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const clearResizeState = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        setPreviewResizeActive(false);
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", clearResizeState);
        window.removeEventListener("pointercancel", clearResizeState);
        previewResizeCleanupRef.current = null;
      };

      const handlePointerMove = (moveEvent: PointerEvent) => {
        updatePreviewWidth(moveEvent.clientX);
      };

      previewResizeCleanupRef.current?.();
      previewResizeCleanupRef.current = clearResizeState;
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", clearResizeState);
      window.addEventListener("pointercancel", clearResizeState);
    },
    [],
  );
  const handleRowSelection = React.useCallback(
    (
      row: ContentLibraryTableRow,
      event?: Pick<React.MouseEvent, "metaKey" | "ctrlKey" | "shiftKey">,
    ) => {
      setSelection((prev) => {
        if (event?.shiftKey) {
          return rangeSelect(prev, row.id, orderedRowIds);
        }
        if (event?.metaKey || event?.ctrlKey) {
          return toggleSelect(prev, row.id);
        }
        return selectOnly(prev, row.id);
      });
    },
    [orderedRowIds],
  );
  const handleRowClick = React.useCallback(
    (
      row: ContentLibraryTableRow,
      event?: Pick<React.MouseEvent, "metaKey" | "ctrlKey" | "shiftKey">,
    ) => {
      if (event?.shiftKey || event?.metaKey || event?.ctrlKey) {
        handleRowSelection(row, event);
        return;
      }
      handleOpenPreview(row);
    },
    [handleOpenPreview, handleRowSelection],
  );
  const handleOpenFullEditor = React.useCallback(
    (row: ContentLibraryTableRow) => {
      if (!projectId) return;
      void navigate({
        to: projectContentLibraryItemPath(String(projectId), row.id),
      });
    },
    [navigate, projectId],
  );
  const openItemSettingsDialog = React.useCallback(
    (kind: NonNullable<ContentLibraryItemSettingsDialogState>["kind"]) =>
      (row: ContentLibraryTableRow) => {
        setItemSettingsDialog({ kind, row });
      },
    [],
  );
  const applyViewsState = React.useCallback(
    (next: AdminContentLibraryViewsState) => {
      queryClient.setQueryData(viewsQueryKey, next);
    },
    [queryClient, viewsQueryKey],
  );
  const createViewMutation = useMutation({
    mutationFn: async (payload: CreateAdminContentLibraryViewPayload) => {
      if (!projectId) throw new Error("PROJECT_NOT_SELECTED");
      return createContentLibraryView(String(projectId), payload);
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
      if (!projectId) throw new Error("PROJECT_NOT_SELECTED");
      return updateContentLibraryView(String(projectId), input.viewId, input.payload);
    },
    onSuccess: (next) => {
      applyViewsState(next);
    },
    onError: (error) => notifyError(error),
  });
  const moveViewMutation = useMutation({
    mutationFn: async (input: { viewId: string; direction: "up" | "down" }) => {
      if (!projectId) throw new Error("PROJECT_NOT_SELECTED");
      return moveContentLibraryView(String(projectId), input.viewId, {
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
      if (!projectId) throw new Error("PROJECT_NOT_SELECTED");
      return deleteContentLibraryView(String(projectId), viewId);
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
      archiveSelectionMutation.isPending ||
      deleteSelectionMutation.isPending,
    selectedRowIds: selection.selectedIds,
    onToggleVisibleRows: (visibleRows, allVisibleSelected) => {
      if (allVisibleSelected) {
        setSelection((prev) => clearSelection(prev));
        return;
      }
      const orderedIds = visibleRows.map((row) => row.id);
      setSelection({
        selectedIds: new Set(orderedIds),
        lastActiveId: orderedIds.at(-1) ?? null,
      });
    },
    onToggleRowSelection: (row) => {
      setSelection((prev) => toggleSelect(prev, row.id));
    },
    onOpen: handleOpenPreview,
    onOpenFullEditor: handleOpenFullEditor,
    onEditPermalink: openItemSettingsDialog("permalink"),
    onEditSeo: openItemSettingsDialog("seo"),
    onEditVisibility: openItemSettingsDialog("visibility"),
    onOpenPageSettings: openItemSettingsDialog("page-settings"),
    onOpenStructuredFields: openItemSettingsDialog("structured-fields"),
    canManageContent,
    onDuplicate: setDuplicateRow,
    onDelete: setDeleteRow,
    onArchive: (row) => setArchiveDialog({ row, mode: "archive" }),
    onUnarchive: (row) => setArchiveDialog({ row, mode: "unarchive" }),
    openPreviewRowId: previewRowId,
  });
  const dataReady = Boolean(projectId) && !modelsQuery.isLoading && !itemsQuery.isLoading;
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
        columnVisibility || columnOrder
          ? {
              ...(columnVisibility ? { visibility: columnVisibility } : {}),
              ...(columnOrder ? { order: columnOrder } : {}),
            }
          : undefined,
    };
  }, [
    effectiveSystemViewId,
    tableHook.searchInput,
    tableHook.sorting,
    tableHook.table,
    toolbarFilters,
    viewMode,
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
      setToolbarFilters(savedView.filters ?? {});
      tableHook.setSearchInput(savedView.query ?? "");
      tableHook.setSorting(savedView.sorting ?? []);
      if (savedView.viewMode) setManualViewMode(savedView.viewMode);
      if (savedView.columns) {
        if (savedView.columns.visibility) {
          tableHook.table.setColumnVisibility?.(savedView.columns.visibility);
        } else {
          tableHook.resetColumnVisibility();
        }
        tableHook.table.setColumnOrder?.(savedView.columns.order ?? []);
      }
    },
    [tableHook],
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
        dirty:
          viewState.kind === "saved" &&
          viewState.viewId === view.id &&
          !doesSavedViewMatchWorkbench(view, currentWorkbenchDefinition),
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
  const selectedRowIds = React.useMemo(
    () => orderedRowIds.filter((rowId) => selection.selectedIds.has(rowId)),
    [orderedRowIds, selection.selectedIds],
  );
  const selectedCount = selectedRowIds.length;
  const isInitialEmptyState = !modelsQuery.isLoading && !itemsQuery.isLoading && rows.length === 0;
  const toolsLabels = React.useMemo(() => buildDataTableToolsLabels(t), [t]);
  const refreshing =
    tableHook.isFetching ||
    modelsQuery.isFetching ||
    itemsQuery.isFetching ||
    viewsQuery.isFetching ||
    archiveMutation.isPending ||
    archiveSelectionMutation.isPending ||
    deleteSelectionMutation.isPending;
  const toolbarNode = (
    <ContentLibraryToolbar
      table={tableHook.table}
      searchInput={tableHook.searchInput}
      onSearchInputChange={tableHook.setSearchInput}
      filters={toolbarFilters}
      onFiltersChange={setToolbarFilters}
      refreshing={refreshing}
      onRefresh={() => {
        void Promise.all([modelsQuery.refetch(), itemsQuery.refetch()]);
      }}
      onResetColumnVisibility={tableHook.resetColumnVisibility}
      toolsLabels={toolsLabels}
      modelOptions={models.map((model) => ({
        value: model.key,
        label: getContentTypeLabel({
          modelKey: model.key,
          fallbackName: model.name,
          fallbackLabel: model.key,
          t: (key) => t(`content:${key}`),
        }),
      }))}
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
  const selectionToolbarNode = (
    <ContentLibrarySelectionToolbar
      t={t}
      selectedCount={selectedCount}
      canManageContent={canManageContent}
      archivePending={archiveSelectionMutation.isPending}
      deletePending={deleteSelectionMutation.isPending}
      onClearSelection={() => {
        setSelection((prev) => clearSelection(prev));
      }}
      onOpenArchive={() => setPendingBulkAction("archive")}
      onOpenDelete={() => setPendingBulkAction("delete")}
    />
  );
  const workbenchNode = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-background px-10 pt-8 pb-20">
      <PageMainRegion
        title={t("nav:NAV_CONTENT_LIBRARY")}
        action={
          <ContentLibraryPrimaryAction
            projectId={projectId ? String(projectId) : null}
            canManageContent={canManageContent}
            onNavigateCreate={() => handleCreateDialogOpenChange(true)}
            onNavigateModels={() =>
              void navigate({ to: projectContentModelsPath(String(projectId)) })
            }
          />
        }
        extra={toolbarNode}
        contentClassName="min-h-0 flex flex-col"
      >
        <div className="flex min-h-0 flex-1 flex-col">
          {!canManageContent ? (
            <div className="mb-4 rounded-2xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              {t("content:CONTENT_LIBRARY_NO_ACCESS_DESC")}
            </div>
          ) : null}
          {viewMode === "card" && (tableHook.pageData?.items.length ?? 0) > 0 ? (
            <div className="flex min-h-0 flex-col gap-4">
              <ContentLibraryCardList
                rows={tableHook.pageData?.items ?? []}
                previewRowId={previewRowId}
                canManageContent={canManageContent}
                onCardClick={handleOpenPreview}
                onOpen={handleOpenPreview}
                onOpenFullEditor={handleOpenFullEditor}
                onEditPermalink={openItemSettingsDialog("permalink")}
                onEditSeo={openItemSettingsDialog("seo")}
                onEditVisibility={openItemSettingsDialog("visibility")}
                onOpenPageSettings={openItemSettingsDialog("page-settings")}
                onOpenStructuredFields={openItemSettingsDialog("structured-fields")}
                onDuplicate={setDuplicateRow}
                onDelete={setDeleteRow}
                onArchive={(row) => setArchiveDialog({ row, mode: "archive" })}
                onUnarchive={(row) => setArchiveDialog({ row, mode: "unarchive" })}
                formatDateTimeOrNull={dateTime.formatDateTimeOrNull}
                pending={
                  archiveMutation.isPending ||
                  duplicateMutation.isPending ||
                  deleteMutation.isPending
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
              infiniteScroll={tableHook.infiniteScroll}
              t={t}
              rowHeight="medium"
              refreshing={refreshing && !modelsQuery.isLoading && !itemsQuery.isLoading}
              rowClassName={(row) =>
                previewRowId === row.original.id
                  ? CONTENT_LIBRARY_PREVIEW_ROW_CLASS_NAME
                  : undefined
              }
              onRowClick={(row, _rowIndex, event) => handleRowClick(row.original, event)}
            />
          )}
        </div>
      </PageMainRegion>
    </div>
  );

  return (
    <AdminRouteContainer
      className="h-full overflow-hidden"
      innerClassName="h-full min-h-0 flex flex-col overflow-hidden px-0 pt-0 pb-0"
      overlay={selectionToolbarNode}
    >
      <div ref={splitLayoutRef} className="flex min-h-0 flex-1 overflow-hidden bg-background">
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{workbenchNode}</div>
        <AnimatePresence initial={false}>
          {previewRow ? (
            <motion.div
              key="content-library-preview-shell"
              className="flex h-full min-h-0 shrink-0 overflow-hidden"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: `${previewWidthPercent}%`, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{
                width: {
                  duration: previewResizeActive ? 0 : 0.24,
                  ease: [0.22, 1, 0.36, 1],
                },
                opacity: { duration: 0.16, ease: "easeOut" },
              }}
            >
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label={t("common:RESIZE")}
                onPointerDown={handlePreviewResizePointerDown}
                className="relative flex w-px shrink-0 cursor-col-resize items-center justify-center bg-border/70 transition-colors after:absolute after:inset-y-0 after:left-1/2 after:w-2 after:-translate-x-1/2 hover:bg-border"
              >
                <div className="z-10 flex h-10 w-3 cursor-col-resize items-center justify-center rounded-full border border-border/80 bg-card ">
                  <div className="flex flex-col gap-1">
                    <span className="block h-1 w-1 rounded-full bg-muted-foreground/70" />
                    <span className="block h-1 w-1 rounded-full bg-muted-foreground/70" />
                    <span className="block h-1 w-1 rounded-full bg-muted-foreground/70" />
                  </div>
                </div>
              </div>
              <motion.div
                key={previewRow.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-l border-border/70 bg-card "
              >
                <ContentLibraryPreviewPanel
                  className="min-h-0 w-full flex-1"
                  projectId={String(projectId)}
                  row={previewRow}
                  readOnly={!canManageContent}
                  initialTitle={previewRow.title || previewRow.name}
                  initialSummary=""
                  onClose={handleClosePreview}
                  onOpenPage={() => {
                    if (!projectId) return;
                    void navigate({
                      to: projectContentLibraryItemPath(String(projectId), previewRow.id),
                    });
                  }}
                  onEditPermalink={() =>
                    setItemSettingsDialog({ kind: "permalink", row: previewRow })
                  }
                  onEditSeo={() => setItemSettingsDialog({ kind: "seo", row: previewRow })}
                  onEditVisibility={() =>
                    setItemSettingsDialog({ kind: "visibility", row: previewRow })
                  }
                  onOpenPageSettings={() =>
                    setItemSettingsDialog({ kind: "page-settings", row: previewRow })
                  }
                  onOpenStructuredFields={() =>
                    setItemSettingsDialog({ kind: "structured-fields", row: previewRow })
                  }
                />
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
      <>
        {projectId ? (
          <ContentLibraryCreateContentDialog
            open={createDialogOpen}
            projectId={String(projectId)}
            readOnly={!canManageContent}
            onOpenChange={handleCreateDialogOpenChange}
          />
        ) : null}
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
          <AlertDialogContent className="sm:max-w-160">
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
                  <div className="text-callout font-semibold text-label-primary">{item.label}</div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="grid gap-1.5">
                      <div className="text-callout text-label-secondary">
                        {t("content:CONTENT_LIBRARY_UPDATE_VIEW_DIFF_SAVED")}
                      </div>
                      <div className="rounded-lg border border-border/60 bg-card px-3 py-2 text-callout text-label-primary">
                        {item.savedValue}
                      </div>
                    </div>
                    <div className="grid gap-1.5">
                      <div className="text-callout text-label-secondary">
                        {t("content:CONTENT_LIBRARY_UPDATE_VIEW_DIFF_CURRENT")}
                      </div>
                      <div className="rounded-lg border border-border/60 bg-card px-3 py-2 text-callout text-label-primary">
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
          <AlertDialogContent className="sm:max-w-130">
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
          bulkArchiveDialog={{
            open: pendingBulkAction === "archive",
            count: selectedCount,
            pending: archiveSelectionMutation.isPending,
            onOpenChange: (open) => {
              if (!open && !archiveSelectionMutation.isPending) setPendingBulkAction(null);
            },
            onConfirm: () => {
              if (!selectedRowIds.length) return;
              archiveSelectionMutation.mutate(selectedRowIds);
            },
          }}
          bulkDeleteDialog={{
            open: pendingBulkAction === "delete",
            count: selectedCount,
            pending: deleteSelectionMutation.isPending,
            onOpenChange: (open) => {
              if (!open && !deleteSelectionMutation.isPending) setPendingBulkAction(null);
            },
            onConfirm: () => {
              if (!selectedRowIds.length) return;
              deleteSelectionMutation.mutate(selectedRowIds);
            },
          }}
        />
        <ContentLibraryItemSettingsDialogs
          state={itemSettingsDialog}
          readOnly={!canManageContent}
          onClose={() => setItemSettingsDialog(null)}
        />
      </>
    </AdminRouteContainer>
  );
}

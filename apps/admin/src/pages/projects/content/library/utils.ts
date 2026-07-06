import type { PageData } from "@arclayer/ui/data-table";

import type { AdminContentItem } from "@arclayer/openapi/admin-types";
import type { AdminContentModel } from "@arclayer/openapi/admin-types";
import type {
  ContentLibraryDerivedStatus,
  ContentLibraryEditWith,
  ContentLibraryFacetOption,
  ContentLibraryRole,
  ContentLibrarySavedView,
  ContentLibraryScopeId,
  ContentLibrarySidebarCounts,
  ContentLibrarySystemViewId,
  ContentLibraryTableRow,
  ContentLibraryToolbarFilters,
  ContentLibraryViewDefinition,
  ContentLibraryViewState,
} from "./types";

const RECENT_WINDOW_DAYS = 7;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const CONTENT_DEFAULT_PAGE_SIZE = 10;

export const CONTENT_LIBRARY_DEFAULT_SCOPE: ContentLibraryScopeId = "quick:all";
export const CONTENT_LIBRARY_DEFAULT_VIEW_STATE: ContentLibraryViewState = {
  kind: "system",
  viewId: "all",
};
const CONTENT_LIBRARY_VIEW_STORAGE_PREFIX = "project-content-library:view";
const CONTENT_LIBRARY_SAVED_VIEWS_STORAGE_PREFIX = "project-content-library:saved-views";
const CONTENT_LIBRARY_ROLES = [
  "page",
  "article",
  "reusable-section",
  "taxonomy",
  "person",
  "settings",
  "data",
  "general",
] as const satisfies readonly ContentLibraryRole[];
const CONTENT_LIBRARY_ROLE_SET = new Set<ContentLibraryRole>(CONTENT_LIBRARY_ROLES);
const CONTENT_LIBRARY_EDIT_WITH_VALUES = [
  "writing",
  "canvas",
  "structured",
] as const satisfies readonly ContentLibraryEditWith[];
const CONTENT_LIBRARY_EDIT_WITH_SET = new Set<ContentLibraryEditWith>(
  CONTENT_LIBRARY_EDIT_WITH_VALUES,
);

const CONTENT_LIBRARY_SYSTEM_VIEWS: ContentLibraryViewDefinition[] = [
  { id: "all", labelKey: "CONTENT_LIBRARY_VIEW_ALL" },
  { id: "draft", labelKey: "CONTENT_LIBRARY_VIEW_DRAFT" },
  { id: "published", labelKey: "CONTENT_LIBRARY_VIEW_PUBLISHED" },
];
const CONTENT_LIBRARY_SUPPORTED_SYSTEM_VIEW_IDS = new Set<ContentLibrarySystemViewId>([
  "all",
  "site-content",
  "draft",
  "published",
  "needs-attention",
]);

function isRecentTimestamp(value: string, now: number): boolean {
  const updatedAt = Date.parse(value);
  if (Number.isNaN(updatedAt)) return false;
  return updatedAt >= now - RECENT_WINDOW_DAYS * MILLISECONDS_PER_DAY;
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function compareNumbers(a: number, b: number): number {
  return a === b ? 0 : a < b ? -1 : 1;
}

function compareMaybeTimestamp(a: string, b: string): number {
  const left = Date.parse(a);
  const right = Date.parse(b);
  if (Number.isNaN(left) || Number.isNaN(right)) return compareText(a, b);
  return compareNumbers(left, right);
}

function compareStatus(
  left: ContentLibraryDerivedStatus,
  right: ContentLibraryDerivedStatus,
): number {
  const rank: Record<ContentLibraryDerivedStatus, number> = {
    changed: 0,
    published: 1,
    draft: 2,
    archived: 3,
  };
  return compareNumbers(rank[left], rank[right]);
}

function isContentLibraryRole(value: unknown): value is ContentLibraryRole {
  return typeof value === "string" && CONTENT_LIBRARY_ROLE_SET.has(value as ContentLibraryRole);
}

function isContentLibraryEditWith(value: unknown): value is ContentLibraryEditWith {
  return (
    typeof value === "string" && CONTENT_LIBRARY_EDIT_WITH_SET.has(value as ContentLibraryEditWith)
  );
}

function normalizeContentLibraryViewSorting(value: unknown): ContentLibrarySavedView["sorting"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as { id?: unknown; desc?: unknown };
    const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
    if (!id) return [];
    return [{ id, desc: Boolean(candidate.desc) }];
  });
}

function normalizeContentLibraryViewColumns(
  value: unknown,
): ContentLibrarySavedView["columns"] | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as { visibility?: unknown; order?: unknown };
  const visibility =
    candidate.visibility && typeof candidate.visibility === "object"
      ? (Object.fromEntries(
          Object.entries(candidate.visibility as Record<string, unknown>).filter(
            ([key, nextValue]) => Boolean(key.trim()) && typeof nextValue === "boolean",
          ),
        ) as Record<string, boolean>)
      : undefined;
  const order = Array.isArray(candidate.order)
    ? candidate.order.filter(
        (item): item is string => typeof item === "string" && Boolean(item.trim()),
      )
    : undefined;

  if ((!visibility || Object.keys(visibility).length === 0) && (!order || order.length === 0)) {
    return undefined;
  }

  return {
    ...(visibility && Object.keys(visibility).length ? { visibility } : {}),
    ...(order?.length ? { order } : {}),
  };
}

export function buildContentLibrarySystemViews(): ContentLibraryViewDefinition[] {
  return CONTENT_LIBRARY_SYSTEM_VIEWS;
}

export function buildContentLibraryEditWithFacetOptions(): ContentLibraryFacetOption<ContentLibraryEditWith>[] {
  return [
    { id: "writing", labelKey: "CONTENT_LIBRARY_EDIT_WITH_WRITING" },
    { id: "canvas", labelKey: "CONTENT_LIBRARY_EDIT_WITH_CANVAS" },
    { id: "structured", labelKey: "CONTENT_LIBRARY_EDIT_WITH_STRUCTURED" },
  ];
}

export function buildContentLibraryRoleFacetOptions(): ContentLibraryFacetOption<ContentLibraryRole>[] {
  return [
    { id: "page", labelKey: "CONTENT_LIBRARY_ROLE_PAGE" },
    { id: "article", labelKey: "CONTENT_LIBRARY_ROLE_ARTICLE" },
    { id: "reusable-section", labelKey: "CONTENT_LIBRARY_ROLE_REUSABLE_SECTION" },
    { id: "taxonomy", labelKey: "CONTENT_LIBRARY_ROLE_TAXONOMY" },
    { id: "person", labelKey: "CONTENT_LIBRARY_ROLE_PERSON" },
    { id: "settings", labelKey: "CONTENT_LIBRARY_ROLE_SETTINGS" },
    { id: "data", labelKey: "CONTENT_LIBRARY_ROLE_DATA" },
  ];
}

export function isContentLibraryPageRow(
  row: Pick<ContentLibraryTableRow, "modelKey" | "resolvedRole" | "role">,
): boolean {
  return row.role === "page" || row.resolvedRole === "page" || row.modelKey === "page";
}

export function isContentLibraryReusableSectionRow(
  row: Pick<ContentLibraryTableRow, "modelKey" | "resolvedRole" | "role">,
): boolean {
  return (
    row.role === "reusable-section" ||
    row.resolvedRole === "reusable-section" ||
    row.modelKey === "reusableBlock" ||
    row.modelKey === "reusable-section"
  );
}

export function parseContentLibraryViewState(
  value: string | null | undefined,
): ContentLibraryViewState {
  const normalized = String(value || "").trim();
  if (normalized.startsWith("saved:")) {
    const savedId = normalized.slice("saved:".length).trim();
    if (savedId) return { kind: "saved", viewId: savedId };
  }
  if (CONTENT_LIBRARY_SUPPORTED_SYSTEM_VIEW_IDS.has(normalized as ContentLibrarySystemViewId)) {
    return { kind: "system", viewId: normalized as ContentLibrarySystemViewId };
  }
  return CONTENT_LIBRARY_DEFAULT_VIEW_STATE;
}

export function serializeContentLibraryViewState(value: ContentLibraryViewState): string {
  if (value.kind === "saved") {
    return value.viewId.trim()
      ? `saved:${value.viewId.trim()}`
      : serializeContentLibraryViewState(CONTENT_LIBRARY_DEFAULT_VIEW_STATE);
  }
  return parseContentLibraryViewState(value.viewId).viewId;
}

export function isSameContentLibraryViewState(
  left: ContentLibraryViewState,
  right: ContentLibraryViewState,
): boolean {
  return left.kind === right.kind && left.viewId === right.viewId;
}

export function contentLibraryViewStorageKey(workspaceId: string | null | undefined): string {
  return `${CONTENT_LIBRARY_VIEW_STORAGE_PREFIX}:${String(workspaceId || "unknown")}`;
}

export function readPersistedContentLibraryViewState(
  workspaceId: string | null | undefined,
): ContentLibraryViewState {
  if (typeof window === "undefined") return CONTENT_LIBRARY_DEFAULT_VIEW_STATE;
  const raw = window.localStorage.getItem(contentLibraryViewStorageKey(workspaceId));
  return parseContentLibraryViewState(raw);
}

export function writePersistedContentLibraryViewState(
  workspaceId: string | null | undefined,
  value: ContentLibraryViewState,
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    contentLibraryViewStorageKey(workspaceId),
    serializeContentLibraryViewState(value),
  );
}

export function contentLibrarySavedViewsStorageKey(workspaceId: string | null | undefined): string {
  return `${CONTENT_LIBRARY_SAVED_VIEWS_STORAGE_PREFIX}:${String(workspaceId || "unknown")}`;
}

function normalizeSavedViewBaseViewId(value: unknown): ContentLibrarySystemViewId {
  const parsed = parseContentLibraryViewState(typeof value === "string" ? value : undefined);
  return parsed.kind === "system" ? parsed.viewId : "all";
}

function normalizeContentLibrarySavedView(value: unknown): ContentLibrarySavedView | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ContentLibrarySavedView>;
  const id = String(candidate.id || "").trim();
  const name = String(candidate.name || "").trim();
  if (!id || !name) return null;

  const rawStatus = candidate.filters?.status;
  const normalizedStatus =
    rawStatus === "published" ||
    rawStatus === "changed" ||
    rawStatus === "draft" ||
    rawStatus === "archived"
      ? rawStatus
      : undefined;
  const rawModelKey = candidate.filters?.modelKey;
  const rawLocale = candidate.filters?.locale;
  const rawCreatedByUserId = candidate.filters?.createdByUserId;
  const rawTag = candidate.filters?.tag;
  const rawRole = candidate.filters?.role;
  const rawEditWith = candidate.filters?.editWith;

  return {
    id,
    name,
    baseViewId: normalizeSavedViewBaseViewId(candidate.baseViewId),
    query: String(candidate.query || ""),
    filters: {
      status: normalizedStatus,
      modelKey: typeof rawModelKey === "string" && rawModelKey.trim() ? rawModelKey : undefined,
      locale: typeof rawLocale === "string" && rawLocale.trim() ? rawLocale : undefined,
      createdByUserId:
        typeof rawCreatedByUserId === "string" && rawCreatedByUserId.trim()
          ? rawCreatedByUserId
          : undefined,
      tag: typeof rawTag === "string" && rawTag.trim() ? rawTag : undefined,
      role: isContentLibraryRole(rawRole) ? rawRole : undefined,
      editWith: isContentLibraryEditWith(rawEditWith) ? rawEditWith : undefined,
    },
    sorting: normalizeContentLibraryViewSorting(candidate.sorting),
    columns: normalizeContentLibraryViewColumns(candidate.columns),
    visibility:
      candidate.visibility === "workspace" || candidate.visibility === "private"
        ? candidate.visibility
        : "private",
    pinned: Boolean(candidate.pinned),
    isDefault: Boolean(candidate.isDefault),
  };
}

export function readPersistedContentLibrarySavedViews(
  workspaceId: string | null | undefined,
): ContentLibrarySavedView[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(contentLibrarySavedViewsStorageKey(workspaceId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => normalizeContentLibrarySavedView(item))
      .filter((item): item is ContentLibrarySavedView => item !== null);
  } catch {
    return [];
  }
}

export function writePersistedContentLibrarySavedViews(
  workspaceId: string | null | undefined,
  views: ContentLibrarySavedView[],
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    contentLibrarySavedViewsStorageKey(workspaceId),
    JSON.stringify(views),
  );
}

export function renameContentLibrarySavedView(
  views: ContentLibrarySavedView[],
  viewId: string,
  name: string,
): ContentLibrarySavedView[] {
  const nextName = name.trim();
  if (!nextName) return views;
  return views.map((view) => (view.id === viewId ? { ...view, name: nextName } : view));
}

export function togglePinnedContentLibrarySavedView(
  views: ContentLibrarySavedView[],
  viewId: string,
): ContentLibrarySavedView[] {
  return views.map((view) => (view.id === viewId ? { ...view, pinned: !view.pinned } : view));
}

export function moveContentLibrarySavedView(
  views: ContentLibrarySavedView[],
  viewId: string,
  direction: "up" | "down",
): ContentLibrarySavedView[] {
  const index = views.findIndex((view) => view.id === viewId);
  if (index < 0) return views;
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= views.length) return views;
  const next = [...views];
  const current = next[index];
  next[index] = next[target]!;
  next[target] = current!;
  return next;
}

export function deleteContentLibrarySavedView(
  views: ContentLibrarySavedView[],
  viewId: string,
): ContentLibrarySavedView[] {
  return views.filter((view) => view.id !== viewId);
}

export function buildContentLibrarySavedView(input: {
  name: string;
  baseViewId: ContentLibrarySystemViewId;
  query: string;
  filters: ContentLibraryToolbarFilters;
  sorting?: ContentLibrarySavedView["sorting"];
  columns?: ContentLibrarySavedView["columns"];
}): ContentLibrarySavedView {
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `view-${Date.now()}`;
  return {
    id,
    name: input.name.trim(),
    baseViewId: input.baseViewId,
    query: input.query,
    filters: input.filters,
    sorting: input.sorting ?? [],
    columns: input.columns,
    visibility: "private",
    pinned: false,
    isDefault: false,
  };
}

export function findContentLibrarySavedView(
  views: ContentLibrarySavedView[],
  viewId: string | null | undefined,
): ContentLibrarySavedView | null {
  if (!viewId) return null;
  return views.find((view) => view.id === viewId) ?? null;
}

export function normalizeContentLibraryViewState(
  state: ContentLibraryViewState,
  savedViews: ContentLibrarySavedView[],
  fallbackState: ContentLibraryViewState = CONTENT_LIBRARY_DEFAULT_VIEW_STATE,
): ContentLibraryViewState {
  if (state.kind === "saved" && !findContentLibrarySavedView(savedViews, state.viewId)) {
    return fallbackState;
  }
  return state;
}

export function resolveContentLibraryDefaultViewState(
  savedViews: ContentLibrarySavedView[],
  defaultViewId: string | null | undefined,
): ContentLibraryViewState {
  const savedView = findContentLibrarySavedView(savedViews, defaultViewId);
  if (savedView) {
    return { kind: "saved", viewId: savedView.id };
  }
  return CONTENT_LIBRARY_DEFAULT_VIEW_STATE;
}

export function resolveContentLibrarySystemViewId(
  state: ContentLibraryViewState,
  savedViews: ContentLibrarySavedView[],
): ContentLibrarySystemViewId {
  if (state.kind === "system") return state.viewId;
  return findContentLibrarySavedView(savedViews, state.viewId)?.baseViewId ?? "all";
}

export function areContentLibraryToolbarFiltersEqual(
  left: ContentLibraryToolbarFilters,
  right: ContentLibraryToolbarFilters,
): boolean {
  return (
    left.status === right.status &&
    left.modelKey === right.modelKey &&
    left.locale === right.locale &&
    left.createdByUserId === right.createdByUserId &&
    left.tag === right.tag &&
    left.role === right.role &&
    left.editWith === right.editWith
  );
}

export function contentHasAddress(
  row: Pick<ContentLibraryTableRow, "modelCapabilities" | "capabilityPackIds" | "slug">,
): boolean {
  return (
    Boolean(row.slug) &&
    (row.modelCapabilities.includes("routable") || row.capabilityPackIds.includes("routable"))
  );
}

function normalizeScopeFilter(scopeId: ContentLibraryScopeId) {
  if (scopeId === "quick:all") return { kind: "all" as const };
  if (scopeId === "quick:recent") return { kind: "recent" as const };
  if (scopeId === "quick:draft") return { kind: "status" as const, status: "draft" as const };
  if (scopeId === "quick:published") {
    return { kind: "status" as const, status: "published" as const };
  }
  if (scopeId === "quick:archived") {
    return { kind: "status" as const, status: "archived" as const };
  }
  return { kind: "type" as const, modelKey: scopeId.replace("tree:type:", "") };
}

function matchesLegacyScope(
  row: ContentLibraryTableRow,
  scopeId: ContentLibraryScopeId,
  now: number,
): boolean {
  const scope = normalizeScopeFilter(scopeId);
  if (scope.kind === "all") return true;
  if (scope.kind === "recent") return isRecentTimestamp(row.updatedAt, now);
  if (scope.kind === "status") return row.derivedStatus === scope.status;
  return row.modelKey === scope.modelKey;
}

function matchesView(row: ContentLibraryTableRow, viewId: ContentLibrarySystemViewId): boolean {
  switch (viewId) {
    case "all":
      return true;
    case "site-content":
      return row.libraryGroup === "site-content";
    case "draft":
      return row.derivedStatus === "draft";
    case "published":
      return row.derivedStatus === "published";
    case "needs-attention":
      return row.derivedStatus === "draft" || row.derivedStatus === "changed";
    default:
      return true;
  }
}

function matchesToolbarFilters(
  row: ContentLibraryTableRow,
  filters: ContentLibraryToolbarFilters,
): boolean {
  if (filters.status && row.derivedStatus !== filters.status) return false;
  if (filters.modelKey && row.modelKey !== filters.modelKey) return false;
  if (filters.locale && row.locale !== filters.locale) return false;
  if (filters.createdByUserId && row.createdByUserId !== filters.createdByUserId) return false;
  if (filters.tag && !(row.tags ?? []).includes(filters.tag)) return false;
  if (filters.role && row.role !== filters.role) return false;
  if (filters.editWith && row.editWith !== filters.editWith) return false;
  return true;
}

function matchesSearch(row: ContentLibraryTableRow, query: string): boolean {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [row.name, row.modelName || "", row.bootstrapPresetKey || "", row.slug, row.locale]
    .filter(Boolean)
    .some((value) => value.toLowerCase().includes(q));
}

function sortRows(rows: ContentLibraryTableRow[], ordering?: string): ContentLibraryTableRow[] {
  const segments = String(ordering || "")
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (!segments.length) {
    return [...rows].sort((left, right) => compareMaybeTimestamp(right.updatedAt, left.updatedAt));
  }

  const sorted = [...rows];
  sorted.sort((left, right) => {
    for (const segment of segments) {
      const desc = segment.startsWith("-");
      const key = desc ? segment.slice(1) : segment;
      const direction = desc ? -1 : 1;
      let comparison = 0;

      if (key === "name") comparison = compareText(left.name, right.name);
      else if (key === "modelName")
        comparison = compareText(left.modelName || "", right.modelName || "");
      else if (key === "updatedAt")
        comparison = compareMaybeTimestamp(left.updatedAt, right.updatedAt);
      else if (key === "derivedStatus") {
        comparison = compareStatus(left.derivedStatus, right.derivedStatus);
      }

      if (comparison !== 0) return comparison * direction;
    }
    return compareText(left.id, right.id);
  });
  return sorted;
}

export function buildContentLibraryRows(
  items: AdminContentItem[],
  models: AdminContentModel[],
): ContentLibraryTableRow[] {
  const modelByKey = new Map(models.map((model) => [model.singularKey, model]));
  return items.map((item) => {
    const modelKey = item.modelKey || "";
    const model = modelKey ? modelByKey.get(modelKey) : undefined;
    return {
      ...item,
      name: item.title?.trim() || item.slug,
      modelName: model?.name ?? null,
      modelDescription: model?.description ?? null,
      modelCategory: model?.category ?? null,
      modelCapabilities: model?.capabilities ?? [],
    };
  });
}

export function buildContentSidebarCounts(
  rows: ContentLibraryTableRow[],
): ContentLibrarySidebarCounts {
  const now = Date.now();
  const counts: ContentLibrarySidebarCounts = {
    all: rows.length,
    recent: 0,
    statuses: {
      published: 0,
      changed: 0,
      draft: 0,
      archived: 0,
    },
    models: {},
  };

  for (const row of rows) {
    if (isRecentTimestamp(row.updatedAt, now)) counts.recent += 1;
    counts.statuses[row.derivedStatus] += 1;
    if (row.modelKey) {
      counts.models[row.modelKey] = (counts.models[row.modelKey] ?? 0) + 1;
    }
  }

  return counts;
}

export function buildContentLibraryPageData(
  rows: ContentLibraryTableRow[],
  params: {
    page?: number;
    size?: number;
    q?: string;
    ordering?: string;
  },
  viewId: ContentLibrarySystemViewId,
  filters: ContentLibraryToolbarFilters,
): PageData<ContentLibraryTableRow> {
  const page = Math.max(1, params.page ?? 1);
  const size = Math.max(1, params.size ?? CONTENT_DEFAULT_PAGE_SIZE);
  const scoped = rows.filter(
    (row) =>
      matchesView(row, viewId) &&
      matchesToolbarFilters(row, filters) &&
      matchesSearch(row, params.q || ""),
  );
  const sorted = sortRows(scoped, params.ordering);
  const total = sorted.length;
  const pages = total === 0 ? 0 : Math.ceil(total / size);
  const start = (page - 1) * size;
  const items = sorted.slice(start, start + size);

  return {
    items,
    total,
    page,
    size,
    pages,
    next: page < pages ? page + 1 : null,
    prev: page > 1 && page <= pages ? page - 1 : null,
  };
}

export function contentLibraryTableId(projectId: string | null): string {
  return `project-content-library:${projectId || "unknown"}`;
}

export function buildContentItemsQueryKey(projectId: string | null) {
  return ["content", "items", "all", projectId] as const;
}

export function buildContentModelsQueryKey(projectId: string | null) {
  return ["content", "models", "all", projectId] as const;
}

export function isTypeScopeActive(scopeId: ContentLibraryScopeId, modelKey: string): boolean {
  return scopeId === `tree:type:${modelKey}`;
}

export function matchesContentLibraryLegacyScope(
  row: ContentLibraryTableRow,
  scopeId: ContentLibraryScopeId,
  now = Date.now(),
): boolean {
  return matchesLegacyScope(row, scopeId, now);
}

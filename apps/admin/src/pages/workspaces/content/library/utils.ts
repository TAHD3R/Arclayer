import type { PageData } from "@arclayer/ui/data-table";

import type { AdminContentItem, AdminContentModel } from "@/types/api";
import type {
  ContentLibraryContext,
  ContentLibraryDerivedStatus,
  ContentLibraryRuntime,
  ContentLibraryScopeId,
  ContentLibrarySidebarCounts,
  ContentLibraryTableRow,
  ContentLibraryToolbarFilters,
} from "./types";

const RECENT_WINDOW_DAYS = 7;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const CONTENT_DEFAULT_PAGE_SIZE = 10;

export const CONTENT_LIBRARY_DEFAULT_SCOPE: ContentLibraryScopeId = "quick:all";

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

export function deriveContentRuntime(
  model: Pick<AdminContentModel, "capabilities" | "defaultEditor"> | null | undefined,
): ContentLibraryRuntime {
  if (model?.defaultEditor === "visual") return "visual";
  if (model?.defaultEditor === "rich_text") return "text";
  if (model?.defaultEditor === "table" || model?.defaultEditor === "form") return "data";
  if (model?.capabilities.includes("visual_editable")) return "visual";
  if (model?.capabilities.includes("rich_text_editable")) return "text";
  if (model?.capabilities.includes("queryable") || model?.capabilities.includes("has_relations")) {
    return "data";
  }
  return "unknown";
}

export function deriveContentContext(
  model: Pick<AdminContentModel, "category"> | null | undefined,
): ContentLibraryContext {
  return model?.category ?? "standalone";
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
  return { kind: "type" as const, modelKey: scopeId.replace("tree:type:", "") };
}

function matchesScope(
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

function matchesToolbarFilters(
  row: ContentLibraryTableRow,
  filters: ContentLibraryToolbarFilters,
): boolean {
  if (filters.status && row.derivedStatus !== filters.status) return false;
  if (filters.modelKey && row.modelKey !== filters.modelKey) return false;
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

export function deriveContentStatus(item: AdminContentItem): ContentLibraryDerivedStatus {
  if (item.status === "archived") return "archived";
  if (item.publishedVersion && item.draftVersion > item.publishedVersion) return "changed";
  if (item.status === "published") return "published";
  return "draft";
}

export function buildContentLibraryRows(
  items: AdminContentItem[],
  models: AdminContentModel[],
): ContentLibraryTableRow[] {
  const modelByKey = new Map(models.map((model) => [model.key, model]));
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
      derivedStatus: deriveContentStatus(item),
      archiveVersionNumber:
        item.publishedVersion ?? (item.draftVersion > 0 ? item.draftVersion : null),
      runtime: deriveContentRuntime(model),
      context: deriveContentContext(model),
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
  scopeId: ContentLibraryScopeId,
  filters: ContentLibraryToolbarFilters,
): PageData<ContentLibraryTableRow> {
  const page = Math.max(1, params.page ?? 1);
  const size = Math.max(1, params.size ?? CONTENT_DEFAULT_PAGE_SIZE);
  const now = Date.now();
  const scoped = rows.filter(
    (row) =>
      matchesScope(row, scopeId, now) &&
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

export function contentLibraryTableId(workspaceId: string | null): string {
  return `workspace-content-library:${workspaceId || "unknown"}`;
}

export function buildContentItemsQueryKey(workspaceId: string | null) {
  return ["content", "items", "all", workspaceId] as const;
}

export function buildContentModelsQueryKey(workspaceId: string | null) {
  return ["content", "models", "all", workspaceId] as const;
}

export function isTypeScopeActive(scopeId: ContentLibraryScopeId, modelKey: string): boolean {
  return scopeId === `tree:type:${modelKey}`;
}

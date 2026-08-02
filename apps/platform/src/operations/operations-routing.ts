import type {
  OperationalSignalOrder,
  OperationalSignalSeverity,
  OperationalSignalSourceLifecycle,
  OperationalSignalTriageState,
} from "@arclayer/platform-openapi";

import type { OperationalSignalListQuery } from "@/operations/operations-api";

type OperationalSignalSourceDomain = "jobs";

export type NeedsAttentionSearch = Readonly<{
  sourceLifecycle?: OperationalSignalSourceLifecycle;
  coordinationState?: OperationalSignalTriageState;
  sourceDomain?: OperationalSignalSourceDomain;
  severity?: OperationalSignalSeverity;
  assigneeUserId?: string;
  workspaceId?: string;
  projectId?: string;
  siteId?: string;
  scopeType?: "workspace" | "project" | "site";
  includeReminded?: boolean;
  order?: OperationalSignalOrder;
  orderDirection?: "asc" | "desc";
  page?: number;
  signalId?: string;
}>;

const SIGNAL_LIFECYCLES = new Set<OperationalSignalSourceLifecycle>([
  "unresolved",
  "resolved",
  "all",
]);
const TRIAGE_STATES = new Set<OperationalSignalTriageState>([
  "unclaimed",
  "in_progress",
  "waiting",
  "source_recovered",
]);
const SOURCE_DOMAINS = new Set<OperationalSignalSourceDomain>(["jobs"]);
const SEVERITIES = new Set<OperationalSignalSeverity>(["high"]);
const ORDERS = new Set<OperationalSignalOrder>(["priority", "detected_at"]);
const ORDER_DIRECTIONS = new Set(["asc", "desc"] as const);
function string(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function boolean(value: unknown): boolean | undefined {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return undefined;
}

function enumValue<T extends string>(values: ReadonlySet<T>, value: unknown): T | undefined {
  return typeof value === "string" && values.has(value as T) ? (value as T) : undefined;
}

export function parseNeedsAttentionSearch(search: Record<string, unknown>): NeedsAttentionSearch {
  return {
    sourceLifecycle: enumValue(SIGNAL_LIFECYCLES, search.sourceLifecycle),
    coordinationState: enumValue(TRIAGE_STATES, search.coordinationState),
    sourceDomain: enumValue(SOURCE_DOMAINS, search.sourceDomain),
    severity: enumValue(SEVERITIES, search.severity),
    assigneeUserId: string(search.assigneeUserId),
    workspaceId: string(search.workspaceId),
    projectId: string(search.projectId),
    siteId: string(search.siteId),
    scopeType: enumValue(new Set(["workspace", "project", "site"] as const), search.scopeType),
    includeReminded: boolean(search.includeReminded),
    order: enumValue(ORDERS, search.order),
    orderDirection: enumValue(ORDER_DIRECTIONS, search.orderDirection),
    page: positiveInteger(search.page),
    signalId: string(search.signalId),
  };
}

export function operationalSignalQuery(search: NeedsAttentionSearch): OperationalSignalListQuery {
  return {
    sourceLifecycle: search.sourceLifecycle ?? "unresolved",
    coordinationState: search.coordinationState,
    sourceDomain: search.sourceDomain,
    severity: search.severity,
    assigneeUserId: search.assigneeUserId,
    workspaceId: search.workspaceId,
    projectId: search.projectId,
    siteId: search.siteId,
    includeReminded: search.includeReminded ?? false,
    order: search.order ?? "priority",
    orderDirection: search.orderDirection ?? "asc",
    page: search.page ?? 1,
    size: 20,
  };
}

export function hasAttentionFilters(search: NeedsAttentionSearch): boolean {
  return Boolean(
    (search.sourceLifecycle && search.sourceLifecycle !== "unresolved") ||
    search.coordinationState ||
    search.sourceDomain ||
    search.severity ||
    search.assigneeUserId ||
    search.workspaceId ||
    search.projectId ||
    search.siteId ||
    search.includeReminded ||
    (search.order && search.order !== "priority") ||
    (search.orderDirection && search.orderDirection !== "asc"),
  );
}

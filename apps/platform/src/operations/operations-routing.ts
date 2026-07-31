import type {
  OperationalSignalSourceLifecycle,
  OperationalSignalTriageState,
} from "@arclayer/platform-openapi";

import type { OperationalSignalListQuery } from "@/operations/operations-api";

export type OperationsInboxSearch = Readonly<{
  sourceLifecycle?: OperationalSignalSourceLifecycle;
  coordinationState?: OperationalSignalTriageState;
  includeReminded?: boolean;
  page?: number;
  signalId?: string;
}>;

export type PlatformJobsSearch = Readonly<{
  jobId?: string;
}>;

const SIGNAL_LIFECYCLES = new Set<OperationalSignalSourceLifecycle>([
  "unresolved",
  "resolved",
  "all",
]);
const TRIAGE_STATES = new Set<OperationalSignalTriageState>([
  "needs_attention",
  "in_progress",
  "remind_later",
]);
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

export function parseOperationsInboxSearch(search: Record<string, unknown>): OperationsInboxSearch {
  return {
    sourceLifecycle: enumValue(SIGNAL_LIFECYCLES, search.sourceLifecycle),
    coordinationState: enumValue(TRIAGE_STATES, search.coordinationState),
    includeReminded: boolean(search.includeReminded),
    page: positiveInteger(search.page),
    signalId: string(search.signalId),
  };
}

export function parsePlatformJobsSearch(search: Record<string, unknown>): PlatformJobsSearch {
  return {
    jobId: string(search.jobId),
  };
}

export function operationalSignalQuery(search: OperationsInboxSearch): OperationalSignalListQuery {
  return {
    sourceLifecycle: search.sourceLifecycle ?? "unresolved",
    coordinationState: search.coordinationState,
    includeReminded: search.includeReminded ?? false,
    page: search.page ?? 1,
    size: 20,
  };
}

export function hasInboxFilters(search: OperationsInboxSearch): boolean {
  return Boolean(
    (search.sourceLifecycle && search.sourceLifecycle !== "unresolved") ||
    search.coordinationState ||
    search.includeReminded,
  );
}

export function jobIdFromDestination(path: string): string | null {
  const destination = new URL(path, "https://platform.invalid");
  if (destination.origin !== "https://platform.invalid") return null;
  if (destination.pathname !== "/operations/jobs") return null;
  return string(destination.searchParams.get("jobId")) ?? null;
}

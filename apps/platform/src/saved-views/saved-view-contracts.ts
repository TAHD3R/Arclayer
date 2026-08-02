import type {
  PlatformSavedViewCreateCommand,
  PlatformSavedViewOut,
} from "@arclayer/platform-openapi";

export type SavedViewDensity = PlatformSavedViewOut["density"];

export type SavedViewState = Readonly<{
  filters: ReadonlyArray<PlatformSavedViewOut["filters"][number]>;
  ordering: PlatformSavedViewOut["ordering"];
  visibleColumns: readonly string[];
  columnOrder: readonly string[];
  density: SavedViewDensity;
}>;

export type SavedViewDefinition = Readonly<{
  capabilityId: string;
  filterSchemaRevision: string;
  columnSchemaRevision: string;
  defaultState: SavedViewState;
}>;

function definition(
  capabilityId: string,
  ordering: SavedViewState["ordering"],
  columns: readonly string[],
): SavedViewDefinition {
  return {
    capabilityId,
    filterSchemaRevision: "1",
    columnSchemaRevision: "1",
    defaultState: {
      filters: [],
      ordering,
      visibleColumns: columns,
      columnOrder: columns,
      density: "comfortable",
    },
  };
}

export const SAVED_VIEW_DEFINITIONS = {
  operationsSignals: {
    capabilityId: "operations.signals",
    filterSchemaRevision: "2",
    columnSchemaRevision: "2",
    defaultState: {
      filters: [],
      ordering: { code: "priority", direction: "asc" },
      visibleColumns: ["priority", "condition", "source_lifecycle", "coordination_state"],
      columnOrder: ["priority", "condition", "source_lifecycle", "coordination_state"],
      density: "comfortable",
    },
  },
  tenantWorkspaces: definition("tenant.workspaces", { code: "created_at", direction: "desc" }, [
    "name",
    "owner",
    "commerce",
    "last_activity_at",
  ]),
  tenantUsers: definition("tenant.users", { code: "created_at", direction: "desc" }, [
    "display_name",
    "email",
    "status",
    "two_factor_enabled",
    "last_login_at",
  ]),
  tenantProjects: definition("tenant.projects", { code: "created_at", direction: "desc" }, [
    "name",
    "workspace_name",
    "operations",
    "last_activity_at",
  ]),
  monitoringRequests: definition(
    "monitoring.request-records",
    { code: "occurred_at", direction: "desc" },
    ["occurred_at", "route_template", "method", "status_code", "duration_ms", "actor"],
  ),
  monitoringPerformance: definition(
    "monitoring.request-groups",
    { code: "requests", direction: "desc" },
    ["route_template", "method", "requests", "error_rate", "avg_latency_ms", "last_seen_at"],
  ),
  monitoringAiUsage: definition(
    "monitoring.ai-usage-groups",
    { code: "cost_micros", direction: "desc" },
    [
      "provider",
      "model",
      "requests",
      "error_rate",
      "total_tokens",
      "cost_micros",
      "avg_latency_ms",
      "last_seen_at",
    ],
  ),
  monitoringAudit: definition("monitoring.audit", { code: "occurred_at", direction: "desc" }, [
    "occurred_at",
    "event_name",
    "source",
    "actor",
    "entity_type",
    "trace_id",
  ]),
} as const;

export function toSavedViewCommand(
  name: string,
  definition: SavedViewDefinition,
  state: SavedViewState,
): PlatformSavedViewCreateCommand {
  return {
    name,
    filterSchemaRevision: definition.filterSchemaRevision,
    columnSchemaRevision: definition.columnSchemaRevision,
    filters: [...state.filters],
    ordering: state.ordering,
    visibleColumns: [...state.visibleColumns],
    columnOrder: [...state.columnOrder],
    density: state.density,
  };
}

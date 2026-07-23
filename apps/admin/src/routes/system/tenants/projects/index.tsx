import { useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";

import {
  SystemDirectoryProjectsPage,
  type ProjectSortValue,
  type SystemDirectoryProjectsSearch,
} from "@/pages/system/directory/projects/page";

const PROJECT_SORT_VALUES = new Set<ProjectSortValue>([
  "-created_at",
  "created_at",
  "name",
  "-name",
  "workspace_name",
  "-workspace_name",
  "member_count",
  "-member_count",
  "activity_at",
  "-activity_at",
]);

function optionalString(value: unknown) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function optionalBoolean(value: unknown) {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return undefined;
}

function optionalDateTime(value: unknown) {
  const normalized = optionalString(value);
  if (!normalized) return undefined;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function ProjectsRouteComponent() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const handleSearchChange = useCallback(
    (next: SystemDirectoryProjectsSearch) => {
      void navigate({ search: next, replace: true });
    },
    [navigate],
  );
  return <SystemDirectoryProjectsPage search={search} onSearchChange={handleSearchChange} />;
}

export const Route = createFileRoute("/system/tenants/projects/")({
  staticData: { titleKey: "settings:SETTINGS_SYSTEM_DIRECTORY_TAB_PROJECTS" },
  validateSearch: (search: Record<string, unknown>): SystemDirectoryProjectsSearch => {
    const ordering = optionalString(search.ordering);
    const runtimeHealth = optionalString(search.runtimeHealth);
    const domainState = optionalString(search.domainState);
    const releaseState = optionalString(search.releaseState);
    return {
      q: optionalString(search.q),
      ordering:
        ordering && PROJECT_SORT_VALUES.has(ordering as ProjectSortValue)
          ? (ordering as ProjectSortValue)
          : undefined,
      workspaceId: optionalString(search.workspaceId),
      isActive: optionalBoolean(search.isActive),
      ownerUserId: optionalString(search.ownerUserId),
      runtimeHealth:
        runtimeHealth === "healthy" ||
        runtimeHealth === "degraded" ||
        runtimeHealth === "inactive" ||
        runtimeHealth === "not_deployed" ||
        runtimeHealth === "unavailable"
          ? runtimeHealth
          : undefined,
      domainState:
        domainState === "ready" || domainState === "attention_required" || domainState === "none"
          ? domainState
          : undefined,
      releaseState:
        releaseState === "active" ||
        releaseState === "scheduled" ||
        releaseState === "published" ||
        releaseState === "cancelled" ||
        releaseState === "not_released"
          ? releaseState
          : undefined,
      createdFrom: optionalDateTime(search.createdFrom),
      createdTo: optionalDateTime(search.createdTo),
      activityFrom: optionalDateTime(search.activityFrom),
      activityTo: optionalDateTime(search.activityTo),
    };
  },
  component: ProjectsRouteComponent,
});

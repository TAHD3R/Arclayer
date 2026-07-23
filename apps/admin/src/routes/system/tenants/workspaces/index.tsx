import { useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";

import {
  SystemDirectoryWorkspacesPage,
  type SystemDirectoryWorkspacesSearch,
  type WorkspaceSortValue,
} from "@/pages/system/directory/workspaces/page";

const WORKSPACE_SORT_VALUES = new Set<WorkspaceSortValue>([
  "-created_at",
  "created_at",
  "name",
  "-name",
  "member_count",
  "-member_count",
  "project_count",
  "-project_count",
  "plan",
  "-plan",
  "credit_risk",
  "-credit_risk",
  "renewal_at",
  "-renewal_at",
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

function WorkspacesRouteComponent() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const handleSearchChange = useCallback(
    (next: SystemDirectoryWorkspacesSearch) => {
      void navigate({ search: next, replace: true });
    },
    [navigate],
  );
  return <SystemDirectoryWorkspacesPage search={search} onSearchChange={handleSearchChange} />;
}

export const Route = createFileRoute("/system/tenants/workspaces/")({
  staticData: { titleKey: "settings:SETTINGS_SYSTEM_DIRECTORY_TAB_WORKSPACES" },
  validateSearch: (search: Record<string, unknown>): SystemDirectoryWorkspacesSearch => {
    const ordering = optionalString(search.ordering);
    const subscriptionStatus = optionalString(search.subscriptionStatus);
    const commerceRisk = optionalString(search.commerceRisk);
    return {
      q: optionalString(search.q),
      ordering:
        ordering && WORKSPACE_SORT_VALUES.has(ordering as WorkspaceSortValue)
          ? (ordering as WorkspaceSortValue)
          : undefined,
      isArchived: optionalBoolean(search.isArchived),
      isActive: optionalBoolean(search.isActive),
      ownerUserId: optionalString(search.ownerUserId),
      planCode: optionalString(search.planCode),
      subscriptionStatus:
        subscriptionStatus === "trialing" ||
        subscriptionStatus === "active" ||
        subscriptionStatus === "past_due" ||
        subscriptionStatus === "canceled"
          ? subscriptionStatus
          : undefined,
      commerceRisk:
        commerceRisk === "healthy" ||
        commerceRisk === "attention_required" ||
        commerceRisk === "data_missing"
          ? commerceRisk
          : undefined,
      createdFrom: optionalDateTime(search.createdFrom),
      createdTo: optionalDateTime(search.createdTo),
      activityFrom: optionalDateTime(search.activityFrom),
      activityTo: optionalDateTime(search.activityTo),
    };
  },
  component: WorkspacesRouteComponent,
});

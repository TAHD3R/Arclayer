import { useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";

import {
  SystemDirectoryUsersPage,
  type SystemDirectoryUsersSearch,
  type UserSortValue,
} from "@/pages/system/directory/users/page";

const USER_SORT_VALUES = new Set<UserSortValue>([
  "-created_at",
  "username",
  "-username",
  "email",
  "-email",
  "status",
  "-status",
  "is_super_admin",
  "-is_super_admin",
  "last_login_at",
  "-last_login_at",
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

function UsersRouteComponent() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const handleSearchChange = useCallback(
    (next: SystemDirectoryUsersSearch) => {
      void navigate({ search: next, replace: true });
    },
    [navigate],
  );
  return <SystemDirectoryUsersPage search={search} onSearchChange={handleSearchChange} />;
}

export const Route = createFileRoute("/system/tenants/users/")({
  staticData: { titleKey: "settings:SETTINGS_SYSTEM_DIRECTORY_TAB_USERS" },
  validateSearch: (search: Record<string, unknown>): SystemDirectoryUsersSearch => {
    const ordering = optionalString(search.ordering);
    const status = optionalString(search.status);
    const oauthProvider = optionalString(search.oauthProvider);
    return {
      q: optionalString(search.q),
      ordering:
        ordering && USER_SORT_VALUES.has(ordering as UserSortValue)
          ? (ordering as UserSortValue)
          : undefined,
      status:
        status === "active" || status === "disabled" || status === "locked" ? status : undefined,
      isSuperAdmin: optionalBoolean(search.isSuperAdmin),
      hasPassword: optionalBoolean(search.hasPassword),
      twoFactorEnabled: optionalBoolean(search.twoFactorEnabled),
      oauthProvider:
        oauthProvider === "any" || oauthProvider === "none" ? oauthProvider : undefined,
      createdFrom: optionalDateTime(search.createdFrom),
      createdTo: optionalDateTime(search.createdTo),
      lastLoginFrom: optionalDateTime(search.lastLoginFrom),
      lastLoginTo: optionalDateTime(search.lastLoginTo),
      workspaceMemberOfId: optionalString(search.workspaceMemberOfId),
      projectMemberOfId: optionalString(search.projectMemberOfId),
      ownedWorkspaceId: optionalString(search.ownedWorkspaceId),
      ownedProjectId: optionalString(search.ownedProjectId),
    };
  },
  component: UsersRouteComponent,
});

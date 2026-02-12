import { useMemo } from "react";
import type {
  OrganizationRbacMatrixPermissionRow,
  OrganizationRole,
} from "@/api/organization-rbac";
import {
  getOrganizationRoleDisplayDescription,
  getOrganizationRoleDisplayName,
} from "@/pages/organization/team/shared/role-i18n";

import { ORG_PERMISSION_COPY_MAP } from "../shared/permission-copy-map";

export type DisplayOrganizationPermission = OrganizationRbacMatrixPermissionRow & {
  displayName: string;
  displayDescription: string | null;
};

export type DisplayOrganizationRole = {
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
};

type Translate = (key: string, opts?: Record<string, unknown>) => string;

function includesText(haystack: string | null | undefined, needle: string): boolean {
  if (!needle) return true;
  return String(haystack || "")
    .toLowerCase()
    .includes(needle);
}

export function useOrganizationRolesDisplay(params: {
  roles: OrganizationRole[];
  permissions: OrganizationRbacMatrixPermissionRow[];
  search: string;
  t: Translate;
}) {
  const { roles, permissions, search, t } = params;

  const customRoles = useMemo(() => roles.filter((role) => !role.isSystem), [roles]);
  const customRoleCodeSet = useMemo(
    () => new Set(customRoles.map((role) => role.code)),
    [customRoles],
  );

  const displayRoles = useMemo<DisplayOrganizationRole[]>(
    () =>
      roles.map((role) => ({
        code: role.code,
        name: getOrganizationRoleDisplayName(t, role.code, role.name),
        description: getOrganizationRoleDisplayDescription(t, role.code, role.description),
        isSystem: role.isSystem,
      })),
    [roles, t],
  );

  const displayPermissions = useMemo<DisplayOrganizationPermission[]>(
    () =>
      permissions.map((permission) => {
        const mapped = ORG_PERMISSION_COPY_MAP[permission.code];
        const displayName = mapped
          ? t(`common:${mapped.nameKey}`, { defaultValue: permission.name })
          : permission.name;
        const translatedDescription = mapped
          ? t(`common:${mapped.descKey}`, { defaultValue: permission.description ?? "" })
          : (permission.description ?? "");
        const displayDescription = translatedDescription.trim() ? translatedDescription : null;

        return {
          ...permission,
          displayName,
          displayDescription,
        };
      }),
    [permissions, t],
  );

  const needle = useMemo(() => search.trim().toLowerCase(), [search]);

  const filteredRoles = useMemo(
    () =>
      displayRoles.filter(
        (role) => includesText(role.name, needle) || includesText(role.code, needle),
      ),
    [displayRoles, needle],
  );

  const filteredPermissions = useMemo(
    () =>
      displayPermissions.filter(
        (permission) =>
          includesText(permission.displayName, needle) ||
          includesText(permission.displayDescription, needle),
      ),
    [displayPermissions, needle],
  );

  return {
    displayRoles,
    displayPermissions,
    filteredRoles,
    filteredPermissions,
    customRoleCodeSet,
  };
}

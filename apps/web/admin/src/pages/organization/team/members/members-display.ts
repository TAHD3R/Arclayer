import type {
  OrgMembershipStatus,
  OrgRole,
  OrgUserStatus,
  OrganizationRbacMatrixPermissionRow,
} from "@/types/api";

import { ORG_PERMISSION_COPY_MAP } from "../shared/permission-copy-map";

export type DisplayOrganizationPermission = OrganizationRbacMatrixPermissionRow & {
  displayName: string;
  displayDescription: string | null;
};

export function builtinRoleLabel(
  t: (key: string, opts?: Record<string, unknown>) => string,
  role: OrgRole,
): string {
  return t(`common:ORG_ROLE_${role.toUpperCase()}`);
}

export function roleTagColor(role: OrgRole): string {
  if (role === "owner") return "gold";
  if (role === "admin") return "blue";
  return "default";
}

export function membershipTagColor(status: OrgMembershipStatus): string {
  if (status === "active") return "green";
  if (status === "invited") return "blue";
  return "red";
}

export function userTagColor(status: OrgUserStatus): string {
  if (status === "active") return "green";
  if (status === "disabled") return "red";
  return "gold";
}

export function membershipLabel(
  t: (key: string, opts?: Record<string, unknown>) => string,
  status: OrgMembershipStatus,
): string {
  if (status === "active") return t("team:TEAM_MEMBERSHIP_STATUS_ACTIVE");
  if (status === "invited") return t("team:TEAM_MEMBERSHIP_STATUS_INVITED");
  return t("team:TEAM_MEMBERSHIP_STATUS_DISABLED");
}

export function userStatusLabel(
  t: (key: string, opts?: Record<string, unknown>) => string,
  status: OrgUserStatus,
): string {
  if (status === "active") return t("team:TEAM_USER_STATUS_ACTIVE");
  if (status === "disabled") return t("team:TEAM_USER_STATUS_DISABLED");
  return t("team:TEAM_USER_STATUS_LOCKED");
}

export function mapDisplayPermissions(
  t: (key: string, opts?: Record<string, unknown>) => string,
  permissions: OrganizationRbacMatrixPermissionRow[],
): DisplayOrganizationPermission[] {
  return permissions.map((permission) => {
    const mapped = ORG_PERMISSION_COPY_MAP[permission.code];
    const displayName = mapped
      ? t(`common:${mapped.nameKey}`, { defaultValue: permission.name })
      : permission.name;
    const translatedDescription = mapped
      ? t(`common:${mapped.descKey}`, { defaultValue: permission.description || "" })
      : permission.description;
    const displayDescription =
      String(translatedDescription || permission.description || "").trim() || null;

    return {
      ...permission,
      displayName,
      displayDescription,
    };
  });
}

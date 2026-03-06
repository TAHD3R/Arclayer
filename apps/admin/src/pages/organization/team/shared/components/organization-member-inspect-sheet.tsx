import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { OrgRoleTag, OrgUserStatusTag } from "@/components/ui/tags";

import type {
  ActivityEvent,
  OrgUserStatus,
  OrganizationMember,
  OrganizationMemberWorkspace,
  OrganizationRbacMatrixPermissionRow,
} from "@/types/api";
import { ActivityDetailDialog } from "@/pages/organization/activity/components/activity-detail-dialog";
import { MemberContextDialog } from "@/pages/_shared/team/components/member-context-dialog";
import { OrganizationMemberInspectActivityTab } from "./organization-member-inspect-activity-tab";
import { OrganizationMemberInspectOverviewTab } from "./organization-member-inspect-overview-tab";
import { OrganizationMemberInspectRoleTab } from "./organization-member-inspect-role-tab";
import { OrganizationMemberInspectWorkspacesTab } from "./organization-member-inspect-workspaces-tab";
import type { ResolvedMemberWorkspace } from "./organization-member-workspace-list";
import { useOrganizationMemberInspectActivity } from "../hooks/use-organization-member-inspect-activity";

type RoleDisplay = {
  name: string;
  description: string | null;
};

type DisplayOrganizationPermission = OrganizationRbacMatrixPermissionRow & {
  displayName: string;
  displayDescription: string | null;
};

type OrganizationMemberInspectSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: OrganizationMember | null;
  currentUserId: string | null;
  roleDetailsByCode: Map<string, RoleDisplay>;
  rolesLoading: boolean;
  rolesError: unknown;
  workspaceDataLoading: boolean;
  workspaceDataError: unknown;
  resolveWorkspaces: (workspaces: OrganizationMemberWorkspace[]) => ResolvedMemberWorkspace[];
  workspaceLabelById: Record<string, string>;
  permissions: DisplayOrganizationPermission[];
  permissionsLoading: boolean;
  permissionsError: unknown;
  onEnterWorkspace: (workspaceId: string) => void;
  onAdjustRole: (member: OrganizationMember) => void;
  onRemoveMember: (member: OrganizationMember) => void;
};

function userStatusLabel(
  t: (key: string, opts?: Record<string, unknown>) => string,
  status: OrgUserStatus,
): string {
  if (status === "active") return t("team:TEAM_USER_STATUS_ACTIVE");
  if (status === "disabled") return t("team:TEAM_USER_STATUS_DISABLED");
  return t("team:TEAM_USER_STATUS_LOCKED");
}

export function OrganizationMemberInspectSheet({
  open,
  onOpenChange,
  member,
  currentUserId,
  roleDetailsByCode,
  rolesLoading,
  rolesError,
  workspaceDataLoading,
  workspaceDataError,
  resolveWorkspaces,
  workspaceLabelById,
  permissions,
  permissionsLoading,
  permissionsError,
  onEnterWorkspace,
  onAdjustRole,
  onRemoveMember,
}: OrganizationMemberInspectSheetProps) {
  const { t } = useTranslation(["common", "team"]);
  const [selectedActivity, setSelectedActivity] = useState<ActivityEvent | null>(null);
  const [displayMember, setDisplayMember] = useState(member);

  useEffect(() => {
    if (member) setDisplayMember(member);
  }, [member]);

  useEffect(() => {
    if (!open) {
      setSelectedActivity(null);
    }
  }, [open, member?.membershipId]);

  const {
    activityItems,
    activityLoading,
    activityError,
    isFetchingNextActivityPage,
    activityScrollRef,
    activitySentinelRef,
    refetchActivity,
  } = useOrganizationMemberInspectActivity({
    enabled: open,
    userId: (member ?? displayMember)?.userId ?? null,
  });

  const resolvedWorkspaces = useMemo(() => {
    const targetMember = member ?? displayMember;
    if (!targetMember) return [];
    return resolveWorkspaces(targetMember.workspaces);
  }, [displayMember, member, resolveWorkspaces]);

  const roleDetail = useMemo<RoleDisplay | null>(() => {
    const targetMember = member ?? displayMember;
    if (!targetMember) return null;

    const fromMap = roleDetailsByCode.get(targetMember.roleCode);
    if (fromMap?.name) return fromMap;

    return {
      name: t(`common:ORG_ROLE_${targetMember.role.toUpperCase()}`),
      description: t(`common:ORG_ROLE_${targetMember.role.toUpperCase()}_DESC`),
    };
  }, [displayMember, member, roleDetailsByCode, t]);

  const roleNameByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const [code, role] of roleDetailsByCode.entries()) {
      map.set(code, role.name);
    }
    return map;
  }, [roleDetailsByCode]);

  const rolePermissions = useMemo(() => {
    const targetMember = member ?? displayMember;
    if (!targetMember) return [];

    const roleCode = targetMember.roleCode || targetMember.role;
    return permissions.map((permission) => ({
      code: permission.code,
      displayName: permission.displayName,
      displayDescription: permission.displayDescription,
      granted: permission.grantedRoleCodes.includes(roleCode),
    }));
  }, [displayMember, member, permissions]);

  const activeMember = member ?? displayMember;
  const isCurrentUser = Boolean(
    activeMember && currentUserId && activeMember.userId === currentUserId,
  );
  const isOwnerSelf = Boolean(isCurrentUser && activeMember?.role === "owner");

  if (!activeMember) {
    return null;
  }

  return (
    <>
      <MemberContextDialog
        open={open}
        onOpenChange={onOpenChange}
        dialogTitle={t("common:ORG_MEMBERS_INSPECT_TITLE")}
        dialogDescription={t("common:ORG_MEMBERS_INSPECT_DESC")}
        member={activeMember}
        scopeLabel={t("common:ORG_MEMBERS_CONTEXT_SCOPE")}
        scopeVariant="organization"
        badges={
          <>
            <OrgRoleTag
              role={activeMember.role}
              className="!mr-0 max-w-full overflow-hidden"
              label={
                <span className="truncate">
                  {roleDetail?.name || t(`common:ORG_ROLE_${activeMember.role.toUpperCase()}`)}
                </span>
              }
            />
            <OrgUserStatusTag
              status={activeMember.userStatus}
              className="!mr-0 max-w-full overflow-hidden"
              label={
                <span className="truncate">{userStatusLabel(t, activeMember.userStatus)}</span>
              }
            />
          </>
        }
        actionButtons={[
          {
            key: "change-role",
            label: t("common:ORG_MEMBERS_ACTION_CHANGE_ROLE"),
            onClick: () => onAdjustRole(activeMember),
          },
          {
            key: "remove-member",
            label: isCurrentUser
              ? t("common:ORG_MEMBERS_ACTION_LEAVE_ORGANIZATION")
              : t("common:DELETE"),
            onClick: () => {
              if (isOwnerSelf) return;
              onRemoveMember(activeMember);
            },
            disabled: isOwnerSelf,
            danger: true,
          },
        ]}
        tabs={[
          {
            key: "overview",
            label: t("common:ORG_MEMBERS_CONTEXT_TAB_OVERVIEW"),
            content: (
              <OrganizationMemberInspectOverviewTab
                member={activeMember}
                roleName={roleDetail?.name ?? null}
                roleDescription={roleDetail?.description ?? null}
                permissions={rolePermissions}
                recentActivity={activityItems[0] ?? null}
              />
            ),
          },
          {
            key: "access",
            label: t("common:ORG_MEMBERS_CONTEXT_TAB_ACCESS"),
            content: (
              <OrganizationMemberInspectRoleTab
                roleName={roleDetail?.name ?? null}
                roleDescription={roleDetail?.description ?? null}
                permissions={rolePermissions}
                rolesLoading={rolesLoading}
                permissionsLoading={permissionsLoading}
                rolesError={rolesError}
                permissionsError={permissionsError}
              />
            ),
          },
          {
            key: "participation",
            label: t("common:ORG_MEMBERS_CONTEXT_TAB_PARTICIPATION"),
            content: (
              <OrganizationMemberInspectWorkspacesTab
                workspaces={resolvedWorkspaces}
                roleNameByCode={roleNameByCode}
                workspaceDataLoading={workspaceDataLoading}
                workspaceDataError={workspaceDataError}
                onEnterWorkspace={onEnterWorkspace}
              />
            ),
          },
          {
            key: "activity",
            label: t("common:ORG_MEMBERS_INSPECT_TAB_ACTIVITY"),
            content: (
              <OrganizationMemberInspectActivityTab
                items={activityItems}
                loading={activityLoading}
                error={activityError}
                isFetchingNextPage={isFetchingNextActivityPage}
                onRetry={refetchActivity}
                onSelect={(event) => setSelectedActivity(event)}
                scrollRef={activityScrollRef}
                sentinelRef={activitySentinelRef}
              />
            ),
          },
        ]}
      />

      <ActivityDetailDialog
        open={Boolean(selectedActivity)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setSelectedActivity(null);
          }
        }}
        event={selectedActivity}
        workspaceLabelById={workspaceLabelById}
      />
    </>
  );
}

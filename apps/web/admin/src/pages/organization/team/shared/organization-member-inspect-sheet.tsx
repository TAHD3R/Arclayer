import { useEffect, useMemo, useState } from "react";
import { Avatar, Button as AntButton, Tag, Tooltip } from "antd";
import { useTranslation } from "react-i18next";

import type { ActivityEvent } from "@/api/activity";
import type {
  OrgRole,
  OrgUserStatus,
  OrganizationMember,
  OrganizationMemberWorkspace,
} from "@/api/organization-members";
import type { OrganizationRbacMatrixPermissionRow } from "@/api/organization-rbac";
import { ActivityDetailDialog } from "@/components/activity/activity-detail-dialog";
import {
  ChromeTabs,
  ChromeTabsContent,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@/components/ui/chrome-tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import { OrganizationMemberInspectActivityTab } from "./organization-member-inspect-activity-tab";
import { OrganizationMemberInspectRoleTab } from "./organization-member-inspect-role-tab";
import { OrganizationMemberInspectWorkspacesTab } from "./organization-member-inspect-workspaces-tab";
import type { ResolvedMemberWorkspace } from "./organization-member-workspace-list";
import { useOrganizationMemberInspectActivity } from "./use-organization-member-inspect-activity";

type InspectTab = "role" | "workspaces" | "activity";

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

function roleTagColor(role: OrgRole): string {
  if (role === "owner") return "gold";
  if (role === "admin") return "blue";
  return "default";
}

function userTagColor(status: OrgUserStatus): string {
  if (status === "active") return "green";
  if (status === "disabled") return "red";
  return "gold";
}

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
  const [tab, setTab] = useState<InspectTab>("role");
  const [selectedActivity, setSelectedActivity] = useState<ActivityEvent | null>(null);

  useEffect(() => {
    if (!open) {
      setTab("role");
      setSelectedActivity(null);
      return;
    }

    setTab("role");
    setSelectedActivity(null);
  }, [member?.membershipId, open]);

  const {
    activityItems,
    activityLoading,
    activityError,
    isFetchingNextActivityPage,
    activityScrollRef,
    activitySentinelRef,
    refetchActivity,
  } = useOrganizationMemberInspectActivity({
    enabled: open && tab === "activity",
    userId: member?.userId ?? null,
  });

  const resolvedWorkspaces = useMemo(() => {
    if (!member) return [];
    return resolveWorkspaces(member.workspaces);
  }, [member, resolveWorkspaces]);

  const roleDetail = useMemo<RoleDisplay | null>(() => {
    if (!member) return null;

    const fromMap = roleDetailsByCode.get(member.roleCode);
    if (fromMap?.name) return fromMap;

    const fallbackName = t(`common:ORG_ROLE_${member.role.toUpperCase()}`);
    const fallbackDesc = t(`common:ORG_ROLE_${member.role.toUpperCase()}_DESC`);
    return {
      name: fallbackName,
      description: fallbackDesc,
    };
  }, [member, roleDetailsByCode, t]);

  const roleNameByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const [code, role] of roleDetailsByCode.entries()) {
      map.set(code, role.name);
    }
    return map;
  }, [roleDetailsByCode]);

  const rolePermissions = useMemo(() => {
    if (!member) return [];

    const roleCode = member.roleCode || member.role;
    return permissions.map((permission) => ({
      code: permission.code,
      displayName: permission.displayName,
      displayDescription: permission.displayDescription,
      granted: permission.grantedRoleCodes.includes(roleCode),
    }));
  }, [member, permissions]);

  const isCurrentUser = Boolean(member && currentUserId && member.userId === currentUserId);
  const isOwnerSelf = Boolean(isCurrentUser && member?.role === "owner");
  const primary = member?.displayName || member?.username || "";
  const secondary = member?.email || "-";

  const leaveLabel = isOwnerSelf ? (
    <Tooltip title={t("common:ORG_MEMBERS_OWNER_SELF_REMOVE_BLOCKED")}>
      <span>{t("common:ORG_MEMBERS_ACTION_LEAVE_ORGANIZATION")}</span>
    </Tooltip>
  ) : (
    t("common:ORG_MEMBERS_ACTION_LEAVE_ORGANIZATION")
  );

  const removeLabel = isOwnerSelf ? (
    <Tooltip title={t("common:ORG_MEMBERS_OWNER_SELF_REMOVE_BLOCKED")}>
      <span>{t("common:DELETE")}</span>
    </Tooltip>
  ) : (
    t("common:DELETE")
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[860px] max-w-[96vw] gap-0 p-0">
        {member ? (
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="sticky top-0 z-10 border-b bg-gradient-to-b from-muted/40 to-background px-6 pb-5 pt-5">
              <SheetTitle>{t("common:ORG_MEMBERS_INSPECT_TITLE")}</SheetTitle>
              <SheetDescription>{t("common:ORG_MEMBERS_INSPECT_DESC")}</SheetDescription>

              <div className="p-2">
                <div className="flex items-center gap-3">
                  <Avatar
                    size={64}
                    shape="square"
                    src={member.avatarUrl ?? undefined}
                    className="shrink-0 bg-muted text-foreground"
                  >
                    {primary.slice(0, 1).toUpperCase()}
                  </Avatar>

                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{primary}</div>
                    <div className="truncate text-muted-foreground">{secondary}</div>
                  </div>

                  <div className="flex flex-wrap justify-end gap-1">
                    <Tag color={roleTagColor(member.role)} className="!mr-0">
                      {roleDetail?.name || t(`common:ORG_ROLE_${member.role.toUpperCase()}`)}
                    </Tag>
                    <Tag color={userTagColor(member.userStatus)} className="!mr-0">
                      {userStatusLabel(t, member.userStatus)}
                    </Tag>
                  </div>
                </div>
              </div>
            </SheetHeader>

            <div className="min-h-0 flex-1 overflow-hidden px-6 pb-4 pt-3">
              <ChromeTabs
                value={tab}
                onValueChange={(next) => setTab(next as InspectTab)}
                className="flex h-full min-h-0 flex-col"
              >
                <ChromeTabsList className="w-auto shrink-0">
                  <ChromeTabsTrigger value="role">
                    {t("common:ORG_MEMBERS_INSPECT_TAB_ROLE")}
                  </ChromeTabsTrigger>
                  <ChromeTabsTrigger value="workspaces">
                    {t("common:ORG_MEMBERS_INSPECT_TAB_WORKSPACES")}
                  </ChromeTabsTrigger>
                  <ChromeTabsTrigger value="activity">
                    {t("common:ORG_MEMBERS_INSPECT_TAB_ACTIVITY")}
                  </ChromeTabsTrigger>
                </ChromeTabsList>

                <ChromeTabsContent value="role" className="flex min-h-0 flex-1 flex-col pt-3">
                  <div className="flex min-h-0 flex-1 flex-col">
                    <OrganizationMemberInspectRoleTab
                      roleName={roleDetail?.name ?? null}
                      roleDescription={roleDetail?.description ?? null}
                      permissions={rolePermissions}
                      rolesLoading={rolesLoading}
                      permissionsLoading={permissionsLoading}
                      rolesError={rolesError}
                      permissionsError={permissionsError}
                    />
                  </div>
                </ChromeTabsContent>

                <ChromeTabsContent value="workspaces" className="min-h-0 pt-3">
                  <div className="min-h-[360px]">
                    <OrganizationMemberInspectWorkspacesTab
                      workspaces={resolvedWorkspaces}
                      roleNameByCode={roleNameByCode}
                      workspaceDataLoading={workspaceDataLoading}
                      workspaceDataError={workspaceDataError}
                      onEnterWorkspace={onEnterWorkspace}
                    />
                  </div>
                </ChromeTabsContent>

                <ChromeTabsContent value="activity" className="flex min-h-0 flex-1 flex-col pt-3">
                  <div className="flex min-h-0 flex-1 flex-col">
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
                  </div>
                </ChromeTabsContent>
              </ChromeTabs>
            </div>

            <SheetFooter className="sticky bottom-0 border-t bg-background px-6 py-3">
              <div className="flex w-full items-center justify-end gap-2">
                <AntButton onClick={() => onAdjustRole(member)}>
                  {t("common:ORG_MEMBERS_ACTION_CHANGE_ROLE")}
                </AntButton>
                <AntButton
                  danger
                  disabled={isOwnerSelf}
                  onClick={() => {
                    if (isOwnerSelf) return;
                    onRemoveMember(member);
                  }}
                >
                  {isCurrentUser ? leaveLabel : removeLabel}
                </AntButton>
              </div>
            </SheetFooter>
          </div>
        ) : null}
      </SheetContent>

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
    </Sheet>
  );
}

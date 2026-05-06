import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { listWorkspaceActivity } from "@/api/activity";
import { listAllWorkspacePermissions, listAllWorkspaceRoles } from "@/api/rbac";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import { ActivityDetailDialog } from "@/pages/workspaces/shared/activity/components/activity-detail-dialog";
import { resolveCatalogEntry } from "@/pages/workspaces/shared/activity/constants";
import { WorkspaceMemberActivityTab } from "@/pages/workspaces/team/shared/components/member-inspect-activity-tab";
import { MemberContextDialog } from "@/pages/workspaces/team/shared/components/member-context-dialog";
import { TeamMembershipStatusTag, TeamRoleTag, TeamUserStatusTag } from "@/components/ui/tags";
import type { ActivityEvent, TeamMember } from "@arclayer/openapi/admin-types";
import {
  SummaryCard,
  workspaceMembershipLabel,
  workspaceUserStatusLabel,
} from "./workspace-member-context-dialog-helpers";

type WorkspaceMemberContextDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string | null;
  member: TeamMember | null;
  currentUserId: string | null;
  onAdjustRoles: (member: TeamMember) => void;
  onEnable: (membershipId: string) => void;
  onDisable: (membershipId: string) => void;
  rolesUpdateDisabled?: boolean;
};

function getActivityTitle(
  t: (key: string, options?: Record<string, unknown>) => string,
  event: ActivityEvent,
): string {
  const entry = resolveCatalogEntry(event.eventName);
  const rawName = (event.eventName || "").trim() || "-";
  if (!entry) {
    return t("activity:ACTIVITY_EVENT_UNKNOWN_TITLE", { eventName: rawName });
  }
  return t(`activity:${entry.titleKey}`);
}

export function WorkspaceMemberContextDialog(props: WorkspaceMemberContextDialogProps) {
  const member = props.member;
  const { t } = useTranslation(["team", "activity"]);
  const [displayMember, setDisplayMember] = useState(member);

  useEffect(() => {
    if (member) setDisplayMember(member);
  }, [member]);

  const activeMember = member ?? displayMember;
  const dateTime = useAdminDateTimeFormatter({ workspaceId: props.workspaceId ?? undefined });
  const [selectedActivity, setSelectedActivity] = useState<ActivityEvent | null>(null);
  const activityScrollRef = useRef<HTMLDivElement | null>(null);
  const activitySentinelRef = useRef<HTMLDivElement | null>(null);

  const rolesQuery = useQuery({
    queryKey: ["workspace-member-context", "roles", props.workspaceId],
    enabled: props.open && Boolean(props.workspaceId),
    queryFn: async () => listAllWorkspaceRoles(String(props.workspaceId)),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const permissionsQuery = useQuery({
    queryKey: ["workspace-member-context", "permissions", props.workspaceId],
    enabled: props.open && Boolean(props.workspaceId),
    queryFn: async () => listAllWorkspacePermissions(String(props.workspaceId)),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const activityQuery = useQuery({
    queryKey: ["workspace-member-context", "activity", props.workspaceId, activeMember?.userId],
    enabled: props.open && Boolean(props.workspaceId && activeMember?.userId),
    queryFn: async () => {
      const userId = activeMember?.userId;
      if (!props.workspaceId || !userId) return [] as ActivityEvent[];
      const [actorPage, subjectPage] = await Promise.all([
        listWorkspaceActivity(props.workspaceId, { size: 20, actorUserId: userId }),
        listWorkspaceActivity(props.workspaceId, { size: 20, subjectUserId: userId }),
      ]);
      const unique = new Map<string, ActivityEvent>();
      for (const event of [...(actorPage.items ?? []), ...(subjectPage.items ?? [])]) {
        unique.set(event.id, event);
      }
      return Array.from(unique.values()).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    },
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const roleNameByCode = useMemo(() => {
    const map = new Map<string, { name: string; description: string | null }>();
    for (const role of rolesQuery.data ?? []) {
      map.set(role.code, { name: role.name || role.code, description: role.description });
    }
    return map;
  }, [rolesQuery.data]);

  const roleLabels = useMemo(() => {
    if (!activeMember) return [];
    return activeMember.roleCodes.map((code) => roleNameByCode.get(code)?.name || code);
  }, [activeMember, roleNameByCode]);

  const grantedPermissions = useMemo(() => {
    if (!activeMember) return [];
    const rolePermissionCodes = new Set(
      activeMember.roleCodes.flatMap(
        (code) => rolesQuery.data?.find((role) => role.code === code)?.permissionCodes ?? [],
      ),
    );
    return (permissionsQuery.data ?? []).filter((permission) =>
      rolePermissionCodes.has(permission.code),
    );
  }, [activeMember, permissionsQuery.data, rolesQuery.data]);

  if (!activeMember) {
    return null;
  }

  const canEnable = activeMember.membershipStatus === "disabled";
  const canDisable = activeMember.membershipStatus === "active";
  const isSelf = props.currentUserId === activeMember.userId;
  const roleSummary =
    roleLabels.length <= 1
      ? roleLabels[0] || "-"
      : t("team:TEAM_MEMBER_CONTEXT_MULTIPLE_ROLES", { count: roleLabels.length });

  return (
    <>
      <MemberContextDialog
        open={props.open}
        onOpenChange={props.onOpenChange}
        dialogTitle={t("team:TEAM_MEMBER_CONTEXT_TITLE")}
        dialogDescription={t("team:TEAM_MEMBER_CONTEXT_DESC")}
        member={activeMember}
        scopeLabel={t("team:TEAM_MEMBER_CONTEXT_SCOPE")}
        scopeVariant="workspace"
        badges={
          <>
            <TeamRoleTag
              className="!mr-0 max-w-full overflow-hidden"
              label={<span className="truncate">{roleSummary}</span>}
            />
            <TeamMembershipStatusTag
              status={activeMember.membershipStatus}
              className="!mr-0 max-w-full overflow-hidden"
              label={
                <span className="truncate">
                  {workspaceMembershipLabel(t, activeMember.membershipStatus)}
                </span>
              }
            />
            <TeamUserStatusTag
              status={activeMember.userStatus}
              className="!mr-0 max-w-full overflow-hidden"
              label={
                <span className="truncate">
                  {workspaceUserStatusLabel(t, activeMember.userStatus)}
                </span>
              }
            />
          </>
        }
        actionButtons={[
          {
            key: "edit-roles",
            label: t("team:TEAM_ACTION_EDIT_ROLES"),
            onClick: () => props.onAdjustRoles(activeMember),
            disabled: props.rolesUpdateDisabled,
          },
          ...(canEnable
            ? [
                {
                  key: "enable-member",
                  label: t("team:TEAM_ACTION_ENABLE"),
                  onClick: () => props.onEnable(activeMember.membershipId),
                },
              ]
            : []),
          ...(canDisable && !isSelf
            ? [
                {
                  key: "disable-member",
                  label: t("team:TEAM_ACTION_DISABLE"),
                  onClick: () => props.onDisable(activeMember.membershipId),
                  danger: true,
                },
              ]
            : []),
        ]}
        tabs={[
          {
            key: "overview",
            label: t("team:TEAM_MEMBER_CONTEXT_TAB_OVERVIEW"),
            content: (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <SummaryCard
                  title={t("team:TEAM_MEMBER_CONTEXT_OVERVIEW_ROLES")}
                  body={
                    <div className="text-title3 font-medium text-label-primary">{roleSummary}</div>
                  }
                  footer={roleLabels.join(" · ") || "-"}
                />
                <SummaryCard
                  title={t("team:TEAM_MEMBER_CONTEXT_OVERVIEW_ACCESS")}
                  body={
                    <>
                      <div className="text-title3 font-medium text-label-primary">
                        {grantedPermissions.length}
                      </div>
                      <div className="text-body text-label-secondary">
                        {t("team:TEAM_MEMBER_CONTEXT_OVERVIEW_ACCESS_HINT")}
                      </div>
                    </>
                  }
                  footer={
                    grantedPermissions
                      .slice(0, 3)
                      .map((item) => item.name)
                      .join(" · ") || t("common:EMPTY_DESC")
                  }
                />
                <SummaryCard
                  title={t("team:TEAM_MEMBER_CONTEXT_OVERVIEW_PARTICIPATION")}
                  body={
                    <div className="text-body text-label-secondary">
                      {t("team:TEAM_MEMBER_CONTEXT_OVERVIEW_PARTICIPATION_EMPTY")}
                    </div>
                  }
                />
                <SummaryCard
                  title={t("team:TEAM_MEMBER_CONTEXT_OVERVIEW_ACTIVITY")}
                  body={
                    activityQuery.data?.[0] ? (
                      <div className="text-title3 font-medium text-label-primary">
                        {getActivityTitle(t, activityQuery.data[0])}
                      </div>
                    ) : (
                      <div className="text-body text-label-secondary">
                        {t("team:TEAM_MEMBER_CONTEXT_OVERVIEW_ACTIVITY_EMPTY")}
                      </div>
                    )
                  }
                  footer={
                    activityQuery.data?.[0]
                      ? dateTime.formatDateTime(activityQuery.data[0].occurredAt)
                      : undefined
                  }
                />
              </div>
            ),
          },
          {
            key: "access",
            label: t("team:TEAM_MEMBER_CONTEXT_TAB_ACCESS"),
            content: (
              <ContentGuard
                loading={rolesQuery.isLoading || permissionsQuery.isLoading}
                error={rolesQuery.error || permissionsQuery.error}
                loadingVariant="table"
              >
                <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
                  <section className="rounded-xl border border-border/60 bg-card p-4">
                    <div className="text-title3 font-medium text-label-primary">
                      {t("team:TEAM_TABLE_COL_ROLES")}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {activeMember.roleCodes.map((code) => (
                        <TeamRoleTag
                          key={code}
                          className="!mr-0"
                          label={roleNameByCode.get(code)?.name || code}
                        />
                      ))}
                    </div>
                  </section>
                  <section className="rounded-xl border border-border/60 bg-card p-4">
                    <div className="divide-y overflow-hidden rounded-lg border border-border/60">
                      {grantedPermissions.map((permission) => (
                        <div key={permission.code} className="grid gap-1 px-3 py-2">
                          <div className="font-medium text-label-primary">{permission.name}</div>
                          {permission.description ? (
                            <div className="text-footnote text-label-secondary">
                              {permission.description}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </ContentGuard>
            ),
          },
          {
            key: "participation",
            label: t("team:TEAM_MEMBER_CONTEXT_TAB_PARTICIPATION"),
            content: (
              <ContentGuard
                loading={false}
                empty
                emptyTitle={t("team:TEAM_MEMBER_CONTEXT_PARTICIPATION_EMPTY_TITLE")}
                emptyDescription={t("team:TEAM_MEMBER_CONTEXT_PARTICIPATION_EMPTY_DESC")}
                variant="compact"
                className="py-12"
              />
            ),
          },
          {
            key: "activity",
            label: t("activity:ACTIVITY_TITLE"),
            content: (
              <WorkspaceMemberActivityTab
                items={activityQuery.data ?? []}
                loading={activityQuery.isLoading}
                error={activityQuery.error}
                isFetchingNextPage={false}
                onRetry={() => void activityQuery.refetch()}
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
        onOpenChange={(open) => {
          if (!open) setSelectedActivity(null);
        }}
        event={selectedActivity}
      />
    </>
  );
}

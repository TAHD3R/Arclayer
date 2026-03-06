import { useTranslation } from "react-i18next";

import type { ActivityEvent, OrganizationMember } from "@/types/api";
import { useWorkspaceDateTimeFormatter } from "@/hooks/use-workspace-date-time-formatter";
import { resolveCatalogEntry } from "@/pages/organization/activity/constants";

type OverviewPermission = {
  code: string;
  displayName: string;
  granted: boolean;
};

type OrganizationMemberInspectOverviewTabProps = {
  member: OrganizationMember;
  roleName: string | null;
  roleDescription: string | null;
  permissions: OverviewPermission[];
  recentActivity: ActivityEvent | null;
};

function SummaryCard(props: { title: string; body: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border/60 bg-card p-4">
      <div className="text-callout font-bold uppercase text-label-secondary">{props.title}</div>
      <div className="mt-3 space-y-2">{props.body}</div>
      {props.footer ? (
        <div className="mt-3 text-callout text-label-secondary">{props.footer}</div>
      ) : null}
    </section>
  );
}

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

export function OrganizationMemberInspectOverviewTab({
  member,
  roleName,
  roleDescription,
  permissions,
  recentActivity,
}: OrganizationMemberInspectOverviewTabProps) {
  const { t } = useTranslation(["common", "activity"]);
  const dateTime = useWorkspaceDateTimeFormatter();

  const grantedPermissions = permissions.filter((permission) => permission.granted);
  const topPermissionNames = grantedPermissions
    .slice(0, 3)
    .map((permission) => permission.displayName);
  const workspaceNames = member.workspaces.slice(0, 3).map((workspace) => workspace.workspaceName);

  return (
    <div className="grid min-h-0 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <SummaryCard
        title={t("common:ORG_MEMBERS_CONTEXT_OVERVIEW_ROLE")}
        body={
          <>
            <div className="text-title3 font-medium text-foreground">{roleName || "-"}</div>
            <p className="text-body text-label-secondary">
              {roleDescription || t("common:ORG_MEMBERS_INSPECT_ROLE_DESC_EMPTY")}
            </p>
          </>
        }
      />

      <SummaryCard
        title={t("common:ORG_MEMBERS_CONTEXT_OVERVIEW_ACCESS")}
        body={
          <>
            <div className="text-title3 font-medium text-foreground">
              {grantedPermissions.length}
            </div>
            <div className="text-body text-label-secondary">
              {t("common:ORG_MEMBERS_CONTEXT_OVERVIEW_ACCESS_HINT")}
            </div>
          </>
        }
        footer={
          topPermissionNames.length > 0
            ? topPermissionNames.join(" · ")
            : t("common:ORG_MEMBERS_INSPECT_ROLE_PERMISSIONS_EMPTY")
        }
      />

      <SummaryCard
        title={t("common:ORG_MEMBERS_CONTEXT_OVERVIEW_PARTICIPATION")}
        body={
          <>
            <div className="text-title3 font-medium text-foreground">{member.workspaceCount}</div>
            <div className="text-body text-label-secondary">
              {t("common:ORG_MEMBERS_CONTEXT_OVERVIEW_PARTICIPATION_HINT")}
            </div>
          </>
        }
        footer={
          workspaceNames.length > 0
            ? workspaceNames.join(" · ")
            : t("common:ORG_MEMBERS_INSPECT_WORKSPACES_EMPTY_DESC")
        }
      />

      <SummaryCard
        title={t("common:ORG_MEMBERS_CONTEXT_OVERVIEW_ACTIVITY")}
        body={
          recentActivity ? (
            <div className="text-title3 font-medium text-foreground">
              {getActivityTitle(t, recentActivity)}
            </div>
          ) : (
            <div className="text-body text-label-secondary">
              {t("common:ORG_MEMBERS_CONTEXT_OVERVIEW_ACTIVITY_EMPTY")}
            </div>
          )
        }
        footer={recentActivity ? dateTime.formatDateTime(recentActivity.occurredAt) : undefined}
      />
    </div>
  );
}

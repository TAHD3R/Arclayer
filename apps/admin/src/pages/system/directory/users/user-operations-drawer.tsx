import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Activity,
  BadgeCheck,
  BriefcaseBusiness,
  ExternalLink,
  KeyRound,
  LockKeyhole,
  Mail,
  MessageSquareText,
  Pencil,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserMinus,
} from "lucide-react";

import { UserAvatar, WorkspaceAvatar } from "@/components/common/entity-avatar";
import { ProjectAvatar } from "@/components/common/project-avatar";
import { BaseTag } from "@/components/ui/tags";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { auditEventName, auditSourceLabel } from "@/pages/system/audit-log/audit-event-presenters";
import { FEEDBACK_INTENT_LABELS, FEEDBACK_STATUS_LABELS } from "@/pages/system/feedback/model";
import type { FeedbackStatus } from "@/api/feedback";
import type { SystemDirectoryUser, SystemDirectoryUserDetail } from "@arclayer/openapi/admin-types";
import { Button } from "@arclayer/ui/button";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@arclayer/ui/drawer";
import { Separator } from "@arclayer/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@arclayer/ui/tabs";

import { useSystemDirectoryUserDetail } from "../hooks";
import { isDirectoryRestrictionActive } from "../restriction-state";
import { useSystemDirectoryDateTimeFormatter } from "../system-directory-table";
import { getUserActionAvailability, type UserActionTarget } from "./governance-dialogs";

type UserOperationsTab =
  | "overview"
  | "access"
  | "memberships"
  | "activity"
  | "restrictions"
  | "actions";

const RESTRICTION_REASON_KEYS: Readonly<Record<string, string>> = {
  abuse_prevention: "SETTINGS_ACCESS_RESTRICTION_REASON_ABUSE_PREVENTION",
  billing_issue: "SETTINGS_ACCESS_RESTRICTION_REASON_BILLING_ISSUE",
  compliance_review: "SETTINGS_ACCESS_RESTRICTION_REASON_COMPLIANCE_REVIEW",
  other: "SETTINGS_ACCESS_RESTRICTION_REASON_OTHER",
  owner_request: "SETTINGS_ACCESS_RESTRICTION_REASON_OWNER_REQUEST",
  policy_violation: "SETTINGS_ACCESS_RESTRICTION_REASON_POLICY_VIOLATION",
  security_risk: "SETTINGS_ACCESS_RESTRICTION_REASON_SECURITY_RISK",
};

function DetailFact(props: { label: string; children: ReactNode; numeric?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-label-secondary">{props.label}</dt>
      <dd
        className={
          props.numeric
            ? "mt-1 truncate text-headline font-semibold tabular-nums text-label-primary"
            : "mt-1 truncate text-footnote font-medium text-label-primary"
        }
      >
        {props.children}
      </dd>
    </div>
  );
}

function SectionHeading(props: { icon: ReactNode; title: string; description?: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-label-secondary">
        {props.icon}
      </div>
      <div className="min-w-0">
        <h3 className="text-headline font-semibold text-label-primary">{props.title}</h3>
        {props.description ? (
          <p className="mt-0.5 text-footnote text-label-secondary">{props.description}</p>
        ) : null}
      </div>
    </div>
  );
}

function accountStatusTone(status: SystemDirectoryUser["status"]) {
  if (status === "active") return "green" as const;
  if (status === "disabled") return "red" as const;
  return "gold" as const;
}

function toActionTarget(user: SystemDirectoryUser): UserActionTarget {
  return {
    userId: user.userId,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    status: user.status,
    avatarUrl: user.avatarUrl,
    avatar_url: user.avatar_url,
    isSuperAdmin: user.isSuperAdmin,
    hasPassword: user.hasPassword,
    twoFactorEnabled: user.twoFactorEnabled,
    linkedOauthProviders: user.linkedOauthProviders ?? user.linked_oauth_providers ?? [],
    restrictions: user.restrictions,
  };
}

export function UserOperationsDrawer(props: {
  user: SystemDirectoryUser | null;
  currentUserId: string | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (user: SystemDirectoryUser) => void;
  onResetPassword: (user: SystemDirectoryUser) => void;
  onSendResetPasswordEmail: (user: SystemDirectoryUser) => void;
  onDisableTwoFactor: (user: SystemDirectoryUser) => void;
  onUnlinkOAuth: (user: SystemDirectoryUser, provider: string) => void;
  onRevokeSessions: (user: SystemDirectoryUser) => void;
  onToggleSuperAdmin: (user: SystemDirectoryUser) => void;
  onToggleAccess: (user: SystemDirectoryUser) => void;
  onDelete: (user: SystemDirectoryUser) => void;
}) {
  const { t, i18n } = useTranslation(["common", "activity", "platform", "rbac", "settings"]);
  const userId = props.user?.userId ?? null;
  const [tab, setTab] = useState<UserOperationsTab>("overview");
  const detailQuery = useSystemDirectoryUserDetail(userId);
  const dateTime = useSystemDirectoryDateTimeFormatter();
  const detail = detailQuery.detail;
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);

  useEffect(() => {
    if (userId) setTab("overview");
  }, [userId]);

  const user = props.user;
  const name = user?.displayName?.trim() || user?.username || "";
  const target = user ? toActionTarget(user) : null;
  const availability = target ? getUserActionAvailability(target, props.currentUserId) : null;
  const providers = detail?.linkedOauthProviders ?? detail?.linked_oauth_providers ?? [];
  const statusKey =
    user?.status === "active"
      ? "SETTINGS_SYSTEM_DIRECTORY_STATUS_ACTIVE"
      : user?.status === "disabled"
        ? "SETTINGS_SYSTEM_DIRECTORY_STATUS_DISABLED"
        : "SETTINGS_SYSTEM_DIRECTORY_STATUS_LOCKED";
  const formatDateTime = (value: string) => dateTime.formatDateTime(value);
  const runAction = (action: (user: SystemDirectoryUser) => void) => {
    if (!user) return;
    props.onOpenChange(false);
    action(user);
  };

  return (
    <Drawer open={Boolean(user)} onOpenChange={props.onOpenChange} direction="right">
      <DrawerContent className="w-full sm:max-w-3xl">
        <DrawerHeader className="max-w-none gap-3 rounded-none px-5 py-4 pr-14 text-left">
          <div className="flex min-w-0 items-center gap-3">
            {user ? <UserAvatar name={name} assetRef={user.avatarUrl} size={40} /> : null}
            <div className="min-w-0 flex-1">
              <DrawerTitle className="truncate text-title3 font-semibold">
                {name || t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_USER_TITLE")}
              </DrawerTitle>
              <DrawerDescription className="mt-0.5">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_USER_DESC")}
              </DrawerDescription>
            </div>
            {user ? (
              <BaseTag color={accountStatusTone(user.status)}>{t(`settings:${statusKey}`)}</BaseTag>
            ) : null}
          </div>
        </DrawerHeader>

        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as UserOperationsTab)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="border-b px-5">
            <TabsList className="h-11 w-full justify-start gap-1 overflow-x-auto rounded-none bg-transparent p-0">
              <TabsTrigger value="overview">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_TAB_OVERVIEW")}
              </TabsTrigger>
              <TabsTrigger value="access">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_TAB_ACCESS")}
              </TabsTrigger>
              <TabsTrigger value="memberships">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_TAB_MEMBERSHIPS")}
              </TabsTrigger>
              <TabsTrigger value="activity">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_TAB_ACTIVITY")}
              </TabsTrigger>
              <TabsTrigger value="restrictions">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_TAB_RESTRICTIONS")}
              </TabsTrigger>
              <TabsTrigger value="actions">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_TAB_ACTIONS")}
              </TabsTrigger>
            </TabsList>
          </div>

          <DrawerBody className="min-h-0 max-w-none flex-1 overflow-y-auto px-5 py-5">
            <ContentGuard
              loading={detailQuery.isLoading}
              error={detailQuery.error}
              onRetry={() => void detailQuery.refetch()}
              loadingVariant="form"
              variant="compact"
            >
              {detail ? (
                <>
                  <TabsContent value="overview" className="mt-0 space-y-6">
                    <section className="space-y-4">
                      <div className="flex items-start justify-between gap-4">
                        <SectionHeading
                          icon={<BadgeCheck className="size-4" />}
                          title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_SECTION_ACCOUNT")}
                        />
                        <Button size="sm" variant="ghost" onClick={() => runAction(props.onEdit)}>
                          <Pencil className="size-3.5" />
                          {t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_EDIT_ACCOUNT")}
                        </Button>
                      </div>
                      <dl className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
                        <DetailFact label={t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_USER")}>
                          {detail.displayName || detail.username}
                        </DetailFact>
                        <DetailFact label={t("common:EMAIL")}>
                          {detail.email || t("common:NA")}
                        </DetailFact>
                        <DetailFact label={t("common:USERNAME")}>@{detail.username}</DetailFact>
                        <DetailFact
                          label={t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_CREATED_AT")}
                        >
                          {formatDateTime(detail.createdAt)}
                        </DetailFact>
                        <DetailFact
                          label={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_UPDATED_AT")}
                        >
                          {formatDateTime(detail.updatedAt)}
                        </DetailFact>
                        <DetailFact
                          label={t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_LAST_LOGIN")}
                        >
                          {detail.lastLoginAt ? formatDateTime(detail.lastLoginAt) : t("common:NA")}
                        </DetailFact>
                      </dl>
                    </section>
                    <Separator />
                    <section className="space-y-4">
                      <SectionHeading
                        icon={<BriefcaseBusiness className="size-4" />}
                        title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_SECTION_SCOPE")}
                      />
                      <dl className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4">
                        <DetailFact
                          label={t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_WORKSPACES")}
                          numeric
                        >
                          {number.format(detail.workspaceMembershipCount)}
                        </DetailFact>
                        <DetailFact
                          label={t(
                            "settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_OWNED_ORGANIZATIONS",
                          )}
                          numeric
                        >
                          {number.format(detail.ownedWorkspaceCount)}
                        </DetailFact>
                        <DetailFact
                          label={t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_PROJECTS")}
                          numeric
                        >
                          {number.format(detail.projectMembershipCount)}
                        </DetailFact>
                        <DetailFact
                          label={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_OWNED_PROJECTS")}
                          numeric
                        >
                          {number.format(detail.ownedProjectCount)}
                        </DetailFact>
                      </dl>
                    </section>
                  </TabsContent>

                  <TabsContent value="access" className="mt-0 space-y-6">
                    <section className="space-y-4">
                      <SectionHeading
                        icon={<LockKeyhole className="size-4" />}
                        title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_TAB_ACCESS")}
                      />
                      <dl className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
                        <DetailFact label={t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_STATUS")}>
                          {t(`settings:${statusKey}`)}
                        </DetailFact>
                        <DetailFact
                          label={t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_PERMISSION")}
                        >
                          {t(
                            detail.isSuperAdmin
                              ? "settings:SETTINGS_SYSTEM_DIRECTORY_SUPER_ADMIN_ON"
                              : "settings:SETTINGS_SYSTEM_DIRECTORY_SUPER_ADMIN_OFF",
                          )}
                        </DetailFact>
                        <DetailFact
                          label={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_PASSWORD_MODE")}
                        >
                          {t(
                            detail.hasPassword
                              ? "settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_PASSWORD_MODE_ENABLED"
                              : "settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_PASSWORD_MODE_EMPTY",
                          )}
                        </DetailFact>
                        <DetailFact
                          label={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_TWO_FACTOR")}
                        >
                          {t(
                            detail.twoFactorEnabled
                              ? "settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_TWO_FACTOR_ENABLED"
                              : "settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_TWO_FACTOR_DISABLED",
                          )}
                        </DetailFact>
                        <DetailFact
                          label={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_LINKED_OAUTH")}
                        >
                          {providers.length > 0
                            ? providers.join(", ")
                            : t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_LINKED_OAUTH_EMPTY")}
                        </DetailFact>
                      </dl>
                    </section>
                  </TabsContent>

                  <TabsContent value="memberships" className="mt-0 space-y-6">
                    <MembershipsTab detail={detail} />
                  </TabsContent>

                  <TabsContent value="activity" className="mt-0 space-y-6">
                    <ActivityTab detail={detail} />
                  </TabsContent>

                  <TabsContent value="restrictions" className="mt-0 space-y-4">
                    <SectionHeading
                      icon={<ShieldAlert className="size-4" />}
                      title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_RESTRICTION_HISTORY")}
                    />
                    {detail.restrictionHistory.length === 0 ? (
                      <p className="rounded-lg border border-dashed p-5 text-footnote text-label-secondary">
                        {t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_RESTRICTION_EMPTY")}
                      </p>
                    ) : (
                      <div className="divide-y rounded-lg border">
                        {detail.restrictionHistory.map((entry) => (
                          <div key={entry.commandId} className="space-y-2 p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex min-w-0 items-center gap-2">
                                <BaseTag color={entry.state === "active" ? "red" : "green"}>
                                  {entry.state === "active"
                                    ? t("settings:SETTINGS_SYSTEM_DIRECTORY_STATUS_DISABLED")
                                    : t("settings:SETTINGS_SYSTEM_DIRECTORY_STATUS_ACTIVE")}
                                </BaseTag>
                                <span className="truncate text-footnote font-medium text-label-primary">
                                  {t(
                                    `settings:${RESTRICTION_REASON_KEYS[entry.reasonCategory] ?? "SETTINGS_ACCESS_RESTRICTION_REASON_OTHER"}`,
                                  )}
                                </span>
                              </div>
                              <span className="shrink-0 text-caption tabular-nums text-label-tertiary">
                                {formatDateTime(entry.changedAt)}
                              </span>
                            </div>
                            <p className="text-footnote text-label-secondary">
                              {entry.operatorNote}
                            </p>
                            <p className="font-mono text-caption text-label-tertiary">
                              {entry.reasonCode} · r{entry.revision}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="actions" className="mt-0 space-y-4">
                    <SectionHeading
                      icon={<ShieldCheck className="size-4" />}
                      title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_SECTION_ACTIONS")}
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Button variant="outline" onClick={() => runAction(props.onEdit)}>
                        <Pencil className="size-4" />
                        {t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_EDIT_ACCOUNT")}
                      </Button>
                      <Button
                        variant="outline"
                        disabled={!availability?.canResetPassword}
                        onClick={() => runAction(props.onResetPassword)}
                      >
                        <KeyRound className="size-4" />
                        {t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_RESET_PASSWORD")}
                      </Button>
                      <Button
                        variant="outline"
                        disabled={!availability?.canSendResetPasswordEmail}
                        onClick={() => runAction(props.onSendResetPasswordEmail)}
                      >
                        <Mail className="size-4" />
                        {t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_SEND_RESET_PASSWORD_EMAIL")}
                      </Button>
                      <Button variant="outline" onClick={() => runAction(props.onRevokeSessions)}>
                        <UserMinus className="size-4" />
                        {t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_REVOKE_LOGIN_SESSIONS")}
                      </Button>
                      <Button
                        variant="outline"
                        disabled={!availability?.canDisableTwoFactor}
                        onClick={() => runAction(props.onDisableTwoFactor)}
                      >
                        <ShieldOff className="size-4" />
                        {t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DISABLE_TWO_FACTOR")}
                      </Button>
                      <Button
                        variant="outline"
                        disabled={detail.isSuperAdmin && !availability?.canRevokeSuperAdmin}
                        onClick={() => runAction(props.onToggleSuperAdmin)}
                      >
                        <ShieldCheck className="size-4" />
                        {t(
                          detail.isSuperAdmin
                            ? "settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_REVOKE_SUPER_ADMIN"
                            : "settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_GRANT_SUPER_ADMIN",
                        )}
                      </Button>
                      {providers.map((provider) => (
                        <Button
                          key={provider}
                          variant="outline"
                          onClick={() => {
                            if (!user) return;
                            props.onOpenChange(false);
                            props.onUnlinkOAuth(user, provider);
                          }}
                        >
                          <ShieldOff className="size-4" />
                          {t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_UNLINK_OAUTH_PROVIDER", {
                            provider,
                          })}
                        </Button>
                      ))}
                      <Button
                        variant="outline"
                        disabled={
                          isDirectoryRestrictionActive(detail, "user_disabled")
                            ? !availability?.canEnableAccount
                            : !availability?.canDisableAccount
                        }
                        onClick={() => runAction(props.onToggleAccess)}
                      >
                        <ShieldAlert className="size-4" />
                        {t(
                          isDirectoryRestrictionActive(detail, "user_disabled")
                            ? "settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ENABLE_ACCOUNT"
                            : "settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DISABLE_ACCOUNT",
                        )}
                      </Button>
                      <Button
                        variant="destructive"
                        disabled={!availability?.canDeleteAccount}
                        onClick={() => runAction(props.onDelete)}
                      >
                        <Trash2 className="size-4" />
                        {t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DELETE_ACCOUNT")}
                      </Button>
                    </div>
                  </TabsContent>
                </>
              ) : null}
            </ContentGuard>
          </DrawerBody>
        </Tabs>
      </DrawerContent>
    </Drawer>
  );
}

function MembershipsTab({ detail }: { detail: SystemDirectoryUserDetail }) {
  const { t } = useTranslation(["common", "rbac", "settings"]);
  const hasMemberships =
    detail.workspaceMemberships.length > 0 || detail.projectMemberships.length > 0;
  const roleLabel = (role: string) => {
    const normalized = role.toUpperCase();
    const key = `rbac:RBAC_ROLE_${normalized}_NAME`;
    return t(key, { defaultValue: role });
  };

  if (!hasMemberships) {
    return (
      <p className="rounded-lg border border-dashed p-5 text-footnote text-label-secondary">
        {t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_MEMBERSHIPS_EMPTY")}
      </p>
    );
  }

  return (
    <>
      <section className="space-y-4">
        <SectionHeading
          icon={<BriefcaseBusiness className="size-4" />}
          title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_WORKSPACE_MEMBERSHIPS")}
        />
        <div className="divide-y rounded-lg border">
          {detail.workspaceMemberships.map((membership) => (
            <div key={membership.workspaceId} className="flex items-center gap-3 p-4">
              <WorkspaceAvatar name={membership.workspaceName} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-footnote font-medium text-label-primary">
                  {membership.workspaceName}
                </p>
                <p className="mt-0.5 truncate text-caption text-label-secondary">
                  {membership.roleCodes.map(roleLabel).join(", ") || t("common:NA")}
                </p>
              </div>
              <BaseTag color={membership.status === "active" ? "green" : "gold"}>
                {membership.status === "active"
                  ? t("settings:SETTINGS_SYSTEM_DIRECTORY_STATUS_ACTIVE")
                  : t(
                      membership.status === "invited"
                        ? "settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_MEMBERSHIP_INVITED"
                        : "settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_MEMBERSHIP_DISABLED",
                    )}
              </BaseTag>
            </div>
          ))}
        </div>
      </section>
      <Separator />
      <section className="space-y-4">
        <SectionHeading
          icon={<BriefcaseBusiness className="size-4" />}
          title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_PROJECT_MEMBERSHIPS")}
        />
        <div className="divide-y rounded-lg border">
          {detail.projectMemberships.map((membership) => (
            <a
              key={membership.projectId}
              href={`/projects/${encodeURIComponent(membership.projectId)}`}
              className="flex items-center gap-3 p-4 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <ProjectAvatar name={membership.projectName} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-footnote font-medium text-label-primary">
                  {membership.projectName}
                </p>
                <p className="mt-0.5 truncate text-caption text-label-secondary">
                  {membership.workspaceName} · {roleLabel(membership.role)}
                </p>
              </div>
              <ExternalLink className="size-4 text-label-tertiary" />
            </a>
          ))}
        </div>
      </section>
    </>
  );
}

function ActivityTab({ detail }: { detail: SystemDirectoryUserDetail }) {
  const { t } = useTranslation(["activity", "platform", "settings"]);
  const dateTime = useSystemDirectoryDateTimeFormatter();
  return (
    <>
      <section className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <SectionHeading
            icon={<Activity className="size-4" />}
            title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_ACTIVITY_TITLE")}
          />
          <Button asChild size="sm" variant="ghost">
            <a
              href={`/system/audit-log?view=events&actorUserId=${encodeURIComponent(detail.userId)}`}
            >
              {t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_VIEW_AUDIT")}
              <ExternalLink className="size-3.5" />
            </a>
          </Button>
        </div>
        {detail.recentAuditActivity.length === 0 ? (
          <p className="rounded-lg border border-dashed p-5 text-footnote text-label-secondary">
            {t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_AUDIT_EMPTY")}
          </p>
        ) : (
          <div className="divide-y rounded-lg border">
            {detail.recentAuditActivity.map((event) => (
              <div key={event.eventId} className="flex items-start gap-3 p-4">
                <ScrollText className="mt-0.5 size-4 shrink-0 text-label-tertiary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-footnote font-medium text-label-primary">
                    {auditEventName(t, event.eventName)}
                  </p>
                  <p className="mt-0.5 text-caption text-label-secondary">
                    {auditSourceLabel(t, event.source)} ·{" "}
                    {dateTime.formatDateTime(event.occurredAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      <Separator />
      <section className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <SectionHeading
            icon={<MessageSquareText className="size-4" />}
            title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_VIEW_FEEDBACK")}
          />
          <Button asChild size="sm" variant="ghost">
            <a href={`/system/feedback?reporterUserId=${encodeURIComponent(detail.userId)}`}>
              {t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_VIEW_FEEDBACK")}
              <ExternalLink className="size-3.5" />
            </a>
          </Button>
        </div>
        {detail.recentFeedbackActivity.length === 0 ? (
          <p className="rounded-lg border border-dashed p-5 text-footnote text-label-secondary">
            {t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_FEEDBACK_EMPTY")}
          </p>
        ) : (
          <div className="divide-y rounded-lg border">
            {detail.recentFeedbackActivity.map((feedback) => (
              <div key={feedback.feedbackId} className="space-y-2 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-footnote font-medium text-label-primary">
                    {feedback.intent
                      ? t(`platform:${FEEDBACK_INTENT_LABELS[feedback.intent]}`)
                      : t("platform:FEEDBACK_INTENT_PROBLEM")}
                  </p>
                  <BaseTag color="default">
                    {t(
                      `platform:${FEEDBACK_STATUS_LABELS[feedback.status as FeedbackStatus] ?? "STATUS_NEW"}`,
                    )}
                  </BaseTag>
                </div>
                <p className="line-clamp-2 text-footnote text-label-secondary">
                  {feedback.message}
                </p>
                <p className="text-caption text-label-tertiary">
                  {dateTime.formatDateTime(feedback.lastActivityAt)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

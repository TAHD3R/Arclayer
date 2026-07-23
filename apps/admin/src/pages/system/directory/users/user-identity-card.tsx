import {
  BriefcaseBusiness,
  Copy,
  Eye,
  FolderKanban,
  MessageSquareText,
  ScrollText,
  ShieldAlert,
  UserRoundCog,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { UserAvatar } from "@/components/common/entity-avatar";
import { BaseTag } from "@/components/ui/tags";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { findDirectoryRestriction } from "@/pages/system/directory/restriction-state";
import { Button } from "@arclayer/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@arclayer/ui/hover-card";
import type { SystemDirectoryUser } from "@arclayer/openapi/admin-types";

const RESTRICTION_REASON_KEYS = {
  abuse_prevention: "SETTINGS_ACCESS_RESTRICTION_REASON_ABUSE_PREVENTION",
  billing_issue: "SETTINGS_ACCESS_RESTRICTION_REASON_BILLING_ISSUE",
  compliance_review: "SETTINGS_ACCESS_RESTRICTION_REASON_COMPLIANCE_REVIEW",
  other: "SETTINGS_ACCESS_RESTRICTION_REASON_OTHER",
  owner_request: "SETTINGS_ACCESS_RESTRICTION_REASON_OWNER_REQUEST",
  policy_violation: "SETTINGS_ACCESS_RESTRICTION_REASON_POLICY_VIOLATION",
  security_risk: "SETTINGS_ACCESS_RESTRICTION_REASON_SECURITY_RISK",
} as const;

function IdentityFact(props: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-label-tertiary">{props.label}</dt>
      <dd className="mt-0.5 truncate text-footnote text-label-primary">{props.value}</dd>
    </div>
  );
}

function accountStatusKey(status: SystemDirectoryUser["status"]) {
  if (status === "active") return "SETTINGS_SYSTEM_DIRECTORY_STATUS_ACTIVE";
  if (status === "disabled") return "SETTINGS_SYSTEM_DIRECTORY_STATUS_DISABLED";
  return "SETTINGS_SYSTEM_DIRECTORY_STATUS_LOCKED";
}

function accountStatusColor(status: SystemDirectoryUser["status"]) {
  if (status === "active") return "green" as const;
  if (status === "disabled") return "red" as const;
  return "gold" as const;
}

export function SystemDirectoryUserIdentityCard(props: {
  user: SystemDirectoryUser;
  formatDateTime: (value: string) => string;
  onOpenDetail: (user: SystemDirectoryUser) => void;
  onEdit: (user: SystemDirectoryUser) => void;
}) {
  const { t } = useTranslation(["common", "platform", "settings"]);
  const { user } = props;
  const name = user.displayName || user.username;
  const providers = user.linkedOauthProviders ?? user.linked_oauth_providers ?? [];
  const signInMethods = [
    ...(user.hasPassword ? [t("settings:SETTINGS_SYSTEM_DIRECTORY_SECURITY_PASSWORD")] : []),
    ...providers,
  ];
  const restriction = findDirectoryRestriction(user, "user_disabled");
  const activeRestriction = restriction?.state === "active" ? restriction : null;
  const formatDate = (value: string | null | undefined) =>
    value ? props.formatDateTime(value) : t("common:NA");
  const copyEmail = async () => {
    if (!user.email) return;
    try {
      await navigator.clipboard.writeText(user.email);
      notifySuccessText(t("platform:FEEDBACK_USER_EMAIL_COPIED"));
    } catch (error) {
      notifyError(error);
    }
  };

  return (
    <HoverCard openDelay={160} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="ml-1 flex min-w-0 max-w-full items-center gap-3 rounded-md text-left outline-none hover:bg-accent/45 focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={name}
          onClick={(event) => event.stopPropagation()}
        >
          <UserAvatar name={name} assetRef={user.avatarUrl ?? user.avatar_url} size={28} />
          <span className="min-w-0">
            <span className="block truncate text-footnote font-medium text-label-primary">
              {name}
            </span>
            {user.email ? (
              <span className="block truncate text-caption text-label-secondary">{user.email}</span>
            ) : null}
          </span>
        </button>
      </HoverCardTrigger>

      <HoverCardContent
        align="start"
        sideOffset={8}
        className="w-96 p-0"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex min-w-0 items-start gap-3 border-b border-border px-4 py-4">
          <UserAvatar name={name} assetRef={user.avatarUrl ?? user.avatar_url} size={44} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-callout font-semibold text-label-primary">{name}</p>
              {user.isSuperAdmin ? (
                <BaseTag color="gold">
                  {t("settings:SETTINGS_SYSTEM_DIRECTORY_SUPER_ADMIN_ON")}
                </BaseTag>
              ) : null}
            </div>
            <p className="mt-0.5 truncate text-footnote text-label-secondary">@{user.username}</p>
            {user.email ? (
              <p className="mt-1 truncate text-footnote text-label-secondary">{user.email}</p>
            ) : null}
          </div>
          <BaseTag color={accountStatusColor(user.status)}>
            {t(`settings:${accountStatusKey(user.status)}`)}
          </BaseTag>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3">
          <IdentityFact
            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_CREATED_AT")}
            value={formatDate(user.createdAt ?? user.created_at)}
          />
          <IdentityFact
            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_LAST_LOGIN")}
            value={formatDate(user.lastLoginAt ?? user.last_login_at)}
          />
          <IdentityFact
            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_WORKSPACES")}
            value={String(user.workspaceMembershipCount ?? user.workspace_membership_count ?? 0)}
          />
          <IdentityFact
            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_PROJECTS")}
            value={String(user.projectMembershipCount ?? user.project_membership_count ?? 0)}
          />
          <div className="col-span-2 min-w-0">
            <dt className="text-caption text-label-tertiary">
              {t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_SECURITY")}
            </dt>
            <dd className="mt-0.5 text-footnote text-label-primary">
              {signInMethods.length > 0
                ? signInMethods.join(" · ")
                : t("settings:SETTINGS_SYSTEM_DIRECTORY_SECURITY_NO_SIGN_IN_METHOD")}
              <span className="text-label-tertiary"> · </span>
              {user.twoFactorEnabled
                ? t("settings:SETTINGS_SYSTEM_DIRECTORY_SECURITY_TWO_FACTOR_ON")
                : t("settings:SETTINGS_SYSTEM_DIRECTORY_SECURITY_TWO_FACTOR_OFF")}
            </dd>
          </div>
        </dl>

        {activeRestriction ? (
          <div className="mx-4 mb-3 flex gap-2 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2.5">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-caption font-medium text-label-primary">
                {t("settings:SETTINGS_ACCESS_RESTRICTION_CURRENT_REASON")}
              </p>
              <p className="mt-0.5 text-footnote text-label-secondary">
                {t(`settings:${RESTRICTION_REASON_KEYS[activeRestriction.reasonCategory]}`)}
                <span className="text-label-tertiary"> · </span>
                {formatDate(activeRestriction.effectiveAt)}
              </p>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-1 border-t border-border px-3 py-2.5">
          <Button type="button" variant="ghost" size="sm" onClick={() => props.onOpenDetail(user)}>
            <Eye className="size-3.5" aria-hidden="true" />
            {t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DETAILS")}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => props.onEdit(user)}>
            <UserRoundCog className="size-3.5" aria-hidden="true" />
            {t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_EDIT_ACCOUNT")}
          </Button>
          <Button asChild variant="ghost" size="sm">
            <a
              href={`/system/audit-log?view=events&actorUserId=${encodeURIComponent(user.userId)}`}
            >
              <ScrollText className="size-3.5" aria-hidden="true" />
              {t("platform:AUDIT_TITLE")}
            </a>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <a href={`/system/feedback?reporterUserId=${encodeURIComponent(user.userId)}`}>
              <MessageSquareText className="size-3.5" aria-hidden="true" />
              {t("platform:FEEDBACK_CENTER_TITLE")}
            </a>
          </Button>
          <Button asChild variant="ghost" size="icon-sm">
            <a href={`/system/tenants/workspaces?ownerUserId=${encodeURIComponent(user.userId)}`}>
              <BriefcaseBusiness className="size-3.5" aria-hidden="true" />
              <span className="sr-only">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_VIEW_OWNED_WORKSPACES")}
              </span>
            </a>
          </Button>
          <Button asChild variant="ghost" size="icon-sm">
            <a href={`/system/tenants/projects?ownerUserId=${encodeURIComponent(user.userId)}`}>
              <FolderKanban className="size-3.5" aria-hidden="true" />
              <span className="sr-only">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_VIEW_OWNED_PROJECTS")}
              </span>
            </a>
          </Button>
          {user.email ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="ml-auto"
              onClick={() => void copyEmail()}
            >
              <Copy className="size-3.5" aria-hidden="true" />
              <span className="sr-only">{t("platform:FEEDBACK_USER_COPY_EMAIL")}</span>
            </Button>
          ) : null}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

import { CalendarDays, Copy, ExternalLink, Filter, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { FeedbackUser } from "@/api/feedback";
import { UserAvatar } from "@/components/common/entity-avatar";
import { BaseTag } from "@/components/ui/tags";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { Button } from "@arclayer/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@arclayer/ui/hover-card";

function feedbackUserName(user: FeedbackUser): string {
  return user.displayName || user.username;
}

function IdentityFact(props: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-label-tertiary">{props.label}</dt>
      <dd className="mt-0.5 truncate text-footnote text-label-primary">{props.value}</dd>
    </div>
  );
}

export function FeedbackUserIdentity(props: {
  user: FeedbackUser | null;
  emptyLabel: string;
  formatDateTime?: (value: string) => string;
  onFilter?: (user: FeedbackUser) => void;
}) {
  const { t } = useTranslation(["common", "platform"]);
  if (!props.user) {
    return <span className="text-label-tertiary">{props.emptyLabel}</span>;
  }

  const user = props.user;
  const name = feedbackUserName(user);
  const formatDate = (value: string | null) =>
    value
      ? (props.formatDateTime?.(value) ??
        new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
          new Date(value),
        ))
      : t("common:NA");
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
          className="flex min-w-0 max-w-full items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={name}
        >
          <UserAvatar name={name} assetRef={user.avatarUrl} size={28} />
          <span className="min-w-0 truncate text-callout text-label-primary">{name}</span>
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-80 p-0">
        <div className="flex min-w-0 items-start gap-3 border-b border-border px-4 py-4">
          <UserAvatar name={name} assetRef={user.avatarUrl} size={44} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-callout font-semibold text-label-primary">{name}</p>
              {user.isSuperAdmin ? (
                <ShieldCheck
                  className="size-3.5 shrink-0 text-label-secondary"
                  aria-hidden="true"
                />
              ) : null}
            </div>
            <p className="truncate text-footnote text-label-secondary">@{user.username}</p>
            {user.email ? (
              <p className="mt-1 truncate text-footnote text-label-secondary">{user.email}</p>
            ) : null}
          </div>
          <BaseTag color={user.status === "active" ? "green" : "default"}>
            {user.status === "active"
              ? t("platform:FEEDBACK_USER_STATUS_ACTIVE")
              : t("platform:FEEDBACK_USER_STATUS_INACTIVE")}
          </BaseTag>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3">
          <IdentityFact
            label={t("platform:FEEDBACK_USER_JOINED_AT")}
            value={formatDate(user.createdAt)}
          />
          <IdentityFact
            label={t("platform:FEEDBACK_USER_LAST_LOGIN")}
            value={formatDate(user.lastLoginAt)}
          />
          <IdentityFact
            label={t("platform:FEEDBACK_USER_ACCOUNT_ROLE")}
            value={
              user.isSuperAdmin
                ? t("platform:FEEDBACK_USER_ROLE_SUPER_ADMIN")
                : t("platform:FEEDBACK_USER_ROLE_MEMBER")
            }
          />
          <IdentityFact label={t("platform:FEEDBACK_USER_ACCOUNT_STATUS")} value={user.status} />
        </dl>

        <div className="flex flex-wrap items-center gap-1 border-t border-border px-3 py-2.5">
          <Button asChild variant="ghost" size="sm">
            <a href="/system/tenants/users">
              <ExternalLink className="size-3.5" aria-hidden="true" />
              {t("platform:FEEDBACK_USER_OPEN_DIRECTORY")}
            </a>
          </Button>
          {props.onFilter ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => props.onFilter?.(user)}>
              <Filter className="size-3.5" aria-hidden="true" />
              {t("platform:FEEDBACK_USER_FILTER")}
            </Button>
          ) : null}
          {user.email ? (
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => void copyEmail()}>
              <Copy className="size-3.5" aria-hidden="true" />
              <span className="sr-only">{t("platform:FEEDBACK_USER_COPY_EMAIL")}</span>
            </Button>
          ) : null}
          <CalendarDays className="ml-auto size-3.5 text-label-tertiary" aria-hidden="true" />
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

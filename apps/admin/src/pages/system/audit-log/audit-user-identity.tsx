import { Copy, ExternalLink, Filter, UserRoundSearch } from "lucide-react";
import { useTranslation } from "react-i18next";

import { UserAvatar } from "@/components/common/entity-avatar";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import type { ActivityUserSummary } from "@/pages/workspaces/shared/activity/components/activity-user-pill";
import { Button } from "@arclayer/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@arclayer/ui/hover-card";

function primaryLabel(user: ActivityUserSummary) {
  return user.displayName || user.username || user.id;
}

export function AuditUserIdentity(props: {
  user: ActivityUserSummary | null | undefined;
  userId?: string | null;
  onFilter?: (userId: string) => void;
}) {
  const { t } = useTranslation(["common", "platform"]);
  const userId = props.user?.id || props.userId || null;
  const user =
    props.user ??
    (userId ? { id: userId, username: null, displayName: null, avatarUrl: null } : null);
  if (!user) return <span className="text-label-tertiary">{t("common:NA")}</span>;
  const name = primaryLabel(user);
  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(user.id);
      notifySuccessText(t("platform:AUDIT_USER_ID_COPIED"));
    } catch (error) {
      notifyError(error);
    }
  };

  return (
    <HoverCard openDelay={160} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="flex min-w-0 max-w-full items-center gap-2 rounded-md px-1 py-0.5 text-left outline-none hover:bg-accent/45 focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={name}
          onClick={(event) => event.stopPropagation()}
        >
          <UserAvatar name={name} assetRef={user.avatarUrl} size={26} />
          <span className="min-w-0 truncate text-footnote font-medium text-label-primary">
            {name}
          </span>
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        className="w-76 p-0"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex min-w-0 items-start gap-3 border-b border-border px-4 py-4">
          <UserAvatar name={name} assetRef={user.avatarUrl} size={42} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-callout font-semibold text-label-primary">{name}</p>
            {user.username ? (
              <p className="mt-0.5 truncate text-footnote text-label-secondary">@{user.username}</p>
            ) : (
              <p className="mt-0.5 text-footnote text-label-secondary">
                {t("platform:AUDIT_USER_IDENTITY_PARTIAL")}
              </p>
            )}
          </div>
          <UserRoundSearch className="size-4 shrink-0 text-label-tertiary" aria-hidden="true" />
        </div>
        <div className="px-4 py-3">
          <div className="text-caption text-label-tertiary">
            {t("platform:AUDIT_USER_TECHNICAL_ID")}
          </div>
          <div className="mt-1 break-all font-mono text-caption text-label-secondary">
            {user.id}
          </div>
        </div>
        <div className="flex items-center gap-1 border-t border-border px-3 py-2.5">
          <Button asChild variant="ghost" size="sm">
            <a href="/system/tenants/users" onClick={(event) => event.stopPropagation()}>
              <ExternalLink className="size-3.5" />
              {t("platform:AUDIT_USER_OPEN_DIRECTORY")}
            </a>
          </Button>
          {props.onFilter && userId ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => props.onFilter?.(userId)}
            >
              <Filter className="size-3.5" />
              {t("platform:AUDIT_USER_FILTER")}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="ml-auto"
            onClick={() => void copyId()}
          >
            <Copy className="size-3.5" />
            <span className="sr-only">{t("platform:AUDIT_USER_COPY_ID")}</span>
          </Button>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

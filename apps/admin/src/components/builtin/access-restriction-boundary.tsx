import { useNavigate } from "@tanstack/react-router";
import { Archive, FolderLock, LogOut, MessageCircleMore, ShieldBan } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import * as authApi from "@/api/auth";
import { HeaderFeedbackPopover } from "@/components/feedback/feedback-dialog";
import { queryClient } from "@/lib/query/query-client-instance";
import { isPublicPath } from "@/lib/routing/route-identity";
import { notifyError } from "@/lib/notifications";
import {
  type AccessRestrictionCode,
  type ActiveAccessRestriction,
  useAccessRestrictionStore,
} from "@/stores/use-access-restriction-store";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { Button } from "@arclayer/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@arclayer/ui/empty";

const RESTRICTION_PRESENTATION = {
  USER_DISABLED: {
    titleKey: "ACCESS_RESTRICTION_USER_DISABLED_TITLE",
    descriptionKey: "ACCESS_RESTRICTION_USER_DISABLED_DESCRIPTION",
    icon: ShieldBan,
  },
  WORKSPACE_SUSPENDED: {
    titleKey: "ACCESS_RESTRICTION_WORKSPACE_SUSPENDED_TITLE",
    descriptionKey: "ACCESS_RESTRICTION_WORKSPACE_SUSPENDED_DESCRIPTION",
    icon: ShieldBan,
  },
  WORKSPACE_ARCHIVED: {
    titleKey: "ACCESS_RESTRICTION_WORKSPACE_ARCHIVED_TITLE",
    descriptionKey: "ACCESS_RESTRICTION_WORKSPACE_ARCHIVED_DESCRIPTION",
    icon: Archive,
  },
  PROJECT_SUSPENDED: {
    titleKey: "ACCESS_RESTRICTION_PROJECT_SUSPENDED_TITLE",
    descriptionKey: "ACCESS_RESTRICTION_PROJECT_SUSPENDED_DESCRIPTION",
    icon: FolderLock,
  },
} as const satisfies Record<AccessRestrictionCode, object>;

const REASON_CATEGORIES = new Set([
  "policy_violation",
  "security_risk",
  "billing_issue",
  "abuse_prevention",
  "compliance_review",
  "owner_request",
  "other",
]);

function extractProjectId(pathname: string): string | null {
  const match = /^\/projects\/([^/]+)(?:\/|$)/.exec(pathname);
  return match?.[1] ?? null;
}

function hasRecoveryAction(active: ActiveAccessRestriction, action: string): boolean {
  const actions = active.restriction?.allowedRecoveryActions;
  if (actions) return actions.includes(action);

  if (active.code === "USER_DISABLED") {
    return action === "contact_support" || action === "sign_out";
  }
  if (active.code === "PROJECT_SUSPENDED") {
    return action === "switch_project" || action === "contact_support";
  }
  return action === "switch_workspace" || action === "contact_support";
}

function isRelevantRestriction(params: {
  active: ActiveAccessRestriction;
  pathname: string;
  currentWorkspaceId: string | null;
  currentProjectId: string | null;
}): boolean {
  const { active, pathname, currentWorkspaceId, currentProjectId } = params;
  if (active.code === "USER_DISABLED") return true;

  const restriction = active.restriction;
  if (active.code === "PROJECT_SUSPENDED") {
    const routeProjectId = extractProjectId(pathname);
    if (!restriction) return routeProjectId !== null;
    return restriction.entityId === routeProjectId || restriction.entityId === currentProjectId;
  }

  if (!restriction) {
    return (
      currentWorkspaceId !== null || pathname === "/projects" || pathname.startsWith("/projects/")
    );
  }
  return restriction.entityId === currentWorkspaceId;
}

function formatTimestamp(value: string | null, formatter: Intl.DateTimeFormat): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : formatter.format(date);
}

function RestrictionDetails(props: {
  active: ActiveAccessRestriction;
  formatter: Intl.DateTimeFormat;
}) {
  const { t } = useTranslation("platform");
  const restriction = props.active.restriction;
  if (!restriction) return null;

  const category = REASON_CATEGORIES.has(restriction.reasonCategory)
    ? restriction.reasonCategory.toUpperCase()
    : "OTHER";
  const effectiveAt = formatTimestamp(restriction.effectiveAt, props.formatter);
  const reviewAt = formatTimestamp(restriction.reviewAt, props.formatter);
  const expiresAt = formatTimestamp(restriction.expiresAt, props.formatter);
  const details = [
    {
      label: t("ACCESS_RESTRICTION_REASON_LABEL"),
      value: t(`ACCESS_RESTRICTION_REASON_${category}`),
    },
    effectiveAt ? { label: t("ACCESS_RESTRICTION_EFFECTIVE_AT"), value: effectiveAt } : null,
    reviewAt ? { label: t("ACCESS_RESTRICTION_REVIEW_AT"), value: reviewAt } : null,
    expiresAt ? { label: t("ACCESS_RESTRICTION_EXPIRES_AT"), value: expiresAt } : null,
  ].filter((item): item is { label: string; value: string } => Boolean(item));

  return (
    <dl className="grid w-full gap-3 rounded-xl border border-border/70 bg-card/60 p-4 text-left sm:grid-cols-2">
      {details.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-caption text-label-tertiary">{item.label}</dt>
          <dd className="mt-1 text-footnote text-label-primary">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function AccessRestrictionBlocker(props: { active: ActiveAccessRestriction }) {
  const { t, i18n } = useTranslation(["platform", "common"]);
  const navigate = useNavigate();
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const clearAuth = useAuthStore((state) => state.clear);
  const clearWorkspace = useWorkspaceStore((state) => state.clearWorkspace);
  const setCurrentProjectId = useWorkspaceStore((state) => state.setCurrentProjectId);
  const setLastProjectId = useWorkspaceStore((state) => state.setLastProjectId);
  const clearRestriction = useAccessRestrictionStore((state) => state.clear);
  const [pendingAction, setPendingAction] = useState<"switch" | "sign-out" | null>(null);
  const presentation = RESTRICTION_PRESENTATION[props.active.code];
  const Icon = presentation.icon;
  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage || i18n.language || undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [i18n.language, i18n.resolvedLanguage],
  );
  const canSwitchWorkspace = hasRecoveryAction(props.active, "switch_workspace");
  const canSwitchProject = hasRecoveryAction(props.active, "switch_project");
  const canContactSupport =
    props.active.restriction?.supportAvailable !== false &&
    hasRecoveryAction(props.active, "contact_support");

  const switchScope = async () => {
    setPendingAction("switch");
    try {
      if (canSwitchProject) {
        setCurrentProjectId(null);
        setLastProjectId(null);
        await navigate({ to: "/projects" as never, replace: true });
      } else {
        clearWorkspace();
        await navigate({ to: "/" as never, replace: true });
      }
      clearRestriction();
    } catch (error) {
      notifyError(error);
    } finally {
      setPendingAction(null);
    }
  };

  const signOut = async () => {
    setPendingAction("sign-out");
    try {
      await authApi.logout({ refreshToken });
      void queryClient.cancelQueries();
      queryClient.clear();
      clearWorkspace();
      clearAuth();
      clearRestriction();
      await navigate({ to: "/login" as never, replace: true });
    } catch (error) {
      notifyError(error);
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <main
      className="flex min-h-dvh w-full bg-background px-4 py-10"
      data-testid="access-restriction-blocker"
      aria-live="assertive"
    >
      <Empty className="mx-auto w-full max-w-2xl rounded-none p-0">
        <EmptyHeader>
          <EmptyMedia
            variant="icon"
            className="size-12 rounded-xl border border-border/70 bg-card text-label-primary"
          >
            <Icon className="size-6" aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{t(`platform:${presentation.titleKey}`)}</EmptyTitle>
          <EmptyDescription className="max-w-xl leading-relaxed">
            {t(`platform:${presentation.descriptionKey}`)}
          </EmptyDescription>
        </EmptyHeader>

        <EmptyContent className="max-w-xl">
          <RestrictionDetails active={props.active} formatter={formatter} />
          <div className="flex w-full flex-wrap items-center justify-center gap-2">
            {canSwitchWorkspace || canSwitchProject ? (
              <Button
                type="button"
                size="lg"
                loading={pendingAction === "switch"}
                disabled={pendingAction !== null}
                onClick={() => void switchScope()}
              >
                {t(
                  canSwitchProject
                    ? "platform:ACCESS_RESTRICTION_SWITCH_PROJECT"
                    : "platform:ACCESS_RESTRICTION_SWITCH_WORKSPACE",
                )}
              </Button>
            ) : null}
            {canContactSupport ? (
              <HeaderFeedbackPopover
                source="content_guard"
                initialIntent="problem"
                lockIntent
                reportContext={{ errorCode: props.active.code }}
                trigger={
                  <Button
                    type="button"
                    size="lg"
                    variant="outline"
                    disabled={pendingAction !== null}
                  >
                    <MessageCircleMore className="size-4" aria-hidden="true" />
                    {t("platform:ACCESS_RESTRICTION_CONTACT_SUPPORT")}
                  </Button>
                }
              />
            ) : null}
            <Button
              type="button"
              size="lg"
              variant="ghost"
              loading={pendingAction === "sign-out"}
              disabled={pendingAction !== null}
              onClick={() => void signOut()}
            >
              <LogOut className="size-4" aria-hidden="true" />
              {t("platform:ACCESS_RESTRICTION_SIGN_OUT")}
            </Button>
          </div>
        </EmptyContent>
      </Empty>
    </main>
  );
}

export function AccessRestrictionBoundary(props: { pathname: string; children: ReactNode }) {
  const active = useAccessRestrictionStore((state) => state.active);
  const currentWorkspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const currentProjectId = useWorkspaceStore((state) => state.currentProjectId);

  if (
    !active ||
    isPublicPath(props.pathname) ||
    !isRelevantRestriction({
      active,
      pathname: props.pathname,
      currentWorkspaceId,
      currentProjectId,
    })
  ) {
    return props.children;
  }

  return <AccessRestrictionBlocker active={active} />;
}

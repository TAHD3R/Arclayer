import { useQuery } from "@tanstack/react-query";
import { CalendarClock, CircleAlert, Coins, History, LockKeyhole } from "lucide-react";
import { useTranslation } from "react-i18next";

import { getWorkspaceCommerceOverview } from "@/api/commerce";
import { useSettingsScreen } from "@/components/layout/settings-screen-provider";
import { getErrorMessage } from "@/lib/notifications";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { cn } from "@arclayer/lib/utils";
import { Button, buttonVariants } from "@arclayer/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@arclayer/ui/hover-card";
import { Skeleton } from "@arclayer/ui/skeleton";

export function WorkspaceCreditsControl(
  props: { className?: string; compactOnMobile?: boolean } = {},
) {
  const { t, i18n } = useTranslation(["commerce"]);
  const settingsScreen = useSettingsScreen();
  const workspaceId = useWorkspaceStore(
    (state) => state.currentWorkspaceId ?? state.lastWorkspaceId,
  );
  const overviewQuery = useQuery({
    queryKey: ["commerce", "workspace", workspaceId, "overview"],
    queryFn: ({ signal }) => getWorkspaceCommerceOverview(String(workspaceId), signal),
    enabled: Boolean(workspaceId),
    retry: false,
    staleTime: 30_000,
    meta: { silent: true },
  });

  if (!workspaceId) return null;

  if (overviewQuery.isLoading) {
    return (
      <Skeleton
        className={cn(
          "h-9 w-28 rounded-md",
          props.compactOnMobile && "max-[768px]:w-11",
          props.className,
        )}
        aria-label={t("commerce:CREDITS_LOADING")}
      />
    );
  }

  const overview = overviewQuery.data;
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const openPlanUsage = () => settingsScreen.openSettings({ screen: "workspace.plan-usage" });
  const creditsLabel = overview
    ? t("commerce:CREDITS_BUTTON_LABEL", { count: number.format(overview.credits.available) })
    : t("commerce:CREDITS_UNAVAILABLE");

  const trigger = (
    <div
      tabIndex={0}
      aria-label={creditsLabel}
      className={cn(
        buttonVariants({ variant: "outline", size: "sm" }),
        "cursor-default text-callout font-semibold",
        props.compactOnMobile && "max-[768px]:[&>span:not(.sr-only)]:hidden",
        props.className,
      )}
    >
      {overview ? <Coins aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
      <span>{overview ? number.format(overview.credits.available) : "—"}</span>
    </div>
  );

  return (
    <HoverCard openDelay={180} closeDelay={120}>
      <HoverCardTrigger asChild>{trigger}</HoverCardTrigger>
      <HoverCardContent align="end" sideOffset={8} className="w-80">
        {overview ? (
          <div className="flex flex-col gap-4">
            <div>
              <div className="text-headline font-semibold text-label-primary">
                {t(overview.planRevision.nameI18NKey)}
              </div>
              <div className="mt-1 text-footnote text-label-secondary">
                {t("commerce:CREDITS_AVAILABLE", {
                  count: number.format(overview.credits.available),
                })}
              </div>
            </div>

            <dl className="grid grid-cols-3 gap-2 rounded-lg bg-muted/50 p-3 text-footnote">
              <div className="min-w-0">
                <dt className="text-label-secondary">{t("commerce:CREDITS_BALANCE")}</dt>
                <dd className="mt-1 truncate font-semibold text-label-primary">
                  {number.format(overview.credits.balance)}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-label-secondary">{t("commerce:CREDITS_RESERVED")}</dt>
                <dd className="mt-1 truncate font-semibold text-label-primary">
                  {number.format(overview.credits.reserved)}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-label-secondary">{t("commerce:PLAN_REVISION_SHORT")}</dt>
                <dd className="mt-1 truncate font-semibold text-label-primary">
                  {overview.planRevision.sequence}
                </dd>
              </div>
            </dl>

            <div className="flex flex-col gap-3 text-footnote">
              <div className="flex items-start gap-2">
                <CalendarClock
                  className="mt-0.5 size-4 shrink-0 text-label-secondary"
                  aria-hidden="true"
                />
                <div>
                  <div className="text-label-primary">{t("commerce:CREDITS_PERIOD")}</div>
                  <div className="text-label-secondary">
                    {t("commerce:CREDITS_PERIOD_RANGE", {
                      start: date.format(new Date(overview.credits.periodStart)),
                      end: date.format(new Date(overview.credits.periodEnd)),
                    })}
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <LockKeyhole
                  className="mt-0.5 size-4 shrink-0 text-label-secondary"
                  aria-hidden="true"
                />
                <div>
                  <div className="text-label-primary">{t("commerce:CREDITS_NEXT_REFRESH")}</div>
                  <div className="text-label-secondary">
                    {overview.credits.nextRefreshAt
                      ? date.format(new Date(overview.credits.nextRefreshAt))
                      : t("commerce:CREDITS_NO_AUTOMATIC_REFRESH")}
                  </div>
                </div>
              </div>
            </div>

            <Button type="button" variant="outline" onClick={openPlanUsage}>
              <History data-icon="inline-start" aria-hidden="true" />
              {t("commerce:LEDGER_VIEW_ACTION")}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="text-headline font-semibold text-label-primary">
              {t("commerce:CREDITS_UNAVAILABLE")}
            </div>
            <div className="text-footnote text-label-secondary">
              {getErrorMessage(overviewQuery.error)}
            </div>
            <Button type="button" variant="outline" onClick={() => void overviewQuery.refetch()}>
              {t("commerce:CREDITS_RETRY")}
            </Button>
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}

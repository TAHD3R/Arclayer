import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarClock, Coins, CreditCard, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  createWorkspaceCustomerPortalSession,
  getWorkspaceCommerceOverview,
  type WorkspaceCommerceOverview,
} from "@/api/commerce";
import { CreditLedgerTable } from "@/components/commerce/credit-ledger-table";
import { PlanSelectionDialog } from "@/components/commerce/plan-selection-dialog";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { notifyError } from "@/lib/notifications";
import { Badge } from "@arclayer/ui/badge";
import { Button } from "@arclayer/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@arclayer/ui/card";

function UsageMetric(props: {
  label: string;
  value: string;
  supporting?: string;
  icon: typeof Coins;
}) {
  const Icon = props.icon;
  return (
    <div className="min-w-0 border-b border-border/60 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:px-5 sm:first:pl-0 sm:last:border-r-0 sm:last:pr-0">
      <div className="flex items-center justify-between gap-3 text-footnote text-label-secondary">
        <span>{props.label}</span>
        <Icon className="size-4" aria-hidden="true" />
      </div>
      <div className="mt-2 truncate text-title2 font-semibold tabular-nums text-label-primary">
        {props.value}
      </div>
      {props.supporting ? (
        <p className="mt-1 text-caption text-label-secondary">{props.supporting}</p>
      ) : null}
    </div>
  );
}

function subscriptionBadgeVariant(status: WorkspaceCommerceOverview["subscription"]["status"]) {
  if (status === "active") return "default" as const;
  if (status === "past_due") return "destructive" as const;
  return "secondary" as const;
}

export function WorkspacePlanUsageView({ workspaceId }: { workspaceId: string }) {
  const { t, i18n } = useTranslation(["commerce", "common"]);
  const [plansOpen, setPlansOpen] = useState(false);
  const overviewQuery = useQuery({
    queryKey: ["commerce", "workspace", workspaceId, "overview"],
    queryFn: ({ signal }) => getWorkspaceCommerceOverview(workspaceId, signal),
    retry: false,
    meta: { silent: true },
  });
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const date = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }), [locale]);
  const overview = overviewQuery.data;
  const isFreePlan = overview?.planRevision.planCode === "free";
  const billingPortalMutation = useMutation({
    mutationFn: () => createWorkspaceCustomerPortalSession(workspaceId),
    onSuccess: (redirect) => window.location.assign(redirect.url),
    onError: notifyError,
  });

  return (
    <ContentGuard
      loading={overviewQuery.isLoading}
      error={overviewQuery.error}
      onRetry={() => void overviewQuery.refetch()}
      loadingVariant="form"
    >
      {overview ? (
        <div className="flex flex-col gap-8 pb-8">
          <Card>
            <CardHeader className="gap-4 border-b sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-title2">
                    {t(overview.planRevision.nameI18NKey)}
                  </CardTitle>
                  <Badge variant={subscriptionBadgeVariant(overview.subscription.status)}>
                    {t(
                      `commerce:SUBSCRIPTION_STATUS_${overview.subscription.status.toUpperCase()}`,
                    )}
                  </Badge>
                </div>
                <CardDescription className="mt-1">
                  {t(overview.planRevision.descriptionI18NKey)}
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                {!isFreePlan ? (
                  <Button
                    variant="outline"
                    loading={billingPortalMutation.isPending}
                    onClick={() => billingPortalMutation.mutate()}
                  >
                    <CreditCard data-icon="inline-start" />
                    {t("commerce:PLAN_MANAGE_SUBSCRIPTION")}
                  </Button>
                ) : null}
                <Button onClick={() => setPlansOpen(true)}>
                  <Sparkles data-icon="inline-start" />
                  {t("commerce:PLAN_COMPARE_ACTION")}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div className="grid sm:grid-cols-2">
                <UsageMetric
                  label={t("commerce:CREDITS_AVAILABLE_LABEL")}
                  value={number.format(overview.credits.available)}
                  supporting={t("commerce:PLAN_CREDITS_INCLUDED", {
                    count: number.format(overview.planRevision.creditGrantAmount),
                  })}
                  icon={Coins}
                />
                <UsageMetric
                  label={t("commerce:USAGE_REQUESTS")}
                  value={number.format(overview.usage.requests)}
                  supporting={t("commerce:USAGE_REQUESTS_DESCRIPTION")}
                  icon={CalendarClock}
                />
              </div>
              <div className="grid gap-3 rounded-lg bg-muted/45 p-4 text-footnote text-label-secondary sm:grid-cols-2">
                <div className="flex items-center gap-2">
                  <Coins className="size-4" aria-hidden="true" />
                  <span>
                    {overview.credits.nextRefreshAt
                      ? t("commerce:CREDITS_REFRESH_DATE", {
                          date: date.format(new Date(overview.credits.nextRefreshAt)),
                        })
                      : isFreePlan
                        ? t("commerce:PLAN_FREE_NO_EXPIRATION")
                        : t("commerce:CREDITS_NO_AUTOMATIC_REFRESH")}
                  </span>
                </div>
                {!isFreePlan ? (
                  <div className="flex items-center gap-2">
                    <CreditCard className="size-4" aria-hidden="true" />
                    <span>
                      {overview.subscription.cancelAtPeriodEnd
                        ? t("commerce:SUBSCRIPTION_CANCELS_AT", {
                            date: date.format(new Date(overview.subscription.currentPeriodEnd)),
                          })
                        : t("commerce:SUBSCRIPTION_RENEWS_AT", {
                            date: date.format(new Date(overview.subscription.currentPeriodEnd)),
                          })}
                    </span>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <section
            className="flex min-h-[30rem] flex-col gap-3"
            aria-labelledby="credit-ledger-title"
          >
            <div>
              <h2 id="credit-ledger-title" className="text-headline text-label-primary">
                {t("commerce:LEDGER_DIALOG_TITLE")}
              </h2>
              <p className="mt-1 text-callout text-label-secondary">
                {t("commerce:LEDGER_DIALOG_DESCRIPTION")}
              </p>
            </div>
            <CreditLedgerTable workspaceId={workspaceId} />
          </section>

          <PlanSelectionDialog
            workspaceId={workspaceId}
            open={plansOpen}
            onOpenChange={setPlansOpen}
          />
        </div>
      ) : null}
    </ContentGuard>
  );
}

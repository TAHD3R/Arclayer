import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowUpRight, CalendarClock, Coins, CreditCard, Gauge, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { createWorkspaceCustomerPortalSession, getWorkspaceCommerceOverview } from "@/api/commerce";
import { CreditLedgerTable } from "@/components/commerce/credit-ledger-table";
import { PlanSelectionDialog } from "@/components/commerce/plan-selection-dialog";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { Button } from "@arclayer/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@arclayer/ui/card";
import { Progress } from "@arclayer/ui/progress";

function UsageMetric(props: { label: string; value: string; icon: typeof Coins }) {
  const Icon = props.icon;
  return (
    <div className="min-w-0 rounded-md border border-border/70 p-4">
      <div className="flex items-center justify-between gap-3 text-footnote text-label-secondary">
        <span>{props.label}</span>
        <Icon className="size-4" aria-hidden="true" />
      </div>
      <div className="mt-2 truncate font-mono text-title2 font-semibold tabular-nums text-label-primary">
        {props.value}
      </div>
    </div>
  );
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
  const portalMutation = useMutation({
    mutationFn: () => createWorkspaceCustomerPortalSession(workspaceId),
    onSuccess: (redirect) => window.location.assign(redirect.url),
  });
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const money = useMemo(
    () => new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }),
    [locale],
  );
  const date = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }), [locale]);
  const overview = overviewQuery.data;
  const totalTokens = overview ? overview.usage.promptTokens + overview.usage.completionTokens : 0;
  const spentRatio = overview?.credits.periodGranted
    ? Math.min(100, (overview.credits.periodSpent / overview.credits.periodGranted) * 100)
    : 0;

  return (
    <ContentGuard
      loading={overviewQuery.isLoading}
      error={overviewQuery.error ?? portalMutation.error}
      onRetry={() => void overviewQuery.refetch()}
      loadingVariant="form"
    >
      {overview ? (
        <div className="flex flex-col gap-8 pb-8">
          <Card>
            <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <CardTitle className="text-title2">{overview.plan.name}</CardTitle>
                <CardDescription className="mt-1">{overview.plan.description}</CardDescription>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button variant="outline" onClick={() => setPlansOpen(true)}>
                  <Sparkles data-icon="inline-start" />
                  {t("commerce:PLAN_COMPARE_ACTION")}
                </Button>
                {overview.subscription.billingInterval &&
                overview.billingProvider !== "disabled" ? (
                  <Button
                    variant="outline"
                    loading={portalMutation.isPending}
                    onClick={() => portalMutation.mutate()}
                  >
                    <CreditCard data-icon="inline-start" />
                    {t("commerce:PLAN_MANAGE_SUBSCRIPTION")}
                    <ArrowUpRight data-icon="inline-end" />
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <UsageMetric
                  label={t("commerce:CREDITS_AVAILABLE_LABEL")}
                  value={number.format(overview.credits.available)}
                  icon={Coins}
                />
                <UsageMetric
                  label={t("commerce:CREDITS_PERIOD_SPENT")}
                  value={number.format(overview.credits.periodSpent)}
                  icon={Gauge}
                />
                <UsageMetric
                  label={t("commerce:USAGE_REQUESTS")}
                  value={number.format(overview.usage.requests)}
                  icon={Sparkles}
                />
                <UsageMetric
                  label={t("commerce:USAGE_ACTUAL_COST")}
                  value={money.format(overview.usage.periodCostMicros / 1_000_000)}
                  icon={CreditCard}
                />
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between gap-4 text-footnote">
                  <span className="text-label-secondary">{t("commerce:CREDITS_PERIOD_USAGE")}</span>
                  <span className="font-mono tabular-nums text-label-primary">
                    {number.format(overview.credits.periodSpent)} /{" "}
                    {number.format(overview.credits.periodGranted)}
                  </span>
                </div>
                <Progress
                  value={spentRatio}
                  aria-label={t("commerce:CREDITS_PERIOD_USAGE")}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(spentRatio)}
                />
              </div>
              <div className="grid gap-3 text-footnote text-label-secondary sm:grid-cols-2">
                <div className="flex items-center gap-2">
                  <CalendarClock className="size-4" aria-hidden="true" />
                  <span>
                    {overview.credits.nextRefreshAt
                      ? t("commerce:CREDITS_REFRESH_DATE", {
                          date: date.format(new Date(overview.credits.nextRefreshAt)),
                        })
                      : t("commerce:CREDITS_NO_AUTOMATIC_REFRESH")}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Coins className="size-4" aria-hidden="true" />
                  <span>
                    {t("commerce:USAGE_TOKEN_TOTAL", { count: number.format(totalTokens) })}
                  </span>
                </div>
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

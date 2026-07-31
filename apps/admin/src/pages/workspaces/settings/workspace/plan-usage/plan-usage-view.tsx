import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Coins, CreditCard, Gauge, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { getWorkspaceCommerceOverview } from "@/api/commerce";
import { CreditLedgerTable } from "@/components/commerce/credit-ledger-table";
import { PlanSelectionDialog } from "@/components/commerce/plan-selection-dialog";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { Button } from "@arclayer/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@arclayer/ui/card";

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
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const date = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }), [locale]);
  const overview = overviewQuery.data;
  const money = useMemo(
    () =>
      overview
        ? new Intl.NumberFormat(locale, {
            style: "currency",
            currency: overview.planRevision.currency,
          })
        : null,
    [locale, overview],
  );
  const totalTokens = overview ? overview.usage.promptTokens + overview.usage.completionTokens : 0;

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
            <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <CardTitle className="text-title2">
                  {t(overview.planRevision.nameI18NKey)}
                </CardTitle>
                <CardDescription className="mt-1">
                  {t(overview.planRevision.descriptionI18NKey)}
                </CardDescription>
                <p className="mt-2 text-footnote text-label-secondary">
                  {t("commerce:PLAN_REVISION", { sequence: overview.planRevision.sequence })}
                </p>
              </div>
              <Button variant="outline" onClick={() => setPlansOpen(true)}>
                <Sparkles data-icon="inline-start" />
                {t("commerce:PLAN_COMPARE_ACTION")}
              </Button>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <UsageMetric
                  label={t("commerce:CREDITS_AVAILABLE_LABEL")}
                  value={number.format(overview.credits.available)}
                  icon={Coins}
                />
                <UsageMetric
                  label={t("commerce:CREDITS_RESERVED")}
                  value={number.format(overview.credits.reserved)}
                  icon={Gauge}
                />
                <UsageMetric
                  label={t("commerce:USAGE_REQUESTS")}
                  value={number.format(overview.usage.requests)}
                  icon={Sparkles}
                />
                <UsageMetric
                  label={t("commerce:USAGE_ACTUAL_COST")}
                  value={money?.format(overview.usage.periodCostMicros / 1_000_000) ?? "—"}
                  icon={CreditCard}
                />
              </div>
              <div className="grid gap-3 text-footnote text-label-secondary sm:grid-cols-2">
                <div className="flex items-center gap-2">
                  <CalendarClock className="size-4" aria-hidden="true" />
                  <span>
                    {t("commerce:CREDITS_PERIOD_RANGE", {
                      start: date.format(new Date(overview.credits.periodStart)),
                      end: date.format(new Date(overview.credits.periodEnd)),
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Coins className="size-4" aria-hidden="true" />
                  <span>
                    {t("commerce:USAGE_TOKEN_TOTAL", { count: number.format(totalTokens) })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <CreditCard className="size-4" aria-hidden="true" />
                  <span>
                    {t("commerce:SUBSCRIPTION_STATUS", {
                      status: t(
                        `commerce:SUBSCRIPTION_STATUS_${overview.subscription.status.toUpperCase()}`,
                      ),
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <CalendarClock className="size-4" aria-hidden="true" />
                  <span>
                    {t("commerce:SUBSCRIPTION_PERIOD", {
                      start: date.format(new Date(overview.subscription.currentPeriodStart)),
                      end: date.format(new Date(overview.subscription.currentPeriodEnd)),
                    })}
                  </span>
                </div>
              </div>
              <p className="text-footnote text-label-secondary">
                {t("commerce:PLAN_ALLOWANCES_NOT_PROJECTED")}
              </p>
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

import { useMemo, useState } from "react";
import { BadgeDollarSign, Bot, Coins, MessageSquareMore } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import type { AIUsageGroup } from "@arclayer/openapi/admin-types";

import { ConfigurableDashboard, type DashboardWidget } from "../components/dashboard-layout";
import { ObservabilityMetricCard } from "../components/metric-card";
import { ObservabilityPageControls } from "../components/page-controls";
import type { ObservabilityPeriodDays } from "../components/period-select";
import { ObservabilityTrendCard } from "../components/trend-card";
import { formatCompactNumber, formatCostMicros } from "../formatters";
import { useSystemObservabilityOverview, useSystemObservabilityTrend } from "../hooks";
import { AIUsageDetailDialog } from "./ai-usage-detail-dialog";
import { AIUsageGroupsTable } from "./ai-usage-groups-table";

export function SystemObservabilityAIUsagePage() {
  const { t, i18n } = useTranslation("platform");
  const locale = i18n.resolvedLanguage;
  const [days, setDays] = useState<ObservabilityPeriodDays>(30);
  const [selectedGroup, setSelectedGroup] = useState<AIUsageGroup | null>(null);
  const overview = useSystemObservabilityOverview(days);
  const requests = useSystemObservabilityTrend(days, "requests");
  const tokens = useSystemObservabilityTrend(days, "tokens");
  const cost = useSystemObservabilityTrend(days, "cost");
  const queries = [overview, requests, tokens, cost];
  const widgets = useMemo<DashboardWidget[]>(() => {
    if (!overview.data) return [];
    return [
      {
        id: "ai-requests",
        title: t("METRIC_AI_REQUESTS"),
        content: (
          <ObservabilityMetricCard
            label={t("METRIC_AI_REQUESTS")}
            value={formatCompactNumber(overview.data.ai.requests, locale)}
            icon={Bot}
          />
        ),
      },
      {
        id: "prompt-tokens",
        title: t("METRIC_PROMPT_TOKENS"),
        content: (
          <ObservabilityMetricCard
            label={t("METRIC_PROMPT_TOKENS")}
            value={formatCompactNumber(overview.data.ai.promptTokens, locale)}
            icon={MessageSquareMore}
          />
        ),
      },
      {
        id: "completion-tokens",
        title: t("METRIC_COMPLETION_TOKENS"),
        content: (
          <ObservabilityMetricCard
            label={t("METRIC_COMPLETION_TOKENS")}
            value={formatCompactNumber(overview.data.ai.completionTokens, locale)}
            icon={MessageSquareMore}
          />
        ),
      },
      {
        id: "total-tokens",
        title: t("METRIC_TOTAL_TOKENS"),
        content: (
          <ObservabilityMetricCard
            label={t("METRIC_TOTAL_TOKENS")}
            value={formatCompactNumber(overview.data.ai.totalTokens, locale)}
            icon={Coins}
          />
        ),
      },
      {
        id: "ai-cost",
        title: t("METRIC_AI_COST"),
        content: (
          <ObservabilityMetricCard
            label={t("METRIC_AI_COST")}
            value={formatCostMicros(overview.data.ai.costMicros, locale)}
            icon={BadgeDollarSign}
          />
        ),
      },
      {
        id: "request-trend",
        title: t("TREND_REQUESTS"),
        defaultSpan: 4,
        defaultHeight: 400,
        content: (
          <ObservabilityTrendCard
            title={t("TREND_REQUESTS")}
            description={t(`PERIOD_${days}_DAYS`)}
            points={requests.data?.points}
            loading={requests.isLoading}
            error={requests.error}
            onRetry={() => void requests.refetch()}
            valueKind="count"
          />
        ),
      },
      {
        id: "token-trend",
        title: t("TREND_TOKENS"),
        defaultSpan: 4,
        defaultHeight: 400,
        content: (
          <ObservabilityTrendCard
            title={t("TREND_TOKENS")}
            description={t(`PERIOD_${days}_DAYS`)}
            points={tokens.data?.points}
            loading={tokens.isLoading}
            error={tokens.error}
            onRetry={() => void tokens.refetch()}
            valueKind="count"
          />
        ),
      },
      {
        id: "cost-trend",
        title: t("TREND_COST"),
        defaultSpan: 4,
        defaultHeight: 400,
        content: (
          <ObservabilityTrendCard
            title={t("TREND_COST")}
            description={t(`PERIOD_${days}_DAYS`)}
            points={cost.data?.points}
            loading={cost.isLoading}
            error={cost.error}
            onRetry={() => void cost.refetch()}
            valueKind="cost"
          />
        ),
      },
      {
        id: "usage-groups",
        title: t("AI_USAGE_TABLE_TITLE"),
        defaultSpan: 12,
        defaultHeight: 640,
        content: (
          <section
            className="flex h-full min-h-0 flex-col gap-3 rounded-lg border bg-card p-4"
            aria-labelledby="ai-usage-groups-title"
          >
            <div>
              <h2 id="ai-usage-groups-title" className="text-headline text-label-primary">
                {t("AI_USAGE_TABLE_TITLE")}
              </h2>
              <p className="mt-1 text-callout text-label-secondary">
                {t("AI_USAGE_TABLE_DESCRIPTION")}
              </p>
            </div>
            <div className="min-h-0 flex-1">
              <AIUsageGroupsTable days={days} onSelect={setSelectedGroup} />
            </div>
          </section>
        ),
      },
    ];
  }, [cost, days, locale, overview.data, requests, t, tokens]);

  return (
    <DefaultPage
      title={t("OBSERVABILITY_AI_TITLE")}
      description={t("OBSERVABILITY_AI_DESCRIPTION")}
      action={
        <ObservabilityPageControls
          days={days}
          onDaysChange={setDays}
          refreshing={queries.some((query) => query.isFetching)}
          onRefresh={() => void Promise.all(queries.map((query) => query.refetch()))}
        />
      }
    >
      <ContentGuard
        loading={overview.isLoading}
        error={overview.error}
        onRetry={() => void overview.refetch()}
        loadingVariant="form"
      >
        {overview.data ? (
          <ConfigurableDashboard
            dashboardId="system-observability-ai-usage"
            widgets={widgets}
            ariaLabel={t("OBSERVABILITY_AI_TITLE")}
            className="pb-8"
          />
        ) : null}
      </ContentGuard>
      <AIUsageDetailDialog
        open={Boolean(selectedGroup)}
        onOpenChange={(open) => {
          if (!open) setSelectedGroup(null);
        }}
        group={selectedGroup}
      />
    </DefaultPage>
  );
}

import { useMemo, useState } from "react";
import { BadgeDollarSign, Bot, Coins, MessageSquareMore } from "lucide-react";
import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/layouts/page-shell/default-page";
import type { AIUsageGroup } from "@arclayer/openapi/admin-types";

import { ConfigurableDashboard, type DashboardWidget } from "../components/dashboard-layout";
import { ObservabilityMetricCard } from "../components/metric-card";
import { useObservabilityMetricDetails } from "../components/metric-details";
import { ObservabilityPageControls } from "../components/page-controls";
import type { ObservabilityPeriodDays } from "../components/period-select";
import { ObservabilitySnapshotStateCard } from "../components/snapshot-state-card";
import { ObservabilityTrendCard } from "../components/trend-card";
import { formatCompactNumber, formatCostMicros } from "../formatters";
import { useSystemObservabilityOverview, useSystemObservabilityTrend } from "../hooks";
import { AIUsageDetailDialog } from "./ai-usage-detail-dialog";
import { AIUsageGroupsTable } from "./ai-usage-groups-table";

const TABLE_WIDGET_DEFAULT_HEIGHT = 824;
const TABLE_WIDGET_MIN_HEIGHT = 560;

export function SystemObservabilityAIUsagePage(props: {
  days: ObservabilityPeriodDays;
  onDaysChange: (days: ObservabilityPeriodDays) => void;
}) {
  const { t, i18n } = useTranslation("platform");
  const locale = i18n.resolvedLanguage;
  const metricDetails = useObservabilityMetricDetails();
  const { days } = props;
  const [selectedGroup, setSelectedGroup] = useState<AIUsageGroup | null>(null);
  const overview = useSystemObservabilityOverview(days);
  const requests = useSystemObservabilityTrend(days, "requests");
  const tokens = useSystemObservabilityTrend(days, "tokens");
  const cost = useSystemObservabilityTrend(days, "cost");
  const queries = [overview, requests, tokens, cost];
  const widgets = useMemo<DashboardWidget[]>(() => {
    const summaryWidgets: DashboardWidget[] = overview.data
      ? [
          {
            id: "ai-requests",
            title: t("METRIC_AI_REQUESTS"),
            defaultSpan: 4,
            content: (
              <ObservabilityMetricCard
                label={t("METRIC_AI_REQUESTS")}
                value={formatCompactNumber(overview.data.ai.requests, locale)}
                icon={Bot}
                detail={metricDetails.ai(overview.data, t("METRIC_DEFINITION_AI_REQUESTS"))}
              />
            ),
          },
          {
            id: "prompt-tokens",
            title: t("METRIC_PROMPT_TOKENS"),
            defaultSpan: 4,
            content: (
              <ObservabilityMetricCard
                label={t("METRIC_PROMPT_TOKENS")}
                value={formatCompactNumber(overview.data.ai.promptTokens, locale)}
                icon={MessageSquareMore}
                detail={metricDetails.ai(overview.data, t("METRIC_DEFINITION_PROMPT_TOKENS"))}
              />
            ),
          },
          {
            id: "completion-tokens",
            title: t("METRIC_COMPLETION_TOKENS"),
            defaultSpan: 4,
            content: (
              <ObservabilityMetricCard
                label={t("METRIC_COMPLETION_TOKENS")}
                value={formatCompactNumber(overview.data.ai.completionTokens, locale)}
                icon={MessageSquareMore}
                detail={metricDetails.ai(overview.data, t("METRIC_DEFINITION_COMPLETION_TOKENS"))}
              />
            ),
          },
          {
            id: "total-tokens",
            title: t("METRIC_TOTAL_TOKENS"),
            defaultSpan: 6,
            content: (
              <ObservabilityMetricCard
                label={t("METRIC_TOTAL_TOKENS")}
                value={formatCompactNumber(overview.data.ai.totalTokens, locale)}
                icon={Coins}
                detail={metricDetails.ai(overview.data, t("METRIC_DEFINITION_TOTAL_TOKENS"))}
              />
            ),
          },
          {
            id: "ai-cost",
            title: t("METRIC_AI_COST"),
            defaultSpan: 6,
            content: (
              <ObservabilityMetricCard
                label={t("METRIC_AI_COST")}
                value={formatCostMicros(overview.data.ai.costMicros, locale)}
                icon={BadgeDollarSign}
                detail={metricDetails.ai(overview.data, t("METRIC_DEFINITION_AI_COST"))}
              />
            ),
          },
        ]
      : [
          {
            id: "ai-overview-state",
            title: t("DASHBOARD_SNAPSHOT_ERROR_TITLE"),
            defaultSpan: 12,
            defaultHeight: 240,
            transient: true,
            content: (
              <ObservabilitySnapshotStateCard
                loading={overview.isLoading}
                error={overview.error}
                onRetry={() => void overview.refetch()}
              />
            ),
          },
        ];

    return [
      ...summaryWidgets,
      {
        id: "request-trend",
        title: t("TREND_REQUESTS"),
        defaultSpan: 4,
        defaultHeight: 400,
        content: (
          <ObservabilityTrendCard
            title={t("TREND_REQUESTS")}
            description={t(`PERIOD_${days}_DAYS`)}
            expectedBucketCount={days}
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
            expectedBucketCount={days}
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
            expectedBucketCount={days}
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
        defaultHeight: TABLE_WIDGET_DEFAULT_HEIGHT,
        minHeight: TABLE_WIDGET_MIN_HEIGHT,
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
            <div className="min-h-0 min-w-0 flex-1 overflow-hidden [&>*]:h-full [&>*]:min-h-0">
              <AIUsageGroupsTable days={days} onSelect={setSelectedGroup} />
            </div>
          </section>
        ),
      },
    ];
  }, [
    cost,
    days,
    locale,
    metricDetails,
    overview.data,
    overview.error,
    overview.isLoading,
    overview.refetch,
    requests,
    t,
    tokens,
  ]);

  return (
    <DefaultPage
      title={t("OBSERVABILITY_AI_TITLE")}
      description={t("OBSERVABILITY_AI_DESCRIPTION")}
      action={
        <ObservabilityPageControls
          days={days}
          onDaysChange={props.onDaysChange}
          refreshing={queries.some((query) => query.isFetching)}
          onRefresh={() => void Promise.all(queries.map((query) => query.refetch()))}
        />
      }
    >
      <ConfigurableDashboard
        dashboardId="system-observability-ai-usage"
        widgets={widgets}
        ariaLabel={t("OBSERVABILITY_AI_TITLE")}
        className="pb-8"
      />
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

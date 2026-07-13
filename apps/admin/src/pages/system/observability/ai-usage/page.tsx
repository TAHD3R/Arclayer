import { useState } from "react";
import { BadgeDollarSign, Bot, Coins, MessageSquareMore } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { DefaultPage } from "@/layouts/page-shell/default-page";

import { ObservabilityMetricCard, ObservabilityMetricSection } from "../components/metric-card";
import { ObservabilityPageControls } from "../components/page-controls";
import type { ObservabilityPeriodDays } from "../components/period-select";
import { ObservabilityTrendCard } from "../components/trend-card";
import { formatCompactNumber, formatCostMicros } from "../formatters";
import { useSystemObservabilityOverview, useSystemObservabilityTrend } from "../hooks";
import { AIUsageGroupsTable } from "./ai-usage-groups-table";

export function SystemObservabilityAIUsagePage() {
  const { t, i18n } = useTranslation("platform");
  const locale = i18n.resolvedLanguage;
  const [days, setDays] = useState<ObservabilityPeriodDays>(30);
  const overview = useSystemObservabilityOverview(days);
  const requests = useSystemObservabilityTrend(days, "requests");
  const tokens = useSystemObservabilityTrend(days, "tokens");
  const cost = useSystemObservabilityTrend(days, "cost");
  const queries = [overview, requests, tokens, cost];

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
          <div className="flex flex-col gap-8 pb-8">
            <ObservabilityMetricSection title={t("SECTION_AI_EFFICIENCY")}>
              <ObservabilityMetricCard
                label={t("METRIC_AI_REQUESTS")}
                value={formatCompactNumber(overview.data.ai.requests, locale)}
                icon={Bot}
              />
              <ObservabilityMetricCard
                label={t("METRIC_PROMPT_TOKENS")}
                value={formatCompactNumber(overview.data.ai.promptTokens, locale)}
                icon={MessageSquareMore}
              />
              <ObservabilityMetricCard
                label={t("METRIC_COMPLETION_TOKENS")}
                value={formatCompactNumber(overview.data.ai.completionTokens, locale)}
                icon={MessageSquareMore}
              />
              <ObservabilityMetricCard
                label={t("METRIC_TOTAL_TOKENS")}
                value={formatCompactNumber(overview.data.ai.totalTokens, locale)}
                icon={Coins}
              />
              <ObservabilityMetricCard
                label={t("METRIC_AI_COST")}
                value={formatCostMicros(overview.data.ai.costMicros, locale)}
                icon={BadgeDollarSign}
              />
            </ObservabilityMetricSection>

            <div className="grid gap-4 xl:grid-cols-3">
              <ObservabilityTrendCard
                title={t("TREND_REQUESTS")}
                description={t(`PERIOD_${days}_DAYS`)}
                points={requests.data?.points}
                loading={requests.isLoading}
                error={requests.error}
                onRetry={() => void requests.refetch()}
                valueKind="count"
              />
              <ObservabilityTrendCard
                title={t("TREND_TOKENS")}
                description={t(`PERIOD_${days}_DAYS`)}
                points={tokens.data?.points}
                loading={tokens.isLoading}
                error={tokens.error}
                onRetry={() => void tokens.refetch()}
                valueKind="count"
              />
              <ObservabilityTrendCard
                title={t("TREND_COST")}
                description={t(`PERIOD_${days}_DAYS`)}
                points={cost.data?.points}
                loading={cost.isLoading}
                error={cost.error}
                onRetry={() => void cost.refetch()}
                valueKind="cost"
              />
            </div>

            <section className="flex flex-col gap-3" aria-labelledby="ai-usage-groups-title">
              <div>
                <h2 id="ai-usage-groups-title" className="text-headline text-label-primary">
                  {t("AI_USAGE_TABLE_TITLE")}
                </h2>
                <p className="mt-1 text-callout text-label-secondary">
                  {t("AI_USAGE_TABLE_DESCRIPTION")}
                </p>
              </div>
              <AIUsageGroupsTable days={days} />
            </section>
          </div>
        ) : null}
      </ContentGuard>
    </DefaultPage>
  );
}

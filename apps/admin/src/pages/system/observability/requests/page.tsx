import { useState } from "react";
import { Bot, CircleAlert, Clock3, Gauge, Network } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { DefaultPage } from "@/layouts/page-shell/default-page";

import { ObservabilityMetricCard, ObservabilityMetricSection } from "../components/metric-card";
import { ObservabilityPageControls } from "../components/page-controls";
import type { ObservabilityPeriodDays } from "../components/period-select";
import { ObservabilityTrendCard } from "../components/trend-card";
import { formatInteger, formatLatency, formatPercent } from "../formatters";
import { useSystemObservabilityOverview, useSystemObservabilityTrend } from "../hooks";

export function SystemObservabilityRequestsPage() {
  const { t, i18n } = useTranslation("platform");
  const locale = i18n.resolvedLanguage;
  const [days, setDays] = useState<ObservabilityPeriodDays>(30);
  const overview = useSystemObservabilityOverview(days);
  const httpRequests = useSystemObservabilityTrend(days, "httpRequests");
  const httpErrors = useSystemObservabilityTrend(days, "httpErrors");
  const httpLatency = useSystemObservabilityTrend(days, "httpLatency");
  const aiRequests = useSystemObservabilityTrend(days, "requests");
  const aiErrors = useSystemObservabilityTrend(days, "errors");
  const aiLatency = useSystemObservabilityTrend(days, "latency");
  const queries = [
    overview,
    httpRequests,
    httpErrors,
    httpLatency,
    aiRequests,
    aiErrors,
    aiLatency,
  ];

  const refresh = () => {
    void Promise.all(queries.map((query) => query.refetch()));
  };

  return (
    <DefaultPage
      title={t("OBSERVABILITY_REQUESTS_TITLE")}
      description={t("OBSERVABILITY_REQUESTS_DESCRIPTION")}
      showFavoriteToggle={false}
      action={
        <ObservabilityPageControls
          days={days}
          onDaysChange={setDays}
          refreshing={queries.some((query) => query.isFetching)}
          onRefresh={refresh}
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
            <ObservabilityMetricSection title={t("SECTION_HTTP_RELIABILITY")}>
              <ObservabilityMetricCard
                label={t("METRIC_HTTP_REQUESTS")}
                value={formatInteger(overview.data.http.requests, locale)}
                icon={Network}
              />
              <ObservabilityMetricCard
                label={t("METRIC_HTTP_ERRORS")}
                value={formatInteger(overview.data.http.errorRequests, locale)}
                icon={CircleAlert}
              />
              <ObservabilityMetricCard
                label={t("METRIC_ERROR_RATE")}
                value={formatPercent(overview.data.http.errorRate, locale)}
                icon={Gauge}
              />
              <ObservabilityMetricCard
                label={t("METRIC_HTTP_AVG_LATENCY")}
                value={formatLatency(overview.data.http.avgLatencyMs, locale)}
                icon={Clock3}
              />
              <ObservabilityMetricCard
                label={t("METRIC_HTTP_MAX_LATENCY")}
                value={formatLatency(overview.data.http.maxLatencyMs, locale)}
                icon={Clock3}
              />
            </ObservabilityMetricSection>

            <div className="grid gap-4 xl:grid-cols-3">
              <ObservabilityTrendCard
                title={t("TREND_HTTP_REQUESTS")}
                description={t(`PERIOD_${days}_DAYS`)}
                points={httpRequests.data?.points}
                loading={httpRequests.isLoading}
                error={httpRequests.error}
                onRetry={() => void httpRequests.refetch()}
                valueKind="count"
              />
              <ObservabilityTrendCard
                title={t("TREND_HTTP_ERRORS")}
                description={t(`PERIOD_${days}_DAYS`)}
                points={httpErrors.data?.points}
                loading={httpErrors.isLoading}
                error={httpErrors.error}
                onRetry={() => void httpErrors.refetch()}
                valueKind="count"
                color="var(--destructive)"
              />
              <ObservabilityTrendCard
                title={t("TREND_HTTP_LATENCY")}
                description={t(`PERIOD_${days}_DAYS`)}
                points={httpLatency.data?.points}
                loading={httpLatency.isLoading}
                error={httpLatency.error}
                onRetry={() => void httpLatency.refetch()}
                valueKind="latency"
              />
            </div>

            <ObservabilityMetricSection title={t("SECTION_AI_EFFICIENCY")}>
              <ObservabilityMetricCard
                label={t("METRIC_AI_REQUESTS")}
                value={formatInteger(overview.data.ai.requests, locale)}
                icon={Bot}
              />
              <ObservabilityMetricCard
                label={t("METRIC_AI_ERRORS")}
                value={formatInteger(overview.data.ai.errorRequests, locale)}
                icon={CircleAlert}
              />
              <ObservabilityMetricCard
                label={t("METRIC_ERROR_RATE")}
                value={formatPercent(overview.data.ai.errorRate, locale)}
                icon={Gauge}
              />
              <ObservabilityMetricCard
                label={t("METRIC_P50_LATENCY")}
                value={formatLatency(overview.data.ai.p50LatencyMs, locale)}
                icon={Clock3}
              />
              <ObservabilityMetricCard
                label={t("METRIC_P95_LATENCY")}
                value={formatLatency(overview.data.ai.p95LatencyMs, locale)}
                icon={Clock3}
              />
              <ObservabilityMetricCard
                label={t("METRIC_P99_LATENCY")}
                value={formatLatency(overview.data.ai.p99LatencyMs, locale)}
                icon={Clock3}
              />
            </ObservabilityMetricSection>

            <div className="grid gap-4 xl:grid-cols-3">
              <ObservabilityTrendCard
                title={t("TREND_REQUESTS")}
                description={t(`PERIOD_${days}_DAYS`)}
                points={aiRequests.data?.points}
                loading={aiRequests.isLoading}
                error={aiRequests.error}
                onRetry={() => void aiRequests.refetch()}
                valueKind="count"
              />
              <ObservabilityTrendCard
                title={t("TREND_ERRORS")}
                description={t(`PERIOD_${days}_DAYS`)}
                points={aiErrors.data?.points}
                loading={aiErrors.isLoading}
                error={aiErrors.error}
                onRetry={() => void aiErrors.refetch()}
                valueKind="count"
                color="var(--destructive)"
              />
              <ObservabilityTrendCard
                title={t("TREND_LATENCY")}
                description={t(`PERIOD_${days}_DAYS`)}
                points={aiLatency.data?.points}
                loading={aiLatency.isLoading}
                error={aiLatency.error}
                onRetry={() => void aiLatency.refetch()}
                valueKind="latency"
              />
            </div>
          </div>
        ) : null}
      </ContentGuard>
    </DefaultPage>
  );
}

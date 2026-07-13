import {
  BadgeDollarSign,
  Bot,
  Boxes,
  BriefcaseBusiness,
  CircleAlert,
  Clock3,
  Gauge,
  MessageSquareText,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { DefaultPage } from "@/layouts/page-shell/default-page";

import { ObservabilityMetricCard, ObservabilityMetricSection } from "../components/metric-card";
import { ObservabilityPageControls } from "../components/page-controls";
import type { ObservabilityPeriodDays } from "../components/period-select";
import { ObservabilityTrendCard } from "../components/trend-card";
import { formatCostMicros, formatInteger, formatLatency, formatPercent } from "../formatters";
import { useSystemObservabilityOverview, useSystemObservabilityTrend } from "../hooks";

export function SystemObservabilityOverviewPage() {
  const { t, i18n } = useTranslation("platform");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const [days, setDays] = useState<ObservabilityPeriodDays>(30);
  const overview = useSystemObservabilityOverview(days);
  const httpErrors = useSystemObservabilityTrend(days, "httpErrors");
  const aiErrors = useSystemObservabilityTrend(days, "errors");
  const aiCost = useSystemObservabilityTrend(days, "cost");
  const auditEvents = useSystemObservabilityTrend(days, "auditEvents");
  const queries = [overview, httpErrors, aiErrors, aiCost, auditEvents];

  return (
    <DefaultPage
      title={t("OBSERVABILITY_OVERVIEW_TITLE")}
      description={t("OBSERVABILITY_OVERVIEW_DESCRIPTION")}
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
            <ObservabilityMetricSection title={t("SECTION_SERVICE_HEALTH")}>
              <ObservabilityMetricCard
                label={t("METRIC_ERROR_RATE")}
                value={formatPercent(overview.data.http.errorRate, locale)}
                icon={CircleAlert}
                description={t("METRIC_HTTP_ERROR_RATE_DESCRIPTION")}
              />
              <ObservabilityMetricCard
                label={t("METRIC_HTTP_AVG_LATENCY")}
                value={formatLatency(overview.data.http.avgLatencyMs, locale)}
                icon={Clock3}
              />
              <ObservabilityMetricCard
                label={t("METRIC_AI_ERROR_RATE")}
                value={formatPercent(overview.data.ai.errorRate, locale)}
                icon={Bot}
              />
              <ObservabilityMetricCard
                label={t("METRIC_P95_LATENCY")}
                value={formatLatency(overview.data.ai.p95LatencyMs, locale)}
                icon={Gauge}
              />
            </ObservabilityMetricSection>

            <ObservabilityMetricSection title={t("SECTION_COMMERCIAL_OPERATIONS")}>
              <ObservabilityMetricCard
                label={t("METRIC_AI_COST")}
                value={formatCostMicros(overview.data.ai.costMicros, locale)}
                icon={BadgeDollarSign}
              />
              <ObservabilityMetricCard
                label={t("METRIC_OPEN_FEEDBACK")}
                value={formatInteger(overview.data.operations.openFeedback, locale)}
                icon={MessageSquareText}
              />
              <ObservabilityMetricCard
                label={t("METRIC_ACTIVE_WORKSPACES")}
                value={formatInteger(overview.data.resources.activeWorkspaces, locale)}
                icon={Boxes}
              />
              <ObservabilityMetricCard
                label={t("METRIC_ACTIVE_SUBSCRIPTIONS")}
                value={formatInteger(overview.data.operations.activeSubscriptions, locale)}
                icon={BriefcaseBusiness}
              />
            </ObservabilityMetricSection>

            <section className="flex flex-col gap-3" aria-labelledby="health-trends-title">
              <div>
                <h2 id="health-trends-title" className="text-headline text-label-primary">
                  {t("SECTION_HEALTH_TRENDS")}
                </h2>
                <p className="mt-1 text-callout text-label-secondary">
                  {t("SECTION_HEALTH_TRENDS_DESCRIPTION")}
                </p>
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
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
                  title={t("TREND_COST")}
                  description={t(`PERIOD_${days}_DAYS`)}
                  points={aiCost.data?.points}
                  loading={aiCost.isLoading}
                  error={aiCost.error}
                  onRetry={() => void aiCost.refetch()}
                  valueKind="cost"
                />
                <ObservabilityTrendCard
                  title={t("TREND_AUDIT_EVENTS")}
                  description={t(`PERIOD_${days}_DAYS`)}
                  points={auditEvents.data?.points}
                  loading={auditEvents.isLoading}
                  error={auditEvents.error}
                  onRetry={() => void auditEvents.refetch()}
                  valueKind="count"
                />
              </div>
            </section>
          </div>
        ) : null}
      </ContentGuard>
    </DefaultPage>
  );
}

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
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { DefaultPage } from "@/layouts/page-shell/default-page";

import { ConfigurableDashboard, type DashboardWidget } from "../components/dashboard-layout";
import { ObservabilityMetricCard } from "../components/metric-card";
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
  const widgets = useMemo<DashboardWidget[]>(() => {
    if (!overview.data) return [];
    return [
      {
        id: "http-error-rate",
        title: t("METRIC_ERROR_RATE"),
        content: (
          <ObservabilityMetricCard
            label={t("METRIC_ERROR_RATE")}
            value={formatPercent(overview.data.http.errorRate, locale)}
            icon={CircleAlert}
            description={t("METRIC_HTTP_ERROR_RATE_DESCRIPTION")}
          />
        ),
      },
      {
        id: "http-average-latency",
        title: t("METRIC_HTTP_AVG_LATENCY"),
        content: (
          <ObservabilityMetricCard
            label={t("METRIC_HTTP_AVG_LATENCY")}
            value={formatLatency(overview.data.http.avgLatencyMs, locale)}
            icon={Clock3}
          />
        ),
      },
      {
        id: "ai-error-rate",
        title: t("METRIC_AI_ERROR_RATE"),
        content: (
          <ObservabilityMetricCard
            label={t("METRIC_AI_ERROR_RATE")}
            value={formatPercent(overview.data.ai.errorRate, locale)}
            icon={Bot}
          />
        ),
      },
      {
        id: "ai-p95-latency",
        title: t("METRIC_P95_LATENCY"),
        content: (
          <ObservabilityMetricCard
            label={t("METRIC_P95_LATENCY")}
            value={formatLatency(overview.data.ai.p95LatencyMs, locale)}
            icon={Gauge}
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
        id: "open-feedback",
        title: t("METRIC_OPEN_FEEDBACK"),
        content: (
          <ObservabilityMetricCard
            label={t("METRIC_OPEN_FEEDBACK")}
            value={formatInteger(overview.data.operations.openFeedback, locale)}
            icon={MessageSquareText}
          />
        ),
      },
      {
        id: "active-workspaces",
        title: t("METRIC_ACTIVE_WORKSPACES"),
        content: (
          <ObservabilityMetricCard
            label={t("METRIC_ACTIVE_WORKSPACES")}
            value={formatInteger(overview.data.resources.activeWorkspaces, locale)}
            icon={Boxes}
          />
        ),
      },
      {
        id: "active-subscriptions",
        title: t("METRIC_ACTIVE_SUBSCRIPTIONS"),
        content: (
          <ObservabilityMetricCard
            label={t("METRIC_ACTIVE_SUBSCRIPTIONS")}
            value={formatInteger(overview.data.operations.activeSubscriptions, locale)}
            icon={BriefcaseBusiness}
          />
        ),
      },
      {
        id: "http-error-trend",
        title: t("TREND_HTTP_ERRORS"),
        defaultSpan: 6,
        defaultHeight: 400,
        content: (
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
        ),
      },
      {
        id: "ai-error-trend",
        title: t("TREND_ERRORS"),
        defaultSpan: 6,
        defaultHeight: 400,
        content: (
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
        ),
      },
      {
        id: "ai-cost-trend",
        title: t("TREND_COST"),
        defaultSpan: 6,
        defaultHeight: 400,
        content: (
          <ObservabilityTrendCard
            title={t("TREND_COST")}
            description={t(`PERIOD_${days}_DAYS`)}
            points={aiCost.data?.points}
            loading={aiCost.isLoading}
            error={aiCost.error}
            onRetry={() => void aiCost.refetch()}
            valueKind="cost"
          />
        ),
      },
      {
        id: "audit-event-trend",
        title: t("TREND_AUDIT_EVENTS"),
        defaultSpan: 6,
        defaultHeight: 400,
        content: (
          <ObservabilityTrendCard
            title={t("TREND_AUDIT_EVENTS")}
            description={t(`PERIOD_${days}_DAYS`)}
            points={auditEvents.data?.points}
            loading={auditEvents.isLoading}
            error={auditEvents.error}
            onRetry={() => void auditEvents.refetch()}
            valueKind="count"
          />
        ),
      },
    ];
  }, [aiCost, aiErrors, auditEvents, days, httpErrors, locale, overview.data, t]);

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
          <ConfigurableDashboard
            dashboardId="system-observability-overview"
            widgets={widgets}
            ariaLabel={t("OBSERVABILITY_OVERVIEW_TITLE")}
            className="pb-8"
          />
        ) : null}
      </ContentGuard>
    </DefaultPage>
  );
}

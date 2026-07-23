import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/layouts/page-shell/default-page";
import {
  ConfigurableDashboard,
  type DashboardWidget,
} from "@/pages/system/observability/components/dashboard-layout";
import { ObservabilityPageControls } from "@/pages/system/observability/components/page-controls";
import type { ObservabilityPeriodDays } from "@/pages/system/observability/components/period-select";
import { ObservabilityTrendCard } from "@/pages/system/observability/components/trend-card";
import {
  useSystemObservabilityOverview,
  useSystemObservabilityTrend,
} from "@/pages/system/observability/hooks";
import { usePlatformDashboardSummaryWidgets } from "./dashboard-widgets";

export function SystemPlatformOverviewPage(props: {
  days: ObservabilityPeriodDays;
  onDaysChange: (days: ObservabilityPeriodDays) => void;
}) {
  const { t } = useTranslation("platform");
  const { days } = props;
  const overview = useSystemObservabilityOverview(days);
  const httpErrors = useSystemObservabilityTrend(days, "httpErrors");
  const cost = useSystemObservabilityTrend(days, "cost");
  const auditEvents = useSystemObservabilityTrend(days, "auditEvents");
  const queries = [overview, httpErrors, cost, auditEvents];
  const summaryWidgets = usePlatformDashboardSummaryWidgets({
    overview: overview.data,
    loading: overview.isLoading,
    error: overview.error,
    onRetry: () => void overview.refetch(),
  });
  const widgets = useMemo<DashboardWidget[]>(
    () => [
      ...summaryWidgets,
      {
        id: "http-error-trend",
        title: t("TREND_HTTP_ERRORS"),
        defaultSpan: 6,
        defaultHeight: 400,
        content: (
          <ObservabilityTrendCard
            title={t("TREND_HTTP_ERRORS")}
            description={t(`PERIOD_${days}_DAYS`)}
            expectedBucketCount={days}
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
        id: "ai-cost-trend",
        title: t("TREND_COST"),
        defaultSpan: 6,
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
        id: "audit-event-trend",
        title: t("TREND_AUDIT_EVENTS"),
        defaultSpan: 12,
        defaultHeight: 400,
        content: (
          <ObservabilityTrendCard
            title={t("TREND_AUDIT_EVENTS")}
            description={t(`PERIOD_${days}_DAYS`)}
            expectedBucketCount={days}
            points={auditEvents.data?.points}
            loading={auditEvents.isLoading}
            error={auditEvents.error}
            onRetry={() => void auditEvents.refetch()}
            valueKind="count"
          />
        ),
      },
    ],
    [auditEvents, cost, days, httpErrors, summaryWidgets, t],
  );

  const refresh = () => Promise.all(queries.map((query) => query.refetch()));

  return (
    <DefaultPage
      title={t("OVERVIEW_TITLE")}
      description={t("OVERVIEW_DESCRIPTION")}
      action={
        <ObservabilityPageControls
          days={days}
          onDaysChange={props.onDaysChange}
          refreshing={queries.some((query) => query.isFetching)}
          onRefresh={() => void refresh()}
        />
      }
    >
      <ConfigurableDashboard
        dashboardId="system-platform-overview"
        widgets={widgets}
        ariaLabel={t("OVERVIEW_TITLE")}
        className="pb-8"
      />
    </DefaultPage>
  );
}

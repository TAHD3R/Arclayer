import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import {
  ConfigurableDashboard,
  type DashboardWidget,
} from "@/pages/system/observability/components/dashboard-layout";
import { ObservabilityPageControls } from "@/pages/system/observability/components/page-controls";
import type { ObservabilityPeriodDays } from "@/pages/system/observability/components/period-select";
import { useSystemSummaryWidgets } from "@/pages/system/observability/components/system-summary-metrics";
import { ObservabilityTrendCard } from "@/pages/system/observability/components/trend-card";
import {
  useSystemObservabilityOverview,
  useSystemObservabilityTrend,
} from "@/pages/system/observability/hooks";

export function SystemPlatformOverviewPage() {
  const { t } = useTranslation("platform");
  const [days, setDays] = useState<ObservabilityPeriodDays>(30);
  const overview = useSystemObservabilityOverview(days);
  const httpRequests = useSystemObservabilityTrend(days, "httpRequests");
  const aiRequests = useSystemObservabilityTrend(days, "requests");
  const cost = useSystemObservabilityTrend(days, "cost");
  const auditEvents = useSystemObservabilityTrend(days, "auditEvents");
  const queries = [overview, httpRequests, aiRequests, cost, auditEvents];
  const summaryWidgets = useSystemSummaryWidgets(overview.data);
  const widgets = useMemo<DashboardWidget[]>(
    () => [
      ...summaryWidgets,
      {
        id: "http-request-trend",
        title: t("TREND_HTTP_REQUESTS"),
        defaultSpan: 6,
        defaultHeight: 400,
        content: (
          <ObservabilityTrendCard
            title={t("TREND_HTTP_REQUESTS")}
            description={t(`PERIOD_${days}_DAYS`)}
            points={httpRequests.data?.points}
            loading={httpRequests.isLoading}
            error={httpRequests.error}
            onRetry={() => void httpRequests.refetch()}
            valueKind="count"
          />
        ),
      },
      {
        id: "ai-request-trend",
        title: t("TREND_REQUESTS"),
        defaultSpan: 6,
        defaultHeight: 400,
        content: (
          <ObservabilityTrendCard
            title={t("TREND_REQUESTS")}
            description={t(`PERIOD_${days}_DAYS`)}
            points={aiRequests.data?.points}
            loading={aiRequests.isLoading}
            error={aiRequests.error}
            onRetry={() => void aiRequests.refetch()}
            valueKind="count"
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
    ],
    [aiRequests, auditEvents, cost, days, httpRequests, summaryWidgets, t],
  );

  const refresh = () => Promise.all(queries.map((query) => query.refetch()));

  return (
    <DefaultPage
      title={t("OVERVIEW_TITLE")}
      description={t("OVERVIEW_DESCRIPTION")}
      action={
        <ObservabilityPageControls
          days={days}
          onDaysChange={setDays}
          refreshing={queries.some((query) => query.isFetching)}
          onRefresh={() => void refresh()}
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
            dashboardId="system-platform-overview"
            widgets={widgets}
            ariaLabel={t("OVERVIEW_TITLE")}
            className="pb-8"
          />
        ) : null}
      </ContentGuard>
    </DefaultPage>
  );
}

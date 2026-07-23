import { useMemo, useState } from "react";
import { CircleAlert, Clock3, Gauge, Network } from "lucide-react";
import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/layouts/page-shell/default-page";
import { RequestGroupsTable } from "@/pages/system/audit-log/request-groups-table";
import { RequestGroupDetailDialog } from "@/pages/system/audit-log/request-group-detail-dialog";
import type { HTTPRequestGroupWithPercentiles } from "@/api/platform-observability";

import { ConfigurableDashboard, type DashboardWidget } from "../components/dashboard-layout";
import { ObservabilityMetricCard } from "../components/metric-card";
import { useObservabilityMetricDetails } from "../components/metric-details";
import { ObservabilityPageControls } from "../components/page-controls";
import type { ObservabilityPeriodDays } from "../components/period-select";
import { ObservabilitySnapshotStateCard } from "../components/snapshot-state-card";
import { ObservabilityTrendCard } from "../components/trend-card";
import { formatInteger, formatLatency, formatPercent } from "../formatters";
import { useSystemObservabilityOverview, useSystemObservabilityTrend } from "../hooks";

const TABLE_WIDGET_DEFAULT_HEIGHT = 824;
const TABLE_WIDGET_MIN_HEIGHT = 560;

export function SystemObservabilityRequestsPage(props: {
  days: ObservabilityPeriodDays;
  onDaysChange: (days: ObservabilityPeriodDays) => void;
}) {
  const { t, i18n } = useTranslation("platform");
  const locale = i18n.resolvedLanguage;
  const metricDetails = useObservabilityMetricDetails();
  const { days } = props;
  const [selectedGroup, setSelectedGroup] = useState<HTTPRequestGroupWithPercentiles | null>(null);
  const overview = useSystemObservabilityOverview(days);
  const httpRequests = useSystemObservabilityTrend(days, "httpRequests");
  const httpErrors = useSystemObservabilityTrend(days, "httpErrors");
  const httpLatency = useSystemObservabilityTrend(days, "httpLatency");
  const queries = [overview, httpRequests, httpErrors, httpLatency];

  const refresh = () => {
    void Promise.all(queries.map((query) => query.refetch()));
  };
  const widgets = useMemo<DashboardWidget[]>(() => {
    const summaryWidgets: DashboardWidget[] = overview.data
      ? [
          {
            id: "requests",
            title: t("METRIC_HTTP_REQUESTS"),
            content: (
              <ObservabilityMetricCard
                label={t("METRIC_HTTP_REQUESTS")}
                value={formatInteger(overview.data.http.requests, locale)}
                icon={Network}
                detail={metricDetails.http(overview.data, t("METRIC_DEFINITION_HTTP_REQUESTS"))}
              />
            ),
          },
          {
            id: "errors",
            title: t("METRIC_HTTP_ERRORS"),
            content: (
              <ObservabilityMetricCard
                label={t("METRIC_HTTP_ERRORS")}
                value={formatInteger(overview.data.http.errorRequests, locale)}
                icon={CircleAlert}
                detail={metricDetails.http(overview.data, t("METRIC_DEFINITION_HTTP_ERRORS"))}
              />
            ),
          },
          {
            id: "error-rate",
            title: t("METRIC_ERROR_RATE"),
            content: (
              <ObservabilityMetricCard
                label={t("METRIC_ERROR_RATE")}
                value={formatPercent(overview.data.http.errorRate, locale)}
                icon={Gauge}
                detail={metricDetails.http(overview.data, t("METRIC_DEFINITION_HTTP_ERROR_RATE"))}
              />
            ),
          },
          {
            id: "average-latency",
            title: t("METRIC_HTTP_AVG_LATENCY"),
            content: (
              <ObservabilityMetricCard
                label={t("METRIC_HTTP_AVG_LATENCY")}
                value={formatLatency(overview.data.http.avgLatencyMs, locale)}
                icon={Clock3}
                detail={metricDetails.http(
                  overview.data,
                  t("METRIC_DEFINITION_HTTP_AVERAGE_LATENCY"),
                )}
              />
            ),
          },
          {
            id: "p95-latency",
            title: t("METRIC_HTTP_P95_LATENCY"),
            content: (
              <ObservabilityMetricCard
                label={t("METRIC_HTTP_P95_LATENCY")}
                value={
                  overview.data.http.p95LatencyMs === null
                    ? "—"
                    : formatLatency(overview.data.http.p95LatencyMs, locale)
                }
                icon={Gauge}
                detail={metricDetails.http(overview.data, t("METRIC_DEFINITION_HTTP_P95_LATENCY"))}
              />
            ),
          },
          {
            id: "p99-latency",
            title: t("METRIC_HTTP_P99_LATENCY"),
            content: (
              <ObservabilityMetricCard
                label={t("METRIC_HTTP_P99_LATENCY")}
                value={
                  overview.data.http.p99LatencyMs === null
                    ? "—"
                    : formatLatency(overview.data.http.p99LatencyMs, locale)
                }
                icon={Gauge}
                detail={metricDetails.http(overview.data, t("METRIC_DEFINITION_HTTP_P99_LATENCY"))}
              />
            ),
          },
          {
            id: "maximum-latency",
            title: t("METRIC_HTTP_MAX_LATENCY"),
            content: (
              <ObservabilityMetricCard
                label={t("METRIC_HTTP_MAX_LATENCY")}
                value={formatLatency(overview.data.http.maxLatencyMs, locale)}
                icon={Clock3}
                detail={metricDetails.http(
                  overview.data,
                  t("METRIC_DEFINITION_HTTP_MAXIMUM_LATENCY"),
                )}
              />
            ),
          },
        ]
      : [
          {
            id: "http-overview-state",
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
        title: t("TREND_HTTP_REQUESTS"),
        defaultSpan: 4,
        defaultHeight: 400,
        content: (
          <ObservabilityTrendCard
            title={t("TREND_HTTP_REQUESTS")}
            description={t(`PERIOD_${days}_DAYS`)}
            expectedBucketCount={days}
            points={httpRequests.data?.points}
            loading={httpRequests.isLoading}
            error={httpRequests.error}
            onRetry={() => void httpRequests.refetch()}
            valueKind="count"
          />
        ),
      },
      {
        id: "error-trend",
        title: t("TREND_HTTP_ERRORS"),
        defaultSpan: 4,
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
        id: "latency-trend",
        title: t("TREND_HTTP_LATENCY"),
        defaultSpan: 4,
        defaultHeight: 400,
        content: (
          <ObservabilityTrendCard
            title={t("TREND_HTTP_LATENCY")}
            description={t(`PERIOD_${days}_DAYS`)}
            expectedBucketCount={days}
            points={httpLatency.data?.points}
            loading={httpLatency.isLoading}
            error={httpLatency.error}
            onRetry={() => void httpLatency.refetch()}
            valueKind="latency"
          />
        ),
      },
      {
        id: "request-groups",
        title: t("AUDIT_REQUEST_TABLE_TITLE"),
        defaultSpan: 12,
        defaultHeight: TABLE_WIDGET_DEFAULT_HEIGHT,
        minHeight: TABLE_WIDGET_MIN_HEIGHT,
        content: (
          <section
            className="flex h-full min-h-0 flex-col gap-3 rounded-lg border bg-card p-4"
            aria-labelledby="request-groups-title"
          >
            <div>
              <h2 id="request-groups-title" className="text-headline text-label-primary">
                {t("AUDIT_REQUEST_TABLE_TITLE")}
              </h2>
              <p className="mt-1 text-callout text-label-secondary">
                {t("REQUEST_GROUPS_DESCRIPTION")}
              </p>
            </div>
            <div className="min-h-0 min-w-0 flex-1 overflow-hidden [&>*]:h-full [&>*]:min-h-0">
              <RequestGroupsTable days={days} onSelect={setSelectedGroup} />
            </div>
          </section>
        ),
      },
    ];
  }, [
    days,
    httpErrors,
    httpLatency,
    httpRequests,
    locale,
    metricDetails,
    overview.data,
    overview.error,
    overview.isLoading,
    overview.refetch,
    t,
  ]);

  return (
    <DefaultPage
      title={t("OBSERVABILITY_REQUESTS_TITLE")}
      description={t("OBSERVABILITY_REQUESTS_DESCRIPTION")}
      action={
        <ObservabilityPageControls
          days={days}
          onDaysChange={props.onDaysChange}
          refreshing={queries.some((query) => query.isFetching)}
          onRefresh={refresh}
        />
      }
    >
      <ConfigurableDashboard
        dashboardId="system-observability-requests"
        widgets={widgets}
        ariaLabel={t("OBSERVABILITY_REQUESTS_TITLE")}
        className="pb-8"
      />
      <RequestGroupDetailDialog
        open={Boolean(selectedGroup)}
        onOpenChange={(open) => {
          if (!open) setSelectedGroup(null);
        }}
        group={selectedGroup}
      />
    </DefaultPage>
  );
}

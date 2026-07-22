import { Activity, CircleAlert, Clock3, Gauge, Network } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type {
  HTTPRequestGroupWithPercentiles,
  HTTPRequestRecord,
} from "@/api/platform-observability";
import type { ActivityEvent } from "@arclayer/openapi/admin-types";

import { AuditEventsTable } from "./audit-events-table";
import { RequestGroupsTable } from "./request-groups-table";
import { RequestRecordsTable } from "./request-records-table";
import type { DashboardWidget } from "../observability/components/dashboard-layout";
import { ObservabilityMetricCard } from "../observability/components/metric-card";
import type { ObservabilityPeriodDays } from "../observability/components/period-select";
import { ObservabilityTrendCard } from "../observability/components/trend-card";
import { formatInteger, formatLatency, formatPercent } from "../observability/formatters";
import {
  useSystemObservabilityOverview,
  useSystemObservabilityTrend,
} from "../observability/hooks";

type OverviewQuery = ReturnType<typeof useSystemObservabilityOverview>;
type TrendQuery = ReturnType<typeof useSystemObservabilityTrend>;

type AuditDashboardWidgetOptions = Readonly<{
  days: ObservabilityPeriodDays;
  overview: OverviewQuery;
  requestTrend: TrendQuery;
  errorTrend: TrendQuery;
  eventTrend: TrendQuery;
  workspaceLabelById: Readonly<Record<string, string>>;
  projectLabelById: Readonly<Record<string, string>>;
  onSelectEvent: (event: ActivityEvent) => void;
  onSelectRecord: (record: HTTPRequestRecord) => void;
  onSelectGroup: (group: HTTPRequestGroupWithPercentiles) => void;
}>;

function DashboardTableShell(props: {
  headingId: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="flex h-full min-h-0 flex-col gap-3 rounded-lg border bg-card p-4"
      aria-labelledby={props.headingId}
    >
      <h2 id={props.headingId} className="text-headline font-semibold text-label-primary">
        {props.title}
      </h2>
      <div className="min-h-0 flex-1">{props.children}</div>
    </section>
  );
}

export function useAuditDashboardWidgets(options: AuditDashboardWidgetOptions) {
  const { t, i18n } = useTranslation(["common", "activity", "platform"]);
  const locale = i18n.resolvedLanguage ?? i18n.language;

  const recordWidgets = useMemo<DashboardWidget[]>(
    () => [
      {
        id: "request-records",
        title: t("platform:AUDIT_RECORD_TABLE_TITLE"),
        defaultSpan: 12,
        defaultHeight: 680,
        content: (
          <DashboardTableShell
            headingId="audit-request-records-title"
            title={t("platform:AUDIT_RECORD_TABLE_TITLE")}
          >
            <RequestRecordsTable
              days={options.days}
              workspaceLabelById={options.workspaceLabelById}
              projectLabelById={options.projectLabelById}
              onSelect={options.onSelectRecord}
            />
          </DashboardTableShell>
        ),
      },
    ],
    [options.days, options.onSelectRecord, options.projectLabelById, options.workspaceLabelById, t],
  );
  const analysisWidgets = useMemo<DashboardWidget[]>(() => {
    if (!options.overview.data) return [];
    const http = options.overview.data.http;
    return [
      {
        id: "http-requests",
        title: t("platform:METRIC_HTTP_REQUESTS"),
        content: (
          <ObservabilityMetricCard
            label={t("platform:METRIC_HTTP_REQUESTS")}
            value={formatInteger(http.requests, locale)}
            icon={Network}
          />
        ),
      },
      {
        id: "http-errors",
        title: t("platform:METRIC_HTTP_ERRORS"),
        content: (
          <ObservabilityMetricCard
            label={t("platform:METRIC_HTTP_ERRORS")}
            value={formatInteger(http.errorRequests, locale)}
            icon={CircleAlert}
          />
        ),
      },
      {
        id: "http-error-rate",
        title: t("platform:METRIC_ERROR_RATE"),
        content: (
          <ObservabilityMetricCard
            label={t("platform:METRIC_ERROR_RATE")}
            value={formatPercent(http.errorRate, locale)}
            icon={Activity}
          />
        ),
      },
      {
        id: "http-average-latency",
        title: t("platform:METRIC_HTTP_AVG_LATENCY"),
        content: (
          <ObservabilityMetricCard
            label={t("platform:METRIC_HTTP_AVG_LATENCY")}
            value={formatLatency(http.avgLatencyMs, locale)}
            icon={Clock3}
          />
        ),
      },
      {
        id: "http-p95-latency",
        title: t("platform:METRIC_HTTP_P95_LATENCY"),
        content: (
          <ObservabilityMetricCard
            label={t("platform:METRIC_HTTP_P95_LATENCY")}
            value={http.p95LatencyMs === null ? "—" : formatLatency(http.p95LatencyMs, locale)}
            icon={Gauge}
          />
        ),
      },
      {
        id: "http-p99-latency",
        title: t("platform:METRIC_HTTP_P99_LATENCY"),
        content: (
          <ObservabilityMetricCard
            label={t("platform:METRIC_HTTP_P99_LATENCY")}
            value={http.p99LatencyMs === null ? "—" : formatLatency(http.p99LatencyMs, locale)}
            icon={Gauge}
          />
        ),
      },
      {
        id: "http-request-trend",
        title: t("platform:TREND_HTTP_REQUESTS"),
        defaultSpan: 6,
        defaultHeight: 400,
        content: (
          <ObservabilityTrendCard
            title={t("platform:TREND_HTTP_REQUESTS")}
            description={t(`platform:PERIOD_${options.days}_DAYS`)}
            expectedBucketCount={options.days}
            points={options.requestTrend.data?.points}
            loading={options.requestTrend.isLoading}
            error={options.requestTrend.error}
            onRetry={() => void options.requestTrend.refetch()}
            valueKind="count"
          />
        ),
      },
      {
        id: "http-error-trend",
        title: t("platform:TREND_HTTP_ERRORS"),
        defaultSpan: 6,
        defaultHeight: 400,
        content: (
          <ObservabilityTrendCard
            title={t("platform:TREND_HTTP_ERRORS")}
            description={t(`platform:PERIOD_${options.days}_DAYS`)}
            expectedBucketCount={options.days}
            points={options.errorTrend.data?.points}
            loading={options.errorTrend.isLoading}
            error={options.errorTrend.error}
            onRetry={() => void options.errorTrend.refetch()}
            valueKind="count"
            color="var(--destructive)"
          />
        ),
      },
      {
        id: "request-groups",
        title: t("platform:AUDIT_REQUEST_TABLE_TITLE"),
        defaultSpan: 12,
        defaultHeight: 680,
        content: (
          <DashboardTableShell
            headingId="audit-request-groups-title"
            title={t("platform:AUDIT_REQUEST_TABLE_TITLE")}
          >
            <RequestGroupsTable
              days={options.days}
              onSelect={options.onSelectGroup}
              workspaceLabelById={options.workspaceLabelById}
              projectLabelById={options.projectLabelById}
            />
          </DashboardTableShell>
        ),
      },
    ];
  }, [
    locale,
    options.days,
    options.errorTrend,
    options.onSelectGroup,
    options.overview.data,
    options.requestTrend,
    t,
  ]);
  const eventWidgets = useMemo<DashboardWidget[]>(
    () => [
      {
        id: "audit-event-trend",
        title: t("platform:TREND_AUDIT_EVENTS"),
        defaultSpan: 12,
        defaultHeight: 400,
        content: (
          <ObservabilityTrendCard
            title={t("platform:TREND_AUDIT_EVENTS")}
            description={t(`platform:PERIOD_${options.days}_DAYS`)}
            expectedBucketCount={options.days}
            points={options.eventTrend.data?.points}
            loading={options.eventTrend.isLoading}
            error={options.eventTrend.error}
            onRetry={() => void options.eventTrend.refetch()}
            valueKind="count"
          />
        ),
      },
      {
        id: "audit-events",
        title: t("platform:AUDIT_EVENT_TABLE_TITLE"),
        defaultSpan: 12,
        defaultHeight: 680,
        content: (
          <DashboardTableShell
            headingId="audit-events-title"
            title={t("platform:AUDIT_EVENT_TABLE_TITLE")}
          >
            <AuditEventsTable
              onSelect={options.onSelectEvent}
              workspaceLabelById={options.workspaceLabelById}
              projectLabelById={options.projectLabelById}
            />
          </DashboardTableShell>
        ),
      },
    ],
    [
      options.days,
      options.eventTrend,
      options.onSelectEvent,
      options.projectLabelById,
      options.workspaceLabelById,
      t,
    ],
  );

  return { recordWidgets, analysisWidgets, eventWidgets } as const;
}

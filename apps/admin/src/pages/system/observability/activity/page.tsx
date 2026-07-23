import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Route, ScrollText } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/layouts/page-shell/default-page";
import { Button } from "@arclayer/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@arclayer/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@arclayer/ui/empty";
import { Skeleton } from "@arclayer/ui/skeleton";

import { ConfigurableDashboard, type DashboardWidget } from "../components/dashboard-layout";
import { ObservabilityPageControls } from "../components/page-controls";
import type { ObservabilityPeriodDays } from "../components/period-select";
import { ObservabilityTrendCard } from "../components/trend-card";
import { formatInteger, formatPercent } from "../formatters";
import { useSystemObservabilityOverview, useSystemObservabilityTrend } from "../hooks";

function ActivityContextWidget(props: {
  days: ObservabilityPeriodDays;
  totalEvents: number;
  coverageRate: number;
  totalRecords: number;
}) {
  const { t, i18n } = useTranslation("platform");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  return (
    <Card className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="min-w-0">
          <CardTitle className="text-title3">{t("ACTIVITY_CONTEXT_TITLE")}</CardTitle>
          <CardDescription className="mt-1">{t("ACTIVITY_CONTEXT_DESCRIPTION")}</CardDescription>
        </div>
        <ScrollText className="mt-0.5 size-4 shrink-0 text-label-tertiary" />
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-5">
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-caption text-label-tertiary">{t("ACTIVITY_TOTAL_EVENTS")}</dt>
            <dd className="mt-1 font-mono text-title1 font-semibold tabular-nums text-label-primary">
              {formatInteger(props.totalEvents, locale)}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-label-tertiary">{t("ACTIVITY_ATTRIBUTION")}</dt>
            <dd className="mt-1 font-mono text-title2 font-semibold tabular-nums text-label-primary">
              {props.totalRecords > 0
                ? formatPercent(props.coverageRate, locale)
                : t("METRIC_NO_SAMPLES")}
            </dd>
          </div>
        </dl>
        <div className="rounded-lg border bg-muted/20 p-3">
          <div className="flex items-center gap-2 text-footnote font-medium text-label-primary">
            <Route className="size-4 text-label-tertiary" />
            {t("ACTIVITY_INVESTIGATION_TITLE")}
          </div>
          <p className="mt-1.5 text-caption leading-relaxed text-label-secondary">
            {t("ACTIVITY_INVESTIGATION_DESCRIPTION")}
          </p>
        </div>
        <Button asChild variant="ghost" size="sm" className="mt-auto self-start px-0">
          <Link
            to="/system/audit-log"
            search={{ view: "events", days: props.days === 30 ? undefined : props.days }}
          >
            {t("ACTIVITY_OPEN_EVENTS")}
            <ArrowUpRight data-icon="inline-end" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function ActivityContextState(props: { loading: boolean; onRetry: () => void }) {
  const { t } = useTranslation("platform");
  return (
    <Card className="h-full min-h-0 min-w-0">
      <CardContent className="flex h-full items-center justify-center p-5">
        {props.loading ? (
          <div className="w-full space-y-4">
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <Empty className="border-0 p-3">
            <EmptyHeader>
              <EmptyTitle>{t("ACTIVITY_CONTEXT_ERROR_TITLE")}</EmptyTitle>
              <EmptyDescription>{t("ACTIVITY_CONTEXT_ERROR_DESCRIPTION")}</EmptyDescription>
            </EmptyHeader>
            <Button size="sm" variant="outline" onClick={props.onRetry}>
              {t("common:RETRY")}
            </Button>
          </Empty>
        )}
      </CardContent>
    </Card>
  );
}

export function SystemObservabilityActivityPage(props: {
  days: ObservabilityPeriodDays;
  onDaysChange: (days: ObservabilityPeriodDays) => void;
}) {
  const { t } = useTranslation("platform");
  const overview = useSystemObservabilityOverview(props.days);
  const events = useSystemObservabilityTrend(props.days, "auditEvents");
  const widgets = useMemo<DashboardWidget[]>(
    () => [
      {
        id: "audit-event-trend",
        title: t("TREND_AUDIT_EVENTS"),
        defaultSpan: 8,
        defaultHeight: 400,
        content: (
          <ObservabilityTrendCard
            title={t("TREND_AUDIT_EVENTS")}
            description={t(`PERIOD_${props.days}_DAYS`)}
            expectedBucketCount={props.days}
            points={events.data?.points}
            loading={events.isLoading}
            error={events.error}
            onRetry={() => void events.refetch()}
            valueKind="count"
          />
        ),
      },
      {
        id: "activity-context",
        title: t("ACTIVITY_CONTEXT_TITLE"),
        defaultSpan: 4,
        defaultHeight: 400,
        content: overview.data ? (
          <ActivityContextWidget
            days={props.days}
            totalEvents={overview.data.operations.auditEvents}
            coverageRate={overview.data.dataAvailability.auditProjectAttribution.coverageRate}
            totalRecords={overview.data.dataAvailability.auditProjectAttribution.totalRecords}
          />
        ) : (
          <ActivityContextState
            loading={overview.isLoading}
            onRetry={() => void overview.refetch()}
          />
        ),
      },
    ],
    [events, overview.data, overview.isLoading, overview.refetch, props.days, t],
  );

  return (
    <DefaultPage
      title={t("OBSERVABILITY_ACTIVITY_TITLE")}
      description={t("OBSERVABILITY_ACTIVITY_DESCRIPTION")}
      action={
        <ObservabilityPageControls
          days={props.days}
          onDaysChange={props.onDaysChange}
          refreshing={overview.isFetching || events.isFetching}
          onRefresh={() => void Promise.all([overview.refetch(), events.refetch()])}
        />
      }
    >
      <ConfigurableDashboard
        dashboardId="system-observability-activity"
        widgets={widgets}
        ariaLabel={t("OBSERVABILITY_ACTIVITY_TITLE")}
        className="pb-8"
      />
    </DefaultPage>
  );
}

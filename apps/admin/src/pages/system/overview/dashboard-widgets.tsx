import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Bot,
  Boxes,
  Gauge,
  MessageSquareText,
  Route,
  ScrollText,
} from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { SystemObservabilityOverviewWithTailLatency } from "@/api/platform-observability";
import type { DashboardWidget } from "@/pages/system/observability/components/dashboard-layout";
import {
  formatCompactNumber,
  formatCostMicros,
  formatInteger,
  formatLatency,
  formatPercent,
} from "@/pages/system/observability/formatters";
import { Button } from "@arclayer/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@arclayer/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@arclayer/ui/empty";
import { Skeleton } from "@arclayer/ui/skeleton";

type OverviewSnapshot = SystemObservabilityOverviewWithTailLatency;

function DashboardPanel(props: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  to: string;
  actionLabel: string;
  children: React.ReactNode;
}) {
  const Icon = props.icon;
  return (
    <Card className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <CardHeader className="flex-row items-start justify-between gap-4 pb-3">
        <div className="min-w-0">
          <CardTitle className="text-title3">{props.title}</CardTitle>
          <CardDescription className="mt-1 line-clamp-2">{props.description}</CardDescription>
        </div>
        <Icon className="mt-0.5 size-4 shrink-0 text-label-tertiary" />
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="min-h-0 flex-1">{props.children}</div>
        <Button asChild variant="ghost" size="sm" className="self-start px-0">
          <Link to={props.to}>
            {props.actionLabel}
            <ArrowUpRight data-icon="inline-end" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function SignalValue(props: { label: string; value: string; prominent?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-label-tertiary">{props.label}</dt>
      <dd
        className={
          props.prominent
            ? "mt-1 truncate font-mono text-title1 font-semibold tabular-nums text-label-primary"
            : "mt-1 truncate font-mono text-body font-medium tabular-nums text-label-primary"
        }
      >
        {props.value}
      </dd>
    </div>
  );
}

function ReliabilityPanel(props: { overview: OverviewSnapshot }) {
  const { t, i18n } = useTranslation("platform");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const { http } = props.overview;
  return (
    <DashboardPanel
      title={t("DASHBOARD_RELIABILITY_TITLE")}
      description={t("DASHBOARD_RELIABILITY_DESCRIPTION")}
      icon={Gauge}
      to="/system/observability/requests"
      actionLabel={t("DASHBOARD_OPEN_REQUESTS")}
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
        <SignalValue
          label={t("METRIC_ERROR_RATE")}
          value={formatPercent(http.errorRate, locale)}
          prominent
        />
        <SignalValue
          label={t("METRIC_HTTP_REQUESTS")}
          value={formatCompactNumber(http.requests, locale)}
        />
        <SignalValue
          label={t("METRIC_HTTP_ERRORS")}
          value={formatInteger(http.errorRequests, locale)}
        />
        <SignalValue
          label={t("METRIC_HTTP_AVG_LATENCY")}
          value={formatLatency(http.avgLatencyMs, locale)}
        />
        <SignalValue
          label={t("METRIC_HTTP_P95_LATENCY")}
          value={http.p95LatencyMs === null ? "—" : formatLatency(http.p95LatencyMs, locale)}
        />
        <SignalValue
          label={t("METRIC_HTTP_P99_LATENCY")}
          value={http.p99LatencyMs === null ? "—" : formatLatency(http.p99LatencyMs, locale)}
        />
      </dl>
    </DashboardPanel>
  );
}

function PlatformScalePanel(props: { overview: OverviewSnapshot }) {
  const { t, i18n } = useTranslation("platform");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const { resources, operations } = props.overview;
  return (
    <DashboardPanel
      title={t("DASHBOARD_SCALE_TITLE")}
      description={t("DASHBOARD_SCALE_DESCRIPTION")}
      icon={Boxes}
      to="/system/tenants/workspaces"
      actionLabel={t("DASHBOARD_OPEN_TENANTS")}
    >
      <dl className="grid grid-cols-2 gap-4">
        <SignalValue
          label={t("METRIC_ACTIVE_WORKSPACES")}
          value={formatInteger(resources.activeWorkspaces, locale)}
          prominent
        />
        <SignalValue
          label={t("METRIC_ACTIVE_PROJECTS")}
          value={formatInteger(resources.activeProjects, locale)}
        />
        <SignalValue
          label={t("METRIC_ACTIVE_USERS")}
          value={formatInteger(resources.activeUsers, locale)}
        />
        <SignalValue
          label={t("METRIC_ACTIVE_SUBSCRIPTIONS")}
          value={formatInteger(operations.activeSubscriptions, locale)}
        />
      </dl>
    </DashboardPanel>
  );
}

function OperationsPanel(props: { overview: OverviewSnapshot }) {
  const { t, i18n } = useTranslation("platform");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const rows = [
    {
      label: t("METRIC_OPEN_FEEDBACK"),
      value: formatInteger(props.overview.operations.openFeedback, locale),
      icon: MessageSquareText,
      to: "/system/feedback",
    },
    {
      label: t("METRIC_AUDIT_EVENTS"),
      value: formatCompactNumber(props.overview.operations.auditEvents, locale),
      icon: ScrollText,
      to: "/system/audit-log",
    },
  ] as const;
  return (
    <Card className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <CardHeader>
        <CardTitle className="text-title3">{t("DASHBOARD_OPERATIONS_TITLE")}</CardTitle>
        <CardDescription>{t("DASHBOARD_OPERATIONS_DESCRIPTION")}</CardDescription>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 divide-y p-0">
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <Link
              key={row.label}
              to={row.to}
              className="flex items-center gap-3 px-5 py-4 outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <Icon className="size-4 shrink-0 text-label-tertiary" />
              <span className="min-w-0 flex-1 truncate text-footnote text-label-secondary">
                {row.label}
              </span>
              <span className="font-mono text-body font-semibold tabular-nums text-label-primary">
                {row.value}
              </span>
              <ArrowUpRight className="size-3.5 shrink-0 text-label-tertiary" />
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}

function AIServicePanel(props: { overview: OverviewSnapshot }) {
  const { t, i18n } = useTranslation("platform");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const { ai } = props.overview;
  return (
    <DashboardPanel
      title={t("DASHBOARD_AI_TITLE")}
      description={t("DASHBOARD_AI_DESCRIPTION")}
      icon={Bot}
      to="/system/observability/ai-usage"
      actionLabel={t("DASHBOARD_OPEN_AI_USAGE")}
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
        <SignalValue
          label={t("METRIC_AI_COST")}
          value={formatCostMicros(ai.costMicros, locale)}
          prominent
        />
        <SignalValue
          label={t("METRIC_AI_REQUESTS")}
          value={formatCompactNumber(ai.requests, locale)}
        />
        <SignalValue
          label={t("METRIC_AI_ERRORS")}
          value={formatInteger(ai.errorRequests, locale)}
        />
        <SignalValue label={t("METRIC_ERROR_RATE")} value={formatPercent(ai.errorRate, locale)} />
        <SignalValue
          label={t("METRIC_P95_LATENCY")}
          value={formatLatency(ai.p95LatencyMs, locale)}
        />
        <SignalValue
          label={t("METRIC_TOTAL_TOKENS")}
          value={formatCompactNumber(ai.totalTokens, locale)}
        />
      </dl>
    </DashboardPanel>
  );
}

function AttributionPanel(props: { overview: OverviewSnapshot }) {
  const { t, i18n } = useTranslation("platform");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const signals = [
    [t("METRIC_HTTP_PROJECT_ATTRIBUTION"), props.overview.dataAvailability.httpProjectAttribution],
    [t("METRIC_AI_PROJECT_ATTRIBUTION"), props.overview.dataAvailability.aiProjectAttribution],
    [
      t("METRIC_AUDIT_PROJECT_ATTRIBUTION"),
      props.overview.dataAvailability.auditProjectAttribution,
    ],
  ] as const;
  return (
    <DashboardPanel
      title={t("DASHBOARD_ATTRIBUTION_TITLE")}
      description={t("DASHBOARD_ATTRIBUTION_DESCRIPTION")}
      icon={Route}
      to="/system/audit-log"
      actionLabel={t("DASHBOARD_OPEN_AUDIT")}
    >
      <div className="space-y-4">
        {signals.map(([label, signal]) => {
          const rate = signal.totalRecords > 0 ? signal.coverageRate : 0;
          return (
            <div key={label}>
              <div className="flex items-center justify-between gap-3 text-footnote">
                <span className="truncate text-label-secondary">{label}</span>
                <span className="font-mono tabular-nums text-label-primary">
                  {signal.totalRecords > 0 ? formatPercent(rate, locale) : t("METRIC_NO_SAMPLES")}
                </span>
              </div>
              <div
                className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label={label}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(rate * 100)}
              >
                <div className="h-full bg-primary" style={{ width: `${rate * 100}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </DashboardPanel>
  );
}

function SnapshotStatePanel(props: { loading: boolean; error: unknown; onRetry: () => void }) {
  const { t } = useTranslation("platform");
  return (
    <Card className="h-full min-h-0 min-w-0">
      <CardContent className="flex h-full min-h-48 items-center justify-center p-5">
        {props.loading ? (
          <div className="grid w-full grid-cols-2 gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-20 rounded-lg" />
            ))}
          </div>
        ) : (
          <Empty className="border-0 p-4">
            <EmptyHeader>
              <EmptyTitle>{t("DASHBOARD_SNAPSHOT_ERROR_TITLE")}</EmptyTitle>
              <EmptyDescription>{t("DASHBOARD_SNAPSHOT_ERROR_DESCRIPTION")}</EmptyDescription>
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

export function usePlatformDashboardSummaryWidgets(options: {
  overview: OverviewSnapshot | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}): readonly DashboardWidget[] {
  const { t } = useTranslation("platform");
  return useMemo(() => {
    if (!options.overview) {
      return [
        {
          id: "platform-snapshot-state",
          title: t("DASHBOARD_SNAPSHOT_TITLE"),
          defaultSpan: 12,
          defaultHeight: 240,
          transient: true,
          content: (
            <SnapshotStatePanel
              loading={options.loading}
              error={options.error}
              onRetry={options.onRetry}
            />
          ),
        },
      ];
    }

    return [
      {
        id: "platform-reliability",
        title: t("DASHBOARD_RELIABILITY_TITLE"),
        defaultSpan: 4,
        minSpan: 3,
        defaultHeight: 384,
        minHeight: 368,
        content: <ReliabilityPanel overview={options.overview} />,
      },
      {
        id: "operations-queue",
        title: t("DASHBOARD_OPERATIONS_TITLE"),
        defaultSpan: 4,
        minSpan: 3,
        defaultHeight: 384,
        minHeight: 320,
        content: <OperationsPanel overview={options.overview} />,
      },
      {
        id: "platform-scale",
        title: t("DASHBOARD_SCALE_TITLE"),
        defaultSpan: 4,
        minSpan: 3,
        defaultHeight: 384,
        minHeight: 352,
        content: <PlatformScalePanel overview={options.overview} />,
      },
      {
        id: "ai-service",
        title: t("DASHBOARD_AI_TITLE"),
        defaultSpan: 6,
        minSpan: 3,
        defaultHeight: 384,
        minHeight: 368,
        content: <AIServicePanel overview={options.overview} />,
      },
      {
        id: "project-attribution",
        title: t("DASHBOARD_ATTRIBUTION_TITLE"),
        defaultSpan: 6,
        minSpan: 4,
        defaultHeight: 384,
        minHeight: 352,
        content: <AttributionPanel overview={options.overview} />,
      },
    ];
  }, [options.error, options.loading, options.onRetry, options.overview, t]);
}

import {
  Activity,
  BadgeDollarSign,
  Bot,
  Boxes,
  BriefcaseBusiness,
  CircleAlert,
  Clock3,
  Coins,
  FolderKanban,
  Gauge,
  MessageSquareText,
  Network,
  Route,
  ScrollText,
  UsersRound,
} from "lucide-react";
import { Fragment, useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { SystemObservabilityOverview } from "@/api/platform-observability";

import {
  formatCompactNumber,
  formatCostMicros,
  formatInteger,
  formatLatency,
  formatPercent,
} from "../formatters";
import type { DashboardWidget } from "./dashboard-layout";
import { ObservabilityMetricCard, ObservabilityMetricSection } from "./metric-card";

export type SystemSummaryWidget = DashboardWidget & Readonly<{ section: string }>;

export function useSystemSummaryWidgets(
  overview: SystemObservabilityOverview | undefined,
): readonly SystemSummaryWidget[] {
  const { t, i18n } = useTranslation("platform");
  const locale = i18n.resolvedLanguage ?? i18n.language;

  return useMemo(() => {
    if (!overview) return [];
    const { resources, http, ai, operations, dataAvailability } = overview;
    const coverageValue = (coverage: { totalRecords: number; coverageRate: number }) =>
      coverage.totalRecords > 0
        ? formatPercent(coverage.coverageRate, locale)
        : t("METRIC_NO_SAMPLES");
    const coverageDescription = (coverage: { attributedRecords: number; totalRecords: number }) =>
      t("METRIC_ATTRIBUTION_COVERAGE_DETAIL", {
        attributed: formatInteger(coverage.attributedRecords, locale),
        total: formatInteger(coverage.totalRecords, locale),
      });

    return [
      {
        id: "active-workspaces",
        section: t("SECTION_PLATFORM_SCALE"),
        title: t("METRIC_ACTIVE_WORKSPACES"),
        content: (
          <ObservabilityMetricCard
            label={t("METRIC_ACTIVE_WORKSPACES")}
            value={formatInteger(resources.activeWorkspaces, locale)}
            icon={Boxes}
          />
        ),
      },
      {
        id: "active-projects",
        section: t("SECTION_PLATFORM_SCALE"),
        title: t("METRIC_ACTIVE_PROJECTS"),
        content: (
          <ObservabilityMetricCard
            label={t("METRIC_ACTIVE_PROJECTS")}
            value={formatInteger(resources.activeProjects, locale)}
            icon={FolderKanban}
          />
        ),
      },
      {
        id: "active-users",
        section: t("SECTION_PLATFORM_SCALE"),
        title: t("METRIC_ACTIVE_USERS"),
        content: (
          <ObservabilityMetricCard
            label={t("METRIC_ACTIVE_USERS")}
            value={formatInteger(resources.activeUsers, locale)}
            icon={UsersRound}
          />
        ),
      },
      {
        id: "http-requests",
        section: t("SECTION_HTTP_RELIABILITY"),
        title: t("METRIC_HTTP_REQUESTS"),
        content: (
          <ObservabilityMetricCard
            label={t("METRIC_HTTP_REQUESTS")}
            value={formatCompactNumber(http.requests, locale)}
            icon={Network}
          />
        ),
      },
      {
        id: "http-errors",
        section: t("SECTION_HTTP_RELIABILITY"),
        title: t("METRIC_HTTP_ERRORS"),
        content: (
          <ObservabilityMetricCard
            label={t("METRIC_HTTP_ERRORS")}
            value={formatInteger(http.errorRequests, locale)}
            icon={CircleAlert}
          />
        ),
      },
      {
        id: "http-error-rate",
        section: t("SECTION_HTTP_RELIABILITY"),
        title: t("METRIC_ERROR_RATE"),
        content: (
          <ObservabilityMetricCard
            label={t("METRIC_ERROR_RATE")}
            value={formatPercent(http.errorRate, locale)}
            icon={Gauge}
          />
        ),
      },
      {
        id: "http-average-latency",
        section: t("SECTION_HTTP_RELIABILITY"),
        title: t("METRIC_HTTP_AVG_LATENCY"),
        content: (
          <ObservabilityMetricCard
            label={t("METRIC_HTTP_AVG_LATENCY")}
            value={formatLatency(http.avgLatencyMs, locale)}
            icon={Clock3}
          />
        ),
      },
      {
        id: "http-maximum-latency",
        section: t("SECTION_HTTP_RELIABILITY"),
        title: t("METRIC_HTTP_MAX_LATENCY"),
        content: (
          <ObservabilityMetricCard
            label={t("METRIC_HTTP_MAX_LATENCY")}
            value={formatLatency(http.maxLatencyMs, locale)}
            icon={Activity}
          />
        ),
      },
      {
        id: "ai-requests",
        section: t("SECTION_AI_EFFICIENCY"),
        title: t("METRIC_AI_REQUESTS"),
        content: (
          <ObservabilityMetricCard
            label={t("METRIC_AI_REQUESTS")}
            value={formatCompactNumber(ai.requests, locale)}
            icon={Bot}
          />
        ),
      },
      {
        id: "ai-errors",
        section: t("SECTION_AI_EFFICIENCY"),
        title: t("METRIC_AI_ERRORS"),
        content: (
          <ObservabilityMetricCard
            label={t("METRIC_AI_ERRORS")}
            value={formatInteger(ai.errorRequests, locale)}
            icon={CircleAlert}
          />
        ),
      },
      {
        id: "ai-error-rate",
        section: t("SECTION_AI_EFFICIENCY"),
        title: t("METRIC_ERROR_RATE"),
        content: (
          <ObservabilityMetricCard
            label={t("METRIC_ERROR_RATE")}
            value={formatPercent(ai.errorRate, locale)}
            icon={Gauge}
          />
        ),
      },
      {
        id: "ai-p95-latency",
        section: t("SECTION_AI_EFFICIENCY"),
        title: t("METRIC_P95_LATENCY"),
        content: (
          <ObservabilityMetricCard
            label={t("METRIC_P95_LATENCY")}
            value={formatLatency(ai.p95LatencyMs, locale)}
            icon={Clock3}
          />
        ),
      },
      {
        id: "ai-total-tokens",
        section: t("SECTION_AI_EFFICIENCY"),
        title: t("METRIC_TOTAL_TOKENS"),
        content: (
          <ObservabilityMetricCard
            label={t("METRIC_TOTAL_TOKENS")}
            value={formatCompactNumber(ai.totalTokens, locale)}
            icon={Coins}
          />
        ),
      },
      {
        id: "ai-cost",
        section: t("SECTION_AI_EFFICIENCY"),
        title: t("METRIC_AI_COST"),
        content: (
          <ObservabilityMetricCard
            label={t("METRIC_AI_COST")}
            value={formatCostMicros(ai.costMicros, locale)}
            icon={BadgeDollarSign}
          />
        ),
      },
      {
        id: "audit-events",
        section: t("SECTION_OPERATIONS"),
        title: t("METRIC_AUDIT_EVENTS"),
        content: (
          <ObservabilityMetricCard
            label={t("METRIC_AUDIT_EVENTS")}
            value={formatCompactNumber(operations.auditEvents, locale)}
            icon={ScrollText}
          />
        ),
      },
      {
        id: "open-feedback",
        section: t("SECTION_OPERATIONS"),
        title: t("METRIC_OPEN_FEEDBACK"),
        content: (
          <ObservabilityMetricCard
            label={t("METRIC_OPEN_FEEDBACK")}
            value={formatInteger(operations.openFeedback, locale)}
            icon={MessageSquareText}
          />
        ),
      },
      {
        id: "active-subscriptions",
        section: t("SECTION_OPERATIONS"),
        title: t("METRIC_ACTIVE_SUBSCRIPTIONS"),
        content: (
          <ObservabilityMetricCard
            label={t("METRIC_ACTIVE_SUBSCRIPTIONS")}
            value={formatInteger(operations.activeSubscriptions, locale)}
            icon={BriefcaseBusiness}
          />
        ),
      },
      {
        id: "http-project-attribution",
        section: t("SECTION_PROJECT_ATTRIBUTION"),
        title: t("METRIC_HTTP_PROJECT_ATTRIBUTION"),
        content: (
          <ObservabilityMetricCard
            label={t("METRIC_HTTP_PROJECT_ATTRIBUTION")}
            value={coverageValue(dataAvailability.httpProjectAttribution)}
            description={coverageDescription(dataAvailability.httpProjectAttribution)}
            icon={Route}
          />
        ),
      },
      {
        id: "ai-project-attribution",
        section: t("SECTION_PROJECT_ATTRIBUTION"),
        title: t("METRIC_AI_PROJECT_ATTRIBUTION"),
        content: (
          <ObservabilityMetricCard
            label={t("METRIC_AI_PROJECT_ATTRIBUTION")}
            value={coverageValue(dataAvailability.aiProjectAttribution)}
            description={coverageDescription(dataAvailability.aiProjectAttribution)}
            icon={Bot}
          />
        ),
      },
      {
        id: "audit-project-attribution",
        section: t("SECTION_PROJECT_ATTRIBUTION"),
        title: t("METRIC_AUDIT_PROJECT_ATTRIBUTION"),
        content: (
          <ObservabilityMetricCard
            label={t("METRIC_AUDIT_PROJECT_ATTRIBUTION")}
            value={coverageValue(dataAvailability.auditProjectAttribution)}
            description={coverageDescription(dataAvailability.auditProjectAttribution)}
            icon={ScrollText}
          />
        ),
      },
    ];
  }, [locale, overview, t]);
}

export function SystemSummaryMetrics(props: { overview: SystemObservabilityOverview }) {
  const widgets = useSystemSummaryWidgets(props.overview);
  const sections = useMemo(() => {
    const grouped = new Map<string, SystemSummaryWidget[]>();
    for (const widget of widgets) {
      const sectionWidgets = grouped.get(widget.section) ?? [];
      sectionWidgets.push(widget);
      grouped.set(widget.section, sectionWidgets);
    }
    return [...grouped.entries()];
  }, [widgets]);

  return (
    <div className="flex flex-col gap-6">
      {sections.map(([section, sectionWidgets]) => (
        <ObservabilityMetricSection key={section} title={section}>
          {sectionWidgets.map((widget) => (
            <Fragment key={widget.id}>{widget.content}</Fragment>
          ))}
        </ObservabilityMetricSection>
      ))}
    </div>
  );
}

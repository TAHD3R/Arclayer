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
import { useTranslation } from "react-i18next";

import type { SystemObservabilityOverview } from "@/api/platform-observability";

import {
  formatCompactNumber,
  formatCostMicros,
  formatInteger,
  formatLatency,
  formatPercent,
} from "../formatters";
import { ObservabilityMetricCard, ObservabilityMetricSection } from "./metric-card";

export function SystemSummaryMetrics(props: { overview: SystemObservabilityOverview }) {
  const { t, i18n } = useTranslation("platform");
  const locale = i18n.resolvedLanguage;
  const { resources, http, ai, operations, dataAvailability } = props.overview;

  const coverageValue = (coverage: { totalRecords: number; coverageRate: number }) =>
    coverage.totalRecords > 0
      ? formatPercent(coverage.coverageRate, locale)
      : t("METRIC_NO_SAMPLES");
  const coverageDescription = (coverage: { attributedRecords: number; totalRecords: number }) =>
    t("METRIC_ATTRIBUTION_COVERAGE_DETAIL", {
      attributed: formatInteger(coverage.attributedRecords, locale),
      total: formatInteger(coverage.totalRecords, locale),
    });

  return (
    <div className="flex flex-col gap-6">
      <ObservabilityMetricSection title={t("SECTION_PLATFORM_SCALE")}>
        <ObservabilityMetricCard
          label={t("METRIC_ACTIVE_WORKSPACES")}
          value={formatInteger(resources.activeWorkspaces, locale)}
          icon={Boxes}
        />
        <ObservabilityMetricCard
          label={t("METRIC_ACTIVE_PROJECTS")}
          value={formatInteger(resources.activeProjects, locale)}
          icon={FolderKanban}
        />
        <ObservabilityMetricCard
          label={t("METRIC_ACTIVE_USERS")}
          value={formatInteger(resources.activeUsers, locale)}
          icon={UsersRound}
        />
      </ObservabilityMetricSection>

      <ObservabilityMetricSection title={t("SECTION_HTTP_RELIABILITY")}>
        <ObservabilityMetricCard
          label={t("METRIC_HTTP_REQUESTS")}
          value={formatCompactNumber(http.requests, locale)}
          icon={Network}
        />
        <ObservabilityMetricCard
          label={t("METRIC_HTTP_ERRORS")}
          value={formatInteger(http.errorRequests, locale)}
          icon={CircleAlert}
        />
        <ObservabilityMetricCard
          label={t("METRIC_ERROR_RATE")}
          value={formatPercent(http.errorRate, locale)}
          icon={Gauge}
        />
        <ObservabilityMetricCard
          label={t("METRIC_HTTP_AVG_LATENCY")}
          value={formatLatency(http.avgLatencyMs, locale)}
          icon={Clock3}
        />
        <ObservabilityMetricCard
          label={t("METRIC_HTTP_MAX_LATENCY")}
          value={formatLatency(http.maxLatencyMs, locale)}
          icon={Activity}
        />
      </ObservabilityMetricSection>

      <ObservabilityMetricSection title={t("SECTION_AI_EFFICIENCY")}>
        <ObservabilityMetricCard
          label={t("METRIC_AI_REQUESTS")}
          value={formatCompactNumber(ai.requests, locale)}
          icon={Bot}
        />
        <ObservabilityMetricCard
          label={t("METRIC_AI_ERRORS")}
          value={formatInteger(ai.errorRequests, locale)}
          icon={CircleAlert}
        />
        <ObservabilityMetricCard
          label={t("METRIC_ERROR_RATE")}
          value={formatPercent(ai.errorRate, locale)}
          icon={Gauge}
        />
        <ObservabilityMetricCard
          label={t("METRIC_P95_LATENCY")}
          value={formatLatency(ai.p95LatencyMs, locale)}
          icon={Clock3}
        />
        <ObservabilityMetricCard
          label={t("METRIC_TOTAL_TOKENS")}
          value={formatCompactNumber(ai.totalTokens, locale)}
          icon={Coins}
        />
        <ObservabilityMetricCard
          label={t("METRIC_AI_COST")}
          value={formatCostMicros(ai.costMicros, locale)}
          icon={BadgeDollarSign}
        />
      </ObservabilityMetricSection>

      <ObservabilityMetricSection title={t("SECTION_OPERATIONS")}>
        <ObservabilityMetricCard
          label={t("METRIC_AUDIT_EVENTS")}
          value={formatCompactNumber(operations.auditEvents, locale)}
          icon={ScrollText}
        />
        <ObservabilityMetricCard
          label={t("METRIC_OPEN_FEEDBACK")}
          value={formatInteger(operations.openFeedback, locale)}
          icon={MessageSquareText}
        />
        <ObservabilityMetricCard
          label={t("METRIC_ACTIVE_SUBSCRIPTIONS")}
          value={formatInteger(operations.activeSubscriptions, locale)}
          icon={BriefcaseBusiness}
        />
      </ObservabilityMetricSection>

      <ObservabilityMetricSection title={t("SECTION_PROJECT_ATTRIBUTION")}>
        <ObservabilityMetricCard
          label={t("METRIC_HTTP_PROJECT_ATTRIBUTION")}
          value={coverageValue(dataAvailability.httpProjectAttribution)}
          description={coverageDescription(dataAvailability.httpProjectAttribution)}
          icon={Route}
        />
        <ObservabilityMetricCard
          label={t("METRIC_AI_PROJECT_ATTRIBUTION")}
          value={coverageValue(dataAvailability.aiProjectAttribution)}
          description={coverageDescription(dataAvailability.aiProjectAttribution)}
          icon={Bot}
        />
        <ObservabilityMetricCard
          label={t("METRIC_AUDIT_PROJECT_ATTRIBUTION")}
          value={coverageValue(dataAvailability.auditProjectAttribution)}
          description={coverageDescription(dataAvailability.auditProjectAttribution)}
          icon={ScrollText}
        />
      </ObservabilityMetricSection>
    </div>
  );
}

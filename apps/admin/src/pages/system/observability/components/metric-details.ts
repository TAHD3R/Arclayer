import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { SystemObservabilityOverviewWithTailLatency } from "@/api/platform-observability";

import {
  formatCompactNumber,
  formatCostMicros,
  formatInteger,
  formatLatency,
  formatPercent,
} from "../formatters";
import type { ObservabilityMetricDetail } from "./metric-card";

type Overview = SystemObservabilityOverviewWithTailLatency;

export function useObservabilityMetricDetails() {
  const { t, i18n } = useTranslation("platform");
  const locale = i18n.resolvedLanguage ?? i18n.language;

  return useMemo(() => {
    const http = (overview: Overview, definition: string): ObservabilityMetricDetail => {
      const summary = overview.http;
      const latency = (value: number | null) =>
        value === null ? t("AUDIT_VALUE_UNAVAILABLE") : formatLatency(value, locale);
      return {
        definition,
        period: overview.period,
        coverage: t("METRIC_DETAIL_HTTP_COVERAGE", {
          count: formatInteger(summary.requests, locale),
        }),
        interpretation: t("METRIC_DETAIL_HTTP_INTERPRETATION", {
          requests: formatInteger(summary.requests, locale),
          errors: formatInteger(summary.errorRequests, locale),
          rate: formatPercent(summary.errorRate, locale),
          average: formatLatency(summary.avgLatencyMs, locale),
          p99: latency(summary.p99LatencyMs),
        }),
        source: t("METRIC_DETAIL_HTTP_SOURCE"),
        relatedFacts: [
          {
            label: t("METRIC_HTTP_REQUESTS"),
            value: formatCompactNumber(summary.requests, locale),
          },
          { label: t("METRIC_HTTP_ERRORS"), value: formatInteger(summary.errorRequests, locale) },
          { label: t("METRIC_ERROR_RATE"), value: formatPercent(summary.errorRate, locale) },
          {
            label: t("METRIC_HTTP_AVG_LATENCY"),
            value: formatLatency(summary.avgLatencyMs, locale),
          },
          { label: t("METRIC_HTTP_P95_LATENCY"), value: latency(summary.p95LatencyMs) },
          { label: t("METRIC_HTTP_P99_LATENCY"), value: latency(summary.p99LatencyMs) },
          {
            label: t("METRIC_HTTP_MAX_LATENCY"),
            value: formatLatency(summary.maxLatencyMs, locale),
          },
        ],
      };
    };

    const ai = (overview: Overview, definition: string): ObservabilityMetricDetail => {
      const summary = overview.ai;
      return {
        definition,
        period: overview.period,
        coverage: t("METRIC_DETAIL_AI_COVERAGE", {
          count: formatInteger(summary.requests, locale),
        }),
        interpretation: t("METRIC_DETAIL_AI_INTERPRETATION", {
          requests: formatInteger(summary.requests, locale),
          errors: formatInteger(summary.errorRequests, locale),
          rate: formatPercent(summary.errorRate, locale),
          tokens: formatCompactNumber(summary.totalTokens, locale),
          cost: formatCostMicros(summary.costMicros, locale),
        }),
        source: t("METRIC_DETAIL_AI_SOURCE"),
        relatedFacts: [
          { label: t("METRIC_AI_REQUESTS"), value: formatCompactNumber(summary.requests, locale) },
          { label: t("METRIC_AI_ERRORS"), value: formatInteger(summary.errorRequests, locale) },
          { label: t("METRIC_ERROR_RATE"), value: formatPercent(summary.errorRate, locale) },
          {
            label: t("METRIC_PROMPT_TOKENS"),
            value: formatCompactNumber(summary.promptTokens, locale),
          },
          {
            label: t("METRIC_COMPLETION_TOKENS"),
            value: formatCompactNumber(summary.completionTokens, locale),
          },
          {
            label: t("METRIC_TOTAL_TOKENS"),
            value: formatCompactNumber(summary.totalTokens, locale),
          },
          { label: t("METRIC_AI_COST"), value: formatCostMicros(summary.costMicros, locale) },
          {
            label: t("METRIC_P95_LATENCY"),
            value: formatLatency(summary.p95LatencyMs, locale),
          },
        ],
      };
    };

    return { http, ai } as const;
  }, [locale, t]);
}

import { useState } from "react";
import { BriefcaseBusiness, MessageSquareText, ScrollText } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { DefaultPage } from "@/layouts/page-shell/default-page";

import { ObservabilityMetricCard, ObservabilityMetricSection } from "../components/metric-card";
import { ObservabilityPageControls } from "../components/page-controls";
import type { ObservabilityPeriodDays } from "../components/period-select";
import { ObservabilityTrendCard } from "../components/trend-card";
import { formatCompactNumber, formatInteger } from "../formatters";
import { useSystemObservabilityOverview, useSystemObservabilityTrend } from "../hooks";

export function SystemObservabilityActivityPage() {
  const { t, i18n } = useTranslation("platform");
  const locale = i18n.resolvedLanguage;
  const [days, setDays] = useState<ObservabilityPeriodDays>(30);
  const overview = useSystemObservabilityOverview(days);
  const auditEvents = useSystemObservabilityTrend(days, "auditEvents");
  const queries = [overview, auditEvents];

  return (
    <DefaultPage
      title={t("OBSERVABILITY_ACTIVITY_TITLE")}
      description={t("OBSERVABILITY_ACTIVITY_DESCRIPTION")}
      showFavoriteToggle={false}
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
          <div className="flex flex-col gap-8 pb-8">
            <ObservabilityMetricSection title={t("SECTION_OPERATIONS")}>
              <ObservabilityMetricCard
                label={t("METRIC_AUDIT_EVENTS")}
                value={formatCompactNumber(overview.data.operations.auditEvents, locale)}
                icon={ScrollText}
              />
              <ObservabilityMetricCard
                label={t("METRIC_OPEN_FEEDBACK")}
                value={formatInteger(overview.data.operations.openFeedback, locale)}
                icon={MessageSquareText}
              />
              <ObservabilityMetricCard
                label={t("METRIC_ACTIVE_SUBSCRIPTIONS")}
                value={formatInteger(overview.data.operations.activeSubscriptions, locale)}
                icon={BriefcaseBusiness}
              />
            </ObservabilityMetricSection>

            <div className="grid gap-4 xl:grid-cols-2">
              <ObservabilityTrendCard
                title={t("TREND_AUDIT_EVENTS")}
                description={t(`PERIOD_${days}_DAYS`)}
                points={auditEvents.data?.points}
                loading={auditEvents.isLoading}
                error={auditEvents.error}
                onRetry={() => void auditEvents.refetch()}
                valueKind="count"
              />
            </div>
          </div>
        ) : null}
      </ContentGuard>
    </DefaultPage>
  );
}

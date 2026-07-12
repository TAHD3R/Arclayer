import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { Button } from "@arclayer/ui/button";
import {
  ObservabilityPeriodSelect,
  type ObservabilityPeriodDays,
} from "@/pages/system/observability/components/period-select";
import { SystemSummaryMetrics } from "@/pages/system/observability/components/system-summary-metrics";
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
  const refreshing = [overview, httpRequests, aiRequests, cost, auditEvents].some(
    (query) => query.isFetching,
  );

  const refresh = () =>
    Promise.all([
      overview.refetch(),
      httpRequests.refetch(),
      aiRequests.refetch(),
      cost.refetch(),
      auditEvents.refetch(),
    ]);

  return (
    <DefaultPage
      title={t("OVERVIEW_TITLE")}
      description={t("OVERVIEW_DESCRIPTION")}
      showFavoriteToggle={false}
      action={
        <div className="flex items-center gap-2">
          <ObservabilityPeriodSelect value={days} onChange={setDays} />
          <Button
            variant="outline"
            size="icon"
            loading={refreshing}
            aria-label={t("ACTION_REFRESH")}
            onClick={() => void refresh()}
          >
            <RefreshCw data-icon="inline-start" />
          </Button>
        </div>
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
            <SystemSummaryMetrics overview={overview.data} />
            <section className="flex flex-col gap-3" aria-label={t("OBSERVABILITY_OVERVIEW_TITLE")}>
              <h2 className="text-title3 font-semibold text-label-primary">
                {t("OBSERVABILITY_OVERVIEW_TITLE")}
              </h2>
              <div className="grid gap-4 xl:grid-cols-2">
                <ObservabilityTrendCard
                  title={t("TREND_HTTP_REQUESTS")}
                  description={t(`PERIOD_${days}_DAYS`)}
                  points={httpRequests.data?.points}
                  loading={httpRequests.isLoading}
                  error={httpRequests.error}
                  onRetry={() => void httpRequests.refetch()}
                  valueKind="count"
                />
                <ObservabilityTrendCard
                  title={t("TREND_REQUESTS")}
                  description={t(`PERIOD_${days}_DAYS`)}
                  points={aiRequests.data?.points}
                  loading={aiRequests.isLoading}
                  error={aiRequests.error}
                  onRetry={() => void aiRequests.refetch()}
                  valueKind="count"
                />
                <ObservabilityTrendCard
                  title={t("TREND_COST")}
                  description={t(`PERIOD_${days}_DAYS`)}
                  points={cost.data?.points}
                  loading={cost.isLoading}
                  error={cost.error}
                  onRetry={() => void cost.refetch()}
                  valueKind="cost"
                />
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
            </section>
          </div>
        ) : null}
      </ContentGuard>
    </DefaultPage>
  );
}

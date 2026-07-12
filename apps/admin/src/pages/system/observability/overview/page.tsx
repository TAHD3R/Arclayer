import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { Button } from "@arclayer/ui/button";

import {
  ObservabilityPeriodSelect,
  type ObservabilityPeriodDays,
} from "../components/period-select";
import { SystemSummaryMetrics } from "../components/system-summary-metrics";
import { useSystemObservabilityOverview } from "../hooks";

export function SystemObservabilityOverviewPage() {
  const { t } = useTranslation("platform");
  const [days, setDays] = useState<ObservabilityPeriodDays>(30);
  const overview = useSystemObservabilityOverview(days);

  return (
    <DefaultPage
      title={t("OBSERVABILITY_OVERVIEW_TITLE")}
      description={t("OBSERVABILITY_OVERVIEW_DESCRIPTION")}
      showFavoriteToggle={false}
      action={
        <div className="flex items-center gap-2">
          <ObservabilityPeriodSelect value={days} onChange={setDays} />
          <Button
            variant="outline"
            size="icon"
            loading={overview.isFetching}
            aria-label={t("ACTION_REFRESH")}
            onClick={() => void overview.refetch()}
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
          <div className="pb-8">
            <SystemSummaryMetrics overview={overview.data} />
          </div>
        ) : null}
      </ContentGuard>
    </DefaultPage>
  );
}

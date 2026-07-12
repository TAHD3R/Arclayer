import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";

import { ObservabilityPeriodSelect, type ObservabilityPeriodDays } from "./period-select";

export function ObservabilityPageControls(props: {
  days: ObservabilityPeriodDays;
  onDaysChange: (days: ObservabilityPeriodDays) => void;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const { t } = useTranslation("platform");

  return (
    <div className="flex items-center gap-2">
      <ObservabilityPeriodSelect value={props.days} onChange={props.onDaysChange} />
      <Button
        variant="outline"
        size="icon"
        loading={props.refreshing}
        aria-label={t("ACTION_REFRESH")}
        onClick={props.onRefresh}
      >
        <RefreshCw data-icon="inline-start" />
      </Button>
    </div>
  );
}

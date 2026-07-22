import { useTranslation } from "react-i18next";

import { Tabs, TabsList, TabsTrigger } from "@arclayer/ui/tabs";

export type ObservabilityPeriodDays = 7 | 14 | 30 | 90;

const PERIODS: readonly ObservabilityPeriodDays[] = [7, 14, 30, 90];

export function ObservabilityPeriodSelect(props: {
  value: ObservabilityPeriodDays;
  onChange: (value: ObservabilityPeriodDays) => void;
}) {
  const { t } = useTranslation("platform");

  return (
    <Tabs
      value={String(props.value)}
      onValueChange={(value) => props.onChange(Number(value) as ObservabilityPeriodDays)}
    >
      <TabsList aria-label={t("PERIOD_LABEL")} className="h-9">
        {PERIODS.map((days) => (
          <TabsTrigger
            key={days}
            value={String(days)}
            className="min-w-9 px-2.5 font-mono tabular-nums"
            aria-label={t(`PERIOD_${days}_DAYS`)}
          >
            {days}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

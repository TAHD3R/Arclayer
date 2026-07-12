import { useTranslation } from "react-i18next";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@arclayer/ui/select";

export type ObservabilityPeriodDays = 7 | 30 | 90;

const PERIODS: readonly ObservabilityPeriodDays[] = [7, 30, 90];

export function ObservabilityPeriodSelect(props: {
  value: ObservabilityPeriodDays;
  onChange: (value: ObservabilityPeriodDays) => void;
}) {
  const { t } = useTranslation("platform");

  return (
    <Select
      value={String(props.value)}
      onValueChange={(value) => props.onChange(Number(value) as ObservabilityPeriodDays)}
    >
      <SelectTrigger aria-label={t("PERIOD_LABEL")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {PERIODS.map((days) => (
            <SelectItem key={days} value={String(days)}>
              {t(`PERIOD_${days}_DAYS`)}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import type { AIUsageGroup } from "@arclayer/openapi/admin-types";

function Metric(props: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="text-caption text-label-secondary">{props.label}</div>
      <div className="mt-1 font-mono text-title3 font-semibold tabular-nums">{props.value}</div>
    </div>
  );
}

export function AIUsageDetailDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: AIUsageGroup | null;
}) {
  const { t, i18n } = useTranslation("platform");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const dateTime = useAdminDateTimeFormatter({ workspaceId: null });
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const percent = useMemo(
    () => new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 2 }),
    [locale],
  );
  const money = useMemo(
    () => new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }),
    [locale],
  );
  const group = props.group;

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t("AI_USAGE_DETAIL_TITLE")}
      description={group ? `${group.provider} · ${group.model}` : undefined}
      contentClassName="max-w-180"
    >
      {group ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Metric label={t("METRIC_AI_REQUESTS")} value={number.format(group.requests)} />
            <Metric label={t("METRIC_ERROR_RATE")} value={percent.format(group.errorRate)} />
            <Metric
              label={t("AI_USAGE_AVG_LATENCY")}
              value={`${number.format(group.avgLatencyMs)} ms`}
            />
            <Metric label={t("METRIC_PROMPT_TOKENS")} value={number.format(group.promptTokens)} />
            <Metric
              label={t("METRIC_COMPLETION_TOKENS")}
              value={number.format(group.completionTokens)}
            />
            <Metric
              label={t("METRIC_AI_COST")}
              value={money.format(group.costMicros / 1_000_000)}
            />
          </div>
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-caption text-label-secondary">{t("AUDIT_REQUEST_LAST_SEEN")}</div>
            <div className="mt-1 text-footnote">{dateTime.formatDateTime(group.lastSeenAt)}</div>
          </div>
        </div>
      ) : null}
    </SettingDialog>
  );
}

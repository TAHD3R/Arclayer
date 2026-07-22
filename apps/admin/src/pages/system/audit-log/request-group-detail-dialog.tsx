import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { HTTPRequestGroupWithPercentiles } from "@/api/platform-observability";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import { SettingDialog } from "@arclayer/ui/setting-dialog";

function Metric(props: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="text-caption text-label-secondary">{props.label}</div>
      <div className="mt-1 font-mono text-title3 font-semibold tabular-nums">{props.value}</div>
    </div>
  );
}

export function RequestGroupDetailDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: HTTPRequestGroupWithPercentiles | null;
}) {
  const { t, i18n } = useTranslation("platform");
  const dateTime = useAdminDateTimeFormatter({ workspaceId: null });
  const number = useMemo(
    () => new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language),
    [i18n.language, i18n.resolvedLanguage],
  );
  const percent = useMemo(
    () =>
      new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language, {
        style: "percent",
        maximumFractionDigits: 2,
      }),
    [i18n.language, i18n.resolvedLanguage],
  );
  const group = props.group;
  const latency = (value: number | null) => (value === null ? "—" : `${number.format(value)} ms`);

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t("AUDIT_REQUEST_GROUP_DETAIL_TITLE")}
      description={group ? `${group.method} ${group.routeTemplate}` : undefined}
      contentClassName="max-w-180"
    >
      {group ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Metric label={t("METRIC_HTTP_REQUESTS")} value={number.format(group.requests)} />
            <Metric label={t("METRIC_ERROR_RATE")} value={percent.format(group.errorRate)} />
            <Metric
              label={t("METRIC_HTTP_AVG_LATENCY")}
              value={`${number.format(group.avgLatencyMs)} ms`}
            />
            <Metric label={t("METRIC_HTTP_P95_LATENCY")} value={latency(group.p95LatencyMs)} />
            <Metric label={t("METRIC_HTTP_P99_LATENCY")} value={latency(group.p99LatencyMs)} />
            <Metric
              label={t("METRIC_HTTP_MAX_LATENCY")}
              value={`${number.format(group.maxLatencyMs)} ms`}
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

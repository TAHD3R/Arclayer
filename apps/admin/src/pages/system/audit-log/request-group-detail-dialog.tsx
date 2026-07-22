import { Activity, Copy, Gauge, Network, TriangleAlert } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { HTTPRequestGroupWithPercentiles } from "@/api/platform-observability";
import { BaseTag } from "@/components/ui/tags";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { Button } from "@arclayer/ui/button";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@arclayer/ui/drawer";

function Metric(props: { label: string; value: string; supporting?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border p-3">
      <div className="text-caption text-label-tertiary">{props.label}</div>
      <div className="mt-1 font-mono text-title3 font-semibold tabular-nums text-label-primary">
        {props.value}
      </div>
      {props.supporting ? (
        <div className="mt-1 text-caption text-label-secondary">{props.supporting}</div>
      ) : null}
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
  const latency = (value: number | null) =>
    value === null ? t("AUDIT_VALUE_UNAVAILABLE") : `${number.format(value)} ms`;
  const tailRatio =
    group?.p99LatencyMs && group.avgLatencyMs > 0 ? group.p99LatencyMs / group.avgLatencyMs : null;
  const copyRoute = async () => {
    if (!group) return;
    try {
      await navigator.clipboard.writeText(group.routeTemplate);
      notifySuccessText(t("AUDIT_ROUTE_COPIED"));
    } catch (error) {
      notifyError(error);
    }
  };

  return (
    <Drawer open={props.open} onOpenChange={props.onOpenChange} direction="right">
      <DrawerContent className="w-full sm:max-w-2xl">
        <DrawerHeader className="max-w-none gap-1 px-5 py-4 pr-12">
          <DrawerTitle>{t("AUDIT_REQUEST_GROUP_DETAIL_TITLE")}</DrawerTitle>
          <DrawerDescription>
            {group ? `${group.method} ${group.routeTemplate}` : null}
          </DrawerDescription>
        </DrawerHeader>
        <DrawerBody className="max-w-none space-y-5 overflow-y-auto px-5 py-5">
          {group ? (
            <>
              <section className="rounded-lg border border-border bg-muted/20 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <BaseTag>{group.method}</BaseTag>
                  <BaseTag
                    color={
                      group.statusClass >= 5 ? "red" : group.statusClass === 4 ? "gold" : "green"
                    }
                  >
                    {group.statusClass ? `${group.statusClass}xx` : t("AUDIT_REQUEST_INTERRUPTED")}
                  </BaseTag>
                </div>
                <code className="mt-3 block break-all text-footnote text-label-primary">
                  {group.routeTemplate}
                </code>
                <p className="mt-3 text-footnote leading-relaxed text-label-secondary">
                  {t("AUDIT_GROUP_NARRATIVE", {
                    requests: number.format(group.requests),
                    errors: number.format(group.errorRequests),
                    errorRate: percent.format(group.errorRate),
                  })}
                </p>
              </section>

              <section>
                <div className="flex items-center gap-2">
                  <Gauge className="size-4 text-label-tertiary" />
                  <h3 className="text-footnote font-semibold text-label-primary">
                    {t("AUDIT_LATENCY_DISTRIBUTION_TITLE")}
                  </h3>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Metric
                    label={t("METRIC_HTTP_AVG_LATENCY")}
                    value={`${number.format(group.avgLatencyMs)} ms`}
                  />
                  <Metric
                    label={t("METRIC_HTTP_P95_LATENCY")}
                    value={latency(group.p95LatencyMs)}
                    supporting={t("AUDIT_P95_EXPLANATION")}
                  />
                  <Metric
                    label={t("METRIC_HTTP_P99_LATENCY")}
                    value={latency(group.p99LatencyMs)}
                    supporting={t("AUDIT_P99_EXPLANATION")}
                  />
                  <Metric
                    label={t("METRIC_HTTP_MAX_LATENCY")}
                    value={`${number.format(group.maxLatencyMs)} ms`}
                  />
                  <Metric
                    label={t("AUDIT_TAIL_AMPLIFICATION")}
                    value={
                      tailRatio === null
                        ? t("AUDIT_VALUE_UNAVAILABLE")
                        : `${number.format(tailRatio)}×`
                    }
                    supporting={t("AUDIT_TAIL_AMPLIFICATION_EXPLANATION")}
                  />
                  <Metric
                    label={t("AUDIT_REQUEST_LAST_SEEN")}
                    value={dateTime.formatDateTime(group.lastSeenAt)}
                  />
                </div>
              </section>

              <section className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-border p-4">
                  <div className="flex items-center gap-2">
                    <Network className="size-4 text-label-tertiary" />
                    <h3 className="text-footnote font-semibold">
                      {t("AUDIT_TRAFFIC_PROFILE_TITLE")}
                    </h3>
                  </div>
                  <dl className="mt-3 space-y-2 text-footnote">
                    <div className="flex justify-between gap-4">
                      <dt className="text-label-secondary">{t("METRIC_HTTP_REQUESTS")}</dt>
                      <dd className="font-mono tabular-nums">{number.format(group.requests)}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-label-secondary">{t("AUDIT_ERROR_REQUESTS")}</dt>
                      <dd className="font-mono tabular-nums">
                        {number.format(group.errorRequests)}
                      </dd>
                    </div>
                  </dl>
                </div>
                <div className="rounded-lg border border-border p-4">
                  <div className="flex items-center gap-2">
                    <TriangleAlert className="size-4 text-label-tertiary" />
                    <h3 className="text-footnote font-semibold">
                      {t("AUDIT_RELIABILITY_SIGNAL_TITLE")}
                    </h3>
                  </div>
                  <p className="mt-3 text-footnote leading-relaxed text-label-secondary">
                    {group.errorRequests
                      ? t("AUDIT_RELIABILITY_ERRORS_DETECTED", {
                          rate: percent.format(group.errorRate),
                        })
                      : t("AUDIT_RELIABILITY_NO_ERRORS")}
                  </p>
                </div>
              </section>
            </>
          ) : null}
        </DrawerBody>
        {group ? (
          <DrawerFooter className="max-w-none flex-row items-center justify-between px-5">
            <span className="flex items-center gap-2 text-caption text-label-secondary">
              <Activity className="size-3.5" />
              {t("AUDIT_GROUP_PERCENTILE_SOURCE")}
            </span>
            <Button type="button" variant="outline" onClick={() => void copyRoute()}>
              <Copy className="size-4" />
              {t("AUDIT_COPY_ROUTE")}
            </Button>
          </DrawerFooter>
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}

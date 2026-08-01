import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { formatDate, formatNumber } from "@/monitoring/format";
import { getActivityTrend } from "@/monitoring/monitoring-api";
import {
  MonitoringPage,
  MonitoringQueryState,
  useMonitoringQuery,
} from "@/monitoring/monitoring-ui";
import { Button } from "@arclayer/ui/button";
import { ChartTooltip, Grid, Line, LineChart, XAxis } from "@arclayer/ui/chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@arclayer/ui/table";

export function MonitoringActivityPage() {
  const { t } = useTranslation("monitoring");
  const load = useCallback(() => getActivityTrend({ days: 30, metric: "auditEvents" }), []);
  const { state, retry } = useMonitoringQuery(load, []);
  return (
    <MonitoringPage description={t("ACTIVITY_DESCRIPTION")} title={t("ACTIVITY_TITLE")}>
      <MonitoringQueryState
        isEmpty={(data) => data.points.length === 0}
        retry={retry}
        state={state}
      >
        {(data) => {
          const total = Number(data.total);
          const average = data.points.length ? total / data.points.length : 0;
          const peak = Math.max(...data.points.map((point) => Number(point.value)));
          const chartData = data.points.map((point) => ({
            date: point.date,
            value: Number(point.value),
          }));
          return (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <ActivityMetric label={t("ACTIVITY_TOTAL")} value={formatNumber(total)} />
                <ActivityMetric
                  label={t("ACTIVITY_DAILY_AVERAGE")}
                  value={formatNumber(Math.round(average))}
                />
                <ActivityMetric label={t("ACTIVITY_PEAK_DAY")} value={formatNumber(peak)} />
              </div>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
                <section className="rounded-xl border bg-card p-4 shadow-xs">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-headline">{t("ACTIVITY_CHART_TITLE")}</h2>
                      <p className="mt-1 text-footnote text-label-secondary">
                        {t("ACTIVITY_CHART_DESCRIPTION")}
                      </p>
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <Link to="/monitoring/audit">
                        {t("VIEW_AUDIT")}
                        <ArrowRight aria-hidden="true" />
                      </Link>
                    </Button>
                  </div>
                  <div aria-label={t("ACTIVITY_CHART_ACCESSIBLE_LABEL")} role="img">
                    <LineChart
                      aspectRatio="3 / 1"
                      data={chartData}
                      margin={{ top: 16, right: 16, bottom: 36, left: 16 }}
                    >
                      <Grid horizontal vertical={false} />
                      <XAxis numTicks={5} />
                      <Line dataKey="value" showMarkers stroke="var(--chart-line-primary)" />
                      <ChartTooltip
                        rows={(point) => [
                          {
                            color: "var(--chart-line-primary)",
                            label: t("ACTIVITY_EVENTS"),
                            value: formatNumber(Number(point.value)),
                          },
                        ]}
                      />
                    </LineChart>
                  </div>
                </section>
                <section className="rounded-xl border bg-card shadow-xs">
                  <div className="border-b px-4 py-3">
                    <h2 className="font-semibold">{t("ACTIVITY_EXACT_VALUES")}</h2>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("DATE")}</TableHead>
                          <TableHead>{t("ACTIVITY_EVENTS")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.points.map((point) => (
                          <TableRow key={point.date}>
                            <TableCell>{formatDate(point.date)}</TableCell>
                            <TableCell>{formatNumber(Number(point.value))}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </section>
              </div>
            </div>
          );
        }}
      </MonitoringQueryState>
    </MonitoringPage>
  );
}

function ActivityMetric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3 shadow-xs">
      <p className="text-footnote text-label-secondary">{label}</p>
      <p className="mt-1 text-title font-semibold tabular-nums">{value}</p>
    </div>
  );
}

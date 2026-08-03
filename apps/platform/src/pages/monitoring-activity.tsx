import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { CartesianGrid, Line, LineChart, XAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatDate, formatNumber } from "@/monitoring/format";
import { getActivityTrend } from "@/monitoring/monitoring-api";
import {
  MonitoringPage,
  MonitoringQueryState,
  useMonitoringQuery,
} from "@/monitoring/monitoring-ui";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
          const chartConfig = {
            value: {
              label: t("ACTIVITY_EVENTS"),
              color: "var(--chart-1)",
            },
          } satisfies ChartConfig;
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
                      <h2 className="text-base">{t("ACTIVITY_CHART_TITLE")}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
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
                    <ChartContainer className="h-72 w-full" config={chartConfig}>
                      <LineChart data={chartData} margin={{ left: 12, right: 12 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis
                          axisLine={false}
                          dataKey="date"
                          minTickGap={32}
                          tickFormatter={formatDate}
                          tickLine={false}
                        />
                        <ChartTooltip
                          content={
                            <ChartTooltipContent
                              formatter={(value) => formatNumber(Number(value))}
                            />
                          }
                        />
                        <Line
                          dataKey="value"
                          dot={{ fill: "var(--color-value)" }}
                          stroke="var(--color-value)"
                          strokeWidth={2}
                          type="monotone"
                        />
                      </LineChart>
                    </ChartContainer>
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
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { ObservabilityTrendPoint } from "@/api/platform-observability";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { Button } from "@arclayer/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@arclayer/ui/card";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  XAxis,
  YAxis,
  type ChartConfig,
} from "@arclayer/ui/chart";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@arclayer/ui/empty";
import { Skeleton } from "@arclayer/ui/skeleton";

import { formatTrendValue } from "../formatters";

export type TrendValueKind = "count" | "latency" | "cost";

export function ObservabilityTrendCard(props: {
  title: string;
  description: string;
  points?: ObservabilityTrendPoint[];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  valueKind: TrendValueKind;
  color?: string;
}) {
  const { t, i18n } = useTranslation("platform");
  const prefersReducedMotion = usePrefersReducedMotion();
  const locale = i18n.resolvedLanguage;
  const color = props.color ?? "var(--primary)";
  const config = useMemo<ChartConfig>(
    () => ({ value: { label: props.title, color } }),
    [color, props.title],
  );
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" }),
    [locale],
  );

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-title3">{props.title}</CardTitle>
        <CardDescription>{props.description}</CardDescription>
      </CardHeader>
      <CardContent>
        {props.loading ? (
          <Skeleton className="h-64 w-full rounded-lg" />
        ) : props.error ? (
          <Empty className="min-h-64 border-0 p-4">
            <EmptyHeader>
              <EmptyTitle>{t("common:REQUEST_FAILED")}</EmptyTitle>
              <EmptyDescription>{t("common:PAGE_SERVER_ERROR_DESC")}</EmptyDescription>
            </EmptyHeader>
            <Button size="sm" variant="outline" onClick={props.onRetry}>
              {t("common:RETRY")}
            </Button>
          </Empty>
        ) : !props.points?.length ? (
          <Empty className="min-h-64 border-0 p-4">
            <EmptyHeader>
              <EmptyTitle>{t("TREND_EMPTY_TITLE")}</EmptyTitle>
              <EmptyDescription>{t("TREND_EMPTY_DESCRIPTION")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <ChartContainer
              config={config}
              className="h-64 w-full aspect-auto"
              role="img"
              aria-label={props.title}
            >
              <AreaChart accessibilityLayer data={props.points} margin={{ left: 4, right: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  minTickGap={28}
                  tickFormatter={(value) =>
                    dateFormatter.format(new Date(`${String(value)}T00:00:00Z`))
                  }
                />
                <YAxis
                  width={52}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) =>
                    formatTrendValue({ value: Number(value), kind: props.valueKind, locale })
                  }
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(_label, payload) => {
                        const date = payload[0]?.payload?.date;
                        return typeof date === "string"
                          ? dateFormatter.format(new Date(`${date}T00:00:00Z`))
                          : props.title;
                      }}
                      formatter={(value) => (
                        <div className="flex min-w-40 items-center justify-between gap-4">
                          <span className="text-label-secondary">{props.title}</span>
                          <span className="font-mono font-medium tabular-nums text-label-primary">
                            {formatTrendValue({
                              value: Number(value ?? 0),
                              kind: props.valueKind,
                              locale,
                            })}
                          </span>
                        </div>
                      )}
                    />
                  }
                />
                <Area
                  dataKey="value"
                  type="monotone"
                  fill="var(--color-value)"
                  fillOpacity={0.12}
                  stroke="var(--color-value)"
                  strokeWidth={2}
                  isAnimationActive={!prefersReducedMotion}
                  animationDuration={180}
                />
              </AreaChart>
            </ChartContainer>
            <table className="sr-only">
              <caption>{t("TREND_TABLE_CAPTION", { title: props.title })}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("TREND_TABLE_DATE")}</th>
                  <th scope="col">{t("TREND_TABLE_VALUE")}</th>
                </tr>
              </thead>
              <tbody>
                {props.points.map((point) => (
                  <tr key={point.date}>
                    <td>{dateFormatter.format(new Date(`${point.date}T00:00:00Z`))}</td>
                    <td>
                      {formatTrendValue({
                        value: Number(point.value),
                        kind: props.valueKind,
                        locale,
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </CardContent>
    </Card>
  );
}

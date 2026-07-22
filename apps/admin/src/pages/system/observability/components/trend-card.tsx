import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ObservabilityTrendPoint } from "@/api/platform-observability";
import { Button } from "@arclayer/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@arclayer/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@arclayer/ui/empty";
import { Skeleton } from "@arclayer/ui/skeleton";

import { formatTrendValue } from "../formatters";
import { BklitTrendChart } from "./bklit-trend-chart";
import { TrendDetailDrawer } from "./trend-detail-drawer";

export type TrendValueKind = "count" | "latency" | "cost";

export function ObservabilityTrendCard(props: {
  title: string;
  description: string;
  points?: ObservabilityTrendPoint[];
  expectedBucketCount?: number;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  valueKind: TrendValueKind;
  color?: string;
}) {
  const { t, i18n } = useTranslation("platform");
  const [selectedPoint, setSelectedPoint] = useState<ObservabilityTrendPoint | null>(null);
  const locale = i18n.resolvedLanguage;
  const color = props.color ?? "var(--primary)";
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" }),
    [locale],
  );

  return (
    <>
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
              <BklitTrendChart
                points={props.points}
                title={`${props.title}. ${t("TREND_OPEN_DETAIL")}`}
                color={color}
                formatValue={(value) => formatTrendValue({ value, kind: props.valueKind, locale })}
                onSelectPoint={setSelectedPoint}
              />
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
                        <button type="button" onClick={() => setSelectedPoint(point)}>
                          {formatTrendValue({
                            value: Number(point.value),
                            kind: props.valueKind,
                            locale,
                          })}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </CardContent>
      </Card>
      <TrendDetailDrawer
        open={selectedPoint !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedPoint(null);
        }}
        title={props.title}
        periodLabel={props.description}
        points={props.points ?? []}
        expectedBucketCount={props.expectedBucketCount}
        selectedPoint={selectedPoint}
        valueKind={props.valueKind}
        onSelectPoint={setSelectedPoint}
      />
    </>
  );
}

import { ArrowDownRight, ArrowUpRight, CalendarRange, ChartNoAxesCombined } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { ObservabilityTrendPoint } from "@/api/platform-observability";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@arclayer/ui/drawer";

import { formatTrendValue } from "../formatters";
import type { TrendValueKind } from "./trend-card";

type TrendSummary = Readonly<{
  index: number;
  previous: ObservabilityTrendPoint | null;
  change: number | null;
  percentChange: number | null;
  average: number;
  minimum: number;
  maximum: number;
  total: number;
  rank: number;
  expectedBuckets: number;
}>;

function summarizeTrend(
  points: readonly ObservabilityTrendPoint[],
  selected: ObservabilityTrendPoint,
  expectedBucketCount?: number,
): TrendSummary {
  const index = points.findIndex((point) => point.date === selected.date);
  const values = points.map((point) => Number(point.value));
  const selectedValue = Number(selected.value);
  const previous = index > 0 ? points[index - 1] : null;
  const change = previous ? selectedValue - Number(previous.value) : null;
  const percentChange =
    previous && Number(previous.value) !== 0 ? change! / Math.abs(Number(previous.value)) : null;
  const start = Date.parse(`${points[0]?.date}T00:00:00Z`);
  const end = Date.parse(`${points.at(-1)?.date}T00:00:00Z`);
  const observedRangeBuckets =
    Number.isFinite(start) && Number.isFinite(end)
      ? Math.max(1, Math.round((end - start) / 86_400_000) + 1)
      : points.length;
  const expectedBuckets = Math.max(points.length, expectedBucketCount ?? observedRangeBuckets);

  return {
    index,
    previous,
    change,
    percentChange,
    average: values.reduce((sum, value) => sum + value, 0) / values.length,
    minimum: Math.min(...values),
    maximum: Math.max(...values),
    total: values.reduce((sum, value) => sum + value, 0),
    rank: values.filter((value) => value > selectedValue).length + 1,
    expectedBuckets,
  };
}

function nearbyPoints(points: readonly ObservabilityTrendPoint[], selectedIndex: number) {
  const windowSize = 5;
  const start = Math.max(0, Math.min(selectedIndex - 2, points.length - windowSize));
  return points.slice(start, start + windowSize);
}

function DetailFact(props: { label: string; value: string; primary?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-label-tertiary">{props.label}</dt>
      <dd
        className={
          props.primary
            ? "mt-1 truncate font-mono text-title2 font-semibold tabular-nums text-label-primary"
            : "mt-1 truncate font-mono text-body font-medium tabular-nums text-label-primary"
        }
      >
        {props.value}
      </dd>
    </div>
  );
}

export function TrendDetailDrawer(props: {
  title: string;
  periodLabel: string;
  points: readonly ObservabilityTrendPoint[];
  expectedBucketCount?: number;
  selectedPoint: ObservabilityTrendPoint | null;
  valueKind: TrendValueKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectPoint: (point: ObservabilityTrendPoint) => void;
}) {
  const { t, i18n } = useTranslation("platform");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const selectedPoint = props.selectedPoint;
  const summary = useMemo(
    () =>
      selectedPoint ? summarizeTrend(props.points, selectedPoint, props.expectedBucketCount) : null,
    [props.expectedBucketCount, props.points, selectedPoint],
  );
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }),
    [locale],
  );
  const percentFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: "percent",
        maximumFractionDigits: 1,
        signDisplay: "exceptZero",
      }),
    [locale],
  );
  const format = (value: number) => formatTrendValue({ value, kind: props.valueKind, locale });
  const selectedValue = selectedPoint ? Number(selectedPoint.value) : 0;
  const deviation = summary?.average
    ? (selectedValue - summary.average) / Math.abs(summary.average)
    : 0;
  const localPoints = summary ? nearbyPoints(props.points, summary.index) : [];
  const localMaximum = Math.max(...localPoints.map((point) => Math.abs(Number(point.value))), 1);

  return (
    <Drawer open={props.open} onOpenChange={props.onOpenChange} direction="right">
      <DrawerContent className="w-full sm:max-w-xl">
        <DrawerHeader className="max-w-none gap-1 px-5 py-4 pr-12">
          <DrawerTitle>{props.title}</DrawerTitle>
          <DrawerDescription>
            {selectedPoint
              ? t("TREND_DETAIL_DESCRIPTION", {
                  date: dateFormatter.format(new Date(`${selectedPoint.date}T00:00:00Z`)),
                })
              : props.periodLabel}
          </DrawerDescription>
        </DrawerHeader>
        <DrawerBody className="max-w-none space-y-6 overflow-y-auto px-5 py-5">
          {selectedPoint && summary ? (
            <>
              <section className="rounded-lg border bg-muted/20 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-caption text-label-tertiary">
                      {t("TREND_DETAIL_SELECTED_VALUE")}
                    </p>
                    <p className="mt-1 truncate font-mono text-title1 font-semibold tabular-nums text-label-primary">
                      {format(selectedValue)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 text-footnote text-label-secondary">
                    {summary.change !== null && summary.change > 0 ? (
                      <ArrowUpRight className="size-4" />
                    ) : summary.change !== null && summary.change < 0 ? (
                      <ArrowDownRight className="size-4" />
                    ) : null}
                    <span className="font-mono tabular-nums">
                      {summary.percentChange === null
                        ? summary.previous
                          ? t("TREND_DETAIL_ZERO_BASELINE")
                          : t("TREND_DETAIL_NO_BASELINE")
                        : percentFormatter.format(summary.percentChange)}
                    </span>
                  </div>
                </div>
                <p className="mt-3 text-footnote leading-relaxed text-label-secondary">
                  {deviation > 0
                    ? t("TREND_DETAIL_ABOVE_AVERAGE", {
                        value: percentFormatter.format(Math.abs(deviation)),
                      })
                    : deviation < 0
                      ? t("TREND_DETAIL_BELOW_AVERAGE", {
                          value: percentFormatter.format(Math.abs(deviation)),
                        })
                      : t("TREND_DETAIL_AT_AVERAGE")}
                </p>
                <dl className="mt-4 grid grid-cols-2 gap-4 border-t pt-4">
                  <DetailFact
                    label={t("TREND_DETAIL_PREVIOUS_VALUE")}
                    value={
                      summary.previous
                        ? format(Number(summary.previous.value))
                        : t("TREND_DETAIL_NO_BASELINE")
                    }
                  />
                  <DetailFact
                    label={t("TREND_DETAIL_CHANGE")}
                    value={
                      summary.change === null
                        ? t("TREND_DETAIL_NO_BASELINE")
                        : format(summary.change)
                    }
                  />
                </dl>
              </section>

              <section>
                <div className="flex items-center gap-2">
                  <ChartNoAxesCombined className="size-4 text-label-tertiary" />
                  <h3 className="text-footnote font-semibold text-label-primary">
                    {t("TREND_DETAIL_NEARBY_POINTS")}
                  </h3>
                </div>
                <div className="mt-3 divide-y rounded-lg border">
                  {localPoints.map((point) => {
                    const active = point.date === selectedPoint.date;
                    const width = `${Math.max(3, (Math.abs(Number(point.value)) / localMaximum) * 100)}%`;
                    return (
                      <button
                        key={point.date}
                        type="button"
                        aria-pressed={active}
                        onClick={() => props.onSelectPoint(point)}
                        className="grid w-full grid-cols-[6rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 text-left transition-colors duration-100 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      >
                        <span className="text-caption text-label-secondary">
                          {dateFormatter.format(new Date(`${point.date}T00:00:00Z`))}
                        </span>
                        <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <span
                            className={
                              active ? "block h-full bg-primary" : "block h-full bg-border"
                            }
                            style={{ width }}
                          />
                        </span>
                        <span className="font-mono text-footnote tabular-nums text-label-primary">
                          {format(Number(point.value))}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section>
                <div className="flex items-center gap-2">
                  <CalendarRange className="size-4 text-label-tertiary" />
                  <h3 className="text-footnote font-semibold text-label-primary">
                    {t("TREND_DETAIL_PERIOD_SUMMARY")}
                  </h3>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-5 rounded-lg border p-4">
                  <DetailFact label={t("TREND_DETAIL_AVERAGE")} value={format(summary.average)} />
                  <DetailFact
                    label={t("TREND_DETAIL_RANK")}
                    value={t("TREND_DETAIL_RANK_VALUE", {
                      current: summary.rank,
                      total: props.points.length,
                    })}
                  />
                  <DetailFact label={t("TREND_DETAIL_MINIMUM")} value={format(summary.minimum)} />
                  <DetailFact label={t("TREND_DETAIL_MAXIMUM")} value={format(summary.maximum)} />
                  {props.valueKind !== "latency" ? (
                    <DetailFact label={t("TREND_DETAIL_TOTAL")} value={format(summary.total)} />
                  ) : null}
                  <DetailFact
                    label={t("TREND_DETAIL_COVERAGE")}
                    value={t("TREND_DETAIL_COVERAGE_VALUE", {
                      current: props.points.length,
                      total: summary.expectedBuckets,
                    })}
                  />
                </dl>
                <p className="mt-3 text-caption leading-relaxed text-label-tertiary">
                  {t("TREND_DETAIL_PERIOD_CONTEXT", { period: props.periodLabel })}
                </p>
              </section>
            </>
          ) : null}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}

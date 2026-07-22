import { useMemo } from "react";

import { Area, AreaChart } from "@/components/charts/area-chart";
import { Grid } from "@/components/charts/grid";
import { ChartTooltip } from "@/components/charts/tooltip/chart-tooltip";
import { TooltipContent } from "@/components/charts/tooltip/tooltip-content";
import { XAxis } from "@/components/charts/x-axis";
import type { ObservabilityTrendPoint } from "@/api/platform-observability";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

type BklitTrendChartProps = Readonly<{
  points: readonly ObservabilityTrendPoint[];
  title: string;
  color: string;
  formatValue: (value: number) => string;
  onSelectPoint: (point: ObservabilityTrendPoint) => void;
}>;

export function BklitTrendChart(props: BklitTrendChartProps) {
  const reduceMotion = usePrefersReducedMotion();
  const chartData = useMemo(
    () =>
      props.points.map((point) => ({
        date: new Date(`${point.date}T00:00:00Z`),
        value: point.value,
      })),
    [props.points],
  );

  return (
    <div
      className="h-64 min-h-0 min-w-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      role="button"
      tabIndex={0}
      aria-label={props.title}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        const latestPoint = props.points.at(-1);
        if (latestPoint) props.onSelectPoint(latestPoint);
      }}
    >
      <AreaChart
        data={chartData}
        xDataKey="date"
        className="h-full min-h-0 min-w-0"
        style={{ height: "100%" }}
        margin={{ top: 12, right: 12, bottom: 28, left: 12 }}
        animationDuration={reduceMotion ? 0 : 180}
        yDomainTween={!reduceMotion}
        yDomainTweenDuration={reduceMotion ? 0 : 180}
        onPointClick={(_point, index) => {
          const selected = props.points[index];
          if (selected) props.onSelectPoint(selected);
        }}
      >
        <Grid
          horizontal
          vertical={false}
          stroke="var(--border)"
          strokeDasharray="0"
          strokeOpacity={0.65}
          hideHorizontalEdgeLines
        />
        <XAxis numTicks={5} tickMode="data" />
        <ChartTooltip
          damping={0}
          showDatePill
          content={({ point }) => (
            <TooltipContent
              title={props.title}
              rows={[
                {
                  color: props.color,
                  label: props.title,
                  value: props.formatValue(Number(point.value ?? 0)),
                },
              ]}
            />
          )}
        />
        <Area
          dataKey="value"
          fill={props.color}
          fillOpacity={0.15}
          gradientToOpacity={0}
          stroke={props.color}
          strokeWidth={2}
          animate={!reduceMotion}
          showHighlight
        />
      </AreaChart>
    </div>
  );
}

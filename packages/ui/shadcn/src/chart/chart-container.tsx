import * as React from "react";
import * as RechartsPrimitive from "recharts";

import { cn } from "@arclayer/lib/utils";

import { CHART_CONTAINER_CLASSNAME } from "./chart.constants";
import { ChartProvider } from "./chart-context";
import { ChartStyle } from "./chart-style";
import type { ChartConfig } from "./chart.types";

type ChartContainerProps = React.ComponentProps<"div"> & {
  config: ChartConfig;
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"];
};

function ChartContainer({ children, className, config, id, ...props }: ChartContainerProps) {
  const uniqueId = React.useId();
  const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`;

  return (
    <ChartProvider config={config}>
      <div
        data-chart={chartId}
        data-slot="chart"
        className={cn(CHART_CONTAINER_CLASSNAME, className)}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartProvider>
  );
}

export { ChartContainer, type ChartContainerProps };

export { ChartContainer, type ChartContainerProps } from "./chart-container";
export { ChartLegend, ChartLegendContent, type ChartLegendContentProps } from "./chart-legend";
export { ChartStyle } from "./chart-style";
export { ChartTooltip, ChartTooltipContent, type ChartTooltipContentProps } from "./chart-tooltip";
export type { ChartConfig } from "./chart.types";

// Feature packages consume chart primitives through this boundary so Recharts
// remains an implementation detail of @arclayer/ui and all charts share the
// same container, tooltip, legend, and accessibility contract.
export {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

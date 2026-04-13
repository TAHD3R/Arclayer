import type * as React from "react";

import { CHART_THEMES } from "./chart.constants";

export type ChartConfig = {
  [key: string]: {
    label?: React.ReactNode;
    icon?: React.ComponentType;
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<keyof typeof CHART_THEMES, string> }
  );
};

export type ChartContextValue = {
  config: ChartConfig;
};

export type ChartPayload = Record<string, unknown> & {
  fill?: string;
};

export type ChartPayloadItem = {
  color?: string;
  dataKey?: string;
  name?: string;
  payload?: ChartPayload;
  type?: string;
  value?: number | string;
};

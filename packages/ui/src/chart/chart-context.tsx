import * as React from "react";

import type { ChartContextValue } from "./chart.types";

const ChartContext = React.createContext<ChartContextValue | null>(null);

function ChartProvider({ children, config }: React.PropsWithChildren<ChartContextValue>) {
  return <ChartContext.Provider value={{ config }}>{children}</ChartContext.Provider>;
}

function useChart() {
  const context = React.useContext(ChartContext);

  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />");
  }

  return context;
}

export { ChartProvider, useChart };

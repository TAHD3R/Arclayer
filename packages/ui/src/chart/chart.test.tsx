import { describe, expect, it } from "vitest";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  ChartTooltip,
  ChartTooltipContent,
  Grid,
  Line,
  LineChart,
  XAxis,
} from "./index";

describe("Bklit chart exports", () => {
  it("exposes every reviewed chart primitive through the shared package boundary", () => {
    expect(AreaChart).toBeTypeOf("function");
    expect(Area).toBeTypeOf("function");
    expect(LineChart).toBeTypeOf("function");
    expect(Line).toBeTypeOf("function");
    expect(BarChart).toBeTypeOf("function");
    expect(Bar).toBeTypeOf("function");
    expect(Grid).toBeTypeOf("function");
    expect(XAxis).toBeTypeOf("function");
    expect(ChartTooltip).toBeTypeOf("function");
    expect(ChartTooltipContent).toBeTypeOf("function");
  });
});

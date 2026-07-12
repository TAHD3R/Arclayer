import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");

  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

import {
  Area,
  AreaChart,
  ChartContainer,
  ChartLegendContent,
  ChartStyle,
  ChartTooltip,
  ChartTooltipContent,
} from "./index";
import type { ChartConfig } from "./index";

const chartConfig = {
  desktop: {
    label: "Desktop",
    color: "#123456",
  },
  mobile: {
    label: "Mobile",
    theme: {
      light: "#abcdef",
      dark: "#fedcba",
    },
  },
} satisfies ChartConfig;

describe("chart exports", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("exports the public chart API", () => {
    expect(ChartContainer).toBeTypeOf("function");
    expect(ChartTooltip).toBeTruthy();
    expect(ChartTooltipContent).toBeTypeOf("function");
    expect(ChartLegendContent).toBeTypeOf("function");
    expect(ChartStyle).toBeTypeOf("function");
    expect(Area).toBeTruthy();
    expect(AreaChart).toBeTruthy();
  });

  it("renders chart style variables for plain and themed colors", () => {
    const markup = renderToStaticMarkup(<ChartStyle id="chart-test" config={chartConfig} />);

    expect(markup).toContain("[data-chart=chart-test]");
    expect(markup).toContain("--color-desktop: #123456;");
    expect(markup).toContain("--color-mobile: #abcdef;");
    expect(markup).toContain(".dark [data-chart=chart-test]");
    expect(markup).toContain("--color-mobile: #fedcba;");
  });

  it("throws when tooltip content is rendered outside ChartContainer", () => {
    expect(() =>
      renderToStaticMarkup(
        <ChartTooltipContent
          active
          payload={[
            {
              color: "#123456",
              dataKey: "desktop",
              name: "desktop",
              payload: { desktop: 2400 },
              value: 2400,
            },
          ]}
        />,
      ),
    ).toThrow("useChart must be used within a <ChartContainer />");
  });

  it("renders legend labels from chart config", () => {
    const markup = renderToStaticMarkup(
      <ChartContainer config={chartConfig}>
        <ChartLegendContent
          payload={[
            {
              color: "#123456",
              dataKey: "desktop",
              type: "line",
              value: "desktop",
            },
          ]}
        />
      </ChartContainer>,
    );

    expect(markup).toContain("Desktop");
    expect(markup).toContain("background-color:#123456");
  });
});

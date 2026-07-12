import { CHART_THEMES } from "./chart.constants";
import type { ChartConfig } from "./chart.types";

function ChartStyle({ config, id }: { config: ChartConfig; id: string }) {
  const colorConfig = Object.entries(config).filter(
    ([, itemConfig]) => itemConfig.theme || itemConfig.color,
  );

  if (!colorConfig.length) {
    return null;
  }

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: Object.entries(CHART_THEMES)
          .map(([theme, prefix]) => {
            const cssVariables = colorConfig
              .map(([key, itemConfig]) => {
                const color =
                  itemConfig.theme?.[theme as keyof typeof itemConfig.theme] ?? itemConfig.color;
                return color ? `  --color-${key}: ${color};` : null;
              })
              .filter(Boolean)
              .join("\n");

            return `${prefix} [data-chart=${id}] {\n${cssVariables}\n}`;
          })
          .join("\n"),
      }}
    />
  );
}

export { ChartStyle };

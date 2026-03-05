import type { DataTableToolsLabels } from "@celestial/ui/data-table";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

export function buildDataTableToolsLabels(t: TranslateFn): DataTableToolsLabels {
  return {
    customize: t("common:DATA_TABLE_CUSTOMIZE"),
    customizeTitle: t("common:DATA_TABLE_CUSTOMIZE_TITLE"),
    customizeDescription: t("common:DATA_TABLE_CUSTOMIZE_DESCRIPTION"),
    columns: t("common:DATA_TABLE_COLUMNS"),
    columnsTitle: t("common:DATA_TABLE_COLUMNS_TITLE"),
    columnsDescription: t("common:DATA_TABLE_COLUMNS_DESCRIPTION"),
    density: t("common:DATA_TABLE_DENSITY"),
    densityCompact: t("common:DATA_TABLE_DENSITY_COMPACT"),
    densityDefault: t("common:DATA_TABLE_DENSITY_DEFAULT"),
    densityRelaxed: t("common:DATA_TABLE_DENSITY_RELAXED"),
    refresh: t("common:DATA_TABLE_REFRESH"),
    reset: t("common:DATA_TABLE_RESET"),
    pinLeft: t("common:DATA_TABLE_PIN_LEFT"),
    pinRight: t("common:DATA_TABLE_PIN_RIGHT"),
    pinNone: t("common:DATA_TABLE_PIN_NONE"),
    moveUp: t("common:DATA_TABLE_MOVE_UP"),
    moveDown: t("common:DATA_TABLE_MOVE_DOWN"),
    drag: t("common:DATA_TABLE_DRAG"),
  };
}

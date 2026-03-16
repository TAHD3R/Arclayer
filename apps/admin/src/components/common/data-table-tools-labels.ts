import type { DataTableToolsLabels } from "@arclayer/ui/data-table";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

export function buildDataTableToolsLabels(t: TranslateFn): DataTableToolsLabels {
  return {
    viewOptions: t("common:DATA_TABLE_VIEW_OPTIONS"),
    viewOptionsTitle: t("common:DATA_TABLE_VIEW_OPTIONS_TITLE"),
    viewOptionsDescription: t("common:DATA_TABLE_VIEW_OPTIONS_DESCRIPTION"),
    tableSettings: t("common:DATA_TABLE_TABLE_SETTINGS"),
    columnsSearchPlaceholder: t("common:DATA_TABLE_COLUMNS_SEARCH_PLACEHOLDER"),
    columnsEmpty: t("common:DATA_TABLE_COLUMNS_EMPTY"),
    rowHeight: t("common:DATA_TABLE_ROW_HEIGHT"),
    rowHeightTitle: t("common:DATA_TABLE_ROW_HEIGHT_TITLE"),
    rowHeightShort: t("common:DATA_TABLE_ROW_HEIGHT_SHORT"),
    rowHeightMedium: t("common:DATA_TABLE_ROW_HEIGHT_MEDIUM"),
    rowHeightTall: t("common:DATA_TABLE_ROW_HEIGHT_TALL"),
    rowHeightExtraTall: t("common:DATA_TABLE_ROW_HEIGHT_EXTRA_TALL"),
    headerOptions: t("common:DATA_TABLE_HEADER_OPTIONS"),
    wrapHeaders: t("common:DATA_TABLE_WRAP_HEADERS"),
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
    resetColumnSize: t("common:DATA_TABLE_RESET_COLUMN_SIZE"),
    resetColumnOrder: t("common:DATA_TABLE_RESET_COLUMN_ORDER"),
    clearSelection: t("common:DATA_TABLE_CLEAR_SELECTION"),
    sortAscending: t("common:DATA_TABLE_SORT_ASCENDING"),
    sortDescending: t("common:DATA_TABLE_SORT_DESCENDING"),
    hideColumn: t("common:DATA_TABLE_HIDE_COLUMN"),
    moveUp: t("common:DATA_TABLE_MOVE_UP"),
    moveDown: t("common:DATA_TABLE_MOVE_DOWN"),
    drag: t("common:DATA_TABLE_DRAG"),
    refreshing: t("common:DATA_TABLE_REFRESHING"),
  };
}

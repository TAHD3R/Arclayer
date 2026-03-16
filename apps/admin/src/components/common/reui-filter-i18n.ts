import type { FilterI18nConfig } from "@/components/reui/filters";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

export function buildReuiFilterI18n(
  t: TranslateFn,
  addFilterLabel: string,
): Partial<FilterI18nConfig> {
  return {
    addFilter: addFilterLabel,
    addFilterTitle: addFilterLabel,
    searchFields: t("common:FILTER_SEARCH_FIELDS"),
    noFieldsFound: t("common:FILTER_NO_FIELDS_FOUND"),
    noResultsFound: t("common:FILTER_NO_RESULTS_FOUND"),
    select: t("common:FILTER_SELECT"),
    selectedCount: t("common:FILTER_SELECTED_COUNT"),
    typeAndPressEnter: t("common:FILTER_TYPE_AND_PRESS_ENTER"),
  };
}

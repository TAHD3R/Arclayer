import { DEFAULT_I18N, type FilterI18nConfig } from "@arclayer/ui/filters";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

function translateOrDefault(
  t: TranslateFn,
  key: string,
  defaultValue: string,
  options?: Record<string, unknown>,
): string {
  const translated = t(key, { ...options, defaultValue });
  return translated === key ? defaultValue : translated;
}

export function buildReuiFilterI18n(
  t: TranslateFn,
  addFilterLabel: string,
): Partial<FilterI18nConfig> {
  return {
    addFilter: addFilterLabel,
    addFilterTitle: addFilterLabel,
    searchFields: translateOrDefault(t, "common:FILTER_SEARCH_FIELDS", "Search filters"),
    noFieldsFound: translateOrDefault(t, "common:FILTER_NO_FIELDS_FOUND", "No filters found"),
    noResultsFound: translateOrDefault(t, "common:FILTER_NO_RESULTS_FOUND", "No results found"),
    select: translateOrDefault(t, "common:FILTER_SELECT", "Select..."),
    selectedCount: translateOrDefault(t, "common:FILTER_SELECTED_COUNT", "selected"),
    typeAndPressEnter: translateOrDefault(
      t,
      "common:FILTER_TYPE_AND_PRESS_ENTER",
      "Type and press Enter",
    ),
    operators: {
      ...DEFAULT_I18N.operators,
      is: translateOrDefault(t, "common:FILTER_OPERATOR_IS", "is"),
      contains: translateOrDefault(t, "common:FILTER_OPERATOR_CONTAINS", "contains"),
    },
    placeholders: {
      ...DEFAULT_I18N.placeholders,
      searchField: (fieldName: string) =>
        translateOrDefault(t, "common:FILTER_SEARCH_FIELD", `Search ${fieldName}`, {
          field: fieldName,
        }),
    },
  };
}

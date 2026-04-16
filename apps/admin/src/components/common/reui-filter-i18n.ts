import { DEFAULT_I18N, type FilterI18nConfig } from "@arclayer/ui/filters";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;
type FilterOperatorLabelKey = keyof FilterI18nConfig["operators"];

const FILTER_OPERATOR_LABEL_KEY_BY_VALUE = {
  is: "is",
  is_not: "isNot",
  is_any_of: "isAnyOf",
  is_not_any_of: "isNotAnyOf",
  includes_all: "includesAll",
  excludes_all: "excludesAll",
  before: "before",
  after: "after",
  between: "between",
  not_between: "notBetween",
  contains: "contains",
  not_contains: "notContains",
  starts_with: "startsWith",
  ends_with: "endsWith",
  equals: "equals",
  not_equals: "notEquals",
  greater_than: "greaterThan",
  less_than: "lessThan",
  overlaps: "overlaps",
  includes: "includes",
  excludes: "excludes",
  includes_all_of: "includesAllOf",
  includes_any_of: "includesAnyOf",
  empty: "empty",
  not_empty: "notEmpty",
} as const satisfies Record<string, FilterOperatorLabelKey>;

function translateOrDefault(
  t: TranslateFn,
  key: string,
  defaultValue: string,
  options?: Record<string, unknown>,
): string {
  const translated = t(key, { ...options, defaultValue });
  return translated === key ? defaultValue : translated;
}

function buildTranslatedOperators(t: TranslateFn): FilterI18nConfig["operators"] {
  return {
    is: translateOrDefault(t, "common:FILTER_OPERATOR_IS", DEFAULT_I18N.operators.is),
    isNot: translateOrDefault(t, "common:FILTER_OPERATOR_IS_NOT", DEFAULT_I18N.operators.isNot),
    isAnyOf: translateOrDefault(
      t,
      "common:FILTER_OPERATOR_IS_ANY_OF",
      DEFAULT_I18N.operators.isAnyOf,
    ),
    isNotAnyOf: translateOrDefault(
      t,
      "common:FILTER_OPERATOR_IS_NOT_ANY_OF",
      DEFAULT_I18N.operators.isNotAnyOf,
    ),
    includesAll: translateOrDefault(
      t,
      "common:FILTER_OPERATOR_INCLUDES_ALL",
      DEFAULT_I18N.operators.includesAll,
    ),
    excludesAll: translateOrDefault(
      t,
      "common:FILTER_OPERATOR_EXCLUDES_ALL",
      DEFAULT_I18N.operators.excludesAll,
    ),
    before: translateOrDefault(t, "common:FILTER_OPERATOR_BEFORE", DEFAULT_I18N.operators.before),
    after: translateOrDefault(t, "common:FILTER_OPERATOR_AFTER", DEFAULT_I18N.operators.after),
    between: translateOrDefault(
      t,
      "common:FILTER_OPERATOR_BETWEEN",
      DEFAULT_I18N.operators.between,
    ),
    notBetween: translateOrDefault(
      t,
      "common:FILTER_OPERATOR_NOT_BETWEEN",
      DEFAULT_I18N.operators.notBetween,
    ),
    contains: translateOrDefault(
      t,
      "common:FILTER_OPERATOR_CONTAINS",
      DEFAULT_I18N.operators.contains,
    ),
    notContains: translateOrDefault(
      t,
      "common:FILTER_OPERATOR_NOT_CONTAINS",
      DEFAULT_I18N.operators.notContains,
    ),
    startsWith: translateOrDefault(
      t,
      "common:FILTER_OPERATOR_STARTS_WITH",
      DEFAULT_I18N.operators.startsWith,
    ),
    endsWith: translateOrDefault(
      t,
      "common:FILTER_OPERATOR_ENDS_WITH",
      DEFAULT_I18N.operators.endsWith,
    ),
    isExactly: translateOrDefault(
      t,
      "common:FILTER_OPERATOR_IS_EXACTLY",
      DEFAULT_I18N.operators.isExactly,
    ),
    equals: translateOrDefault(t, "common:FILTER_OPERATOR_EQUALS", DEFAULT_I18N.operators.equals),
    notEquals: translateOrDefault(
      t,
      "common:FILTER_OPERATOR_NOT_EQUALS",
      DEFAULT_I18N.operators.notEquals,
    ),
    greaterThan: translateOrDefault(
      t,
      "common:FILTER_OPERATOR_GREATER_THAN",
      DEFAULT_I18N.operators.greaterThan,
    ),
    lessThan: translateOrDefault(
      t,
      "common:FILTER_OPERATOR_LESS_THAN",
      DEFAULT_I18N.operators.lessThan,
    ),
    overlaps: translateOrDefault(
      t,
      "common:FILTER_OPERATOR_OVERLAPS",
      DEFAULT_I18N.operators.overlaps,
    ),
    includes: translateOrDefault(
      t,
      "common:FILTER_OPERATOR_INCLUDES",
      DEFAULT_I18N.operators.includes,
    ),
    excludes: translateOrDefault(
      t,
      "common:FILTER_OPERATOR_EXCLUDES",
      DEFAULT_I18N.operators.excludes,
    ),
    includesAllOf: translateOrDefault(
      t,
      "common:FILTER_OPERATOR_INCLUDES_ALL_OF",
      DEFAULT_I18N.operators.includesAllOf,
    ),
    includesAnyOf: translateOrDefault(
      t,
      "common:FILTER_OPERATOR_INCLUDES_ANY_OF",
      DEFAULT_I18N.operators.includesAnyOf,
    ),
    empty: translateOrDefault(t, "common:FILTER_OPERATOR_EMPTY", DEFAULT_I18N.operators.empty),
    notEmpty: translateOrDefault(
      t,
      "common:FILTER_OPERATOR_NOT_EMPTY",
      DEFAULT_I18N.operators.notEmpty,
    ),
  };
}

export function resolveReuiFilterOperatorLabel(
  i18n: Partial<FilterI18nConfig> | undefined,
  operator: string,
): string {
  const operatorLabelKey =
    FILTER_OPERATOR_LABEL_KEY_BY_VALUE[operator as keyof typeof FILTER_OPERATOR_LABEL_KEY_BY_VALUE];
  if (!operatorLabelKey) {
    return operator.replace(/_/g, " ");
  }
  return i18n?.operators?.[operatorLabelKey] ?? DEFAULT_I18N.operators[operatorLabelKey];
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
    operators: buildTranslatedOperators(t),
    placeholders: {
      ...DEFAULT_I18N.placeholders,
      searchField: (fieldName: string) =>
        translateOrDefault(t, "common:FILTER_SEARCH_FIELD", `Search ${fieldName}`, {
          field: fieldName,
        }),
    },
  };
}

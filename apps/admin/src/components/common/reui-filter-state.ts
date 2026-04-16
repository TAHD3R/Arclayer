import { createFilter, type Filter, type FilterI18nConfig } from "@arclayer/ui/filters";

import { resolveReuiFilterOperatorLabel } from "./reui-filter-i18n";

export type OperatorAwareFieldFilter<TField extends string = string, TValue = string> = {
  field: TField;
  operator: string;
  values: TValue[];
};

export type OperatorAwareFilterState<TField extends string = string, TValue = string> = Partial<
  Record<TField, { operator: string; values: TValue[] }>
>;

type OperatorAwareFilterSummaryOptions<TValue> = {
  i18n?: Partial<FilterI18nConfig>;
  maxValues?: number;
  valueFormatter?: (value: TValue) => string | undefined;
};

function defaultValueFormatter(value: unknown): string | undefined {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized || undefined;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value == null) {
    return undefined;
  }
  const normalized = String(value).trim();
  return normalized || undefined;
}

export function buildOperatorAwareFilterState<TField extends string, TValue>(
  filters: readonly Filter<TValue>[],
): OperatorAwareFilterState<TField, TValue> {
  const next = {} as OperatorAwareFilterState<TField, TValue>;

  for (const filter of filters) {
    next[filter.field as TField] = {
      operator: filter.operator,
      values: [...filter.values],
    };
  }

  return next;
}

export function buildFiltersFromOperatorAwareState<TField extends string, TValue>(
  state: OperatorAwareFilterState<TField, TValue>,
): Filter<TValue>[] {
  return Object.entries(state).flatMap(([field, filter]) => {
    if (!filter) {
      return [];
    }
    const resolvedFilter = filter as { operator: string; values: TValue[] };
    return [createFilter(field, resolvedFilter.operator, [...resolvedFilter.values])];
  });
}

export function resolveOperatorAwareFieldFilter<TField extends string, TValue>(
  state: OperatorAwareFilterState<TField, TValue>,
  field: TField,
): OperatorAwareFieldFilter<TField, TValue> | undefined {
  const filter = state[field];
  if (!filter) {
    return undefined;
  }
  return {
    field,
    operator: filter.operator,
    values: [...filter.values],
  };
}

export function summarizeOperatorAwareFieldFilter<TField extends string, TValue>(
  filter: OperatorAwareFieldFilter<TField, TValue> | undefined,
  options?: OperatorAwareFilterSummaryOptions<TValue>,
): string | undefined {
  if (!filter) {
    return undefined;
  }

  const operatorLabel = resolveReuiFilterOperatorLabel(options?.i18n, filter.operator);
  const maxValues = options?.maxValues ?? 2;
  const valueFormatter = options?.valueFormatter ?? defaultValueFormatter;
  const values = filter.values
    .map((value) => valueFormatter(value))
    .filter((value): value is string => Boolean(value));

  if (values.length === 0) {
    return operatorLabel;
  }

  const visibleValues = values.slice(0, maxValues);
  const remainingCount = values.length - visibleValues.length;
  const visibleSummary = visibleValues.join(", ");

  return remainingCount > 0
    ? `${operatorLabel}: ${visibleSummary} +${remainingCount}`
    : `${operatorLabel}: ${visibleSummary}`;
}

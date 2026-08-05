import { describe, expect, it } from "vitest";

import {
  buildOperatorAwareFilterState,
  buildFiltersFromOperatorAwareState,
  resolveOperatorAwareFieldFilter,
  summarizeOperatorAwareFieldFilter,
} from "@/components/common/reui-filter-state";
import {
  buildReuiFilterI18n,
  resolveReuiFilterOperatorLabel,
} from "@/components/common/reui-filter-i18n";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

const TRANSLATIONS: Record<string, string> = {
  "common:FILTER_OPERATOR_IS": "Is",
  "common:FILTER_OPERATOR_IS_NOT": "Is not",
  "common:FILTER_OPERATOR_IS_ANY_OF": "Is any of",
  "common:FILTER_OPERATOR_IS_NOT_ANY_OF": "Is not any of",
  "common:FILTER_OPERATOR_INCLUDES_ALL": "Includes all",
  "common:FILTER_OPERATOR_EXCLUDES_ALL": "Excludes all",
  "common:FILTER_OPERATOR_BEFORE": "Before",
  "common:FILTER_OPERATOR_AFTER": "After",
  "common:FILTER_OPERATOR_BETWEEN": "Between",
  "common:FILTER_OPERATOR_NOT_BETWEEN": "Not between",
  "common:FILTER_OPERATOR_CONTAINS": "Contains",
  "common:FILTER_OPERATOR_NOT_CONTAINS": "Does not contain",
  "common:FILTER_OPERATOR_STARTS_WITH": "Starts with",
  "common:FILTER_OPERATOR_ENDS_WITH": "Ends with",
  "common:FILTER_OPERATOR_IS_EXACTLY": "Is exactly",
  "common:FILTER_OPERATOR_EQUALS": "Equals",
  "common:FILTER_OPERATOR_NOT_EQUALS": "Not equals",
  "common:FILTER_OPERATOR_GREATER_THAN": "Greater than",
  "common:FILTER_OPERATOR_LESS_THAN": "Less than",
  "common:FILTER_OPERATOR_OVERLAPS": "Overlaps",
  "common:FILTER_OPERATOR_INCLUDES": "Includes",
  "common:FILTER_OPERATOR_EXCLUDES": "Excludes",
  "common:FILTER_OPERATOR_INCLUDES_ALL_OF": "Includes all of",
  "common:FILTER_OPERATOR_INCLUDES_ANY_OF": "Includes any of",
  "common:FILTER_OPERATOR_EMPTY": "Is empty",
  "common:FILTER_OPERATOR_NOT_EMPTY": "Is not empty",
};

function buildTranslateFn(): TranslateFn {
  return (key) => TRANSLATIONS[key] ?? key;
}

describe("buildReuiFilterI18n", () => {
  it("translates the shared operator copy required by the admin filter surfaces", () => {
    const i18n = buildReuiFilterI18n(buildTranslateFn(), "Filter");

    expect(i18n.operators?.is).toBe("Is");
    expect(i18n.operators?.isNot).toBe("Is not");
    expect(i18n.operators?.isAnyOf).toBe("Is any of");
    expect(i18n.operators?.contains).toBe("Contains");
    expect(i18n.operators?.startsWith).toBe("Starts with");
    expect(i18n.operators?.after).toBe("After");
    expect(i18n.operators?.empty).toBe("Is empty");
    expect(resolveReuiFilterOperatorLabel(i18n, "not_empty")).toBe("Is not empty");
  });
});

describe("reui operator-aware filter helpers", () => {
  it("preserves operator plus values when indexing field filters", () => {
    const state = buildOperatorAwareFilterState<"eventName" | "tagIds", string>([
      { id: "1", field: "eventName", operator: "contains", values: ["user"] },
      { id: "2", field: "tagIds", operator: "is_any_of", values: ["a", "b", "c"] },
    ]);

    expect(state.eventName).toEqual({ operator: "contains", values: ["user"] });
    expect(state.tagIds).toEqual({ operator: "is_any_of", values: ["a", "b", "c"] });

    expect(buildFiltersFromOperatorAwareState(state)).toEqual([
      expect.objectContaining({
        field: "eventName",
        operator: "contains",
        values: ["user"],
      }),
      expect.objectContaining({
        field: "tagIds",
        operator: "is_any_of",
        values: ["a", "b", "c"],
      }),
    ]);
  });

  it("builds a column summary from the current operator-aware filter state", () => {
    const i18n = buildReuiFilterI18n(buildTranslateFn(), "Filter");
    const state = buildOperatorAwareFilterState<"eventName", string>([
      { id: "1", field: "eventName", operator: "contains", values: ["user", "invite", "audit"] },
    ]);

    const filter = resolveOperatorAwareFieldFilter(state, "eventName");

    expect(filter).toEqual({
      field: "eventName",
      operator: "contains",
      values: ["user", "invite", "audit"],
    });
    expect(summarizeOperatorAwareFieldFilter(filter, { i18n })).toBe("Contains: user, invite +1");
  });
});

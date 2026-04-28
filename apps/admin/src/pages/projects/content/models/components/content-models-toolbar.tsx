import * as React from "react";
import {
  DatabaseIcon,
  FunnelXIcon,
  ListFilterIcon,
  ShapesIcon,
  ShieldCheckIcon,
} from "lucide-react";
import type { SortingState, Table as ReactTable } from "@tanstack/react-table";

import { buildDataTableToolsLabels } from "@/components/common/data-table-tools-labels";
import { DataTableSearchInput } from "@/components/common/data-table-search-input";
import { DataTableToolbarAntdIconButton } from "@/components/common/data-table-toolbar-antd-icon-button";
import { buildReuiFilterI18n } from "@/components/common/reui-filter-i18n";
import { PageExtraToolbar } from "@/layouts/page-shell/page-extra-toolbar";
import { Button } from "@arclayer/ui/button";
import { DataTableToolbarTools, type DataTableRowHeight } from "@arclayer/ui/data-table";
import { Filters, createFilter, type Filter, type FilterFieldConfig } from "@arclayer/ui/filters";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";

import type { ContentModelsFilters, ContentModelsTableRow } from "../types";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;
type FilterValue = string;
type ContentModelsSortValue =
  | "updated_desc"
  | "updated_asc"
  | "name_asc"
  | "name_desc"
  | "field_count_desc"
  | "field_count_asc";

const FILTER_OPERATORS = [{ value: "is", labelKey: "common:FILTER_OPERATOR_IS" }] as const;

function toReuiFilters(filters: ContentModelsFilters): Filter<FilterValue>[] {
  const next: Filter<FilterValue>[] = [];
  if (filters.category) next.push(createFilter("category", "is", [filters.category]));
  if (filters.modelKind) next.push(createFilter("modelKind", "is", [filters.modelKind]));
  if (filters.systemManaged) {
    next.push(createFilter("systemManaged", "is", [filters.systemManaged]));
  }
  return next;
}

function fromReuiFilters(filters: Filter<FilterValue>[]): ContentModelsFilters {
  const next: ContentModelsFilters = {};
  for (const filter of filters) {
    const first = filter.values[0];
    if (typeof first !== "string" || !first) continue;
    if (filter.field === "category") next.category = first as ContentModelsFilters["category"];
    if (filter.field === "modelKind") next.modelKind = first as ContentModelsFilters["modelKind"];
    if (filter.field === "systemManaged") {
      next.systemManaged = first as ContentModelsFilters["systemManaged"];
    }
  }
  return next;
}

function buildFilterFields(t: TranslateFn): FilterFieldConfig<FilterValue>[] {
  const operatorLabels = FILTER_OPERATORS.map((operator) => ({
    value: operator.value,
    label: t(operator.labelKey, { defaultValue: "is" }),
  }));

  return [
    {
      key: "category",
      label: t("content:CONTENT_MODELS_FILTER_FIELD_CATEGORY"),
      type: "select",
      icon: <DatabaseIcon className="size-4" />,
      searchable: false,
      operators: operatorLabels,
      options: [
        { value: "custom", label: t("content:CONTENT_MODELS_CATEGORY_CUSTOM") },
        { value: "content_library", label: t("content:CONTENT_MODELS_CATEGORY_CONTENT_LIBRARY") },
        { value: "site_builder", label: t("content:CONTENT_MODELS_CATEGORY_SITE_BUILDER") },
        { value: "system", label: t("content:CONTENT_MODELS_CATEGORY_SYSTEM") },
      ],
    },
    {
      key: "modelKind",
      label: t("content:CONTENT_MODELS_FILTER_FIELD_MODEL_KIND"),
      type: "select",
      icon: <ShapesIcon className="size-4" />,
      searchable: false,
      operators: operatorLabels,
      options: [
        { value: "collection_type", label: t("content:CONTENT_MODELS_KIND_COLLECTION_TYPE") },
        { value: "single_type", label: t("content:CONTENT_MODELS_KIND_SINGLE_TYPE") },
        { value: "component", label: t("content:CONTENT_MODELS_KIND_COMPONENT") },
      ],
    },
    {
      key: "systemManaged",
      label: t("content:CONTENT_MODELS_FILTER_FIELD_MANAGEMENT"),
      type: "select",
      icon: <ShieldCheckIcon className="size-4" />,
      searchable: false,
      operators: operatorLabels,
      options: [
        { value: "yes", label: t("content:CONTENT_MODELS_FILTER_MANAGED_PLATFORM") },
        { value: "no", label: t("content:CONTENT_MODELS_FILTER_MANAGED_CUSTOM") },
      ],
    },
  ];
}

function sortingToSortValue(sorting: SortingState): ContentModelsSortValue {
  const primary = sorting[0];
  if (!primary) return "updated_desc";
  if (primary.id === "updatedAt") return primary.desc ? "updated_desc" : "updated_asc";
  if (primary.id === "name") return primary.desc ? "name_desc" : "name_asc";
  if (primary.id === "fieldCount") return primary.desc ? "field_count_desc" : "field_count_asc";
  return "updated_desc";
}

function sortValueToSorting(value: ContentModelsSortValue): SortingState {
  if (value === "updated_asc") return [{ id: "updatedAt", desc: false }];
  if (value === "name_asc") return [{ id: "name", desc: false }];
  if (value === "name_desc") return [{ id: "name", desc: true }];
  if (value === "field_count_desc") return [{ id: "fieldCount", desc: true }];
  if (value === "field_count_asc") return [{ id: "fieldCount", desc: false }];
  return [{ id: "updatedAt", desc: true }];
}

export function ContentModelsToolbar(props: {
  t: TranslateFn;
  table: ReactTable<ContentModelsTableRow>;
  sorting: SortingState;
  onSortingChange: (next: SortingState) => void;
  searchInput: string;
  onSearchInputChange: (next: string) => void;
  filters: ContentModelsFilters;
  onFiltersChange: (next: ContentModelsFilters) => void;
  rowHeight: DataTableRowHeight;
  onRowHeightChange: (next: DataTableRowHeight) => void;
  wrapHeaders: boolean;
  onWrapHeadersChange: (next: boolean) => void;
  onRefresh: () => void;
  refreshing: boolean;
  onResetColumnVisibility: () => void;
}) {
  const filterItems = React.useMemo(() => toReuiFilters(props.filters), [props.filters]);
  const filterFields = React.useMemo(() => buildFilterFields(props.t), [props.t]);
  const reuiI18n = React.useMemo(
    () => buildReuiFilterI18n(props.t, props.t("content:CONTENT_MODELS_FILTER_TITLE")),
    [props.t],
  );
  const toolsLabels = React.useMemo(() => buildDataTableToolsLabels(props.t), [props.t]);
  const sortValue = React.useMemo(() => sortingToSortValue(props.sorting), [props.sorting]);
  const sortOptions = React.useMemo(
    () => [
      {
        value: "updated_desc" as const,
        label: props.t("content:CONTENT_MODELS_SORT_UPDATED_DESC"),
      },
      { value: "updated_asc" as const, label: props.t("content:CONTENT_MODELS_SORT_UPDATED_ASC") },
      { value: "name_asc" as const, label: props.t("content:CONTENT_MODELS_SORT_NAME_ASC") },
      { value: "name_desc" as const, label: props.t("content:CONTENT_MODELS_SORT_NAME_DESC") },
      {
        value: "field_count_desc" as const,
        label: props.t("content:CONTENT_MODELS_SORT_FIELD_COUNT_DESC"),
      },
      {
        value: "field_count_asc" as const,
        label: props.t("content:CONTENT_MODELS_SORT_FIELD_COUNT_ASC"),
      },
    ],
    [props.t],
  );

  return (
    <PageExtraToolbar
      leading={
        <>
          <DataTableSearchInput
            value={props.searchInput}
            onChange={props.onSearchInputChange}
            placeholder={props.t("content:CONTENT_MODELS_SEARCH_PLACEHOLDER")}
            clearLabel={props.t("common:CLEAR")}
          />
          <Select
            value={sortValue}
            onValueChange={(next) =>
              props.onSortingChange(sortValueToSorting(next as ContentModelsSortValue))
            }
          >
            <SelectTrigger className="w-[12rem] min-w-[12rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end" position="popper">
              {sortOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Filters
            filters={filterItems}
            fields={filterFields}
            onChange={(next) => props.onFiltersChange(fromReuiFilters(next))}
            i18n={reuiI18n}
            allowMultiple={false}
            enableShortcut
            shortcutKey="f"
            shortcutLabel="F"
            trigger={
              <Button
                variant="outline"
                aria-label={props.t("content:CONTENT_MODELS_FILTER_TITLE")}
                title={props.t("content:CONTENT_MODELS_FILTER_TITLE")}
              >
                <ListFilterIcon className="size-4" />
              </Button>
            }
          />
          {filterItems.length > 0 ? (
            <Button variant="outline" onClick={() => props.onFiltersChange({})}>
              <FunnelXIcon className="size-4" />
              {props.t("content:CONTENT_MODELS_FILTER_RESET")}
            </Button>
          ) : null}
        </>
      }
      trailing={
        <DataTableToolbarTools
          table={props.table}
          rowHeight={props.rowHeight}
          onRowHeightChange={props.onRowHeightChange}
          wrapHeaders={props.wrapHeaders}
          onWrapHeadersChange={props.onWrapHeadersChange}
          onRefresh={props.onRefresh}
          refreshing={props.refreshing}
          onResetColumnVisibility={props.onResetColumnVisibility}
          labels={toolsLabels}
          components={{ IconButton: DataTableToolbarAntdIconButton }}
        />
      }
      leadingClassName="items-center"
      trailingClassName="justify-end"
    />
  );
}

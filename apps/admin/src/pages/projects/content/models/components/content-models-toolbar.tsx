import * as React from "react";
import {
  DatabaseIcon,
  FunnelXIcon,
  ListFilterIcon,
  ShapesIcon,
  ShieldCheckIcon,
} from "lucide-react";

import { buildDataTableToolsLabels } from "@/components/common/data-table-tools-labels";
import { DataTableSearchInput } from "@/components/common/data-table-search-input";
import { DataTableToolbarAntdIconButton } from "@/components/common/data-table-toolbar-antd-icon-button";
import { buildReuiFilterI18n } from "@/components/common/reui-filter-i18n";
import { PageExtraToolbar } from "@/layouts/page-shell/page-extra-toolbar";
import { Button } from "@arclayer/ui/button";
import { DataTableToolbarTools, type DataTableRowHeight } from "@arclayer/ui/data-table";
import { Filters, createFilter, type Filter, type FilterFieldConfig } from "@arclayer/ui/filters";
import type { Table as ReactTable } from "@tanstack/react-table";

import type { ContentModelsFilters, ContentModelsTableRow } from "../types";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;
type FilterValue = string;

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

export function ContentModelsToolbar(props: {
  t: TranslateFn;
  table: ReactTable<ContentModelsTableRow>;
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

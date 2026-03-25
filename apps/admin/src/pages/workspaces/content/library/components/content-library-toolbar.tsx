import * as React from "react";
import { FileStackIcon, FunnelXIcon, Layers3Icon, ListFilterIcon } from "lucide-react";
import type { Table as ReactTable } from "@tanstack/react-table";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import {
  DataTableToolbarTools,
  type DataTableRowHeight,
  type DataTableToolsLabels,
} from "@arclayer/ui/data-table";
import { Filters, createFilter, type Filter, type FilterFieldConfig } from "@arclayer/ui/filters";

import { DataTableSearchInput } from "@/components/common/data-table-search-input";
import { DataTableToolbarAntdIconButton } from "@/components/common/data-table-toolbar-antd-icon-button";
import { PageExtraToolbar } from "@/layouts/page-shell/page-extra-toolbar";
import { buildReuiFilterI18n } from "@/components/common/reui-filter-i18n";
import type {
  ContentLibraryDerivedStatus,
  ContentLibraryEditWith,
  ContentLibraryRole,
  ContentLibraryToolbarFilters,
} from "../types";
import {
  ContentLibraryViewModeToggle,
  type ContentLibraryViewMode,
} from "./content-library-view-mode-toggle";

type FilterValue = string;

function toReuiFilters(filters: ContentLibraryToolbarFilters): Filter<FilterValue>[] {
  const next: Filter<FilterValue>[] = [];
  if (filters.status) next.push(createFilter("status", "is", [filters.status]));
  if (filters.modelKey) next.push(createFilter("modelKey", "is", [filters.modelKey]));
  if (filters.role) next.push(createFilter("role", "is", [filters.role]));
  if (filters.editWith) next.push(createFilter("editWith", "is", [filters.editWith]));
  return next;
}

function fromReuiFilters(filters: Filter<FilterValue>[]): ContentLibraryToolbarFilters {
  const next: ContentLibraryToolbarFilters = {};
  for (const filter of filters) {
    const first = filter.values[0];
    if (typeof first !== "string" || !first) continue;
    if (filter.field === "status") next.status = first as ContentLibraryDerivedStatus;
    if (filter.field === "modelKey") next.modelKey = first;
    if (filter.field === "role") next.role = first as ContentLibraryRole;
    if (filter.field === "editWith") next.editWith = first as ContentLibraryEditWith;
  }
  return next;
}

export function ContentLibraryToolbar<TData>(props: {
  table: ReactTable<TData>;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  filters: ContentLibraryToolbarFilters;
  onFiltersChange: (next: ContentLibraryToolbarFilters) => void;
  rowHeight: DataTableRowHeight;
  onRowHeightChange: (next: DataTableRowHeight) => void;
  wrapHeaders: boolean;
  onWrapHeadersChange: (next: boolean) => void;
  refreshing?: boolean;
  onRefresh: () => void;
  onResetColumnVisibility?: () => void;
  toolsLabels: DataTableToolsLabels;
  modelOptions: Array<{ value: string; label: string }>;
  viewMode: ContentLibraryViewMode;
  onViewModeChange: (next: ContentLibraryViewMode) => void;
  views?: Array<{ id: string; label: string; active?: boolean; onSelect?: () => void }>;
  onOpenViewsManager?: () => void;
  primaryAction?: React.ReactNode;
}) {
  const { t } = useTranslation(["common", "content"]);

  const filterItems = React.useMemo(() => toReuiFilters(props.filters), [props.filters]);
  const reuiI18n = React.useMemo(
    () => buildReuiFilterI18n(t, t("content:CONTENT_LIBRARY_FILTER_TITLE")),
    [t],
  );

  const fields = React.useMemo<FilterFieldConfig<FilterValue>[]>(
    () => [
      {
        key: "status",
        label: t("content:CONTENT_LIBRARY_FILTER_FIELD_STATUS"),
        type: "select",
        icon: <ListFilterIcon className="size-4" />,
        searchable: false,
        operators: [{ value: "is", label: t("common:FILTER_OPERATOR_IS") }],
        options: [
          { value: "published", label: t("content:CONTENT_LIBRARY_STATUS_PUBLISHED") },
          { value: "changed", label: t("content:CONTENT_LIBRARY_STATUS_CHANGED") },
          { value: "draft", label: t("content:CONTENT_LIBRARY_STATUS_DRAFT") },
          { value: "archived", label: t("content:CONTENT_LIBRARY_STATUS_ARCHIVED") },
        ],
      },
      {
        key: "role",
        label: t("content:CONTENT_LIBRARY_FILTER_FIELD_ROLE"),
        type: "select",
        icon: <FileStackIcon className="size-4" />,
        searchable: false,
        operators: [{ value: "is", label: t("common:FILTER_OPERATOR_IS") }],
        options: [
          { value: "page", label: t("content:CONTENT_LIBRARY_ROLE_PAGE") },
          { value: "article", label: t("content:CONTENT_LIBRARY_ROLE_ARTICLE") },
          { value: "reusable-section", label: t("content:CONTENT_LIBRARY_ROLE_REUSABLE_SECTION") },
          { value: "taxonomy", label: t("content:CONTENT_LIBRARY_ROLE_TAXONOMY") },
          { value: "person", label: t("content:CONTENT_LIBRARY_ROLE_PERSON") },
          { value: "settings", label: t("content:CONTENT_LIBRARY_ROLE_SETTINGS") },
          { value: "data", label: t("content:CONTENT_LIBRARY_ROLE_DATA") },
          { value: "general", label: t("content:CONTENT_LIBRARY_ROLE_GENERAL") },
        ],
      },
      {
        key: "editWith",
        label: t("content:CONTENT_LIBRARY_FILTER_FIELD_EDIT_WITH"),
        type: "select",
        icon: <Layers3Icon className="size-4" />,
        searchable: false,
        operators: [{ value: "is", label: t("common:FILTER_OPERATOR_IS") }],
        options: [
          { value: "writing", label: t("content:CONTENT_LIBRARY_EDIT_WITH_WRITING") },
          { value: "canvas", label: t("content:CONTENT_LIBRARY_EDIT_WITH_CANVAS") },
          { value: "structured", label: t("content:CONTENT_LIBRARY_EDIT_WITH_STRUCTURED") },
        ],
      },
      {
        key: "modelKey",
        label: t("content:CONTENT_LIBRARY_FILTER_FIELD_CONTENT_TYPE"),
        type: "select",
        icon: <Layers3Icon className="size-4" />,
        searchable: true,
        operators: [{ value: "is", label: t("common:FILTER_OPERATOR_IS") }],
        options: props.modelOptions,
      },
    ],
    [props.modelOptions, t],
  );

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {props.views?.length || props.onOpenViewsManager ? (
        <div className="flex flex-wrap items-center gap-2">
          {(props.views ?? []).map((view) => (
            <Button
              key={view.id}
              type="button"
              variant={view.active ? "secondary" : "ghost"}
              size="sm"
              onClick={view.onSelect}
            >
              {view.label}
            </Button>
          ))}
          {props.onOpenViewsManager ? (
            <Button type="button" variant="outline" size="sm" onClick={props.onOpenViewsManager}>
              {t("content:CONTENT_LIBRARY_ACTION_MANAGE_VIEWS")}
            </Button>
          ) : null}
        </div>
      ) : null}

      <PageExtraToolbar
        className="items-center"
        leading={
          <>
            <DataTableSearchInput
              value={props.searchInput}
              onChange={props.onSearchInputChange}
              placeholder={t("content:CONTENT_LIBRARY_SEARCH_PLACEHOLDER")}
              clearLabel={t("common:CLEAR")}
            />

            <Filters
              filters={filterItems}
              fields={fields}
              onChange={(next) => props.onFiltersChange(fromReuiFilters(next))}
              i18n={reuiI18n}
              allowMultiple={false}
              enableShortcut
              shortcutKey="f"
              shortcutLabel="F"
              trigger={
                <Button variant="outline">
                  <ListFilterIcon className="size-4" />
                  {t("content:CONTENT_LIBRARY_FILTER_TITLE")}
                </Button>
              }
            />

            {filterItems.length > 0 ? (
              <Button variant="outline" onClick={() => props.onFiltersChange({})}>
                <FunnelXIcon className="size-4" />
                {t("content:CONTENT_LIBRARY_FILTER_RESET")}
              </Button>
            ) : null}
          </>
        }
        trailing={
          <>
            {props.primaryAction}
            <DataTableToolbarTools
              table={props.table}
              rowHeight={props.rowHeight}
              onRowHeightChange={props.onRowHeightChange}
              wrapHeaders={props.wrapHeaders}
              onWrapHeadersChange={props.onWrapHeadersChange}
              onRefresh={props.onRefresh}
              refreshing={props.refreshing}
              onResetColumnVisibility={props.onResetColumnVisibility}
              labels={props.toolsLabels}
              components={{ IconButton: DataTableToolbarAntdIconButton }}
            />
            <ContentLibraryViewModeToggle
              t={t}
              value={props.viewMode}
              onChange={props.onViewModeChange}
            />
          </>
        }
        leadingClassName="items-center"
        trailingClassName="justify-end"
      />
    </div>
  );
}

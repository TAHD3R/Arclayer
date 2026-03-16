"use client";

import * as React from "react";
import { Check, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import type { Table as ReactTable } from "@tanstack/react-table";

import { cn } from "@arclayer/lib/utils";
import { Button as ButtonPrimitive } from "@arclayer/ui/button-primitive";
import { Input } from "@arclayer/ui/input";
import {
  DropdownCardBody,
  DropdownCardContent,
  DropdownCardHeader,
  DropdownCardRoot,
  DropdownCardTrigger,
} from "@arclayer/ui/dropdown-card";

import { DataTableDefaultIconButton } from "./data-table-icon-button";
import { DataTableToolTooltip } from "./data-table-tool-tooltip";
import type {
  DataTableIconButtonProps,
  DataTableToolsComponents,
  DataTableToolsLabels,
} from "./data-table-tools.types";
import { type DataTableRowHeight } from "./types";

const ICON_CLASS = "size-4";

const ROW_HEIGHT_OPTIONS: readonly DataTableRowHeight[] = ["short", "medium", "tall", "extraTall"];

function resolveIconButton(components: DataTableToolsComponents | undefined) {
  return (components?.IconButton ?? DataTableDefaultIconButton) as React.ComponentType<
    DataTableIconButtonProps & { className?: string }
  >;
}

function ColumnToggleRow<TData>(props: {
  column: ReturnType<ReactTable<TData>["getAllColumns"]>[number];
  onToggle: () => void;
  label: string;
}) {
  const visible = props.column.getIsVisible();

  return (
    <ButtonPrimitive
      type="button"
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
        visible ? "bg-accent/35 text-foreground" : "hover:bg-accent/20 text-label-secondary",
      )}
      onClick={props.onToggle}
      tapScale={1}
    >
      <span
        className={cn(
          "flex size-4 items-center justify-center rounded-sm border",
          visible ? "border-primary bg-primary text-primary-foreground" : "border-border",
        )}
      >
        {visible ? <Check className="size-3" /> : null}
      </span>
      <span className="min-w-0 flex-1 truncate text-footnote font-medium">{props.label}</span>
    </ButtonPrimitive>
  );
}

export function DataTableViewOptions<TData>(props: {
  table: ReactTable<TData>;
  rowHeight: DataTableRowHeight;
  onRowHeightChange: (next: DataTableRowHeight) => void;
  wrapHeaders: boolean;
  onWrapHeadersChange: (next: boolean) => void;
  labels: Pick<
    DataTableToolsLabels,
    | "viewOptions"
    | "viewOptionsTitle"
    | "viewOptionsDescription"
    | "columnsTitle"
    | "columnsDescription"
    | "columnsSearchPlaceholder"
    | "columnsEmpty"
    | "rowHeightTitle"
    | "rowHeightShort"
    | "rowHeightMedium"
    | "rowHeightTall"
    | "rowHeightExtraTall"
    | "headerOptions"
    | "wrapHeaders"
    | "reset"
  >;
  components?: DataTableToolsComponents;
  onResetColumnVisibility?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const IconButton = resolveIconButton(props.components);

  const columns = React.useMemo(
    () =>
      props.table
        .getAllLeafColumns()
        .filter((column) => typeof column.accessorFn !== "undefined" && column.getCanHide()),
    [props.table],
  );

  const filteredColumns = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return columns;

    return columns.filter((column) => {
      const label = String(column.columnDef.meta?.title ?? column.id)
        .trim()
        .toLowerCase();
      return label.includes(needle);
    });
  }, [columns, search]);

  const resetAll = React.useCallback(() => {
    if (props.onResetColumnVisibility) props.onResetColumnVisibility();
    else props.table.resetColumnVisibility();
    props.table.resetColumnOrder();
    props.table.resetColumnPinning();
    props.onRowHeightChange("medium");
    props.onWrapHeadersChange(false);
  }, [props]);

  const rowHeightLabel = React.useMemo<Record<DataTableRowHeight, string>>(
    () => ({
      short: props.labels.rowHeightShort,
      medium: props.labels.rowHeightMedium,
      tall: props.labels.rowHeightTall,
      extraTall: props.labels.rowHeightExtraTall,
    }),
    [props.labels],
  );

  return (
    <DropdownCardRoot open={open} onOpenChange={setOpen}>
      <DropdownCardTrigger asChild>
        <span className="inline-flex">
          <DataTableToolTooltip label={props.labels.viewOptions}>
            <IconButton label={props.labels.viewOptions} active={open}>
              <SlidersHorizontal className={ICON_CLASS} />
            </IconButton>
          </DataTableToolTooltip>
        </span>
      </DropdownCardTrigger>

      <DropdownCardContent align="end" sideOffset={8} className="w-[380px] max-w-[92vw]">
        <DropdownCardHeader className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-headline">{props.labels.viewOptionsTitle}</div>
            <div className="text-callout text-label-secondary">
              {props.labels.viewOptionsDescription}
            </div>
          </div>

          <DataTableToolTooltip label={props.labels.reset}>
            <DataTableDefaultIconButton label={props.labels.reset} onClick={resetAll}>
              <RotateCcw className={ICON_CLASS} />
            </DataTableDefaultIconButton>
          </DataTableToolTooltip>
        </DropdownCardHeader>

        <DropdownCardBody className="space-y-5 py-4">
          <section className="space-y-2.5">
            <div>
              <div className="text-footnote font-semibold text-label-primary">
                {props.labels.rowHeightTitle}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {ROW_HEIGHT_OPTIONS.map((option) => {
                const active = props.rowHeight === option;
                return (
                  <ButtonPrimitive
                    key={option}
                    type="button"
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left text-footnote font-medium transition-colors",
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-accent/20",
                    )}
                    onClick={() => props.onRowHeightChange(option)}
                    tapScale={1}
                  >
                    {rowHeightLabel[option]}
                  </ButtonPrimitive>
                );
              })}
            </div>
          </section>

          <section className="space-y-2.5">
            <div className="text-footnote font-semibold text-label-primary">
              {props.labels.headerOptions}
            </div>
            <ButtonPrimitive
              type="button"
              className={cn(
                "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-footnote transition-colors",
                props.wrapHeaders
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:bg-accent/20",
              )}
              onClick={() => props.onWrapHeadersChange(!props.wrapHeaders)}
              tapScale={1}
            >
              <span className="font-medium">{props.labels.wrapHeaders}</span>
              <span
                className={cn(
                  "flex size-4 items-center justify-center rounded-sm border",
                  props.wrapHeaders
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border",
                )}
              >
                {props.wrapHeaders ? <Check className="size-3" /> : null}
              </span>
            </ButtonPrimitive>
          </section>

          <section className="space-y-2.5">
            <div>
              <div className="text-footnote font-semibold text-label-primary">
                {props.labels.columnsTitle}
              </div>
              <div className="text-caption text-label-secondary">
                {props.labels.columnsDescription}
              </div>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-label-secondary" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={props.labels.columnsSearchPlaceholder}
                className="pl-9"
              />
            </div>
            <div className="max-h-60 overflow-auto">
              <div className="grid gap-1.5 pr-1">
                {filteredColumns.length ? (
                  filteredColumns.map((column) => (
                    <ColumnToggleRow
                      key={column.id}
                      column={column}
                      onToggle={() => column.toggleVisibility(!column.getIsVisible())}
                      label={String(column.columnDef.meta?.title ?? column.id)}
                    />
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed px-3 py-4 text-center text-footnote text-label-secondary">
                    {props.labels.columnsEmpty}
                  </div>
                )}
              </div>
            </div>
          </section>
        </DropdownCardBody>
      </DropdownCardContent>
    </DropdownCardRoot>
  );
}

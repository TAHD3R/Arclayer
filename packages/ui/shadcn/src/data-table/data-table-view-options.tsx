"use client";

import * as React from "react";
import { Check, RotateCcw, SlidersHorizontal } from "lucide-react";

import { cn } from "@arclayer/lib/utils";
import { Button as ButtonPrimitive } from "@arclayer/ui/button-primitive";
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

function OptionCard(props: {
  active: boolean;
  label: string;
  onClick: () => void;
  trailing?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <ButtonPrimitive
      type="button"
      disabled={props.disabled}
      className={cn(
        "flex min-h-10 w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-footnote font-medium transition-colors",
        props.active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border hover:bg-accent/20 text-foreground",
        props.disabled && "pointer-events-none opacity-50",
      )}
      onClick={props.onClick}
      tapScale={1}
    >
      <span className="min-w-0 flex-1 truncate">{props.label}</span>
      {props.trailing}
    </ButtonPrimitive>
  );
}

export function DataTableViewOptions(props: {
  rowHeight: DataTableRowHeight;
  onRowHeightChange: (next: DataTableRowHeight) => void;
  wrapHeaders: boolean;
  onWrapHeadersChange: (next: boolean) => void;
  labels: Pick<
    DataTableToolsLabels,
    | "viewOptions"
    | "viewOptionsTitle"
    | "viewOptionsDescription"
    | "rowHeightTitle"
    | "rowHeightShort"
    | "rowHeightMedium"
    | "rowHeightTall"
    | "rowHeightExtraTall"
    | "headerOptions"
    | "wrapHeaders"
    | "tableSettings"
    | "reset"
    | "resetColumnSize"
    | "resetColumnOrder"
    | "clearSelection"
  >;
  components?: DataTableToolsComponents;
  onReset?: () => void;
  onResetColumnSize?: () => void;
  onResetColumnOrder?: () => void;
  onClearSelection?: () => void;
  canResetColumnSize?: boolean;
  canResetColumnOrder?: boolean;
  showClearSelection?: boolean;
  canClearSelection?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const IconButton = resolveIconButton(props.components);

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

      <DropdownCardContent align="end" sideOffset={8} className="w-[340px] max-w-[92vw]">
        <DropdownCardHeader className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-headline">{props.labels.viewOptionsTitle}</div>
            <div className="text-callout text-label-secondary">
              {props.labels.viewOptionsDescription}
            </div>
          </div>

          <DataTableToolTooltip label={props.labels.reset}>
            <DataTableDefaultIconButton label={props.labels.reset} onClick={props.onReset}>
              <RotateCcw className={ICON_CLASS} />
            </DataTableDefaultIconButton>
          </DataTableToolTooltip>
        </DropdownCardHeader>

        <DropdownCardBody className="space-y-5 py-4">
          <section className="space-y-2.5">
            <div className="text-footnote font-semibold text-label-primary">
              {props.labels.rowHeightTitle}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {ROW_HEIGHT_OPTIONS.map((option) => (
                <OptionCard
                  key={option}
                  active={props.rowHeight === option}
                  label={rowHeightLabel[option]}
                  onClick={() => props.onRowHeightChange(option)}
                />
              ))}
            </div>
          </section>

          <section className="space-y-2.5">
            <div className="text-footnote font-semibold text-label-primary">
              {props.labels.headerOptions}
            </div>
            <OptionCard
              active={props.wrapHeaders}
              label={props.labels.wrapHeaders}
              onClick={() => props.onWrapHeadersChange(!props.wrapHeaders)}
              trailing={
                <span
                  className={cn(
                    "ml-3 flex size-4 shrink-0 items-center justify-center rounded-sm border",
                    props.wrapHeaders
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border",
                  )}
                >
                  {props.wrapHeaders ? <Check className="size-3" /> : null}
                </span>
              }
            />
          </section>

          <section className="space-y-2.5">
            <div className="text-footnote font-semibold text-label-primary">
              {props.labels.tableSettings}
            </div>
            <div className="grid gap-2">
              <OptionCard
                active={false}
                label={props.labels.resetColumnSize}
                onClick={() => props.onResetColumnSize?.()}
                disabled={!props.canResetColumnSize}
              />
              <OptionCard
                active={false}
                label={props.labels.resetColumnOrder}
                onClick={() => props.onResetColumnOrder?.()}
                disabled={!props.canResetColumnOrder}
              />
              {props.showClearSelection ? (
                <OptionCard
                  active={false}
                  label={props.labels.clearSelection}
                  onClick={() => props.onClearSelection?.()}
                  disabled={!props.canClearSelection}
                />
              ) : null}
            </div>
          </section>
        </DropdownCardBody>
      </DropdownCardContent>
    </DropdownCardRoot>
  );
}

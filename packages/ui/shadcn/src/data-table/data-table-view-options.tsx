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
        "flex min-h-11 w-full items-center justify-between rounded-2xl border border-transparent px-3 py-2.5 text-left text-callout font-medium transition-colors",
        props.active
          ? "border-border/60 bg-accent/18 text-label-primary"
          : "text-label-primary hover:bg-accent/12",
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

      <DropdownCardContent
        align="end"
        sideOffset={8}
        className="w-90 max-w-[92vw] rounded-[22px] border-border/70 bg-popover/96  backdrop-blur-xl"
      >
        <DropdownCardHeader className="flex items-center justify-between gap-3 border-border/60 px-5 py-4">
          <div className="min-w-0">
            <div className="text-title3 font-semibold">{props.labels.viewOptionsTitle}</div>
          </div>

          <DataTableToolTooltip label={props.labels.reset}>
            <DataTableDefaultIconButton label={props.labels.reset} onClick={props.onReset}>
              <RotateCcw className={ICON_CLASS} />
            </DataTableDefaultIconButton>
          </DataTableToolTooltip>
        </DropdownCardHeader>

        <DropdownCardBody className="space-y-3 px-3 pb-3 pt-2">
          <section className="rounded-[20px] border border-border/55 bg-card/35 p-2">
            <div className="px-2 pb-2 text-caption font-semibold  tracking-[0.16em] text-label-secondary">
              {props.labels.rowHeightTitle}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
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

          <section className="rounded-[20px] border border-border/55 bg-card/35 p-2">
            <div className="px-2 pb-2 text-caption font-semibold  tracking-[0.16em] text-label-secondary">
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
                      : "border-border/60",
                  )}
                >
                  {props.wrapHeaders ? <Check className="size-3" /> : null}
                </span>
              }
            />
          </section>

          <section className="rounded-[20px] border border-border/55 bg-card/35 p-2">
            <div className="px-2 pb-2 text-caption font-semibold  tracking-[0.16em] text-label-secondary">
              {props.labels.tableSettings}
            </div>
            <div className="grid gap-1.5">
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

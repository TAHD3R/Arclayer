"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  EyeOff,
  ListFilter,
  Rows3,
  WrapTextIcon,
} from "lucide-react";
import type { Header } from "@tanstack/react-table";
import type { ComponentPropsWithoutRef, MouseEventHandler, ReactNode } from "react";

import { cn } from "@arclayer/lib/utils";
import { Button as ButtonPrimitive } from "@arclayer/ui/button-primitive";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "../dropdown-menu";

import type { DataTableColumnMenuLabels } from "./data-table-tools.types";

function resolveHeaderContentClass(wrapHeaders: boolean): string {
  return wrapHeaders ? "whitespace-normal break-words py-2" : "truncate whitespace-nowrap";
}

export type DataTableColumnHeaderFilterAction = {
  active?: boolean;
  summary?: string;
  onSelect: () => void;
};

export function DataTableColumnHeaderMenu<TData>(props: {
  header: Header<TData, unknown>;
  justifyClass: string;
  wrapHeaders: boolean;
  content: ReactNode;
  canSort: boolean;
  sorted: false | "asc" | "desc";
  wrapContent: boolean;
  canWrapContent?: boolean;
  onWrapContentChange: (next: boolean) => void;
  filterAction?: DataTableColumnHeaderFilterAction;
  labels: DataTableColumnMenuLabels;
  triggerClassName?: string;
  onTriggerClickCapture?: MouseEventHandler<HTMLButtonElement>;
  triggerProps?: Omit<
    ComponentPropsWithoutRef<typeof ButtonPrimitive>,
    "children" | "type" | "className" | "tapScale"
  >;
}) {
  const canHide = props.header.column.getCanHide();
  const canWrapContent = props.canWrapContent ?? true;
  const canMenu = true;

  if (!canMenu) {
    return (
      <div
        className={cn(
          "inline-flex min-h-8 max-w-full items-center gap-1 px-2 py-1.5 text-callout font-semibold",
          props.justifyClass,
          resolveHeaderContentClass(props.wrapHeaders),
        )}
      >
        {props.content}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ButtonPrimitive
          type="button"
          className={cn(
            "group inline-flex h-full min-h-8 w-full max-w-full items-center rounded-none py-1.5 text-callout font-semibold transition-colors hover:bg-muted/55 data-[state=open]:bg-muted/60",
            props.justifyClass,
            props.triggerClassName,
          )}
          tapScale={1}
          onClickCapture={props.onTriggerClickCapture}
          {...props.triggerProps}
        >
          <div className={cn("min-w-0 max-w-full", resolveHeaderContentClass(props.wrapHeaders))}>
            {props.content}
          </div>
        </ButtonPrimitive>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-44 text-footnote">
        {props.filterAction ? (
          <DropdownMenuItem
            className={props.filterAction.active ? "text-label-primary" : undefined}
            onClick={props.filterAction.onSelect}
          >
            <ListFilter className="size-4" />
            <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
              <span>{props.labels.filter}</span>
              {props.filterAction.summary ? (
                <span
                  aria-hidden="true"
                  className="min-w-0 truncate text-[11px] text-label-secondary"
                >
                  {props.filterAction.summary}
                </span>
              ) : null}
            </span>
          </DropdownMenuItem>
        ) : null}

        {props.canSort ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <ArrowUpDown className="size-4" />
              <span>{props.labels.sort}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-44">
              <DropdownMenuItem
                onClick={() =>
                  props.sorted === "asc"
                    ? props.header.column.clearSorting()
                    : props.header.column.toggleSorting(false)
                }
              >
                <ArrowUp className="size-4" />
                <span>{props.labels.sortAscending}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  props.sorted === "desc"
                    ? props.header.column.clearSorting()
                    : props.header.column.toggleSorting(true)
                }
              >
                <ArrowDown className="size-4" />
                <span>{props.labels.sortDescending}</span>
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}

        {canHide ? (
          <DropdownMenuItem onClick={() => props.header.column.toggleVisibility(false)}>
            <EyeOff className="size-4" />
            <span className="text-footnote">{props.labels.hide}</span>
          </DropdownMenuItem>
        ) : null}

        {canWrapContent ? (
          <DropdownMenuItem
            className={props.wrapContent ? "text-label-primary" : undefined}
            onClick={() => props.onWrapContentChange(!props.wrapContent)}
          >
            {props.wrapContent ? <Rows3 className="size-4" /> : <WrapTextIcon className="size-4" />}
            <span className="text-footnote">
              {props.wrapContent ? props.labels.unwrapContent : props.labels.wrapContent}
            </span>
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

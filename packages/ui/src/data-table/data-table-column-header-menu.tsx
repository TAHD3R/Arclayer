"use client";

import { ArrowDown, ArrowUp, EyeOff } from "lucide-react";
import type { Header } from "@tanstack/react-table";
import type { ReactNode } from "react";

import { cn } from "@arclayer/lib/utils";
import { Button as ButtonPrimitive } from "@arclayer/ui/button-primitive";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../dropdown-menu";

import { SortStateIcon } from "./data-table-presenter-utils";
import type { DataTableToolsLabels } from "./data-table-tools.types";

function resolveHeaderContentClass(wrapHeaders: boolean): string {
  return wrapHeaders ? "whitespace-normal break-words  py-2" : "truncate whitespace-nowrap";
}

export function DataTableColumnHeaderMenu<TData>(props: {
  header: Header<TData, unknown>;
  justifyClass: string;
  wrapHeaders: boolean;
  content: ReactNode;
  canSort: boolean;
  sorted: false | "asc" | "desc";
  labels: Pick<DataTableToolsLabels, "sortAscending" | "sortDescending" | "hideColumn">;
}) {
  const canHide = props.header.column.getCanHide();
  const canMenu = props.canSort || canHide;

  if (!canMenu) {
    return (
      <div
        className={cn(
          "inline-flex min-h-8 max-w-full items-center gap-1 px-2 py-1.5 text-callout",
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
            "group inline-flex min-h-8 max-w-full items-center gap-1 rounded-md px-2 py-1.5 text-callout transition-colors hover:bg-muted/50",
            props.justifyClass,
          )}
          tapScale={1}
        >
          <div className={cn("min-w-0 max-w-full", resolveHeaderContentClass(props.wrapHeaders))}>
            {props.content}
          </div>
          <SortStateIcon state={props.sorted} />
        </ButtonPrimitive>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-44">
        {props.canSort ? (
          <>
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
          </>
        ) : null}

        {canHide ? (
          <>
            {props.canSort ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem onClick={() => props.header.column.toggleVisibility(false)}>
              <EyeOff className="size-4" />
              <span>{props.labels.hideColumn}</span>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

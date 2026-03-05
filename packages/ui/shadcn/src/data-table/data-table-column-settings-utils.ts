"use client";

import * as React from "react";
import type { Table as ReactTable } from "@tanstack/react-table";

export type DataTableColumnMeta = { kind?: string; title?: unknown };

export const DATA_TABLE_LOCKED_START_IDS = new Set<string>(["select"]);
export const DATA_TABLE_LOCKED_END_IDS = new Set<string>(["actions"]);

export function isDataTableColumnLocked(columnId: string): boolean {
  return DATA_TABLE_LOCKED_START_IDS.has(columnId) || DATA_TABLE_LOCKED_END_IDS.has(columnId);
}

export function resolveDataTableColumnLabel(column: {
  id: string;
  columnDef: { header?: unknown; meta?: unknown };
}): string {
  const meta = column.columnDef.meta as DataTableColumnMeta | undefined;
  if (typeof meta?.title === "string" && meta.title.trim()) return meta.title.trim();
  if (typeof column.columnDef.header === "string" && column.columnDef.header.trim()) {
    return column.columnDef.header.trim();
  }
  return column.id;
}

export function normalizeDataTableColumnOrder(
  leafIds: readonly string[],
  order: readonly string[],
): string[] {
  const known = new Set(leafIds);
  const filtered = order.filter((id) => known.has(id));
  const missing = leafIds.filter((id) => !filtered.includes(id));
  return [...filtered, ...missing];
}

function arrayMove<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to) return [...items];
  const next = [...items];
  const [picked] = next.splice(from, 1);
  next.splice(to, 0, picked);
  return next;
}

export function moveDataTableColumnInUnlockedZone(
  order: readonly string[],
  activeId: string,
  overId: string,
): string[] {
  const lockedStart = order.filter((x) => DATA_TABLE_LOCKED_START_IDS.has(x));
  const lockedEnd = order.filter((x) => DATA_TABLE_LOCKED_END_IDS.has(x));
  const middle = order.filter(
    (x) => !DATA_TABLE_LOCKED_START_IDS.has(x) && !DATA_TABLE_LOCKED_END_IDS.has(x),
  );

  const from = middle.indexOf(activeId);
  const to = middle.indexOf(overId);
  if (from < 0 || to < 0) return [...order];

  const nextMiddle = arrayMove(middle, from, to);
  return [...lockedStart, ...nextMiddle, ...lockedEnd];
}

export function useNormalizedDataTableColumnOrder<TData>(table: ReactTable<TData>): string[] {
  const leafIds = React.useMemo(() => table.getAllLeafColumns().map((c) => c.id), [table]);
  const rawOrder = table.getState().columnOrder ?? [];
  return React.useMemo(() => normalizeDataTableColumnOrder(leafIds, rawOrder), [leafIds, rawOrder]);
}

"use client";

import type { ColumnDef, VisibilityState } from "@tanstack/react-table";

type ColumnMeta = { defaultHidden?: boolean };

function resolveColumnId<TData>(column: ColumnDef<TData, unknown>): string | null {
  if (typeof column.id === "string" && column.id.trim()) return column.id.trim();
  if (
    "accessorKey" in column &&
    typeof column.accessorKey === "string" &&
    column.accessorKey.trim()
  ) {
    return column.accessorKey.trim();
  }
  return null;
}

export function collectLeafColumnIds<TData>(
  columns: readonly ColumnDef<TData, unknown>[],
): readonly string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const visit = (defs: readonly ColumnDef<TData, unknown>[]) => {
    for (const col of defs) {
      if ("columns" in col && Array.isArray(col.columns) && col.columns.length) {
        visit(col.columns as readonly ColumnDef<TData, unknown>[]);
        continue;
      }

      const id = resolveColumnId(col);
      if (!id) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  };

  visit(columns);
  return out;
}

export function resolveDefaultColumnVisibility<TData>(
  columns: readonly ColumnDef<TData, unknown>[],
): VisibilityState {
  const state: VisibilityState = {};

  const visit = (defs: readonly ColumnDef<TData, unknown>[]) => {
    for (const col of defs) {
      const meta = col.meta as ColumnMeta | undefined;
      const colId = resolveColumnId(col);
      if (colId && meta?.defaultHidden) state[colId] = false;

      if ("columns" in col && Array.isArray(col.columns) && col.columns.length) {
        visit(col.columns as readonly ColumnDef<TData, unknown>[]);
      }
    }
  };

  visit(columns);
  return state;
}

export function normalizeSearchDefault(input: string): string {
  return input.trim();
}

export function buildRequestParams<TExtraQuery extends Record<string, unknown>>(
  base: { page: number; size: number; q?: string; ordering?: string },
  mapped: Partial<TExtraQuery>,
  extra: Partial<TExtraQuery>,
): typeof base & Partial<TExtraQuery> {
  // Base query wins on collisions (page/size/q/ordering should be controlled by the table hook).
  return { ...extra, ...mapped, ...base };
}

export function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  const normalize = (v: unknown): unknown => {
    if (v === null) return null;
    if (typeof v !== "object") return v;
    if (v instanceof Date) return v.toISOString();
    if (Array.isArray(v)) return v.map((item) => normalize(item));
    if (seen.has(v as object)) return "[Circular]";
    seen.add(v as object);
    const obj = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = normalize(obj[key]);
    }
    return out;
  };

  try {
    return JSON.stringify(normalize(value));
  } catch {
    return String(value);
  }
}

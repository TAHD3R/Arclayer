import type { ColumnDef, SortingState, Updater } from "@tanstack/react-table";

export function applyUpdater<T>(updaterOrValue: Updater<T>, prev: T): T {
  return typeof updaterOrValue === "function"
    ? (updaterOrValue as (old: T) => T)(prev)
    : updaterOrValue;
}

type ColumnSortKeyMap = Record<string, string | undefined>;

function getColumnId<TData>(col: ColumnDef<TData, unknown>): string | undefined {
  if ("id" in col && typeof col.id === "string" && col.id) return col.id;
  if ("accessorKey" in col && typeof col.accessorKey === "string" && col.accessorKey) {
    return col.accessorKey;
  }
  return undefined;
}

export function collectColumnSortKeys<TData>(
  columns: ColumnDef<TData, unknown>[],
): ColumnSortKeyMap {
  const out: ColumnSortKeyMap = {};

  const walk = (defs: ColumnDef<TData, unknown>[]) => {
    for (const col of defs) {
      // Group columns: recurse.
      if ("columns" in col && Array.isArray(col.columns)) {
        walk(col.columns as ColumnDef<TData, unknown>[]);
      }

      const id = getColumnId(col);
      const sortKey = col.meta?.sortKey;
      if (id) out[id] = sortKey;
    }
  };

  walk(columns);
  return out;
}

export function buildOrdering(
  sorting: SortingState,
  sortKeyByColumnId: ColumnSortKeyMap,
): string | undefined {
  const parts: string[] = [];
  for (const s of sorting) {
    const sortKey = sortKeyByColumnId[s.id];
    if (!sortKey) continue;
    parts.push(s.desc ? `-${sortKey}` : sortKey);
  }
  return parts.length ? parts.join(",") : undefined;
}

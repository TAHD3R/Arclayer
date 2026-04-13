"use client";

import type { ColumnDef } from "@tanstack/react-table";
import * as React from "react";

import { normalizeDataTableColumnOrder } from "./data-table-column-settings-utils";
import {
  readPreferencesState,
  updatePreferencesState,
  type DataTablePreferencesStorageOptions,
} from "./storage";
import { collectLeafColumnIds } from "./use-data-table-utils";

function isSameOrder(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((id, index) => id === b[index]);
}

export function useDataTableColumnOrderPreference<TData>(params: {
  tableId: string;
  columns: readonly ColumnDef<TData, unknown>[];
  storage?: DataTablePreferencesStorageOptions;
}): {
  initialColumnOrder: string[] | undefined;
  onColumnOrderChange: (next: readonly string[]) => void;
} {
  const leafIds = React.useMemo(() => collectLeafColumnIds(params.columns), [params.columns]);

  const initialColumnOrder = React.useMemo(() => {
    const persisted = readPreferencesState(params.tableId, params.storage);
    const persistedOrder = persisted?.columnOrder;
    if (!persistedOrder?.length) return undefined;
    return normalizeDataTableColumnOrder(leafIds, persistedOrder);
  }, [leafIds, params.storage, params.tableId]);

  const onColumnOrderChange = React.useCallback(
    (next: readonly string[]) => {
      const normalized = normalizeDataTableColumnOrder(leafIds, next);
      updatePreferencesState(
        params.tableId,
        { columnOrder: isSameOrder(normalized, leafIds) ? null : normalized },
        params.storage,
      );
    },
    [leafIds, params.storage, params.tableId],
  );

  return { initialColumnOrder, onColumnOrderChange };
}

"use client";

import * as React from "react";

import type { DataTableRowHeight } from "./types";
import { resolveDataTableRowHeight } from "./types";
import {
  readPreferencesState,
  updatePreferencesState,
  type DataTablePreferencesStorageOptions,
} from "./storage";

export function useDataTableRowHeightPreference(params: {
  tableId: string;
  defaultRowHeight?: DataTableRowHeight;
  storage?: DataTablePreferencesStorageOptions;
}): readonly [DataTableRowHeight, (next: DataTableRowHeight) => void] {
  const defaultRowHeight = resolveDataTableRowHeight(params.defaultRowHeight ?? "medium");

  const [rowHeight, setRowHeight] = React.useState<DataTableRowHeight>(() => {
    const persisted = readPreferencesState(params.tableId, params.storage);
    return resolveDataTableRowHeight(
      persisted?.rowHeight ?? persisted?.density ?? defaultRowHeight,
    );
  });

  React.useEffect(() => {
    const persisted = readPreferencesState(params.tableId, params.storage);
    setRowHeight(
      resolveDataTableRowHeight(persisted?.rowHeight ?? persisted?.density ?? defaultRowHeight),
    );
  }, [defaultRowHeight, params.storage, params.tableId]);

  const onChange = React.useCallback(
    (next: DataTableRowHeight) => {
      const normalized = resolveDataTableRowHeight(next);
      setRowHeight(normalized);
      updatePreferencesState(
        params.tableId,
        { rowHeight: normalized === defaultRowHeight ? null : normalized },
        params.storage,
      );
    },
    [defaultRowHeight, params.storage, params.tableId],
  );

  return [rowHeight, onChange] as const;
}

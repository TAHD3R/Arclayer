"use client";

import * as React from "react";

import type { DataTableDensity } from "./types";
import {
  readPreferencesState,
  updatePreferencesState,
  type DataTablePreferencesStorageOptions,
} from "./storage";

function clampDensity(value: DataTableDensity): DataTableDensity {
  if (value === "compact") return "compact";
  if (value === "relaxed") return "relaxed";
  return "default";
}

export function useDataTableDensityPreference(params: {
  tableId: string;
  defaultDensity?: DataTableDensity;
  storage?: DataTablePreferencesStorageOptions;
}): readonly [DataTableDensity, (next: DataTableDensity) => void] {
  const defaultDensity = clampDensity(params.defaultDensity ?? "default");

  const [density, setDensity] = React.useState<DataTableDensity>(() => {
    const persisted = readPreferencesState(params.tableId, params.storage);
    const persistedDensity = persisted?.density;
    return persistedDensity ? clampDensity(persistedDensity) : defaultDensity;
  });

  React.useEffect(() => {
    const persisted = readPreferencesState(params.tableId, params.storage);
    const persistedDensity = persisted?.density;
    setDensity(persistedDensity ? clampDensity(persistedDensity) : defaultDensity);
  }, [defaultDensity, params.storage, params.tableId]);

  const onChange = React.useCallback(
    (next: DataTableDensity) => {
      const normalized = clampDensity(next);
      setDensity(normalized);
      updatePreferencesState(
        params.tableId,
        { density: normalized === defaultDensity ? null : normalized },
        params.storage,
      );
    },
    [defaultDensity, params.storage, params.tableId],
  );

  return [density, onChange] as const;
}

"use client";

import * as React from "react";

import {
  readPreferencesState,
  updatePreferencesState,
  type DataTablePreferencesStorageOptions,
} from "./storage";

export function useDataTableWrapHeadersPreference(params: {
  tableId: string;
  defaultWrapHeaders?: boolean;
  storage?: DataTablePreferencesStorageOptions;
}): readonly [boolean, (next: boolean) => void] {
  const defaultWrapHeaders = params.defaultWrapHeaders ?? false;

  const [wrapHeaders, setWrapHeaders] = React.useState<boolean>(() => {
    const persisted = readPreferencesState(params.tableId, params.storage);
    return persisted?.wrapHeaders ?? defaultWrapHeaders;
  });

  React.useEffect(() => {
    const persisted = readPreferencesState(params.tableId, params.storage);
    setWrapHeaders(persisted?.wrapHeaders ?? defaultWrapHeaders);
  }, [defaultWrapHeaders, params.storage, params.tableId]);

  const onChange = React.useCallback(
    (next: boolean) => {
      setWrapHeaders(next);
      updatePreferencesState(
        params.tableId,
        { wrapHeaders: next === defaultWrapHeaders ? null : next },
        params.storage,
      );
    },
    [defaultWrapHeaders, params.storage, params.tableId],
  );

  return [wrapHeaders, onChange] as const;
}

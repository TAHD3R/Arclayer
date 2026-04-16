"use client";

import * as React from "react";

import {
  readPreferencesState,
  updatePreferencesState,
  type DataTablePreferencesStorageOptions,
} from "./storage";

export function useDataTableWrapContentPreference(params: {
  tableId: string;
  defaultWrapContent?: boolean;
  storage?: DataTablePreferencesStorageOptions;
}): readonly [boolean, (next: boolean) => void] {
  const defaultWrapContent = params.defaultWrapContent ?? false;

  const [wrapContent, setWrapContent] = React.useState<boolean>(() => {
    const persisted = readPreferencesState(params.tableId, params.storage);
    return persisted?.wrapContent ?? defaultWrapContent;
  });

  React.useEffect(() => {
    const persisted = readPreferencesState(params.tableId, params.storage);
    setWrapContent(persisted?.wrapContent ?? defaultWrapContent);
  }, [defaultWrapContent, params.storage, params.tableId]);

  const onChange = React.useCallback(
    (next: boolean) => {
      setWrapContent(next);
      updatePreferencesState(
        params.tableId,
        { wrapContent: next === defaultWrapContent ? null : next },
        params.storage,
      );
    },
    [defaultWrapContent, params.storage, params.tableId],
  );

  return [wrapContent, onChange] as const;
}

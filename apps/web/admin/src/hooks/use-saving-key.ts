import * as React from "react";

export type WithSavingKeyFn = (key: string, fn: () => Promise<void>) => Promise<void>;

export function useSavingKey(): { savingKey: string | null; withSavingKey: WithSavingKeyFn } {
  const [savingKey, setSavingKey] = React.useState<string | null>(null);

  const withSavingKey = React.useCallback<WithSavingKeyFn>(async (key, fn) => {
    setSavingKey(key);
    try {
      await fn();
    } finally {
      setSavingKey(null);
    }
  }, []);

  return { savingKey, withSavingKey };
}

import * as React from "react";

interface CommonControlledStateProps<T> {
  value?: T;
  defaultValue?: T;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useControlledState<T, Rest extends any[] = []>(
  props: CommonControlledStateProps<T> & {
    onChange?: (value: T, ...args: Rest) => void;
  },
): readonly [T, (next: T, ...args: Rest) => void] {
  const { value, defaultValue, onChange } = props;
  const isControlled = value !== undefined;
  const skipNextControlledSyncRef = React.useRef(false);

  const [state, setInternalState] = React.useState<T>(
    isControlled ? (value as T) : (defaultValue as T),
  );

  React.useLayoutEffect(() => {
    if (!isControlled) return;
    if (skipNextControlledSyncRef.current) {
      skipNextControlledSyncRef.current = false;
      return;
    }
    if (Object.is(state, value)) return;
    setInternalState(value as T);
  });

  const setState = React.useCallback(
    (next: T, ...args: Rest) => {
      if (isControlled) skipNextControlledSyncRef.current = true;
      setInternalState(next);
      onChange?.(next, ...args);
    },
    [isControlled, onChange],
  );

  return [state, setState] as const;
}

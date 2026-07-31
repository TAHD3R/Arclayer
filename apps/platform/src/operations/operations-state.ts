import { useCallback, useEffect, useRef, useState } from "react";

export type OperationsQueryState<T> =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "ready"; data: T; refreshing: boolean }>
  | Readonly<{ status: "error"; error: unknown }>;

export function useOperationsQuery<T>(
  load: (signal: AbortSignal) => Promise<T>,
  dependencies: readonly unknown[],
) {
  const [state, setState] = useState<OperationsQueryState<T>>({ status: "loading" });
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState((current) =>
      current.status === "ready"
        ? { status: "ready", data: current.data, refreshing: true }
        : { status: "loading" },
    );
    void load(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ status: "ready", data, refreshing: false });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setState({ status: "error", error });
      },
    );
    return () => controller.abort();
  }, [...dependencies, load, retryVersion]);

  const retry = useCallback(() => setRetryVersion((current) => current + 1), []);
  return { state, retry };
}

export type OperationsMutationState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "pending" }>
  | Readonly<{ status: "error"; error: unknown }>;

export function useOperationsMutation<TArgs, TResult>(
  mutate: (args: TArgs) => Promise<TResult>,
  onSuccess: (result: TResult) => void | Promise<void>,
) {
  const activeMutation = useRef(0);
  const [state, setState] = useState<OperationsMutationState>({ status: "idle" });

  const execute = useCallback(
    async (args: TArgs): Promise<TResult | undefined> => {
      const mutationId = activeMutation.current + 1;
      activeMutation.current = mutationId;
      setState({ status: "pending" });
      try {
        const result = await mutate(args);
        if (activeMutation.current !== mutationId) return undefined;
        await onSuccess(result);
        setState({ status: "idle" });
        return result;
      } catch (error) {
        if (activeMutation.current === mutationId) setState({ status: "error", error });
        return undefined;
      }
    },
    [mutate, onSuccess],
  );

  const reset = useCallback(() => setState({ status: "idle" }), []);
  return { execute, reset, state };
}

import { useCallback, useMemo, useState } from "react";

/**
 * Keep a stable payload snapshot across close animations.
 * This prevents close-transition flicker where i18n interpolations temporarily
 * fall back to raw/default values while dialog content is still visible.
 */
export function useDialogSnapshotState<T>() {
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<T | null>(null);
  const [snapshot, setSnapshot] = useState<T | null>(null);

  const clearPayload = useCallback(() => {
    setPayload(null);
    setSnapshot(null);
  }, []);

  const openWith = useCallback((nextPayload: T) => {
    setPayload(nextPayload);
    setSnapshot(nextPayload);
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setPayload(null);
    // Keep snapshot until next openWith/clearPayload so the closing frame remains stable.
  }, []);

  const onOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        setOpen(true);
        return;
      }
      close();
    },
    [close],
  );

  const displayPayload = useMemo(() => payload ?? snapshot, [payload, snapshot]);

  return {
    open,
    payload,
    displayPayload,
    openWith,
    close,
    onOpenChange,
    setPayload,
    setOpen,
    clearPayload,
  } as const;
}

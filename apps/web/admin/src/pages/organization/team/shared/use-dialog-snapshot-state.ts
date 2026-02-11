import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type UseDialogSnapshotStateOptions = {
  closeDelayMs?: number;
};

const DEFAULT_CLOSE_DELAY_MS = 220;

export function useDialogSnapshotState<T>(options: UseDialogSnapshotStateOptions = {}) {
  const closeDelayMs = options.closeDelayMs ?? DEFAULT_CLOSE_DELAY_MS;

  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<T | null>(null);
  const [snapshot, setSnapshot] = useState<T | null>(null);

  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (!closeTimerRef.current) return;
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const clearPayload = useCallback(() => {
    setPayload(null);
    setSnapshot(null);
  }, []);

  const openWith = useCallback(
    (nextPayload: T) => {
      clearCloseTimer();
      setPayload(nextPayload);
      setSnapshot(nextPayload);
      setOpen(true);
    },
    [clearCloseTimer],
  );

  const close = useCallback(() => {
    setOpen(false);
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      clearPayload();
      closeTimerRef.current = null;
    }, closeDelayMs);
  }, [clearCloseTimer, clearPayload, closeDelayMs]);

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

  useEffect(() => {
    return () => {
      clearCloseTimer();
    };
  }, [clearCloseTimer]);

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

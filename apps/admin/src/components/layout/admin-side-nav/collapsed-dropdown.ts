import { useCallback, useEffect, useRef, useState } from "react";

const COLLAPSED_DROPDOWN_CLOSE_DELAY_MS = 160;
const COLLAPSED_DROPDOWN_REOPEN_DELAY_MS = 180;

export type CollapsedDropdownController = {
  openKey: string | null;
  isOpen: (key: string) => boolean;
  open: (key: string) => void;
  close: () => void;
  scheduleClose: () => void;
  toggle: (key: string) => void;
  markActivity: () => void;
};

export function useCollapsedDropdownController(): CollapsedDropdownController {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const reopenTimerRef = useRef<number | null>(null);
  const pendingOpenKeyRef = useRef<string | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current === null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const clearReopenTimer = useCallback(() => {
    if (reopenTimerRef.current === null) return;
    window.clearTimeout(reopenTimerRef.current);
    reopenTimerRef.current = null;
  }, []);

  const close = useCallback(() => {
    pendingOpenKeyRef.current = null;
    clearCloseTimer();
    clearReopenTimer();
    setOpenKey(null);
  }, [clearCloseTimer, clearReopenTimer]);

  const open = useCallback(
    (key: string) => {
      clearCloseTimer();
      setOpenKey((currentOpenKey) => {
        if (currentOpenKey === key) {
          pendingOpenKeyRef.current = null;
          clearReopenTimer();
          return currentOpenKey;
        }

        if (pendingOpenKeyRef.current === key) {
          return currentOpenKey;
        }

        if (currentOpenKey !== null) {
          pendingOpenKeyRef.current = key;
          clearReopenTimer();
          reopenTimerRef.current = window.setTimeout(() => {
            setOpenKey(key);
            pendingOpenKeyRef.current = null;
            reopenTimerRef.current = null;
          }, COLLAPSED_DROPDOWN_REOPEN_DELAY_MS);
          return null;
        }

        pendingOpenKeyRef.current = null;
        clearReopenTimer();
        return key;
      });
    },
    [clearCloseTimer, clearReopenTimer],
  );

  const scheduleClose = useCallback(() => {
    pendingOpenKeyRef.current = null;
    clearCloseTimer();
    clearReopenTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setOpenKey(null);
      closeTimerRef.current = null;
    }, COLLAPSED_DROPDOWN_CLOSE_DELAY_MS);
  }, [clearCloseTimer, clearReopenTimer]);

  const toggle = useCallback(
    (key: string) => {
      if (openKey === key) {
        close();
        return;
      }
      open(key);
    },
    [close, open, openKey],
  );

  const markActivity = useCallback(() => {
    clearCloseTimer();
  }, [clearCloseTimer]);

  useEffect(() => {
    return () => {
      pendingOpenKeyRef.current = null;
      clearCloseTimer();
      clearReopenTimer();
    };
  }, [clearCloseTimer, clearReopenTimer]);

  return {
    openKey,
    isOpen: (key: string) => openKey === key,
    open,
    close,
    scheduleClose,
    toggle,
    markActivity,
  };
}

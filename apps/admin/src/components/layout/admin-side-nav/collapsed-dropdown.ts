import { useCallback, useEffect, useRef, useState } from "react";

const COLLAPSED_DROPDOWN_IDLE_CLOSE_DELAY_MS = 2000;
const COLLAPSED_DROPDOWN_ACTIVITY_THROTTLE_MS = 150;

export type CollapsedDropdownController = {
  openKey: string | null;
  isOpen: (key: string) => boolean;
  open: (key: string) => void;
  close: () => void;
  toggle: (key: string) => void;
  markActivity: () => void;
};

export function useCollapsedDropdownController(): CollapsedDropdownController {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const openKeyRef = useRef<string | null>(null);
  const idleTimerRef = useRef<number | null>(null);
  const lastActivityAtRef = useRef<number>(0);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current === null) return;
    window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = null;
  }, []);

  const scheduleIdleClose = useCallback(
    (key: string) => {
      clearIdleTimer();
      idleTimerRef.current = window.setTimeout(() => {
        if (openKeyRef.current !== key) return;
        openKeyRef.current = null;
        setOpenKey(null);
      }, COLLAPSED_DROPDOWN_IDLE_CLOSE_DELAY_MS);
    },
    [clearIdleTimer],
  );

  const open = useCallback(
    (key: string) => {
      openKeyRef.current = key;
      lastActivityAtRef.current = Date.now();
      setOpenKey(key);
      scheduleIdleClose(key);
    },
    [scheduleIdleClose],
  );

  const close = useCallback(() => {
    openKeyRef.current = null;
    lastActivityAtRef.current = 0;
    clearIdleTimer();
    setOpenKey(null);
  }, [clearIdleTimer]);

  const toggle = useCallback(
    (key: string) => {
      const nextKey = openKeyRef.current === key ? null : key;
      openKeyRef.current = nextKey;
      lastActivityAtRef.current = nextKey ? Date.now() : 0;
      clearIdleTimer();
      setOpenKey(nextKey);
      if (nextKey) scheduleIdleClose(nextKey);
    },
    [clearIdleTimer, scheduleIdleClose],
  );

  const markActivity = useCallback(() => {
    const key = openKeyRef.current;
    if (!key) return;
    const now = Date.now();
    if (now - lastActivityAtRef.current < COLLAPSED_DROPDOWN_ACTIVITY_THROTTLE_MS) return;
    lastActivityAtRef.current = now;
    scheduleIdleClose(key);
  }, [scheduleIdleClose]);

  useEffect(() => {
    openKeyRef.current = openKey;
  }, [openKey]);

  useEffect(() => clearIdleTimer, [clearIdleTimer]);

  return {
    openKey,
    isOpen: (key: string) => openKey === key,
    open,
    close,
    toggle,
    markActivity,
  };
}

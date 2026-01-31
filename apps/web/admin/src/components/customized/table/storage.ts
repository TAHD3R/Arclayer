import { STORAGE_KEYS } from "@/constants/storage";

import type { VisibilityState } from "@tanstack/react-table";

const VISIBILITY_VERSION = "v1";

export function buildVisibilityStorageKey(tableId: string): string {
  // Keep consistent with other admin storage keys.
  return `${STORAGE_KEYS.dataTableVisibility}:${tableId}:${VISIBILITY_VERSION}`;
}

export function readVisibilityState(tableId: string): VisibilityState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(buildVisibilityStorageKey(tableId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as VisibilityState;
  } catch {
    return null;
  }
}

export function writeVisibilityState(tableId: string, state: VisibilityState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(buildVisibilityStorageKey(tableId), JSON.stringify(state));
  } catch {
    // ignore storage errors
  }
}

export function clearVisibilityState(tableId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(buildVisibilityStorageKey(tableId));
  } catch {
    // ignore storage errors
  }
}

import type { VisibilityState } from "@tanstack/react-table";

const DEFAULT_VISIBILITY_KEY_PREFIX = "celestial:admin:dataTable:visibility";
const DEFAULT_VISIBILITY_VERSION = "v1";

export type DataTableVisibilityStorageOptions = {
  /**
   * Storage key prefix.
   *
   * Defaults to the Admin-compatible prefix so existing persisted visibility state remains stable.
   * Other apps should override this (e.g. `celestial:studio:dataTable:visibility`).
   */
  keyPrefix?: string;
  version?: string;
};

function resolveVisibilityOptions(
  options: DataTableVisibilityStorageOptions | undefined,
): Required<DataTableVisibilityStorageOptions> {
  return {
    keyPrefix: options?.keyPrefix ?? DEFAULT_VISIBILITY_KEY_PREFIX,
    version: options?.version ?? DEFAULT_VISIBILITY_VERSION,
  };
}

export function buildVisibilityStorageKey(
  tableId: string,
  options?: DataTableVisibilityStorageOptions,
): string {
  const resolved = resolveVisibilityOptions(options);
  return `${resolved.keyPrefix}:${tableId}:${resolved.version}`;
}

export function readVisibilityState(
  tableId: string,
  options?: DataTableVisibilityStorageOptions,
): VisibilityState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(buildVisibilityStorageKey(tableId, options));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as VisibilityState;
  } catch (error) {
    console.error("Failed to read data-table column visibility from localStorage.", error);
    return null;
  }
}

export function writeVisibilityState(
  tableId: string,
  state: VisibilityState,
  options?: DataTableVisibilityStorageOptions,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(buildVisibilityStorageKey(tableId, options), JSON.stringify(state));
  } catch (error) {
    console.error("Failed to persist data-table column visibility to localStorage.", error);
  }
}

export function clearVisibilityState(
  tableId: string,
  options?: DataTableVisibilityStorageOptions,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(buildVisibilityStorageKey(tableId, options));
  } catch (error) {
    console.error("Failed to clear data-table column visibility from localStorage.", error);
  }
}

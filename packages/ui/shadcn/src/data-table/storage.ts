import type { VisibilityState } from "@tanstack/react-table";

import type { DataTableDensity } from "./types";

const DEFAULT_VISIBILITY_KEY_PREFIX = "arclayer:admin:dataTable:visibility";
const DEFAULT_VISIBILITY_VERSION = "v1";

const DEFAULT_PREFERENCES_KEY_PREFIX = "arclayer:admin:dataTable:preferences";
const DEFAULT_PREFERENCES_VERSION = "v1";

export type DataTableVisibilityStorageOptions = {
  /**
   * Storage key prefix.
   *
   * Defaults to the Admin-compatible prefix so existing persisted visibility state remains stable.
   * Other apps should override this (e.g. `arclayer:studio:dataTable:visibility`).
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

export type DataTablePreferencesStorageOptions = {
  /**
   * Storage key prefix.
   *
   * Defaults to the Admin-compatible prefix.
   * Other apps should override this (e.g. `arclayer:studio:dataTable:preferences`).
   */
  keyPrefix?: string;
  version?: string;
};

export type DataTablePreferencesState = {
  columnOrder?: string[];
  density?: DataTableDensity;
};

export type DataTablePreferencesPatch = {
  columnOrder?: string[] | null;
  density?: DataTableDensity | null;
};

function resolvePreferencesOptions(
  options: DataTablePreferencesStorageOptions | undefined,
): Required<DataTablePreferencesStorageOptions> {
  return {
    keyPrefix: options?.keyPrefix ?? DEFAULT_PREFERENCES_KEY_PREFIX,
    version: options?.version ?? DEFAULT_PREFERENCES_VERSION,
  };
}

export function buildVisibilityStorageKey(
  tableId: string,
  options?: DataTableVisibilityStorageOptions,
): string {
  const resolved = resolveVisibilityOptions(options);
  return `${resolved.keyPrefix}:${tableId}:${resolved.version}`;
}

export function buildPreferencesStorageKey(
  tableId: string,
  options?: DataTablePreferencesStorageOptions,
): string {
  const resolved = resolvePreferencesOptions(options);
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

function isDensity(value: unknown): value is DataTableDensity {
  return value === "compact" || value === "default" || value === "relaxed";
}

function normalizePreferencesState(input: unknown): DataTablePreferencesState | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;

  const columnOrder = Array.isArray(obj.columnOrder)
    ? obj.columnOrder.filter((x) => typeof x === "string" && x.trim()).map((x) => String(x))
    : undefined;

  const density = isDensity(obj.density) ? obj.density : undefined;

  if (!columnOrder?.length && !density) return null;
  return {
    ...(columnOrder?.length ? { columnOrder } : {}),
    ...(density ? { density } : {}),
  };
}

export function readPreferencesState(
  tableId: string,
  options?: DataTablePreferencesStorageOptions,
): DataTablePreferencesState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(buildPreferencesStorageKey(tableId, options));
    if (!raw) return null;
    return normalizePreferencesState(JSON.parse(raw));
  } catch (error) {
    console.error("Failed to read data-table preferences from localStorage.", error);
    return null;
  }
}

export function writePreferencesState(
  tableId: string,
  state: DataTablePreferencesState,
  options?: DataTablePreferencesStorageOptions,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      buildPreferencesStorageKey(tableId, options),
      JSON.stringify(state),
    );
  } catch (error) {
    console.error("Failed to persist data-table preferences to localStorage.", error);
  }
}

export function clearPreferencesState(
  tableId: string,
  options?: DataTablePreferencesStorageOptions,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(buildPreferencesStorageKey(tableId, options));
  } catch (error) {
    console.error("Failed to clear data-table preferences from localStorage.", error);
  }
}

export function updatePreferencesState(
  tableId: string,
  patch: DataTablePreferencesPatch,
  options?: DataTablePreferencesStorageOptions,
): void {
  const prev = readPreferencesState(tableId, options);
  const merged: DataTablePreferencesState = {
    ...(prev?.columnOrder ? { columnOrder: prev.columnOrder } : {}),
    ...(prev?.density ? { density: prev.density } : {}),
  };

  if (patch.columnOrder === null) delete merged.columnOrder;
  else if (patch.columnOrder !== undefined) merged.columnOrder = patch.columnOrder;

  if (patch.density === null) delete merged.density;
  else if (patch.density !== undefined) merged.density = patch.density;

  if (!merged.columnOrder?.length && !merged.density) {
    clearPreferencesState(tableId, options);
    return;
  }

  writePreferencesState(tableId, merged, options);
}

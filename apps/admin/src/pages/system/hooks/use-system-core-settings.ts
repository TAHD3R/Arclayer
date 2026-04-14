import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getSystemCoreSettings, patchSystemCoreSettings } from "@/api/settings";

export type SystemSettingsRecord = Record<string, unknown>;
export const SYSTEM_CORE_SETTINGS_QUERY_KEY = ["settings", "system", "core"] as const;

type SettingsLike =
  | {
      value?: unknown;
      secrets?: unknown;
    }
  | null
  | undefined;

function asRecord(input: unknown): SystemSettingsRecord {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return input as SystemSettingsRecord;
}

export function getSystemSettingsSection(
  settings: SettingsLike,
  sectionKey: string,
): SystemSettingsRecord {
  return asRecord(asRecord(settings?.value)[sectionKey]);
}

export function getSystemSettingsSecrets(settings: SettingsLike): SystemSettingsRecord {
  return asRecord(settings?.secrets);
}

export function readStringValue(record: SystemSettingsRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function readRecordValue(record: SystemSettingsRecord, key: string): SystemSettingsRecord {
  return asRecord(record[key]);
}

export function readNumberValue(record: SystemSettingsRecord, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function readBooleanValue(record: SystemSettingsRecord, key: string): boolean | null {
  const value = record[key];
  return typeof value === "boolean" ? value : null;
}

export function readStringArrayValue(record: SystemSettingsRecord, key: string): string[] {
  const value = record[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export function useSystemCoreSettings() {
  const query = useQuery({
    queryKey: SYSTEM_CORE_SETTINGS_QUERY_KEY,
    queryFn: async () => getSystemCoreSettings(),
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  return {
    ...query,
    coreSettings: query.data ?? null,
  } as const;
}

export function usePatchSystemCoreSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (patch: Record<string, unknown>) => patchSystemCoreSettings(patch),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: SYSTEM_CORE_SETTINGS_QUERY_KEY,
      });
    },
  });
}

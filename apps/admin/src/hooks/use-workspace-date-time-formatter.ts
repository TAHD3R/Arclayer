import {
  type AdminLocalizationSnapshot,
  type FormatDateTimeOptions,
  useAdminDateTimeFormatter,
} from "@/hooks/use-admin-date-time-formatter";

export type WorkspaceLocalizationSnapshot = AdminLocalizationSnapshot;
export type { FormatDateTimeOptions };

export function useWorkspaceDateTimeFormatter(params?: { workspaceId?: string | null }) {
  return useAdminDateTimeFormatter(params);
}

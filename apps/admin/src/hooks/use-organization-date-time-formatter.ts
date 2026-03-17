import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";

export function useOrganizationDateTimeFormatter() {
  return useAdminDateTimeFormatter({ workspaceId: null });
}

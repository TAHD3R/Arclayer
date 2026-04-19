import type { AppLocale } from "@/lib/i18n";
import type { WorkspaceSettingsTabKey } from "@/types/settings-workspace";

export type WorkspaceSettingsFormValues = {
  name: string;
  description: string;
  slug: string;
  locale: AppLocale;
  timezone: string;
  useBrowserTimeZone: boolean;
  dateFormat: string;
  useRelativeDateTime: boolean;
  defaultRoleCode: string;
  assignRoleCode: string;
};

export type AssignRoleDialogValues = {
  confirmName: string;
};

export type LeaveWorkspaceDialogValues = {
  confirmText: string;
};

export type DeleteWorkspaceDialogValues = {
  confirmName: string;
};

export type WorkspaceSettingsPageProps = {
  activeTab: WorkspaceSettingsTabKey;
  workspaceIdOverride?: string | null;
};

export type WorkspaceSettingsTabNavigation = {
  to: "/settings/workspace/general";
  search?: (prev: Record<string, unknown>) => Record<string, unknown>;
};

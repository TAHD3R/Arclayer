import type { AppLocale } from "@/lib/i18n";
import type { WorkspaceSettingsTabKey } from "@/types/settings-workspace";

export type WorkspaceSettingsFormValues = {
  name: string;
  slug: string;
  iconUrl: string;
  locale: AppLocale;
  timezone: string;
  dateFormat: string;
  defaultRoleCode: string;
  assignRoleCode: string;
  contentAutosaveEnabled: boolean;
  contentAutosaveIntervalSec: number;
  contentAutosaveSaveOnBlur: boolean;
  contentRetentionDraftMaxRevisions: number;
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
  to:
    | "/w/$workspaceId/settings/workspace/basics"
    | "/w/$workspaceId/settings/workspace/content-strategy"
    | "/w/$workspaceId/settings/workspace/danger";
  params: { workspaceId: string };
};

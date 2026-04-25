import type { LucideIcon } from "lucide-react";
import type { SettingsSectionTarget } from "@/lib/settings/settings-screen";

export type CommandScopeKind = "workspace" | "organization" | "me" | "none";
export type CommandEntryKind = "page" | "action" | "user" | "asset";
export type CommandSectionId = "recent" | "favorites" | "actions" | "pages" | "users" | "assets";
export type CommandAvatarShape = "circle" | "square";

export type CommandNavigateAction = {
  type: "navigate";
  to: string;
  search?: Record<string, string>;
};

export type CommandCallbackAction = {
  type: "callback";
  run: () => void;
};

export type CommandSettingsAction = {
  type: "settings";
  target: SettingsSectionTarget;
};

export type CommandEntryAction =
  | CommandNavigateAction
  | CommandCallbackAction
  | CommandSettingsAction;

export type RecentCommandRecord = {
  key: string;
  kind: CommandEntryKind;
  title: string;
  subtitle: string;
  keywords: string[];
  to: string;
  search?: Record<string, string>;
  settingsTarget?: SettingsSectionTarget;
  avatarName?: string;
  avatarAssetRef?: string | null;
  avatarShape?: CommandAvatarShape;
  shortcut?: string[];
  visitedAt: string;
};

export type CommandEntry = {
  id: string;
  key: string;
  kind: CommandEntryKind;
  title: string;
  subtitle: string;
  keywords: readonly string[];
  icon?: LucideIcon | null;
  avatar?: {
    name: string;
    assetRef?: string | null;
    shape?: CommandAvatarShape;
  };
  shortcut?: readonly string[];
  meta?: string;
  action: CommandEntryAction;
  recent?: {
    enabled: boolean;
    snapshot: Omit<RecentCommandRecord, "visitedAt">;
  };
};

export type CommandSection = {
  id: CommandSectionId;
  heading: string;
  entries: readonly CommandEntry[];
  loading?: boolean;
  emptyText?: string;
};

export type CommandScope = {
  kind: CommandScopeKind;
  pathname: string;
  workspaceId: string | null;
  projectId: string | null;
  organizationId: string | null;
};

export const SETTINGS_SCREENS = [
  "personal.profile",
  "personal.preferences",
  "personal.notifications",
  "workspace.general",
  "workspace.knowledge",
  "workspace.skills",
  "workspace.design-systems",
  "workspace.plan-usage",
  "workspace.members",
  "workspace.invitations",
  "workspace.roles",
] as const;

export type SettingsScreen = (typeof SETTINGS_SCREENS)[number];

export type SettingsScreenPayload = Readonly<{
  memberId?: string;
  invitationId?: string;
  roleId?: string;
  field?: string;
  skillAction?: "import";
}>;

export type SettingsSectionTarget = Readonly<{
  screen: SettingsScreen;
  section?: string;
  payload?: SettingsScreenPayload;
}>;

export type SettingsScreenState = Readonly<{
  open: boolean;
  screen: SettingsScreen;
  section?: string;
  payload?: SettingsScreenPayload;
  focusRequestId: number;
}>;

export const DEFAULT_SETTINGS_SCREEN: SettingsScreen = "personal.profile";

const SETTINGS_SCREEN_SET = new Set<string>(SETTINGS_SCREENS);

export function isSettingsScreen(value: unknown): value is SettingsScreen {
  return typeof value === "string" && SETTINGS_SCREEN_SET.has(value);
}

export type MyWorkspaceMemberPreview = {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export type WorkspaceIconMode = "initials" | "glyph" | "emoji" | "image";

export type WorkspaceIconMetadata = {
  iconMode: WorkspaceIconMode;
  iconColor: string;
  iconGlyph?: string | null;
  iconEmoji?: string | null;
  iconUrl?: string | null;
};

export type MyWorkspace = {
  workspaceId: string;
  organizationId: string;
  slug: string;
  name: string;
  kind: "team";
  description?: string | null;
  iconMode: WorkspaceIconMode;
  iconColor: string;
  iconGlyph?: string | null;
  iconEmoji?: string | null;
  iconUrl?: string | null;
  memberCount?: number;
  membersPreview?: MyWorkspaceMemberPreview[];
  createdAt?: string | null;
  visibleOnly: boolean;
  isCreatorAdmin: boolean;
  isLegacy: boolean;
};

export type InstanceSetupState = {
  status: "uninitialized" | "ready" | "repair_required";
  repairReason: string | null;
};

export type WorkspaceSwitcher = {
  teams: MyWorkspace[];
};

export type WorkspaceFirstOnboardingStatus =
  | "pending_workspace"
  | "pending_workspace_defaults"
  | "completed";

export type WorkspaceFirstOnboarding = {
  status: WorkspaceFirstOnboardingStatus;
  workspaceId: string | null;
  workspace_id?: string | null;
};

export type WorkspaceSlugAvailability = {
  normalizedSlug: string | null;
  available: boolean;
  reason: "invalid" | "reserved" | "exists" | null;
  normalized_slug?: string | null;
};

export type OnboardingWorkspaceCreatePayload = {
  name?: string;
  slug?: string;
};

export type OnboardingWorkspaceCreateResult = {
  workspaceId: string;
  workspace_id?: string;
};

export type MyWorkspaceListResult = {
  items: MyWorkspace[];
  switcher: WorkspaceSwitcher;
  instanceSetup: InstanceSetupState;
  onboarding?: WorkspaceFirstOnboarding;
};

export type AuthzSnapshot = {
  userId: string;
  roleCodes: string[];
  permissionCodes: string[];
  isSuperuser: boolean;
};

export type WorkspaceDetail = {
  id: string;
  organizationId: string;
  slug: string;
  name: string;
  description?: string | null;
  kind?: "team";
  iconMode: WorkspaceIconMode;
  iconColor: string;
  iconGlyph?: string | null;
  iconEmoji?: string | null;
  iconUrl: string | null;
  iconAssetAligned?: boolean;
};

export type WorkspaceRolePolicy = {
  workspaceId: string;
  defaultRoleCode: string;
};

export type WorkspaceAssignRoleResult = {
  workspaceId: string;
  roleCode: string;
  updatedCount: number;
};

export type LeaveWorkspaceResult = {
  workspaceId: string;
  membershipId: string;
  left: boolean;
};

export type WorkspaceDeleteResult = {
  workspaceId: string;
  deleted: boolean;
};

export type WorkspaceDangerAction = {
  enabled: boolean;
  blockedReason: string | null;
};

export type WorkspaceDangerCapabilities = {
  workspaceId: string;
  organizationId: string;
  confirmLeaveText: string;
  confirmDeleteName: string;
  leaveAction: WorkspaceDangerAction;
  deleteAction: WorkspaceDangerAction;
};

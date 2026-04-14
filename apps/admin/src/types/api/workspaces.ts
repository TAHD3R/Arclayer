export type MyWorkspaceMemberPreview = {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export type MyWorkspace = {
  workspaceId: string;
  organizationId: string;
  slug: string;
  name: string;
  kind: "team" | "personal";
  iconUrl?: string | null;
  memberCount?: number;
  membersPreview?: MyWorkspaceMemberPreview[];
  visibleOnly: boolean;
  isCreatorAdmin: boolean;
  isLegacy: boolean;
};

export type InstanceSetupState = {
  status: "uninitialized" | "ready" | "repair_required";
  repairReason: string | null;
};

export type PersonalSpaceSwitcher = {
  status: "pending" | "ready" | "failed" | "not_created";
  workspace: MyWorkspace | null;
  retryAvailable: boolean;
  lastError: string | null;
};

export type WorkspaceSwitcher = {
  teams: MyWorkspace[];
  personalSpace: PersonalSpaceSwitcher;
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
  kind: "team" | "personal";
  name?: string;
  slug?: string;
};

export type OnboardingWorkspaceCreateResult = {
  workspaceId: string;
  kind: "team" | "personal";
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
  kind?: "team" | "personal";
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

import type { PageData } from "@/types/api/common";

export type DirectoryActorSummary = {
  userId: string;
  username: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
  user_id?: string;
  display_name?: string | null;
  avatar_url?: string | null;
};

export type SystemDirectoryUser = {
  userId: string;
  username: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
  status: string;
  isSuperAdmin: boolean;
  hasPassword: boolean;
  twoFactorEnabled: boolean;
  linkedOauthProviders: string[];
  lastLoginAt: string | null;
  createdAt: string;
  ownedOrganizationsCount: number;
  organizationMembershipCount: number;
  workspaceMembershipCount: number;
  projectMembershipCount: number;
  user_id?: string;
  display_name?: string | null;
  avatar_url?: string | null;
  is_super_admin?: boolean;
  has_password?: boolean;
  two_factor_enabled?: boolean;
  linked_oauth_providers?: string[];
  last_login_at?: string | null;
  created_at?: string;
  owned_organizations_count?: number;
  organization_membership_count?: number;
  workspace_membership_count?: number;
  project_membership_count?: number;
};

export type SystemDirectoryOrganization = {
  organizationId: string;
  name: string;
  slug: string;
  kind: string;
  isActive: boolean;
  createdAt: string;
  owner: DirectoryActorSummary | null;
  memberCount: number;
  workspaceCount: number;
  projectCount: number;
  organization_id?: string;
  is_active?: boolean;
  created_at?: string;
  member_count?: number;
  workspace_count?: number;
  project_count?: number;
};

export type SystemDirectoryWorkspace = {
  workspaceId: string;
  organizationId: string;
  organizationName: string;
  name: string;
  description: string | null;
  isActive: boolean;
  isArchived: boolean;
  createdAt: string;
  owner: DirectoryActorSummary | null;
  memberCount: number;
  projectCount: number;
  workspace_id?: string;
  organization_id?: string;
  organization_name?: string;
  is_active?: boolean;
  is_archived?: boolean;
  created_at?: string;
  member_count?: number;
  project_count?: number;
};

export type SystemDirectoryProject = {
  projectId: string;
  workspaceId: string;
  workspaceName: string;
  organizationId: string;
  organizationName: string;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  owner: DirectoryActorSummary | null;
  memberCount: number;
  project_id?: string;
  workspace_id?: string;
  workspace_name?: string;
  organization_id?: string;
  organization_name?: string;
  is_active?: boolean;
  created_at?: string;
  member_count?: number;
};

export type SystemDirectoryUserDetail = SystemDirectoryUser & {
  updatedAt: string;
  updated_at?: string;
};

export type SystemDirectoryOrganizationDetail = SystemDirectoryOrganization & {
  updatedAt: string;
  logoUrl: string | null;
  updated_at?: string;
  logo_url?: string | null;
};

export type SystemDirectoryWorkspaceDetail = SystemDirectoryWorkspace & {
  updatedAt: string;
  kind: string;
  iconMode: string;
  iconColor: string;
  iconGlyph: string | null;
  iconEmoji: string | null;
  iconUrl: string | null;
  updated_at?: string;
  icon_mode?: string;
  icon_color?: string;
  icon_glyph?: string | null;
  icon_emoji?: string | null;
  icon_url?: string | null;
};

export type SystemDirectoryProjectDetail = SystemDirectoryProject & {
  updatedAt: string;
  iconMode: string;
  iconColor: string;
  iconGlyph: string | null;
  iconEmoji: string | null;
  iconUrl: string | null;
  updated_at?: string;
  icon_mode?: string;
  icon_color?: string;
  icon_glyph?: string | null;
  icon_emoji?: string | null;
  icon_url?: string | null;
};

export type SystemDirectoryUserPage = PageData<SystemDirectoryUser>;
export type SystemDirectoryOrganizationPage = PageData<SystemDirectoryOrganization>;
export type SystemDirectoryWorkspacePage = PageData<SystemDirectoryWorkspace>;
export type SystemDirectoryProjectPage = PageData<SystemDirectoryProject>;

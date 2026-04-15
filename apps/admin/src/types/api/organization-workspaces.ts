export type OrganizationWorkspaceTemplate = "blog" | "website" | "blank";

export type OrganizationWorkspaceMemberPreview = {
  userId: string;
  username: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
};

export type OrganizationWorkspaceMember = {
  membershipId: string;
  userId: string;
  username: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
  joinedAt: string;
};

export type OrganizationWorkspace = {
  id: string;
  workspaceId: string;
  organizationId: string;
  slug: string;
  name: string;
  description: string | null;
  iconMode: "initials" | "glyph" | "emoji" | "image";
  iconColor: string;
  iconGlyph?: string | null;
  iconEmoji?: string | null;
  iconUrl: string | null;
  isArchived: boolean;
  archivedAt: string | null;
  archivedByUserId: string | null;
  memberCount: number;
  membersPreview: OrganizationWorkspaceMemberPreview[];
  createdAt: string;
  enterable: boolean;
};

export type OrganizationWorkspaceArchiveResult = {
  workspaceId: string;
  isArchived: boolean;
  archivedAt: string | null;
  archivedByUserId: string | null;
};

export type OrganizationWorkspaceCreateInput = {
  name: string;
  slug?: string;
  description?: string;
  template: OrganizationWorkspaceTemplate;
  locale?: string;
  timezone?: string;
  dateFormat?: string;
};

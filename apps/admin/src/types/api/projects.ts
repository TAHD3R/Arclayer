export type Project = {
  id: string;
  organizationId: string;
  workspaceId: string;
  slug: string;
  name: string;
  description: string | null;
  iconMode: "initials" | "glyph" | "emoji" | "image";
  iconColor: string;
  iconGlyph?: string | null;
  iconEmoji?: string | null;
  iconUrl: string | null;
  isActive: boolean;
};

export type ProjectRuntime = {
  id: string;
  projectId: string;
  kind: string;
  name: string;
  isActive: boolean;
};

export type ProjectListItem = Project & {
  primaryRuntime: ProjectRuntime | null;
  memberCount: number;
  membersPreview: Array<{
    userId: string;
    username: string;
    displayName: string | null;
    email: string | null;
    avatarUrl: string | null;
  }>;
  archivedAt: string | null;
  archivedByUserId: string | null;
  createdAt: string;
  enterable: boolean;
};

export type ProjectCreateInput = {
  workspaceId: string;
  name: string;
  slug?: string;
  description?: string;
};

export type ProjectUpdateInput = {
  name?: string;
  slug?: string;
  description?: string | null;
  iconMode?: "initials" | "glyph" | "emoji" | "image";
  iconColor?: string | null;
  iconGlyph?: string | null;
  iconEmoji?: string | null;
  iconUrl?: string | null;
};

export type ProjectSlugAvailability = {
  normalizedSlug: string | null;
  available: boolean;
  reason: "invalid" | "reserved" | "exists" | null;
};

export type ProjectDangerAction = {
  enabled: boolean;
  blockedReason: string | null;
};

export type ProjectDangerCapabilities = {
  projectId: string;
  workspaceId: string;
  organizationId: string;
  confirmDeleteName: string;
  archiveAction: ProjectDangerAction;
  deleteAction: ProjectDangerAction;
};

export type ProjectArchiveResult = {
  projectId: string;
  isActive: boolean;
};

export type ProjectDeleteResult = {
  projectId: string;
  deleted: boolean;
};

export type ProjectDetail = {
  project: Project;
  primaryRuntime: ProjectRuntime | null;
};

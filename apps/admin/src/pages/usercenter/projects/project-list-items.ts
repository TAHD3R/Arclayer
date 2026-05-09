import type { ProjectListItem } from "@arclayer/openapi/admin-types";
import type { PageData } from "@arclayer/openapi/admin-types";

export type UserCenterProjectListItemMemberPreview = {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  email: string | null;
};

export type UserCenterProjectListItem = {
  id: string;
  projectId: string;
  workspaceId: string;
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
  membersPreview: UserCenterProjectListItemMemberPreview[];
  createdAt: string;
  enterable: boolean;
  primaryRuntime: ProjectListItem["primaryRuntime"];
};

export function mapProjectToListItem(project: ProjectListItem): UserCenterProjectListItem {
  return {
    id: project.id,
    projectId: project.id,
    workspaceId: project.workspaceId,
    slug: project.slug,
    name: project.name,
    description: project.description,
    iconMode: project.iconMode,
    iconColor: project.iconColor,
    iconGlyph: project.iconGlyph ?? null,
    iconEmoji: project.iconEmoji ?? null,
    iconUrl: project.iconUrl,
    isArchived: !project.isActive,
    archivedAt: project.archivedAt,
    archivedByUserId: project.archivedByUserId,
    memberCount: project.memberCount,
    membersPreview: project.membersPreview.map((member) => ({
      userId: member.userId,
      username: member.username,
      displayName: member.displayName,
      avatarUrl: member.avatarUrl,
      email: member.email,
    })),
    createdAt: project.createdAt,
    enterable: project.enterable,
    primaryRuntime: project.primaryRuntime,
  };
}

export function mapProjectListItemToSidebarBrowseProject(project: UserCenterProjectListItem) {
  return {
    projectId: project.projectId,
    workspaceId: project.workspaceId,
    name: project.name,
    description: project.description,
    enterable: project.enterable,
    iconMode: project.iconMode,
    iconColor: project.iconColor,
    iconGlyph: project.iconGlyph ?? null,
    iconEmoji: project.iconEmoji ?? null,
    iconUrl: project.iconUrl,
  };
}

export function paginateProjectList(
  items: readonly UserCenterProjectListItem[],
  page: number,
  size: number,
): PageData<UserCenterProjectListItem> {
  const safeSize = Math.max(1, size);
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / safeSize));
  const safePage = Math.min(Math.max(1, page), pages);
  const start = (safePage - 1) * safeSize;
  const pagedItems = items.slice(start, start + safeSize);

  return {
    items: pagedItems,
    total,
    page: safePage,
    size: safeSize,
    pages,
    next: safePage < pages ? safePage + 1 : null,
    prev: safePage > 1 ? safePage - 1 : null,
  };
}

import type { PageData } from "@arclayer/openapi/admin-types";
import type { WorkspaceManageListItem } from "@arclayer/openapi/admin-types";

export type UserCenterWorkspaceListItemMemberPreview = {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  email: string | null;
};

export type UserCenterWorkspaceListItem = {
  id: string;
  workspaceId: string;
  projectId: string | null;
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
  membersPreview: UserCenterWorkspaceListItemMemberPreview[];
  createdAt: string | null;
  enterable: boolean;
};

export function mapWorkspaceManageListItemToListItem(
  workspace: WorkspaceManageListItem,
): UserCenterWorkspaceListItem {
  const membersPreview = workspace.membersPreview ?? [];
  return {
    ...workspace,
    projectId: workspace.projectId ?? null,
    description: workspace.description ?? null,
    createdAt: workspace.createdAt ?? null,
    iconMode: workspace.iconMode ?? "initials",
    iconColor: workspace.iconColor ?? "#337ea9",
    iconGlyph: workspace.iconGlyph ?? null,
    iconEmoji: workspace.iconEmoji ?? null,
    iconUrl: workspace.iconUrl ?? null,
    isArchived: workspace.isArchived ?? false,
    archivedAt: workspace.archivedAt ?? null,
    archivedByUserId: workspace.archivedByUserId ?? null,
    memberCount: workspace.memberCount ?? 0,
    enterable: workspace.enterable ?? true,
    membersPreview: membersPreview.map((member) => ({
      userId: member.userId,
      username: member.username,
      displayName: member.displayName ?? null,
      avatarUrl: member.avatarUrl ?? null,
      email: null,
    })),
  };
}

export function matchesWorkspaceSearch(item: UserCenterWorkspaceListItem, searchInput: string) {
  const normalizedQuery = String(searchInput || "")
    .trim()
    .toLowerCase();
  if (!normalizedQuery) return true;

  return [item.name, item.description]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(normalizedQuery));
}

export function paginateWorkspaceList(
  items: readonly UserCenterWorkspaceListItem[],
  page: number,
  size: number,
): PageData<UserCenterWorkspaceListItem> {
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

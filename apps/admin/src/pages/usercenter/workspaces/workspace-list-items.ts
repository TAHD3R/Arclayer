import type { PageData } from "@/types/api";
import type { OrganizationWorkspace } from "@/types/api";

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
  organizationId: string;
  slug: string;
  name: string;
  kind: "team";
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

export function mapOrganizationWorkspaceToListItem(
  workspace: OrganizationWorkspace,
): UserCenterWorkspaceListItem {
  return {
    ...workspace,
    kind: "team",
    membersPreview: workspace.membersPreview.map((member) => ({
      userId: member.userId,
      username: member.username,
      displayName: member.displayName,
      avatarUrl: member.avatarUrl,
      email: member.email,
    })),
  };
}

export function matchesWorkspaceSearch(item: UserCenterWorkspaceListItem, searchInput: string) {
  const normalizedQuery = String(searchInput || "")
    .trim()
    .toLowerCase();
  if (!normalizedQuery) return true;

  return [item.name, item.slug, item.description]
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

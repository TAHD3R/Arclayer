import type { AdminAssetFolderOut as AdminAssetFolder } from "@arclayer/openapi";

function toTimestamp(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function compareAssetFolders(a: AdminAssetFolder, b: AdminAssetFolder): number {
  const aOrder = typeof a.sortOrder === "number" ? a.sortOrder : Number.MAX_SAFE_INTEGER;
  const bOrder = typeof b.sortOrder === "number" ? b.sortOrder : Number.MAX_SAFE_INTEGER;
  if (aOrder !== bOrder) return aOrder - bOrder;

  const aName = (a.name || "").trim().toLocaleLowerCase();
  const bName = (b.name || "").trim().toLocaleLowerCase();
  if (aName !== bName) return aName.localeCompare(bName);

  return toTimestamp(a.createdAt) - toTimestamp(b.createdAt);
}

export function buildFolderById(folders: AdminAssetFolder[]): Map<string, AdminAssetFolder> {
  const map = new Map<string, AdminAssetFolder>();
  for (const folder of folders) map.set(String(folder.id), folder);
  return map;
}

export function buildChildrenByParent(
  folders: AdminAssetFolder[],
): Map<string | null, AdminAssetFolder[]> {
  const map = new Map<string | null, AdminAssetFolder[]>();
  for (const folder of [...folders].sort(compareAssetFolders)) {
    const parentId = folder.parentId ? String(folder.parentId) : null;
    map.set(parentId, [...(map.get(parentId) ?? []), folder]);
  }
  return map;
}

export function buildFolderPath(
  folderId: string | null,
  folderById: ReadonlyMap<string, AdminAssetFolder>,
): AdminAssetFolder[] {
  if (!folderId) return [];

  const path: AdminAssetFolder[] = [];
  let cursor = folderById.get(folderId);
  for (let guard = 0; guard < 24 && cursor; guard += 1) {
    path.unshift(cursor);
    const parentId = cursor.parentId ? String(cursor.parentId) : null;
    cursor = parentId ? folderById.get(parentId) : undefined;
  }
  return path;
}

export function flattenFoldersDepthFirst(folders: AdminAssetFolder[]): AdminAssetFolder[] {
  const childrenByParent = buildChildrenByParent(folders);
  const out: AdminAssetFolder[] = [];
  const walk = (parentId: string | null) => {
    const children = childrenByParent.get(parentId) ?? [];
    for (const child of children) {
      out.push(child);
      walk(String(child.id));
    }
  };
  walk(null);
  return out;
}

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { STORAGE_KEYS } from "@/constants/storage";
import type {
  FavoriteFolderNode,
  FavoriteItemNode,
  FavoriteNode,
  FavoritesState,
} from "@/types/stores";

const MAX_FAVORITES = 10;
const FAVORITES_HARD_CUT_VERSION = 5;

function normalizeFavoritePath(path: string): string {
  return path.trim();
}

function createFavoriteItem(path: string): FavoriteItemNode {
  return {
    id: `item:${path}`,
    type: "item",
    path,
  };
}

function createFolderId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `folder:${crypto.randomUUID()}`;
  }
  return `folder:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function collectFavoritePaths(nodes: readonly FavoriteNode[]): string[] {
  const paths: string[] = [];
  const walk = (items: readonly FavoriteNode[]) => {
    for (const item of items) {
      if (item.type === "item") {
        paths.push(item.path);
        continue;
      }
      walk(item.children);
    }
  };
  walk(nodes);
  return paths;
}

function normalizeFavoriteNodes(nodes: readonly FavoriteNode[]): FavoriteNode[] {
  const seenPaths = new Set<string>();
  let remaining = MAX_FAVORITES;

  const walk = (items: readonly FavoriteNode[]): FavoriteNode[] => {
    const next: FavoriteNode[] = [];
    for (const item of items) {
      if (item.type === "item") {
        const path = normalizeFavoritePath(item.path);
        if (!path || seenPaths.has(path) || remaining <= 0) continue;
        seenPaths.add(path);
        remaining -= 1;
        next.push(createFavoriteItem(path));
        continue;
      }

      next.push({
        id: item.id || createFolderId(),
        type: "folder",
        name: item.name || "",
        expanded: item.expanded !== false,
        children: walk(item.children ?? []),
      });
    }
    return next;
  };

  return walk(nodes);
}

function removeFavoritePath(nodes: readonly FavoriteNode[], path: string): FavoriteNode[] {
  const next: FavoriteNode[] = [];
  for (const item of nodes) {
    if (item.type === "item") {
      if (item.path !== path) next.push(item);
      continue;
    }

    next.push({
      ...item,
      children: removeFavoritePath(item.children, path),
    });
  }
  return next;
}

function updateFolderNode(
  nodes: readonly FavoriteNode[],
  folderId: string,
  update: (folder: FavoriteFolderNode) => FavoriteFolderNode,
): FavoriteNode[] {
  return nodes.map((item) => {
    if (item.type === "item") return item;
    if (item.id === folderId) return update(item);
    return {
      ...item,
      children: updateFolderNode(item.children, folderId, update),
    };
  });
}

function updateNodesAtParent(
  nodes: readonly FavoriteNode[],
  parentId: string | null,
  update: (items: FavoriteNode[]) => FavoriteNode[],
): FavoriteNode[] {
  if (parentId === null) return update([...nodes]);

  return nodes.map((item) => {
    if (item.type === "item") return item;
    if (item.id === parentId) {
      return {
        ...item,
        children: update([...item.children]),
      };
    }
    return {
      ...item,
      children: updateNodesAtParent(item.children, parentId, update),
    };
  });
}

function deleteFolderAndLiftChildren(
  nodes: readonly FavoriteNode[],
  folderId: string,
): FavoriteNode[] {
  const next: FavoriteNode[] = [];
  for (const item of nodes) {
    if (item.type === "item") {
      next.push(item);
      continue;
    }
    if (item.id === folderId) {
      next.push(...item.children);
      continue;
    }
    next.push({
      ...item,
      children: deleteFolderAndLiftChildren(item.children, folderId),
    });
  }
  return next;
}

function reorderSiblingNodes(items: FavoriteNode[], orderedIds: readonly string[]): FavoriteNode[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const next: FavoriteNode[] = [];

  for (const id of orderedIds) {
    const found = byId.get(id);
    if (!found) continue;
    next.push(found);
    byId.delete(id);
  }

  for (const item of items) {
    if (!byId.has(item.id)) continue;
    next.push(item);
  }

  return next;
}

function detachFavoriteNode(
  nodes: readonly FavoriteNode[],
  nodeId: string,
): { nodes: FavoriteNode[]; removed: FavoriteNode | null } {
  let removed: FavoriteNode | null = null;
  const next: FavoriteNode[] = [];

  for (const item of nodes) {
    if (item.id === nodeId) {
      removed = item;
      continue;
    }

    if (item.type === "item") {
      next.push(item);
      continue;
    }

    const result = detachFavoriteNode(item.children, nodeId);
    if (!result.removed) {
      next.push(item);
      continue;
    }

    removed = result.removed;
    next.push({ ...item, children: result.nodes });
  }

  return { nodes: next, removed };
}

function insertFavoriteNode(
  nodes: readonly FavoriteNode[],
  targetParentId: string | null,
  node: FavoriteNode,
  index?: number,
): FavoriteNode[] {
  const insertAt = (items: FavoriteNode[]) => {
    const next = [...items];
    const boundedIndex =
      typeof index === "number" ? Math.max(0, Math.min(index, next.length)) : next.length;
    next.splice(boundedIndex, 0, node);
    return next;
  };

  return updateNodesAtParent(nodes, targetParentId, insertAt);
}

function containsFavoriteNode(nodes: readonly FavoriteNode[], nodeId: string): boolean {
  for (const item of nodes) {
    if (item.id === nodeId) return true;
    if (item.type === "folder" && containsFavoriteNode(item.children, nodeId)) return true;
  }
  return false;
}

function buildFavoriteState(items: readonly FavoriteNode[], sectionExpanded: boolean) {
  const normalizedItems = normalizeFavoriteNodes(items);
  return {
    items: normalizedItems,
    paths: collectFavoritePaths(normalizedItems),
    sectionExpanded,
  };
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      paths: [],
      items: [],
      sectionExpanded: true,
      toggle: (rawPath) => {
        const path = normalizeFavoritePath(rawPath);
        if (!path) return;

        const current = get();
        const exists = current.paths.includes(path);
        const nextItems = exists
          ? removeFavoritePath(current.items, path)
          : [...current.items, createFavoriteItem(path)];

        set(buildFavoriteState(nextItems, current.sectionExpanded));
      },
      remove: (rawPath) => {
        const path = normalizeFavoritePath(rawPath);
        if (!path) return;

        const current = get();
        set(buildFavoriteState(removeFavoritePath(current.items, path), current.sectionExpanded));
      },
      reorder: (parentId, orderedIds) => {
        const current = get();
        const nextItems = updateNodesAtParent(current.items, parentId, (items) =>
          reorderSiblingNodes(items, orderedIds),
        );
        set(buildFavoriteState(nextItems, current.sectionExpanded));
      },
      move: (nodeId, targetParentId, index) => {
        const current = get();
        const detached = detachFavoriteNode(current.items, nodeId);
        if (!detached.removed) return;
        if (
          targetParentId &&
          detached.removed.type === "folder" &&
          containsFavoriteNode(detached.removed.children, targetParentId)
        ) {
          return;
        }

        const nextItems = insertFavoriteNode(
          detached.nodes,
          targetParentId,
          detached.removed,
          index,
        );
        set(buildFavoriteState(nextItems, current.sectionExpanded));
      },
      addFolder: (name, parentId = null) => {
        const current = get();
        const folderId = createFolderId();
        const nextItems = updateNodesAtParent(current.items, parentId, (items) => [
          ...items,
          {
            id: folderId,
            type: "folder",
            name,
            expanded: true,
            children: [],
          },
        ]);

        set(buildFavoriteState(nextItems, current.sectionExpanded));
        return folderId;
      },
      renameFolder: (folderId, name) => {
        const trimmed = name.trim();
        if (!trimmed) return;

        const current = get();
        const nextItems = updateFolderNode(current.items, folderId, (folder) => ({
          ...folder,
          name: trimmed,
        }));
        set(buildFavoriteState(nextItems, current.sectionExpanded));
      },
      deleteFolder: (folderId) => {
        const current = get();
        const nextItems = deleteFolderAndLiftChildren(current.items, folderId);
        set(buildFavoriteState(nextItems, current.sectionExpanded));
      },
      setFolderExpanded: (folderId, expanded) => {
        const current = get();
        const nextItems = updateFolderNode(current.items, folderId, (folder) => ({
          ...folder,
          expanded,
        }));
        set(buildFavoriteState(nextItems, current.sectionExpanded));
      },
      setSectionExpanded: (expanded) => set({ sectionExpanded: expanded }),
    }),
    {
      name: STORAGE_KEYS.favorites,
      storage: createJSONStorage(() => localStorage),
      version: FAVORITES_HARD_CUT_VERSION,
      migrate: (persistedState, persistedVersion) => {
        if (persistedVersion < FAVORITES_HARD_CUT_VERSION) {
          return buildFavoriteState([], true);
        }
        const state =
          persistedState && typeof persistedState === "object"
            ? (persistedState as Partial<FavoritesState>)
            : {};

        const items =
          Array.isArray(state.items) && state.items.length > 0
            ? state.items
            : (state.paths ?? []).map((path) => createFavoriteItem(normalizeFavoritePath(path)));

        return buildFavoriteState(items, state.sectionExpanded ?? true);
      },
    },
  ),
);

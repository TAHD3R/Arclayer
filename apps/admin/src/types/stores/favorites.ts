export type FavoriteItemNode = {
  id: string;
  type: "item";
  path: string;
};

export type FavoriteFolderNode = {
  id: string;
  type: "folder";
  name: string;
  expanded: boolean;
  children: FavoriteNode[];
};

export type FavoriteNode = FavoriteItemNode | FavoriteFolderNode;

export interface FavoritesState {
  paths: string[];
  items: FavoriteNode[];
  sectionExpanded: boolean;
  toggle: (path: string) => void;
  remove: (path: string) => void;
  reorder: (parentId: string | null, orderedIds: string[]) => void;
  move: (nodeId: string, targetParentId: string | null, index?: number) => void;
  addFolder: (name: string, parentId?: string | null) => string;
  renameFolder: (folderId: string, name: string) => void;
  deleteFolder: (folderId: string) => void;
  setFolderExpanded: (folderId: string, expanded: boolean) => void;
  setSectionExpanded: (expanded: boolean) => void;
}

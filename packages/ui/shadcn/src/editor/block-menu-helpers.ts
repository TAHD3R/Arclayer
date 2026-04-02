import { KEYS } from "platejs";

export const ARTICLE_EDITOR_BLOCK_SELECTION_EXCLUDED_TYPES = new Set<string>([
  KEYS.column,
  KEYS.tr,
  KEYS.td,
]);

export type BlockContextMenuActionId = "turn-into" | "duplicate" | "delete";

export function isArticleEditorBlockSelectable(element: {
  id?: string | null;
  type?: string | null;
}) {
  if (!element.id) return false;
  return !ARTICLE_EDITOR_BLOCK_SELECTION_EXCLUDED_TYPES.has(element.type ?? "");
}

export function getBlockContextMenuActionIds(selectedCount: number): BlockContextMenuActionId[] {
  if (selectedCount <= 0) return [];
  if (selectedCount === 1) return ["turn-into", "duplicate", "delete"];
  return ["duplicate", "delete"];
}

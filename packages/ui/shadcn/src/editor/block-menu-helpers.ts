import { KEYS, type Path } from "platejs";
import type { PlateEditor } from "platejs/react";

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

export function isArticleEditorBlockSelectableAtPath(
  editor: Pick<PlateEditor, "api" | "getType">,
  element: {
    id?: string | null;
    type?: string | null;
  },
  path?: Path,
) {
  if (!isArticleEditorBlockSelectable(element)) return false;
  if (!path) return true;

  return !editor.api.block({
    above: true,
    at: path,
    match: { type: editor.getType(KEYS.tr) },
  });
}

export function getBlockContextMenuActionIds(selectedCount: number): BlockContextMenuActionId[] {
  if (selectedCount <= 0) return [];
  if (selectedCount === 1) return ["turn-into", "duplicate", "delete"];
  return ["duplicate", "delete"];
}

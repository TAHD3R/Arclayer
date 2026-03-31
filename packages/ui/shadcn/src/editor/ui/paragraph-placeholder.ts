import { KEYS, NodeApi, PathApi, type Path } from "platejs";
import type { PlateEditor } from "platejs/react";

function isElementLike(value: unknown): value is { children?: unknown[]; type?: string } {
  return Boolean(value) && typeof value === "object";
}

function isTodoElement(value: unknown): value is { checked?: boolean; listStyleType?: string } {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    ("checked" in (value as object) || "listStyleType" in (value as object))
  );
}

function isTodoListStyle(value: unknown) {
  return value === "todo" || value === KEYS.listTodo;
}

export function hasSlashInputChild(element: unknown) {
  if (!isElementLike(element) || !Array.isArray(element.children)) return false;

  return element.children.some((child) => isElementLike(child) && child.type === "slash_input");
}

export function shouldShowParagraphPlaceholder(params: {
  editor?: PlateEditor;
  element: unknown;
  focused: boolean;
  path?: Path;
  selected: boolean;
}) {
  if (!params.focused || !params.selected) return false;
  if (hasSlashInputChild(params.element)) return false;
  if (params.editor && params.path) {
    let currentPath = params.path;
    while (currentPath.length > 0) {
      const parentPath = PathApi.parent(currentPath);
      const parentEntry = params.editor.api.node(parentPath);
      if (!parentEntry) break;

      const [parentNode] = parentEntry;
      if (
        isTodoElement(parentNode) &&
        (typeof parentNode.checked === "boolean" || isTodoListStyle(parentNode.listStyleType))
      ) {
        return false;
      }

      currentPath = parentPath;
    }
  }
  if (
    isTodoElement(params.element) &&
    (typeof params.element.checked === "boolean" || isTodoListStyle(params.element.listStyleType))
  ) {
    return false;
  }

  return isElementLike(params.element) && NodeApi.string(params.element as never).length === 0;
}

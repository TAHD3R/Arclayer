import { KEYS, NodeApi, PathApi, type Path, type Range } from "platejs";
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

function hasListStyle(value: unknown) {
  return typeof value === "string" && value.length > 0;
}

export function hasSlashInputChild(element: unknown) {
  if (!isElementLike(element) || !Array.isArray(element.children)) return false;

  return element.children.some((child) => isElementLike(child) && child.type === "slash_input");
}

export function isExpandedSelection(selection: Range | null | undefined) {
  if (!selection) return false;

  const { anchor, focus } = selection;
  if (anchor.offset !== focus.offset) return true;
  if (anchor.path.length !== focus.path.length) return true;

  return anchor.path.some((segment, index) => segment !== focus.path[index]);
}

function isSamePath(a: Path, b: Path) {
  return a.length === b.length && a.every((segment, index) => segment === b[index]);
}

export function shouldShowParagraphPlaceholder(params: {
  editor?: PlateEditor;
  element: unknown;
  focused: boolean;
  hasExpandedSelection?: boolean;
  isSelectingBlocks?: boolean;
  path?: Path;
  selected: boolean;
}) {
  const hasExpandedSelection =
    params.hasExpandedSelection ??
    (Boolean(params.editor?.api?.isExpanded?.()) || isExpandedSelection(params.editor?.selection));
  const isSelectingBlocks =
    params.isSelectingBlocks ??
    (params.editor && "getOption" in params.editor && typeof params.editor.getOption === "function"
      ? Boolean(params.editor.getOption({ key: KEYS.blockSelection }, "isSelectingSome"))
      : false);

  if (!params.focused || !params.selected) return false;
  if (hasExpandedSelection || isSelectingBlocks) {
    return false;
  }
  if (hasSlashInputChild(params.element)) return false;
  if (params.editor && params.path && typeof params.editor.api?.block === "function") {
    const currentBlockEntry = params.editor.api.block();

    if (!currentBlockEntry || !isSamePath(currentBlockEntry[1], params.path)) {
      return false;
    }
  }
  if (params.editor && params.path && typeof params.editor.api?.node === "function") {
    let currentPath = params.path;
    while (currentPath.length > 0) {
      const parentPath = PathApi.parent(currentPath);
      const parentEntry = params.editor.api.node(parentPath);
      if (!parentEntry) break;

      const [parentNode] = parentEntry;
      if (
        isTodoElement(parentNode) &&
        (typeof parentNode.checked === "boolean" ||
          isTodoListStyle(parentNode.listStyleType) ||
          hasListStyle(parentNode.listStyleType))
      ) {
        return false;
      }

      currentPath = parentPath;
    }
  }
  if (
    isTodoElement(params.element) &&
    (typeof params.element.checked === "boolean" ||
      isTodoListStyle(params.element.listStyleType) ||
      hasListStyle(params.element.listStyleType))
  ) {
    return false;
  }

  return isElementLike(params.element) && NodeApi.string(params.element as never).length === 0;
}

import { NodeApi } from "platejs";

function isElementLike(value: unknown): value is { children?: unknown[]; type?: string } {
  return Boolean(value) && typeof value === "object";
}

export function hasSlashInputChild(element: unknown) {
  if (!isElementLike(element) || !Array.isArray(element.children)) return false;

  return element.children.some((child) => isElementLike(child) && child.type === "slash_input");
}

export function shouldShowParagraphPlaceholder(params: {
  element: unknown;
  focused: boolean;
  selected: boolean;
}) {
  if (!params.focused || !params.selected) return false;
  if (hasSlashInputChild(params.element)) return false;

  return isElementLike(params.element) && NodeApi.string(params.element as never).length === 0;
}

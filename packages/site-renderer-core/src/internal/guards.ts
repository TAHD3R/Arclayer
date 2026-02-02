import type { CoreBlockNode, CoreDocumentIR } from "./core-blocks";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function hasOnlyAllowedKeys(obj: Record<string, unknown>, allowedKeys: readonly string[]): boolean {
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.includes(key)) return false;
  }
  return true;
}

function isLocalizedString(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) return false;
  for (const v of Object.values(value)) {
    if (v === undefined) continue;
    if (typeof v !== "string") return false;
  }
  return true;
}

export function isCoreBlockNode(value: unknown): value is CoreBlockNode {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string") return false;
  if (typeof value.type !== "string") return false;
  if (!isRecord(value.props)) return false;

  switch (value.type) {
    case "container": {
      if (!hasOnlyAllowedKeys(value.props, ["as", "className"])) return false;
      if (value.props.as !== undefined) {
        if (value.props.as !== "div" && value.props.as !== "section" && value.props.as !== "article") {
          return false;
        }
      }
      if (value.props.className !== undefined && typeof value.props.className !== "string") return false;
      if (value.children === undefined) return true;
      if (!Array.isArray(value.children)) return false;
      return value.children.every(isCoreBlockNode);
    }
    case "heading": {
      if (!hasOnlyAllowedKeys(value.props, ["level", "text", "align"])) return false;
      if (typeof value.props.level !== "number") return false;
      if (value.props.level < 1 || value.props.level > 6) return false;
      if (!isLocalizedString(value.props.text)) return false;
      if (value.props.align !== undefined) {
        if (
          value.props.align !== "left" &&
          value.props.align !== "center" &&
          value.props.align !== "right"
        ) {
          return false;
        }
      }
      return value.children === undefined;
    }
    case "paragraph": {
      if (!hasOnlyAllowedKeys(value.props, ["text", "align"])) return false;
      if (!isLocalizedString(value.props.text)) return false;
      if (value.props.align !== undefined) {
        if (
          value.props.align !== "left" &&
          value.props.align !== "center" &&
          value.props.align !== "right"
        ) {
          return false;
        }
      }
      return value.children === undefined;
    }
    case "divider": {
      if (!hasOnlyAllowedKeys(value.props, ["variant"])) return false;
      if (value.props.variant !== undefined) {
        if (value.props.variant !== "default" && value.props.variant !== "subtle") return false;
      }
      return value.children === undefined;
    }
  }

  return false;
}

/**
 * Runtime guard for editor mode / postMessage transport.
 *
 * Sprint 1/2:
 * - Keep it intentionally limited to the core block set.
 * - This avoids accepting arbitrary JSON in props.
 */
export function isCoreDocumentIR(value: unknown): value is CoreDocumentIR {
  if (!isRecord(value)) return false;
  if (value.version !== 1) return false;
  if (!Array.isArray(value.blocks)) return false;
  return value.blocks.every(isCoreBlockNode);
}

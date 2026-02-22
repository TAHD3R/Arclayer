import type { CoreBlockNode, CoreDocumentIR } from "./core-blocks";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

// We intentionally restrict block ids to a conservative ASCII subset:
// - used as `data-block-id` attribute value
// - used by editor overlay selectors and postMessage transports
// This prevents CSS selector escaping quirks and avoids surprising characters in debug UIs.
const CORE_BLOCK_ID_RE = /^[A-Za-z0-9][A-Za-z0-9:_-]*$/;

function isSafeCoreBlockId(value: string): boolean {
  return CORE_BLOCK_ID_RE.test(value);
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

function isDimensionValue(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.trim().length > 0;
  return false;
}

function isBlockLayoutProps(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  if (
    !hasOnlyAllowedKeys(value, [
      "width",
      "minWidth",
      "maxWidth",
      "height",
      "minHeight",
      "maxHeight",
      "margin",
      "padding",
      "paddingX",
      "paddingY",
      "gap",
      "display",
      "direction",
      "wrap",
      "justifyContent",
      "alignItems",
    ])
  ) {
    return false;
  }

  if (!isDimensionValue(value.width)) return false;
  if (!isDimensionValue(value.minWidth)) return false;
  if (!isDimensionValue(value.maxWidth)) return false;
  if (!isDimensionValue(value.height)) return false;
  if (!isDimensionValue(value.minHeight)) return false;
  if (!isDimensionValue(value.maxHeight)) return false;
  if (!isDimensionValue(value.margin)) return false;
  if (!isDimensionValue(value.padding)) return false;
  if (!isDimensionValue(value.paddingX)) return false;
  if (!isDimensionValue(value.paddingY)) return false;
  if (!isDimensionValue(value.gap)) return false;

  if (value.display !== undefined && value.display !== "block" && value.display !== "flex") return false;
  if (value.direction !== undefined && value.direction !== "row" && value.direction !== "column") return false;
  if (value.wrap !== undefined && value.wrap !== "nowrap" && value.wrap !== "wrap") return false;

  if (value.justifyContent !== undefined) {
    if (
      value.justifyContent !== "start" &&
      value.justifyContent !== "center" &&
      value.justifyContent !== "end" &&
      value.justifyContent !== "space-between" &&
      value.justifyContent !== "space-around"
    ) {
      return false;
    }
  }

  if (value.alignItems !== undefined) {
    if (
      value.alignItems !== "start" &&
      value.alignItems !== "center" &&
      value.alignItems !== "end" &&
      value.alignItems !== "stretch"
    ) {
      return false;
    }
  }

  return true;
}

function isBlockDesignProps(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  if (
    !hasOnlyAllowedKeys(value, [
      "color",
      "backgroundColor",
      "borderColor",
      "borderStyle",
      "borderWidth",
      "borderRadius",
      "boxShadow",
      "opacity",
    ])
  ) {
    return false;
  }

  if (value.color !== undefined && typeof value.color !== "string") return false;
  if (value.backgroundColor !== undefined && typeof value.backgroundColor !== "string") return false;
  if (value.borderColor !== undefined && typeof value.borderColor !== "string") return false;
  if (value.borderStyle !== undefined) {
    if (value.borderStyle !== "solid" && value.borderStyle !== "dashed" && value.borderStyle !== "dotted") {
      return false;
    }
  }
  if (!isDimensionValue(value.borderWidth)) return false;
  if (!isDimensionValue(value.borderRadius)) return false;
  if (value.boxShadow !== undefined && typeof value.boxShadow !== "string") return false;
  if (value.opacity !== undefined) {
    if (typeof value.opacity !== "number" || !Number.isFinite(value.opacity)) return false;
  }

  return true;
}

function isBlockAnimationProps(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;

  if (
    !hasOnlyAllowedKeys(value, ["type", "trigger", "durationMs", "delayMs", "easing", "iterationCount", "fillMode"])
  ) {
    return false;
  }

  if (value.type !== undefined) {
    if (
      value.type !== "none" &&
      value.type !== "fade" &&
      value.type !== "slide-up" &&
      value.type !== "slide-down" &&
      value.type !== "zoom-in"
    ) {
      return false;
    }
  }

  if (value.trigger !== undefined && value.trigger !== "load" && value.trigger !== "hover") return false;

  if (value.durationMs !== undefined) {
    if (typeof value.durationMs !== "number" || !Number.isFinite(value.durationMs)) return false;
  }

  if (value.delayMs !== undefined) {
    if (typeof value.delayMs !== "number" || !Number.isFinite(value.delayMs)) return false;
  }

  if (value.easing !== undefined && typeof value.easing !== "string") return false;

  if (value.iterationCount !== undefined) {
    if (typeof value.iterationCount !== "number" || !Number.isFinite(value.iterationCount)) return false;
  }

  if (value.fillMode !== undefined) {
    if (
      value.fillMode !== "none" &&
      value.fillMode !== "forwards" &&
      value.fillMode !== "backwards" &&
      value.fillMode !== "both"
    ) {
      return false;
    }
  }

  return true;
}

function hasValidCommonVisualProps(props: Record<string, unknown>): boolean {
  return (
    isBlockLayoutProps(props.layout) &&
    isBlockDesignProps(props.style) &&
    isBlockAnimationProps(props.animation)
  );
}

export function isCoreBlockNode(value: unknown): value is CoreBlockNode {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string") return false;
  if (!isSafeCoreBlockId(value.id)) return false;
  if (typeof value.type !== "string") return false;
  if (!isRecord(value.props)) return false;

  switch (value.type) {
    case "container": {
      if (!hasOnlyAllowedKeys(value.props, ["as", "className", "layout", "style", "animation"])) return false;
      if (value.props.as !== undefined) {
        if (value.props.as !== "div" && value.props.as !== "section" && value.props.as !== "article") {
          return false;
        }
      }
      if (value.props.className !== undefined && typeof value.props.className !== "string") return false;
      if (!hasValidCommonVisualProps(value.props)) return false;
      if (value.children === undefined) return true;
      if (!Array.isArray(value.children)) return false;
      return value.children.every(isCoreBlockNode);
    }
    case "heading": {
      if (!hasOnlyAllowedKeys(value.props, ["level", "text", "align", "layout", "style", "animation"])) return false;
      if (typeof value.props.level !== "number") return false;
      if (value.props.level < 1 || value.props.level > 6) return false;
      if (!isLocalizedString(value.props.text)) return false;
      if (value.props.align !== undefined) {
        if (value.props.align !== "left" && value.props.align !== "center" && value.props.align !== "right") {
          return false;
        }
      }
      if (!hasValidCommonVisualProps(value.props)) return false;
      return value.children === undefined;
    }
    case "paragraph": {
      if (!hasOnlyAllowedKeys(value.props, ["text", "align", "layout", "style", "animation"])) return false;
      if (!isLocalizedString(value.props.text)) return false;
      if (value.props.align !== undefined) {
        if (value.props.align !== "left" && value.props.align !== "center" && value.props.align !== "right") {
          return false;
        }
      }
      if (!hasValidCommonVisualProps(value.props)) return false;
      return value.children === undefined;
    }
    case "divider": {
      if (!hasOnlyAllowedKeys(value.props, ["variant", "layout", "style", "animation"])) return false;
      if (value.props.variant !== undefined) {
        if (value.props.variant !== "default" && value.props.variant !== "subtle") return false;
      }
      if (!hasValidCommonVisualProps(value.props)) return false;
      return value.children === undefined;
    }
  }

  return false;
}

/**
 * Runtime guard for editor mode / postMessage transport.
 */
export function isCoreDocumentIR(value: unknown): value is CoreDocumentIR {
  if (!isRecord(value)) return false;
  if (value.version !== 1) return false;
  if (!Array.isArray(value.blocks)) return false;
  return value.blocks.every(isCoreBlockNode);
}

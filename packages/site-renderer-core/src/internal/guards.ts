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
    case "grid": {
      if (!hasOnlyAllowedKeys(value.props, ["columns", "columnGap", "rowGap", "layout", "style", "animation"])) {
        return false;
      }
      if (value.props.columns !== undefined) {
        if (typeof value.props.columns !== "number" || !Number.isFinite(value.props.columns)) return false;
        if (value.props.columns < 1 || value.props.columns > 12) return false;
      }
      if (value.props.columnGap !== undefined && typeof value.props.columnGap !== "string") return false;
      if (value.props.rowGap !== undefined && typeof value.props.rowGap !== "string") return false;
      if (!hasValidCommonVisualProps(value.props)) return false;
      if (value.children === undefined) return true;
      if (!Array.isArray(value.children)) return false;
      return value.children.every(isCoreBlockNode);
    }
    case "spacer": {
      if (!hasOnlyAllowedKeys(value.props, ["height", "layout", "style", "animation"])) return false;
      if (value.props.height !== undefined && typeof value.props.height !== "string") return false;
      if (!hasValidCommonVisualProps(value.props)) return false;
      return value.children === undefined;
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
    case "list": {
      if (!hasOnlyAllowedKeys(value.props, ["ordered", "items", "layout", "style", "animation"])) return false;
      if (value.props.ordered !== undefined && typeof value.props.ordered !== "boolean") return false;
      if (value.props.items !== undefined) {
        if (!Array.isArray(value.props.items)) return false;
        if (!value.props.items.every(isLocalizedString)) return false;
      }
      if (!hasValidCommonVisualProps(value.props)) return false;
      return value.children === undefined;
    }
    case "quote": {
      if (!hasOnlyAllowedKeys(value.props, ["text", "citation", "layout", "style", "animation"])) return false;
      if (!isLocalizedString(value.props.text)) return false;
      if (value.props.citation !== undefined && !isLocalizedString(value.props.citation)) return false;
      if (!hasValidCommonVisualProps(value.props)) return false;
      return value.children === undefined;
    }
    case "image": {
      if (!hasOnlyAllowedKeys(value.props, ["src", "alt", "objectFit", "layout", "style", "animation"])) return false;
      if (typeof value.props.src !== "string") return false;
      if (value.props.alt !== undefined && typeof value.props.alt !== "string") return false;
      if (value.props.objectFit !== undefined) {
        if (
          value.props.objectFit !== "cover" &&
          value.props.objectFit !== "contain" &&
          value.props.objectFit !== "fill" &&
          value.props.objectFit !== "none"
        ) {
          return false;
        }
      }
      if (!hasValidCommonVisualProps(value.props)) return false;
      return value.children === undefined;
    }
    case "video": {
      if (
        !hasOnlyAllowedKeys(value.props, [
          "src",
          "poster",
          "autoplay",
          "loop",
          "muted",
          "layout",
          "style",
          "animation",
        ])
      ) {
        return false;
      }
      if (typeof value.props.src !== "string") return false;
      if (value.props.poster !== undefined && typeof value.props.poster !== "string") return false;
      if (value.props.autoplay !== undefined && typeof value.props.autoplay !== "boolean") return false;
      if (value.props.loop !== undefined && typeof value.props.loop !== "boolean") return false;
      if (value.props.muted !== undefined && typeof value.props.muted !== "boolean") return false;
      if (!hasValidCommonVisualProps(value.props)) return false;
      return value.children === undefined;
    }
    case "icon": {
      if (!hasOnlyAllowedKeys(value.props, ["name", "size", "layout", "style", "animation"])) return false;
      if (typeof value.props.name !== "string") return false;
      if (value.props.size !== undefined && typeof value.props.size !== "string") return false;
      if (!hasValidCommonVisualProps(value.props)) return false;
      return value.children === undefined;
    }
    case "button": {
      if (!hasOnlyAllowedKeys(value.props, ["text", "href", "variant", "size", "layout", "style", "animation"])) {
        return false;
      }
      if (!isLocalizedString(value.props.text)) return false;
      if (value.props.href !== undefined && typeof value.props.href !== "string") return false;
      if (value.props.variant !== undefined) {
        if (
          value.props.variant !== "primary" &&
          value.props.variant !== "secondary" &&
          value.props.variant !== "outline"
        ) {
          return false;
        }
      }
      if (value.props.size !== undefined) {
        if (value.props.size !== "sm" && value.props.size !== "md" && value.props.size !== "lg") return false;
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

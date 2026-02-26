import type React from "react";

import type {
  BlockAnimationProps,
  BlockDesignProps,
  BlockLayoutProps,
  BlockNode,
  CommonBlockVisualProps,
  ViewerContext,
} from "@celestial/site-block-protocol";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function resolveVisualPropsFromNodeProps(props: unknown): CommonBlockVisualProps {
  if (!isRecord(props)) return {};

  const result: CommonBlockVisualProps = {};
  if (isRecord(props.layout)) result.layout = props.layout as BlockLayoutProps;
  if (isRecord(props.style)) result.style = props.style as BlockDesignProps;
  if (isRecord(props.animation)) result.animation = props.animation as BlockAnimationProps;
  return result;
}

function mergeOverride<T extends object>(base: T | undefined, override: T): T {
  return { ...(base ?? ({} as T)), ...override };
}

/**
 * 解析节点的最终视觉属性：
 * - 基础视觉属性来自 node.props.layout/style/animation
 * - 当 ctx.breakpoint 命中时，合并 node.responsive[bp] 的同名覆盖
 */
export function resolveNodeVisualProps(node: BlockNode, ctx: ViewerContext): CommonBlockVisualProps {
  const base = resolveVisualPropsFromNodeProps(node.props);

  const breakpoint = (ctx.breakpoint || "").trim();
  if (!breakpoint) return base;

  const override = node.responsive?.[breakpoint];
  if (!override) return base;

  const result: CommonBlockVisualProps = { ...base };

  if (isRecord(override.layout)) {
    result.layout = mergeOverride(base.layout, override.layout as BlockLayoutProps);
  }
  if (isRecord(override.style)) {
    result.style = mergeOverride(base.style, override.style as BlockDesignProps);
  }
  if (isRecord(override.animation)) {
    result.animation = mergeOverride(base.animation, override.animation as BlockAnimationProps);
  }

  return result;
}

function mapFlexAlign(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (value === "start") return "flex-start";
  if (value === "end") return "flex-end";
  if (value === "center" || value === "space-between" || value === "space-around") return value;
  return undefined;
}

function toCssLength(value: unknown): string | number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return `${value}px`;
  if (typeof value === "string" && value.trim()) return value;
  return undefined;
}

function applyLayoutStyles(style: React.CSSProperties, layout: BlockLayoutProps | undefined): void {
  if (!layout) return;

  style.width = toCssLength(layout.width);
  style.minWidth = toCssLength(layout.minWidth);
  style.maxWidth = toCssLength(layout.maxWidth);
  style.height = toCssLength(layout.height);
  style.minHeight = toCssLength(layout.minHeight);
  style.maxHeight = toCssLength(layout.maxHeight);
  style.margin = toCssLength(layout.margin);
  style.padding = toCssLength(layout.padding);

  const paddingX = toCssLength(layout.paddingX);
  if (paddingX !== undefined) {
    style.paddingLeft = paddingX;
    style.paddingRight = paddingX;
  }

  const paddingY = toCssLength(layout.paddingY);
  if (paddingY !== undefined) {
    style.paddingTop = paddingY;
    style.paddingBottom = paddingY;
  }

  style.gap = toCssLength(layout.gap);
  style.display = layout.display;
  style.flexDirection = layout.direction;
  style.flexWrap = layout.wrap;
  style.justifyContent = mapFlexAlign(layout.justifyContent) as React.CSSProperties["justifyContent"];
  style.alignItems = mapFlexAlign(layout.alignItems) as React.CSSProperties["alignItems"];
}

function applyDesignStyles(style: React.CSSProperties, design: BlockDesignProps | undefined): void {
  if (!design) return;

  style.color = design.color;
  style.backgroundColor = design.backgroundColor;
  style.borderColor = design.borderColor;
  style.borderStyle = design.borderStyle;
  style.borderWidth = toCssLength(design.borderWidth);
  style.borderRadius = toCssLength(design.borderRadius);
  style.boxShadow = design.boxShadow;

  if (typeof design.opacity === "number" && Number.isFinite(design.opacity)) {
    style.opacity = Math.min(1, Math.max(0, design.opacity));
  }
}

function applyAnimationStyles(style: React.CSSProperties, animation: BlockAnimationProps | undefined): void {
  if (!animation || !animation.type || animation.type === "none") return;

  style.animationName =
    animation.type === "fade"
      ? "celestial-editor-fade-in"
      : animation.type === "slide-up"
        ? "celestial-editor-slide-up"
        : animation.type === "slide-down"
          ? "celestial-editor-slide-down"
          : "celestial-editor-zoom-in";

  style.animationDuration = `${Math.max(60, animation.durationMs ?? 260)}ms`;
  style.animationDelay = `${Math.max(0, animation.delayMs ?? 0)}ms`;
  style.animationTimingFunction = animation.easing || "cubic-bezier(0.2, 0.9, 0.2, 1)";
  style.animationIterationCount = `${Math.max(1, Math.round(animation.iterationCount ?? 1))}`;
  style.animationFillMode = animation.fillMode ?? "both";
}

export function buildBlockStyles(props: CommonBlockVisualProps | undefined): React.CSSProperties {
  const style: React.CSSProperties = {};
  if (!props) return style;
  applyLayoutStyles(style, props.layout);
  applyDesignStyles(style, props.style);
  applyAnimationStyles(style, props.animation);
  return style;
}

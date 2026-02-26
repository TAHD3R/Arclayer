import React from "react";

import type {
  BlockAnimationProps,
  BlockDesignProps,
  BlockLayoutProps,
  BlockNode,
  CommonBlockVisualProps,
  DocumentIR,
  LocalizedString,
  ViewerContext,
} from "@celestial/site-block-protocol";
import { resolveLocalizedValue } from "@celestial/site-block-protocol";

export type CoreBlockType =
  | "container"
  | "grid"
  | "spacer"
  | "divider"
  | "heading"
  | "paragraph"
  | "list"
  | "quote"
  | "image"
  | "video"
  | "icon"
  | "button";

export type CoreBlockPropsByType = {
  container: CommonBlockVisualProps & {
    /**
     * Semantic wrapper.
     * Keep it minimal in Sprint 1; we can expand later.
     */
    as?: "div" | "section" | "article";
    className?: string;
  };
  grid: CommonBlockVisualProps & {
    columns?: number;
    columnGap?: string;
    rowGap?: string;
  };
  spacer: CommonBlockVisualProps & {
    height?: string;
  };
  heading: CommonBlockVisualProps & {
    level: 1 | 2 | 3 | 4 | 5 | 6;
    text: LocalizedString;
    align?: "left" | "center" | "right";
  };
  paragraph: CommonBlockVisualProps & {
    text: LocalizedString;
    align?: "left" | "center" | "right";
  };
  list: CommonBlockVisualProps & {
    ordered?: boolean;
    items?: LocalizedString[];
  };
  quote: CommonBlockVisualProps & {
    text: LocalizedString;
    citation?: LocalizedString;
  };
  image: CommonBlockVisualProps & {
    src: string;
    alt?: string;
    objectFit?: "cover" | "contain" | "fill" | "none";
  };
  video: CommonBlockVisualProps & {
    src: string;
    poster?: string;
    autoplay?: boolean;
    loop?: boolean;
    muted?: boolean;
  };
  icon: CommonBlockVisualProps & {
    name: string;
    size?: string;
  };
  button: CommonBlockVisualProps & {
    text: LocalizedString;
    href?: string;
    variant?: "primary" | "secondary" | "outline";
    size?: "sm" | "md" | "lg";
  };
  divider: CommonBlockVisualProps & {
    variant?: "default" | "subtle";
  };
};

export type CoreContainerNode = Omit<BlockNode<"container", CoreBlockPropsByType["container"]>, "children"> & {
  children?: CoreBlockNode[];
};
export type CoreGridNode = Omit<BlockNode<"grid", CoreBlockPropsByType["grid"]>, "children"> & {
  children?: CoreBlockNode[];
};
export type CoreSpacerNode = Omit<BlockNode<"spacer", CoreBlockPropsByType["spacer"]>, "children"> & {
  children?: never;
};
export type CoreHeadingNode = Omit<BlockNode<"heading", CoreBlockPropsByType["heading"]>, "children"> & {
  children?: never;
};
export type CoreParagraphNode = Omit<BlockNode<"paragraph", CoreBlockPropsByType["paragraph"]>, "children"> & {
  children?: never;
};
export type CoreListNode = Omit<BlockNode<"list", CoreBlockPropsByType["list"]>, "children"> & {
  children?: never;
};
export type CoreQuoteNode = Omit<BlockNode<"quote", CoreBlockPropsByType["quote"]>, "children"> & {
  children?: never;
};
export type CoreImageNode = Omit<BlockNode<"image", CoreBlockPropsByType["image"]>, "children"> & {
  children?: never;
};
export type CoreVideoNode = Omit<BlockNode<"video", CoreBlockPropsByType["video"]>, "children"> & {
  children?: never;
};
export type CoreIconNode = Omit<BlockNode<"icon", CoreBlockPropsByType["icon"]>, "children"> & {
  children?: never;
};
export type CoreButtonNode = Omit<BlockNode<"button", CoreBlockPropsByType["button"]>, "children"> & {
  children?: never;
};
export type CoreDividerNode = Omit<BlockNode<"divider", CoreBlockPropsByType["divider"]>, "children"> & {
  children?: never;
};

export type CoreBlockNode =
  | CoreContainerNode
  | CoreGridNode
  | CoreSpacerNode
  | CoreHeadingNode
  | CoreParagraphNode
  | CoreListNode
  | CoreQuoteNode
  | CoreImageNode
  | CoreVideoNode
  | CoreIconNode
  | CoreButtonNode
  | CoreDividerNode;

export interface CoreDocumentIR extends Omit<DocumentIR, "blocks"> {
  blocks: CoreBlockNode[];
}

function mapFlexAlign(value: BlockLayoutProps["justifyContent"] | BlockLayoutProps["alignItems"]): string | undefined {
  if (!value) return undefined;
  if (value === "start") return "flex-start";
  if (value === "end") return "flex-end";
  return value;
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

export function renderCoreBlock(node: CoreBlockNode, ctx: ViewerContext): React.ReactNode {
  try {
    return renderCoreBlockUnsafe(node, ctx);
  } catch (err) {
    return renderBlockError(node, err);
  }
}

function resolveText(value: LocalizedString, ctx: ViewerContext): string {
  return resolveLocalizedValue(value, ctx) ?? "";
}

function resolveHref(href: string, basePath: string | undefined): string {
  const raw = (href || "").trim();
  if (!raw) return raw;

  // Only prefix absolute-path links. Keep external URLs, protocol-relative URLs, hashes, and mailto/tel intact.
  if (!raw.startsWith("/") || raw.startsWith("//")) return raw;

  const base = (basePath || "").trim();
  if (!base) return raw;

  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  return normalizedBase + raw;
}

function renderCoreBlockUnsafe(node: CoreBlockNode, ctx: ViewerContext): React.ReactNode {
  switch (node.type) {
    case "container": {
      const Tag = node.props.as ?? "section";
      return (
        <Tag
          data-block-type={node.type}
          data-block-id={node.id}
          className={node.props.className}
          style={buildBlockStyles(node.props)}
        >
          {node.children?.map((child) => (
            <React.Fragment key={child.id}>{renderCoreBlock(child, ctx)}</React.Fragment>
          ))}
        </Tag>
      );
    }
    case "grid": {
      const columns = Number.isFinite(node.props.columns) ? Math.max(1, Math.round(node.props.columns ?? 2)) : 2;
      const style = buildBlockStyles(node.props);
      style.display = "grid";
      style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
      if (node.props.columnGap) style.columnGap = node.props.columnGap;
      if (node.props.rowGap) style.rowGap = node.props.rowGap;

      return (
        <div data-block-type={node.type} data-block-id={node.id} style={style}>
          {node.children?.map((child) => (
            <React.Fragment key={child.id}>{renderCoreBlock(child, ctx)}</React.Fragment>
          ))}
        </div>
      );
    }
    case "spacer": {
      const style = buildBlockStyles(node.props);
      if (node.props.height) {
        style.height = node.props.height;
      } else if (!style.height) {
        style.height = "24px";
      }
      return <div data-block-type={node.type} data-block-id={node.id} style={style} aria-hidden="true" />;
    }
    case "heading": {
      const Tag = `h${node.props.level}` as const;
      const text = resolveText(node.props.text, ctx);
      const style = buildBlockStyles(node.props);
      style.textAlign = node.props.align ?? "left";
      return (
        <Tag data-block-type={node.type} data-block-id={node.id} data-align={node.props.align ?? "left"} style={style}>
          {text}
        </Tag>
      );
    }
    case "paragraph": {
      const text = resolveText(node.props.text, ctx);
      const style = buildBlockStyles(node.props);
      style.textAlign = node.props.align ?? "left";
      return (
        <p data-block-type={node.type} data-block-id={node.id} data-align={node.props.align ?? "left"} style={style}>
          {text}
        </p>
      );
    }
    case "list": {
      const Tag = node.props.ordered ? "ol" : "ul";
      const items = Array.isArray(node.props.items) ? node.props.items : [];
      const style = buildBlockStyles(node.props);
      return (
        <Tag data-block-type={node.type} data-block-id={node.id} style={style}>
          {items.map((item, index) => (
            <li key={index}>{resolveText(item, ctx)}</li>
          ))}
        </Tag>
      );
    }
    case "quote": {
      const text = resolveText(node.props.text, ctx);
      const citation = node.props.citation ? resolveText(node.props.citation, ctx) : "";
      const style = buildBlockStyles(node.props);
      return (
        <blockquote data-block-type={node.type} data-block-id={node.id} style={style}>
          <p>{text}</p>
          {citation ? <cite>{citation}</cite> : null}
        </blockquote>
      );
    }
    case "image": {
      const style = buildBlockStyles(node.props);
      style.objectFit = node.props.objectFit ?? "cover";
      return (
        <img
          data-block-type={node.type}
          data-block-id={node.id}
          src={node.props.src}
          alt={node.props.alt ?? ""}
          style={style}
        />
      );
    }
    case "video": {
      const style = buildBlockStyles(node.props);
      return (
        <video
          data-block-type={node.type}
          data-block-id={node.id}
          src={node.props.src}
          poster={node.props.poster}
          autoPlay={!!node.props.autoplay}
          loop={!!node.props.loop}
          muted={!!node.props.muted}
          controls={!node.props.autoplay}
          style={style}
        />
      );
    }
    case "icon": {
      const style = buildBlockStyles(node.props);
      if (node.props.size) style.fontSize = node.props.size;
      return (
        <span
          data-block-type={node.type}
          data-block-id={node.id}
          data-icon={node.props.name}
          role="img"
          aria-label={node.props.name}
          style={style}
        />
      );
    }
    case "button": {
      const text = resolveText(node.props.text, ctx);
      const style = buildBlockStyles(node.props);
      if (node.props.href) {
        return (
          <a
            data-block-type={node.type}
            data-block-id={node.id}
            href={resolveHref(node.props.href, ctx.basePath)}
            data-variant={node.props.variant}
            data-size={node.props.size}
            style={style}
          >
            {text}
          </a>
        );
      }

      return (
        <button
          type="button"
          data-block-type={node.type}
          data-block-id={node.id}
          data-variant={node.props.variant}
          data-size={node.props.size}
          style={style}
        >
          {text}
        </button>
      );
    }
    case "divider": {
      return (
        <hr
          data-block-type={node.type}
          data-block-id={node.id}
          data-variant={node.props.variant ?? "default"}
          style={buildBlockStyles(node.props)}
        />
      );
    }
  }

  return assertUnreachable(node);
}

function assertUnreachable(_value: never): never {
  throw new Error("Unreachable core block type");
}

function renderBlockError(node: CoreBlockNode, err: unknown): React.ReactNode {
  const message = err instanceof Error ? err.message : String(err);
  return (
    <pre data-block-error="true" data-block-type={node.type} data-block-id={node.id}>
      Block render error: {message}
    </pre>
  );
}

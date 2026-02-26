import React from "react";

import type {
  BlockNode,
  CommonBlockVisualProps,
  DocumentIR,
  LocalizedString,
  ViewerContext,
} from "@celestial/site-block-protocol";
import type { BlockManifest } from "@celestial/site-block-protocol";
import { CORE_BLOCK_MANIFESTS, resolveLocalizedValue } from "@celestial/site-block-protocol";

import type { BlockRenderer } from "./BlockRegistry";
import { BlockRegistry } from "./BlockRegistry";
import { buildBlockStyles, resolveNodeVisualProps } from "./visual-props";

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

function resolveContainerTag(value: unknown): "div" | "section" | "article" {
  if (value === "div" || value === "section" || value === "article") return value;
  return "section";
}

function resolveHeadingTag(level: number): "h1" | "h2" | "h3" | "h4" | "h5" | "h6" {
  switch (level) {
    case 1:
      return "h1";
    case 2:
      return "h2";
    case 3:
      return "h3";
    case 4:
      return "h4";
    case 5:
      return "h5";
    case 6:
      return "h6";
    default:
      return "h2";
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

const CORE_MANIFEST_BY_TYPE = new Map<string, BlockManifest>(
  CORE_BLOCK_MANIFESTS.map((m) => [m.type, m]),
);

export const coreBlockRenderers = {
  container: (node, ctx, registry) => {
    const props = node.props as Record<string, unknown>;
    const Tag = resolveContainerTag(props["as"]);
    const className = asString(props["className"]);
    const style = buildBlockStyles(resolveNodeVisualProps(node, ctx));

    return (
      <Tag data-block-type={node.type} data-block-id={node.id} className={className} style={style}>
        {Array.isArray(node.children)
          ? node.children.map((child) => <React.Fragment key={child.id}>{registry.render(child, ctx)}</React.Fragment>)
          : null}
      </Tag>
    );
  },
  grid: (node, ctx, registry) => {
    const props = node.props as Record<string, unknown>;
    const columnsRaw = asNumber(props["columns"]);
    const columns = columnsRaw !== undefined ? Math.max(1, Math.round(columnsRaw)) : 2;

    const style = buildBlockStyles(resolveNodeVisualProps(node, ctx));
    style.display = "grid";
    style.gridTemplateColumns = `repeat(${columns}, 1fr)`;

    const columnGap = asString(props["columnGap"]);
    const rowGap = asString(props["rowGap"]);
    if (columnGap) style.columnGap = columnGap;
    if (rowGap) style.rowGap = rowGap;

    return (
      <div data-block-type={node.type} data-block-id={node.id} style={style}>
        {Array.isArray(node.children)
          ? node.children.map((child) => <React.Fragment key={child.id}>{registry.render(child, ctx)}</React.Fragment>)
          : null}
      </div>
    );
  },
  spacer: (node, ctx) => {
    const props = node.props as Record<string, unknown>;
    const style = buildBlockStyles(resolveNodeVisualProps(node, ctx));

    const height = asString(props["height"]);
    if (height) {
      style.height = height;
    } else if (!style.height) {
      style.height = "24px";
    }

    return <div data-block-type={node.type} data-block-id={node.id} style={style} aria-hidden="true" />;
  },
  divider: (node, ctx) => {
    const props = node.props as Record<string, unknown>;
    const variant = asString(props["variant"]) ?? "default";
    return (
      <hr
        data-block-type={node.type}
        data-block-id={node.id}
        data-variant={variant}
        style={buildBlockStyles(resolveNodeVisualProps(node, ctx))}
      />
    );
  },
  heading: (node, ctx) => {
    const props = node.props as Record<string, unknown>;
    const levelRaw = asNumber(props["level"]);
    const level = levelRaw !== undefined ? Math.min(6, Math.max(1, Math.round(levelRaw))) : 2;
    const Tag = resolveHeadingTag(level);

    const textValue = props["text"] as LocalizedString;
    const text = resolveText(textValue, ctx);

    const align = asString(props["align"]) ?? "left";
    const style = buildBlockStyles(resolveNodeVisualProps(node, ctx));
    style.textAlign = align as React.CSSProperties["textAlign"];

    return (
      <Tag data-block-type={node.type} data-block-id={node.id} data-align={align} style={style}>
        {text}
      </Tag>
    );
  },
  paragraph: (node, ctx) => {
    const props = node.props as Record<string, unknown>;
    const textValue = props["text"] as LocalizedString;
    const text = resolveText(textValue, ctx);

    const align = asString(props["align"]) ?? "left";
    const style = buildBlockStyles(resolveNodeVisualProps(node, ctx));
    style.textAlign = align as React.CSSProperties["textAlign"];

    return (
      <p data-block-type={node.type} data-block-id={node.id} data-align={align} style={style}>
        {text}
      </p>
    );
  },
  list: (node, ctx) => {
    const props = node.props as Record<string, unknown>;
    const ordered = props["ordered"] === true;
    const Tag = ordered ? "ol" : "ul";

    const items = Array.isArray(props["items"]) ? (props["items"] as LocalizedString[]) : [];
    const style = buildBlockStyles(resolveNodeVisualProps(node, ctx));

    return (
      <Tag data-block-type={node.type} data-block-id={node.id} style={style}>
        {items.map((item, index) => (
          <li key={index}>{resolveText(item, ctx)}</li>
        ))}
      </Tag>
    );
  },
  quote: (node, ctx) => {
    const props = node.props as Record<string, unknown>;
    const textValue = props["text"] as LocalizedString;
    const citationValue = props["citation"] as LocalizedString | undefined;

    const text = resolveText(textValue, ctx);
    const citation = citationValue ? resolveText(citationValue, ctx) : "";
    const style = buildBlockStyles(resolveNodeVisualProps(node, ctx));

    return (
      <blockquote data-block-type={node.type} data-block-id={node.id} style={style}>
        <p>{text}</p>
        {citation ? <cite>{citation}</cite> : null}
      </blockquote>
    );
  },
  image: (node, ctx) => {
    const props = node.props as Record<string, unknown>;
    const src = asString(props["src"]) ?? "";
    const alt = asString(props["alt"]) ?? "";

    const style = buildBlockStyles(resolveNodeVisualProps(node, ctx));
    const objectFit = asString(props["objectFit"]) ?? "cover";
    style.objectFit = objectFit as React.CSSProperties["objectFit"];

    return <img data-block-type={node.type} data-block-id={node.id} src={src} alt={alt} style={style} />;
  },
  video: (node, ctx) => {
    const props = node.props as Record<string, unknown>;
    const src = asString(props["src"]) ?? "";
    const poster = asString(props["poster"]);
    const autoplay = props["autoplay"] === true;
    const loop = props["loop"] === true;
    const muted = props["muted"] === true;

    const style = buildBlockStyles(resolveNodeVisualProps(node, ctx));

    return (
      <video
        data-block-type={node.type}
        data-block-id={node.id}
        src={src}
        poster={poster}
        autoPlay={autoplay}
        loop={loop}
        muted={muted}
        controls={!autoplay}
        style={style}
      />
    );
  },
  icon: (node, ctx) => {
    const props = node.props as Record<string, unknown>;
    const name = asString(props["name"]) ?? "";
    const size = asString(props["size"]);

    const style = buildBlockStyles(resolveNodeVisualProps(node, ctx));
    if (size) style.fontSize = size;

    return (
      <span
        data-block-type={node.type}
        data-block-id={node.id}
        data-icon={name}
        role="img"
        aria-label={name}
        style={style}
      />
    );
  },
  button: (node, ctx) => {
    const props = node.props as Record<string, unknown>;
    const textValue = props["text"] as LocalizedString;
    const text = resolveText(textValue, ctx);

    const href = asString(props["href"]);
    const variant = asString(props["variant"]);
    const size = asString(props["size"]);
    const style = buildBlockStyles(resolveNodeVisualProps(node, ctx));

    if (href) {
      return (
        <a
          data-block-type={node.type}
          data-block-id={node.id}
          href={resolveHref(href, ctx.basePath)}
          data-variant={variant}
          data-size={size}
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
        data-variant={variant}
        data-size={size}
        style={style}
      >
        {text}
      </button>
    );
  },
} satisfies Record<CoreBlockType, BlockRenderer>;

export function registerCoreBlocks(registry: BlockRegistry): void {
  for (const [type, renderer] of Object.entries(coreBlockRenderers) as Array<[CoreBlockType, BlockRenderer]>) {
    const manifest = CORE_MANIFEST_BY_TYPE.get(type);
    if (!manifest) {
      throw new Error(`[site-renderer-core] Missing core block manifest: ${type}`);
    }
    registry.register(manifest, renderer);
  }
}

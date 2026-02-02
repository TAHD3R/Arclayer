import React from "react";

import type {
  BlockNode,
  DocumentIR,
  LocalizedString,
  ViewerContext,
} from "@celestial/site-block-protocol";
import { resolveLocalizedValue } from "@celestial/site-block-protocol";

export type CoreBlockType = "container" | "heading" | "paragraph" | "divider";

export type CoreBlockPropsByType = {
  container: {
    /**
     * Semantic wrapper.
     * Keep it minimal in Sprint 1; we can expand later.
     */
    as?: "div" | "section" | "article";
    className?: string;
  };
  heading: {
    level: 1 | 2 | 3 | 4 | 5 | 6;
    text: LocalizedString;
    align?: "left" | "center" | "right";
  };
  paragraph: {
    text: LocalizedString;
    align?: "left" | "center" | "right";
  };
  divider: {
    variant?: "default" | "subtle";
  };
};

export type CoreContainerNode = Omit<BlockNode<"container", CoreBlockPropsByType["container"]>, "children"> & {
  children?: CoreBlockNode[];
};
export type CoreHeadingNode = Omit<BlockNode<"heading", CoreBlockPropsByType["heading"]>, "children"> & {
  children?: never;
};
export type CoreParagraphNode = Omit<BlockNode<"paragraph", CoreBlockPropsByType["paragraph"]>, "children"> & {
  children?: never;
};
export type CoreDividerNode = Omit<BlockNode<"divider", CoreBlockPropsByType["divider"]>, "children"> & {
  children?: never;
};

export type CoreBlockNode = CoreContainerNode | CoreHeadingNode | CoreParagraphNode | CoreDividerNode;

export interface CoreDocumentIR extends Omit<DocumentIR, "blocks"> {
  blocks: CoreBlockNode[];
}

export function renderCoreBlock(node: CoreBlockNode, ctx: ViewerContext): React.ReactNode {
  switch (node.type) {
    case "container": {
      const Tag = node.props.as ?? "section";
      return (
        <Tag data-block-type={node.type} data-block-id={node.id} className={node.props.className}>
          {node.children?.map((child) => (
            <React.Fragment key={child.id}>{renderUnknown(child, ctx)}</React.Fragment>
          ))}
        </Tag>
      );
    }
    case "heading": {
      const Tag = `h${node.props.level}` as const;
      const text = resolveText(node.props.text, ctx);
      return (
        <Tag
          data-block-type={node.type}
          data-block-id={node.id}
          style={node.props.align ? { textAlign: node.props.align } : undefined}
        >
          {text}
        </Tag>
      );
    }
    case "paragraph": {
      const text = resolveText(node.props.text, ctx);
      return (
        <p
          data-block-type={node.type}
          data-block-id={node.id}
          style={node.props.align ? { textAlign: node.props.align } : undefined}
        >
          {text}
        </p>
      );
    }
    case "divider": {
      return (
        <hr
          data-block-type={node.type}
          data-block-id={node.id}
          data-variant={node.props.variant ?? "default"}
        />
      );
    }
  }

  return assertUnreachable(node);
}

function resolveText(value: LocalizedString, ctx: ViewerContext): string {
  return resolveLocalizedValue(value, ctx) ?? "";
}

function renderUnknown(node: CoreBlockNode, ctx: ViewerContext) {
  // In Sprint 1 we only render core blocks. Unknown blocks should still be visible for debugging.
  return renderCoreBlock(node, ctx);
}

function assertUnreachable(_value: never): never {
  throw new Error("Unreachable core block type");
}

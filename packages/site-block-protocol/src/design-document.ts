import type { CommonBlockVisualProps, DocumentMeta } from "./index";

export type DesignNodeId = string;

/**
 * DesignDocument v1
 *
 * A normalized, editor-friendly document format:
 * - page root node + nodesById table (stable patching, undo/redo, AI patch friendly)
 * - node children are stored as id arrays (not embedded objects)
 *
 * Note: v1 intentionally models the current Block protocol. Future versions
 * will introduce richer primitives and prefab instances while keeping the same
 * "root + node table" shape for stability.
 */
export interface DesignDocumentV1 {
  version: 1;
  rootId: DesignNodeId;
  nodesById: Record<DesignNodeId, DesignNodeV1>;
}

/**
 * Page root node (singleton).
 *
 * This node does not exist in DocumentIR.blocks.
 * It carries page-level metadata and visual overrides.
 */
export interface DesignPageNodeV1 {
  id: DesignNodeId;
  type: "page";
  meta?: DocumentMeta;
  children: DesignNodeId[];
}

/**
 * Block node (mirrors DocumentIR BlockNode but normalized for editing).
 *
 * - `type` is a block type identifier (e.g. "container", "heading")
 * - `props` is block-specific props, including `layout/style/animation`
 * - `children` are references to child nodes by id
 */
export interface DesignBlockNodeV1 {
  id: DesignNodeId;
  type: string;
  props: Record<string, unknown>;
  children?: DesignNodeId[];
  responsive?: Partial<Record<string, Partial<CommonBlockVisualProps>>>;
}

export type DesignNodeV1 = DesignPageNodeV1 | DesignBlockNodeV1;

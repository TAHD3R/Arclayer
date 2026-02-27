import type { BlockNode, LocalizedString } from "./index";
import type { FieldDefinition } from "./field-types";

export type BlockCategory =
  | "layout"
  | "text"
  | "media"
  | "data"
  | "navigation"
  | "interactive"
  | "custom";

export interface BlockSupports {
  children?: boolean;
  childTypes?: string[];
  layout?: boolean;
  design?: boolean;
  animation?: boolean;
  responsive?: boolean;
  reusable?: boolean;
}

export type PrefabSlotManifest = {
  name: string;
  label: LocalizedString;
  /**
   * Allowed node types inside this slot.
   * If omitted/empty, the editor should allow all core nodes by default.
   */
  allowedNodeTypes?: string[];
  required?: boolean;
  minChildren?: number;
  maxChildren?: number;
};

export interface BlockManifest<Type extends string = string> {
  type: Type;
  label: LocalizedString;
  icon?: string;
  category: BlockCategory;
  /** Manifest kind: default is normal block. Prefab manifests are editor insert entries. */
  kind?: "block" | "prefab";
  supports: BlockSupports;
  /** Block-specific attribute schema, reuses FieldDefinition. */
  attributes: FieldDefinition[];
  /**
   * Prefab slot definitions.
   * Only meaningful when `kind === "prefab"`.
   */
  slots?: PrefabSlotManifest[];
  /**
   * Prefab 样式覆写白名单：仅允许覆写这些 design key。
   *
   * 说明：
   * - 这是一种“组件边界”约束：prefab 内部的关键样式应由 prefab 自己控制
   * - 编辑器与运行时都应以此为准（编辑时过滤 patch，运行时可做降级/提示）
   */
  styleOverrideWhitelist?: string[];
}

export interface BlockPattern {
  code: string;
  label: LocalizedString;
  category: string;
  preview_image?: string;
  blocks: BlockNode[];
}

/**
 * Reusable block reference node.
 * Renderer resolves ref_id to actual BlockNode[] from block storage.
 */
export interface ReusableBlockRef {
  id: string;
  type: "__reusable__";
  props: {
    ref_id: string;
    overrides?: Record<string, unknown>;
  };
  children?: never;
}

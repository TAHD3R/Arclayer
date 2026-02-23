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

export interface BlockManifest<Type extends string = string> {
  type: Type;
  label: LocalizedString;
  icon?: string;
  category: BlockCategory;
  supports: BlockSupports;
  /** Block-specific attribute schema, reuses FieldDefinition. */
  attributes: FieldDefinition[];
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

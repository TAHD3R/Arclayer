export type {
  LocaleCode,
  LocalizedString,
  LocalizedValue,
  ViewerContext,
  DocumentIR,
  DocumentMeta,
  BlockNode,
} from "@celestial/site-block-protocol";
export { resolveLocalizedValue } from "@celestial/site-block-protocol";

export type {
  CoreBlockType,
  CoreDocumentIR,
  CoreBlockNode,
  CoreBlockPropsByType,
} from "./internal/core-blocks";
export { registerCoreBlocks } from "./internal/core-blocks";
export { DocumentRenderer } from "./internal/DocumentRenderer";
export { isCoreBlockNode, isCoreDocumentIR, isDocumentIR } from "./internal/guards";

export type { CssVarMap } from "./internal/theme/css-vars";
export { serializeCssVarsToStyleText, resolveTokenCollection, serializeTokensToStyleText } from "./internal/theme/css-vars";

export type { BlockRenderer } from "./internal/BlockRegistry";
export type {
  PrefabRenderer,
  PrefabInstanceNode,
  PrefabInstanceProps,
  PrefabInstanceBlockType,
} from "./internal/BlockRegistry";
export { BlockRegistry, PREFAB_INSTANCE_BLOCK_TYPE } from "./internal/BlockRegistry";

export { coreBlockRenderers } from "./internal/blocks/index";

export type { CreateDefaultBlockRegistryOptions } from "./internal/default-registry";
export { createDefaultBlockRegistry, defaultFallbackRenderer } from "./internal/default-registry";

export { buildBlockStyles, resolveNodeVisualProps } from "./internal/visual-props";

export { cardPrefabRenderer } from "./internal/prefabs/card-prefab";

export { PortableTextRenderer } from "./internal/rich-text/portable-text-renderer";
export { InlineEditor } from "./internal/rich-text/inline-editor";

// --- DesignDocument v1 (editor-first document format) ---
export {
  isDesignDocumentV1,
  migrateDocumentIRToDesignDocumentV1,
  compileDesignDocumentV1ToDocumentIR,
} from "./internal/design-document";

// --- Layout compute (absolute constraints + auto-layout subset) ---
export type {
  LayoutAxis,
  LayoutAlign,
  LayoutJustify,
  LayoutBox,
  LayoutSize,
  AbsoluteConstraintHorizontal,
  AbsoluteConstraintVertical,
  AbsoluteConstraints,
  AbsoluteRect,
  NodePositioningAbsolute,
  NodeChildrenLayout,
  LayoutNode,
  LayoutComputeViewport,
  LayoutComputeWarning,
  LayoutComputeResult,
} from "./internal/layout/types";
export { computeLayoutBoxes } from "./internal/layout/compute-layout";

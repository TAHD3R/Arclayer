export type {
  LocaleCode,
  LocalizedString,
  LocalizedValue,
  ViewerContext,
  PageBlueprint,
  ContentRefIncludesMap,
} from "@celestial/block-protocol";
export { resolveLocalizedValue } from "@celestial/block-protocol";

export type { CssVarMap } from "./internal/theme/css-vars";
export {
  serializeCssVarsToStyleText,
  resolveTokenCollection,
  serializeTokensToStyleText,
} from "./internal/theme/css-vars";

// --- PageBlueprint v1（编辑器文档格式） ---
export { isPageBlueprint } from "./internal/design-document";
export type {
  PageBlueprintRendererProps,
  PageBlueprintRendererViewport,
} from "./internal/design/DesignDocumentRenderer";
export { PageBlueprintRenderer } from "./internal/design/DesignDocumentRenderer";
export {
  mergeDesignNodeResponsiveOverrideV1,
  resolveDesignNodeAtBreakpointV1,
} from "./internal/design/responsive-overrides";
export type {
  DesignRenderDataSourcesV1,
  PrefabDefinitionV1,
  PrefabTemplateV1,
} from "./internal/design/prefab-registry";
export { PrefabRegistryV1 } from "./internal/design/prefab-registry";
export {
  createDefaultPrefabRegistryV1,
  createEmptyPageBlueprint,
} from "./internal/design/default-prefab-registry";

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

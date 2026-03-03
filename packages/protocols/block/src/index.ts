import type { LocaleCode, LocalizedString } from "./localized";

export type { LocaleCode, LocalizedString, LocalizedValue } from "./localized";
export { resolveLocalizedValue } from "./localized";

export type BlockDimensionValue = number | string;

// --- PageBlueprint v1（编辑器文档格式） ---

export type {
  BreakpointName,
  DesignAlignV1,
  DesignAutoLayoutV1,
  DesignBindingExprV1,
  DesignBindingSourceV1,
  ContentRefIncludeErrorCodeV1,
  ContentRefIncludeErrorV1,
  ContentRefIncludeV1,
  ContentRefIncludesMap,
  DesignConstraintsV1,
  DesignContentRefNodeV1,
  PageBlueprint,
  DesignEmbedNodeV1,
  DesignFrameNodeV1,
  DesignGroupNodeV1,
  DesignImageNodeV1,
  DesignLayoutV1,
  DesignNodeBaseV1,
  DesignNodeId,
  DesignNodeResponsiveOverrideV1,
  DesignNodeV1,
  DesignPageRootNodeV1,
  DesignPrefabInstanceNodeV1,
  DesignPropsMapV1,
  DesignRectNodeV1,
  DesignStyleV1,
  DesignTypographyV1,
  DesignTextNodeV1,
  DesignTransformV1,
  DesignValueV1,
  PrefabInstancePropsV1,
  PrefabSlotChildrenV1,
  ResolveWarningV1,
} from "./design-document";

export type { JsonObject, JsonScalar, JsonValue } from "./json-types";

export {
  DesignBindingExprV1Schema,
  PageBlueprintSchema,
  DesignNodeV1Schema,
  DesignValueV1Schema,
  isPageBlueprint,
} from "./design-document.zod";

export { BlockManifestSchema, PrefabSlotManifestSchema } from "./block-manifest.zod";
export { exportBlockManifestJsonSchema, exportPageBlueprintJsonSchema } from "./json-schema";

export type { PageBlueprintFragment, PageBlueprintPatternV1 } from "./page-blueprint-fragment";

export interface BlockLayoutProps {
  width?: BlockDimensionValue;
  minWidth?: BlockDimensionValue;
  maxWidth?: BlockDimensionValue;
  height?: BlockDimensionValue;
  minHeight?: BlockDimensionValue;
  maxHeight?: BlockDimensionValue;
  margin?: BlockDimensionValue;
  padding?: BlockDimensionValue;
  paddingX?: BlockDimensionValue;
  paddingY?: BlockDimensionValue;
  gap?: BlockDimensionValue;
  display?: "block" | "flex";
  direction?: "row" | "column";
  wrap?: "nowrap" | "wrap";
  justifyContent?: "start" | "center" | "end" | "space-between" | "space-around";
  alignItems?: "start" | "center" | "end" | "stretch";
}

export interface BlockDesignProps {
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderStyle?: "solid" | "dashed" | "dotted";
  borderWidth?: BlockDimensionValue;
  borderRadius?: BlockDimensionValue;
  boxShadow?: string;
  opacity?: number;
}

export interface BlockAnimationProps {
  type?: "none" | "fade" | "slide-up" | "slide-down" | "zoom-in";
  trigger?: "load" | "hover";
  durationMs?: number;
  delayMs?: number;
  easing?: string;
  iterationCount?: number;
  fillMode?: "none" | "forwards" | "backwards" | "both";
}

export interface CommonBlockVisualProps {
  layout?: BlockLayoutProps;
  style?: BlockDesignProps;
  animation?: BlockAnimationProps;
}

export interface ViewerContext {
  locale: LocaleCode;
  fallbackLocale?: LocaleCode;
  routeParams?: Record<string, string>;
  variantId?: string | null;
  /**
   * Optional base path prefix for internal links (e.g. "/w/{workspaceSlug}").
   * This helps a single Portal instance serve multiple workspaces/sites via path-based routing.
   */
  basePath?: string;
  /** Active design token mode (e.g. "light", "dark"). */
  mode?: string;
  /** Active breakpoint name (e.g. "desktop", "mobile"). */
  breakpoint?: string;
}

// --- Breakpoint ---

export interface BreakpointDefinition {
  name: string;
  minWidth: number;
  label: LocalizedString;
}

export const DEFAULT_BREAKPOINTS: BreakpointDefinition[] = [
  { name: "wide", minWidth: 1440, label: { "en-US": "Wide", "zh-CN": "超宽" } },
  { name: "desktop", minWidth: 1024, label: { "en-US": "Desktop", "zh-CN": "桌面" } },
  { name: "tablet", minWidth: 768, label: { "en-US": "Tablet", "zh-CN": "平板" } },
  { name: "mobile", minWidth: 0, label: { "en-US": "Mobile", "zh-CN": "手机" } },
];

export function resolveBreakpointNameByWidth(
  width: number,
  breakpoints: BreakpointDefinition[] = DEFAULT_BREAKPOINTS,
): string {
  const w = Number.isFinite(width) ? width : 0;
  const sorted = [...breakpoints].sort((a, b) => b.minWidth - a.minWidth);
  for (const bp of sorted) {
    if (w >= bp.minWidth) return bp.name;
  }
  // Fallback: keep behavior deterministic even for empty breakpoints array.
  return sorted[sorted.length - 1]?.name ?? "mobile";
}

// --- Display Mode ---

export interface DisplayMode {
  code: string;
  label: LocalizedString;
  field_visibility: Record<string, boolean>;
  field_order: string[];
  template_hint?: string;
}

export interface ContentTypeRenderContract {
  version: 1;
  display_modes: DisplayMode[];
  default_mode: string;
  platform_hints?: {
    web?: { ssr?: boolean; lazy_images?: boolean };
    miniapp?: { max_depth?: number; unsupported_blocks?: string[] };
    native?: { image_quality?: string };
  };
}

// --- Re-exports ---

export type {
  FieldKind,
  FieldValidation,
  FieldUIHints,
  FieldDefinition,
  ContentTypeFieldSchema,
  ReferenceValue,
} from "./field-types";

export type {
  TokenValue,
  TokenLayer,
  TokenDefinition,
  TokenCollection,
  DesignTokenCollection,
} from "./design-tokens";

export type {
  PortableTextMarkDef,
  PortableTextSpan,
  PortableTextChild,
  PortableTextBlock,
  PortableTextCustomBlock,
  PortableTextContent,
} from "./portable-text";

export type { BlockCategory, BlockSupports, BlockManifest } from "./block-registry";

export { CORE_BLOCK_MANIFESTS } from "./manifests/index";
export { EDITOR_INTERNAL_BLOCK_MANIFESTS } from "./manifests/index";
export { PREFAB_BLOCK_MANIFESTS } from "./manifests/index";

export { CORE_PAGE_BLUEPRINT_PATTERNS_V1 } from "./patterns/index";

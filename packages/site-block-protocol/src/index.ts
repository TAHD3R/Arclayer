export type LocaleCode = "zh-CN" | "en-US" | (string & {});

/**
 * Field-level i18n map.
 *
 * Example:
 * - { "zh-CN": "你好", "en-US": "Hello" }
 */
export type LocalizedValue<T> = Partial<Record<LocaleCode, T>>;

export type LocalizedString = LocalizedValue<string>;

export interface DocumentMeta {
  title?: LocalizedString;
  description?: LocalizedString;
  /**
   * Page-level visual props.
   *
   * Note: These are NOT block props; they apply to the document root container.
   * We reuse Block*Props for now to keep the inspector and renderer consistent.
   */
  layout?: BlockLayoutProps;
  style?: BlockDesignProps;
  animation?: BlockAnimationProps;
}

export type BlockDimensionValue = number | string;

// --- DesignDocument (Editor-first document format) ---

export type { DesignNodeId, DesignNodeV1, DesignPageNodeV1, DesignBlockNodeV1, DesignDocumentV1 } from "./design-document";

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

/**
 * Block protocol v1:
 * - `type` is registered in block registry
 * - `props` must be schema-defined (TS + runtime validation in later sprints)
 */
export interface BlockNode<Type extends string = string, Props extends object = object> {
  id: string;
  type: Type;
  props: Props;
  children?: BlockNode[];
  /** Per-breakpoint visual overrides, keyed by breakpoint name. */
  responsive?: Partial<Record<string, Partial<CommonBlockVisualProps>>>;
}

export interface DocumentIR {
  version: 1;
  meta?: DocumentMeta;
  /**
   * The main content blocks of the page.
   * Future: add slots (header/footer) and other regions.
   */
  blocks: BlockNode[];
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

export type {
  BlockCategory,
  BlockSupports,
  BlockManifest,
  BlockPattern,
  ReusableBlockRef,
} from "./block-registry";

export { CORE_BLOCK_MANIFESTS } from "./manifests/index";
export { EDITOR_INTERNAL_BLOCK_MANIFESTS } from "./manifests/index";

export { CORE_BLOCK_PATTERNS } from "./patterns/index";

export function resolveLocalizedValue<T>(
  value: LocalizedValue<T> | undefined,
  ctx: ViewerContext,
): T | undefined {
  if (!value) return undefined;
  const direct = value[ctx.locale];
  if (direct !== undefined) return direct;
  if (ctx.fallbackLocale) {
    const fallback = value[ctx.fallbackLocale];
    if (fallback !== undefined) return fallback;
  }
  // Pick a deterministic "first" locale entry if present.
  const entries = Object.entries(value) as Array<[string, T]>;
  return entries.length ? entries[0]![1] : undefined;
}

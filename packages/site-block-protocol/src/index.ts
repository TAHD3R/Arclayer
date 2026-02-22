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
}

export type BlockDimensionValue = number | string;

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
  /**
   * Route params injected by the Portal runtime (e.g. from RouteTemplate matcher).
   * Keys/values are always strings.
   */
  routeParams?: Record<string, string>;
  /**
   * Optional page variant id selected by backend.
   * Variants are theme-scoped and defined by theme packages.
   */
  variantId?: string | null;
}

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

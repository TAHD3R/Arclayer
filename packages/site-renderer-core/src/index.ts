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
export { DocumentRenderer } from "./internal/DocumentRenderer";
export { isCoreBlockNode, isCoreDocumentIR } from "./internal/guards";

export type { CssVarMap } from "./internal/theme/css-vars";
export { serializeCssVarsToStyleText } from "./internal/theme/css-vars";

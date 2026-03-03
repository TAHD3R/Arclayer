import type { LocalizedString } from "./index";

/** Resolved value or a reference to another token via $ref. */
export type TokenValue = string | number | { $ref: string };

export type TokenLayer = "primitive" | "semantic" | "component";

export interface TokenDefinition {
  key: string;
  layer: TokenLayer;
  /** mode name → value. At least "default" should exist. */
  values: Record<string, TokenValue>;
  description?: LocalizedString;
}

export interface TokenCollection {
  name: string;
  modes: string[];
  tokens: TokenDefinition[];
}

export interface DesignTokenCollection {
  version: 1;
  collections: TokenCollection[];
}

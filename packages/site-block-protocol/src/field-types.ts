import type { LocalizedString } from "./index";

import type { JsonValue } from "./json-types";

export type FieldKind =
  | "text"
  | "richtext"
  | "number"
  | "boolean"
  | "date"
  | "media"
  | "reference"
  | "object"
  | "array"
  | "select"
  | "color"
  | "url"
  | "json";

export interface FieldValidation {
  min?: number;
  max?: number;
  pattern?: string;
  options?: Array<{ value: string; label: LocalizedString }>;
  /** For "array" kind: item field definition. */
  of?: FieldDefinition;
  /** For "object" kind: nested fields. */
  fields?: FieldDefinition[];
  /** For "reference" kind: allowed content type codes. */
  refTypes?: string[];
}

export interface FieldUIHints {
  widget?: string;
  group?: string;
  hidden?: boolean;
  readonly?: boolean;
  columns?: 1 | 2 | 3 | 4;
  placeholder?: LocalizedString;
}

export interface FieldDefinition {
  key: string;
  kind: FieldKind;
  label: LocalizedString;
  required?: boolean;
  default?: JsonValue;
  validation?: FieldValidation;
  ui?: FieldUIHints;
}

export interface ContentTypeFieldSchema {
  version: 1;
  fields: FieldDefinition[];
}

/** Reference value stored in field_values for "reference" kind fields. */
export interface ReferenceValue {
  _type: "reference";
  /** Target entry PublicUUID. */
  _ref: string;
  /** Target content type code (type constraint). */
  _refType?: string;
  /** Weak reference: target deletion does not block. */
  _weak?: boolean;
}

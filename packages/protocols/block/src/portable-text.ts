export interface PortableTextMarkDef {
  _key: string;
  _type: string;
  [key: string]: unknown;
}

export interface PortableTextSpan {
  _type: "span";
  _key: string;
  text: string;
  marks?: string[];
}

export type PortableTextChild = PortableTextSpan | PortableTextCustomBlock;

export interface PortableTextBlock {
  _type: "block";
  _key: string;
  style: "normal" | "h1" | "h2" | "h3" | "h4" | "blockquote";
  children: PortableTextChild[];
  markDefs?: PortableTextMarkDef[];
  listItem?: "bullet" | "number";
  level?: number;
}

export interface PortableTextCustomBlock {
  _type: string;
  _key: string;
  [key: string]: unknown;
}

export type PortableTextContent = (PortableTextBlock | PortableTextCustomBlock)[];

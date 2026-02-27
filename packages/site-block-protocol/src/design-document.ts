import type { LocalizedString } from "./localized";

export type DesignNodeId = string;

export type BreakpointName = string;

export type DesignBindingSourceV1 =
  | "primaryEntry"
  | "prefabProps"
  | "routeParams"
  | "site"
  | "viewer";

export type DesignBindingExprV1 = {
  kind: "binding";
  source: DesignBindingSourceV1;
  /**
   * Dot path, e.g. "fields.title" or "params.slug".
   * Resolution is renderer-defined and must be safe (no arbitrary code execution).
   */
  path: string;
};

export type DesignValueV1 = { kind: "literal"; value: unknown } | DesignBindingExprV1;

export type DesignConstraintHorizontalV1 = "left" | "right" | "leftRight" | "center" | "scale";

export type DesignConstraintVerticalV1 = "top" | "bottom" | "topBottom" | "center" | "scale";

export type DesignConstraintsV1 = {
  horizontal: DesignConstraintHorizontalV1;
  vertical: DesignConstraintVerticalV1;
};

export type DesignAlignV1 = "start" | "center" | "end";

export type DesignAbsoluteRectV1 = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DesignAbsoluteLayoutV1 = {
  rect: DesignAbsoluteRectV1;
  constraints?: Partial<DesignConstraintsV1>;
  /**
   * How rect.x/rect.y is interpreted.
   * - start: x/y is top-left
   * - center: x/y is center
   * - end: x/y is bottom-right
   */
  alignX?: DesignAlignV1;
  alignY?: DesignAlignV1;
};

export type DesignAutoLayoutV1 = {
  direction: "row" | "column";
  gap?: number;
  padding?: number;
  alignItems?: "start" | "center" | "end" | "stretch";
  justifyContent?: "start" | "center" | "end" | "space-between" | "space-around";
  wrap?: "nowrap" | "wrap";
};

/**
 * Unified layout definition:
 * - `self` controls how this node is positioned/sized inside its parent.
 * - `children` controls how this node lays out its children.
 */
export type DesignLayoutV1 = {
  self?: DesignAbsoluteLayoutV1;
  children:
    | { mode: "absolute" }
    | ({ mode: "auto" } & DesignAutoLayoutV1);
};

export type DesignTypographyV1 = {
  fontFamily?: string;
  fontSize?: number;
  lineHeight?: number;
  letterSpacing?: number;
  fontWeight?: number;
};

export type DesignStyleV1 = {
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderStyle?: "solid" | "dashed" | "dotted";
  borderWidth?: number | string;
  borderRadius?: number | string;
  boxShadow?: string;
  opacity?: number;
  typography?: DesignTypographyV1;
};

export type DesignTransformV1 = {
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
};

export type DesignMotionRefV1 = {
  motionId: string;
};

export type DesignNodeResponsiveOverrideV1 = Partial<{
  layout: Partial<DesignLayoutV1>;
  style: Partial<DesignStyleV1>;
  transform: Partial<DesignTransformV1>;
  motionRefs: DesignMotionRefV1[];
}>;

export type DesignNodeBaseV1 = {
  id: DesignNodeId;
  name?: string;
  locked?: boolean;
  hidden?: boolean;
  layout?: DesignLayoutV1;
  style?: DesignStyleV1;
  transform?: DesignTransformV1;
  motionRefs?: DesignMotionRefV1[];
  /**
   * Per-breakpoint overrides. Only stores diff fields.
   */
  responsive?: Partial<Record<BreakpointName, DesignNodeResponsiveOverrideV1>>;
};

export type DesignPageRootSeoV1 = {
  title?: LocalizedString | DesignBindingExprV1;
  description?: LocalizedString | DesignBindingExprV1;
};

export type DesignPageRootDataSourcesV1 = {
  primaryEntryId?: string;
  named?: Record<string, { entryId: string; typeHint?: string }>;
};

export interface DesignPageRootNodeV1 extends DesignNodeBaseV1 {
  type: "page_root";
  children: DesignNodeId[];
  seo?: DesignPageRootSeoV1;
  dataSources?: DesignPageRootDataSourcesV1;
}

export interface DesignFrameNodeV1 extends DesignNodeBaseV1 {
  type: "frame";
  children: DesignNodeId[];
}

export interface DesignGroupNodeV1 extends DesignNodeBaseV1 {
  type: "group";
  children: DesignNodeId[];
}

export interface DesignRectNodeV1 extends DesignNodeBaseV1 {
  type: "rect";
  children?: never;
}

export interface DesignTextNodeV1 extends DesignNodeBaseV1 {
  type: "text";
  text: LocalizedString | DesignBindingExprV1;
  tag?: "p" | "span" | "h1" | "h2" | "h3";
  align?: "left" | "center" | "right";
  children?: never;
}

export interface DesignImageNodeV1 extends DesignNodeBaseV1 {
  type: "image";
  src: string | DesignBindingExprV1;
  alt?: LocalizedString | DesignBindingExprV1;
  objectFit?: "cover" | "contain" | "fill" | "none";
  children?: never;
}

export interface DesignEmbedNodeV1 extends DesignNodeBaseV1 {
  type: "embed";
  url: string | DesignBindingExprV1;
  children?: never;
}

export type PrefabSlotChildrenV1 = Record<string, DesignNodeId[]>;

export type PrefabInstancePropsV1 = Record<string, DesignValueV1>;

export interface DesignPrefabInstanceNodeV1 extends DesignNodeBaseV1 {
  type: "prefab_instance";
  prefabId: string;
  props: PrefabInstancePropsV1;
  slotChildren?: PrefabSlotChildrenV1;
  children?: never;
}

export type DesignNodeV1 =
  | DesignPageRootNodeV1
  | DesignFrameNodeV1
  | DesignGroupNodeV1
  | DesignRectNodeV1
  | DesignTextNodeV1
  | DesignImageNodeV1
  | DesignEmbedNodeV1
  | DesignPrefabInstanceNodeV1;

export interface DesignDocumentV1 {
  version: 1;
  rootId: DesignNodeId;
  nodesById: Record<DesignNodeId, DesignNodeV1>;
}

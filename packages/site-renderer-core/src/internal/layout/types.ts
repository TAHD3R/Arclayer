export type LayoutAxis = "row" | "column";

export type LayoutAlign = "start" | "center" | "end" | "stretch";

export type LayoutJustify = "start" | "center" | "end" | "space-between" | "space-around";

export type LayoutBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type LayoutSize = {
  width: number;
  height: number;
};

export type AbsoluteConstraintHorizontal = "left" | "right" | "leftRight" | "center" | "scale";

export type AbsoluteConstraintVertical = "top" | "bottom" | "topBottom" | "center" | "scale";

export type AbsoluteConstraints = {
  horizontal: AbsoluteConstraintHorizontal;
  vertical: AbsoluteConstraintVertical;
};

export type AbsoluteRect = LayoutBox;

export type NodePositioningAbsolute = {
  kind: "absolute";
  /**
   * 设计态（base）矩形：相对于父容器 base 尺寸坐标系的 x/y/w/h。
   *
   * 当父容器实际尺寸（actual）与 base 尺寸不一致时，由 constraints 决定如何映射到 actual。
   */
  rect: AbsoluteRect;
  constraints?: Partial<AbsoluteConstraints>;
};

export type NodeChildrenLayout =
  | {
      mode: "absolute";
    }
  | {
      mode: "auto";
      direction: LayoutAxis;
      gap?: number;
      padding?: number;
      alignItems?: LayoutAlign;
      justifyContent?: LayoutJustify;
    };

export type LayoutNode = {
  id: string;
  type: string;
  /**
   * 节点自身在父容器中的定位方式。根节点可以不填（由 viewport 决定）。
   */
  positioning?: NodePositioningAbsolute;
  /**
   * 子节点布局方式。未设置时默认 absolute（子节点走 constraints）。
   */
  childrenLayout?: NodeChildrenLayout;
  children?: string[];
  /**
   * 可选文本信息，供默认测量策略使用（SSR 的“保守测量”）。
   */
  text?: {
    content: string;
    fontSize?: number;
    lineHeight?: number;
    /**
     * 文本换行时的最大宽度（px）。未提供时，默认使用节点自身宽度。
     */
    maxWidth?: number;
  };
};

export type LayoutComputeViewport = {
  width: number;
  height: number;
  /**
   * 根容器设计态（base）宽高。
   * 不提供时，默认等于 viewport.width/height。
   */
  baseWidth?: number;
  baseHeight?: number;
};

export type LayoutComputeWarning = {
  nodeId: string;
  message: string;
};

export type LayoutComputeResult = {
  boxesById: Record<string, LayoutBox>;
  warnings: LayoutComputeWarning[];
};

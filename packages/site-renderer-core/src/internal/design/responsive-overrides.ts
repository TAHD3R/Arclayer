import type {
  DesignAutoLayoutV1,
  DesignConstraintsV1,
  DesignLayoutV1,
  DesignNodeResponsiveOverrideV1,
  DesignNodeV1,
  DesignStyleV1,
  DesignTransformV1,
  DesignTypographyV1,
} from "@celestial/site-block-protocol";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeOverride<T extends object>(base: T | undefined, override: Partial<T> | undefined): T | undefined {
  if (!base && !override) return undefined;
  return { ...(base ?? ({} as T)), ...(override ?? ({} as Partial<T>)) } as T;
}

function mergeTypography(base: DesignTypographyV1 | undefined, override: Partial<DesignTypographyV1> | undefined): DesignTypographyV1 | undefined {
  return mergeOverride(base, override);
}

function mergeStyle(base: DesignStyleV1 | undefined, override: Partial<DesignStyleV1> | undefined): DesignStyleV1 | undefined {
  const merged = mergeOverride(base, override);
  if (!merged) return undefined;
  const typography = mergeTypography(base?.typography, override?.typography);
  if (typography) merged.typography = typography;
  return merged;
}

function mergeTransform(base: DesignTransformV1 | undefined, override: Partial<DesignTransformV1> | undefined): DesignTransformV1 | undefined {
  return mergeOverride(base, override);
}

function mergeConstraints(base: Partial<DesignConstraintsV1> | undefined, override: Partial<DesignConstraintsV1> | undefined): Partial<DesignConstraintsV1> | undefined {
  return mergeOverride(base, override);
}

function mergeChildrenLayout(
  base: DesignLayoutV1["children"] | undefined,
  override: DesignLayoutV1["children"] | undefined,
): DesignLayoutV1["children"] {
  const baseMode = base?.mode;
  const overrideAny = (override ?? undefined) as
    | ({ mode?: "absolute" | "auto" } & Partial<DesignAutoLayoutV1>)
    | undefined;
  const overrideMode = overrideAny?.mode;

  const mode =
    overrideMode ??
    // Diff-only overrides may omit `mode`; keep base mode when possible.
    baseMode ??
    (overrideAny && (overrideAny.direction || overrideAny.gap !== undefined || overrideAny.padding !== undefined)
      ? "auto"
      : "absolute");

  if (mode === "absolute") return { mode: "absolute" };

  const baseAuto = baseMode === "auto" ? base : undefined;
  const overrideAuto = mode === "auto" ? overrideAny : undefined;

  const out: { mode: "auto"; direction: "row" | "column" } & Partial<DesignAutoLayoutV1> = {
    mode: "auto",
    direction: overrideAuto?.direction ?? baseAuto?.direction ?? "column",
  };

  const gap = overrideAuto?.gap ?? baseAuto?.gap;
  if (gap !== undefined) out.gap = gap;
  const padding = overrideAuto?.padding ?? baseAuto?.padding;
  if (padding !== undefined) out.padding = padding;
  const alignItems = overrideAuto?.alignItems ?? baseAuto?.alignItems;
  if (alignItems !== undefined) out.alignItems = alignItems;
  const justifyContent = overrideAuto?.justifyContent ?? baseAuto?.justifyContent;
  if (justifyContent !== undefined) out.justifyContent = justifyContent;
  const wrap = overrideAuto?.wrap ?? baseAuto?.wrap;
  if (wrap !== undefined) out.wrap = wrap;

  return out as DesignLayoutV1["children"];
}

function mergeAbsoluteSelfLayout(
  base: DesignLayoutV1["self"] | undefined,
  override: DesignLayoutV1["self"] | undefined,
): DesignLayoutV1["self"] | undefined {
  if (!base && !override) return undefined;
  const rect = mergeOverride(base?.rect, override?.rect);
  if (!rect) return undefined;
  const out: DesignLayoutV1["self"] = { rect };

  const constraints = mergeConstraints(base?.constraints, override?.constraints);
  if (constraints !== undefined) out.constraints = constraints;

  const alignX = override?.alignX ?? base?.alignX;
  if (alignX !== undefined) out.alignX = alignX;

  const alignY = override?.alignY ?? base?.alignY;
  if (alignY !== undefined) out.alignY = alignY;

  return out;
}

function mergeLayout(base: DesignLayoutV1 | undefined, override: Partial<DesignLayoutV1> | undefined): DesignLayoutV1 | undefined {
  if (!base && !override) return undefined;

  const baseChildren = base?.children;
  const overrideChildren = override?.children as DesignLayoutV1["children"] | undefined;
  const children = mergeChildrenLayout(baseChildren, overrideChildren);

  const baseSelf = base?.self;
  const overrideSelf = override?.self as DesignLayoutV1["self"] | undefined;
  const self = mergeAbsoluteSelfLayout(baseSelf, overrideSelf);

  const out: DesignLayoutV1 = {
    ...(self ? { self } : {}),
    children,
  };
  return out;
}

export function mergeDesignNodeResponsiveOverrideV1(args: {
  node: DesignNodeV1;
  override: DesignNodeResponsiveOverrideV1 | undefined;
}): DesignNodeV1 {
  const { node, override } = args;
  if (!override) return node;

  // v1：仅合并 layout/style/transform/motionRefs，其他字段不允许 override。
  return {
    ...node,
    layout: mergeLayout(node.layout, override.layout as Partial<DesignLayoutV1> | undefined),
    style: mergeStyle(node.style, override.style as Partial<DesignStyleV1> | undefined),
    transform: mergeTransform(node.transform, override.transform as Partial<DesignTransformV1> | undefined),
    motionRefs: override.motionRefs ?? node.motionRefs,
  } as DesignNodeV1;
}

export function resolveDesignNodeAtBreakpointV1(args: { node: DesignNodeV1; breakpoint: string | undefined }): DesignNodeV1 {
  const bp = (args.breakpoint || "").trim();
  if (!bp) return args.node;

  const responsive = args.node.responsive;
  if (!responsive || !isRecord(responsive)) return args.node;

  const override = responsive[bp] as DesignNodeResponsiveOverrideV1 | undefined;
  return mergeDesignNodeResponsiveOverrideV1({ node: args.node, override });
}

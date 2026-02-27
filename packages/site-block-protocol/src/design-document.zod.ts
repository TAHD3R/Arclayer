import { z } from "zod";

export const LocaleCodeSchema = z.string().min(1);
export const LocalizedStringSchema = z.record(LocaleCodeSchema, z.string());

export const DesignBindingSourceV1Schema = z.enum([
  "primaryEntry",
  "prefabProps",
  "routeParams",
  "site",
  "viewer",
]);

export const DesignBindingExprV1Schema = z
  .object({
    kind: z.literal("binding"),
    source: DesignBindingSourceV1Schema,
    path: z.string().min(1),
  })
  .strict();

const JsonScalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const JsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([JsonScalarSchema, z.array(JsonValueSchema), z.record(z.string(), JsonValueSchema)]),
);

export const DesignLiteralValueV1Schema = z
  .object({
    kind: z.literal("literal"),
    value: JsonValueSchema,
  })
  .strict();

export const DesignValueV1Schema = z.discriminatedUnion("kind", [
  DesignLiteralValueV1Schema,
  DesignBindingExprV1Schema,
]);

export const DesignConstraintHorizontalV1Schema = z.enum([
  "left",
  "right",
  "leftRight",
  "center",
  "scale",
]);
export const DesignConstraintVerticalV1Schema = z.enum([
  "top",
  "bottom",
  "topBottom",
  "center",
  "scale",
]);

export const DesignConstraintsV1Schema = z
  .object({
    horizontal: DesignConstraintHorizontalV1Schema,
    vertical: DesignConstraintVerticalV1Schema,
  })
  .strict();

export const DesignAlignV1Schema = z.enum(["start", "center", "end"]);

export const DesignAbsoluteRectV1Schema = z
  .object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  })
  .strict();

export const DesignAbsoluteLayoutV1Schema = z
  .object({
    rect: DesignAbsoluteRectV1Schema,
    constraints: DesignConstraintsV1Schema.partial().optional(),
    alignX: DesignAlignV1Schema.optional(),
    alignY: DesignAlignV1Schema.optional(),
  })
  .strict();

export const DesignAutoLayoutV1Schema = z
  .object({
    direction: z.enum(["row", "column"]),
    gap: z.number().optional(),
    padding: z.number().optional(),
    alignItems: z.enum(["start", "center", "end", "stretch"]).optional(),
    justifyContent: z
      .enum(["start", "center", "end", "space-between", "space-around"])
      .optional(),
    wrap: z.enum(["nowrap", "wrap"]).optional(),
  })
  .strict();

export const DesignChildrenLayoutV1Schema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("absolute") }).strict(),
  z
    .object({
      mode: z.literal("auto"),
      ...DesignAutoLayoutV1Schema.shape,
    })
    .strict(),
]);

export const DesignLayoutV1Schema = z
  .object({
    self: DesignAbsoluteLayoutV1Schema.optional(),
    children: DesignChildrenLayoutV1Schema,
  })
  .strict();

export const DesignTypographyV1Schema = z
  .object({
    fontFamily: z.string().optional(),
    fontSize: z.number().optional(),
    lineHeight: z.number().optional(),
    letterSpacing: z.number().optional(),
    fontWeight: z.number().optional(),
  })
  .strict();

export const DesignStyleV1Schema = z
  .object({
    color: z.string().optional(),
    backgroundColor: z.string().optional(),
    borderColor: z.string().optional(),
    borderStyle: z.enum(["solid", "dashed", "dotted"]).optional(),
    borderWidth: z.union([z.number(), z.string()]).optional(),
    borderRadius: z.union([z.number(), z.string()]).optional(),
    boxShadow: z.string().optional(),
    opacity: z.number().optional(),
    typography: DesignTypographyV1Schema.optional(),
  })
  .strict();

export const DesignTransformV1Schema = z
  .object({
    rotation: z.number().optional(),
    scaleX: z.number().optional(),
    scaleY: z.number().optional(),
  })
  .strict();

export const DesignMotionRefV1Schema = z
  .object({
    motionId: z.string().min(1),
  })
  .strict();

// --- responsive overrides (diff-only) ---

const DesignChildrenLayoutOverrideV1Schema = z
  .object({
    // diff-only overrides may omit mode; renderer will infer when possible.
    mode: z.enum(["absolute", "auto"]).optional(),
    direction: z.enum(["row", "column"]).optional(),
    gap: z.number().optional(),
    padding: z.number().optional(),
    alignItems: z.enum(["start", "center", "end", "stretch"]).optional(),
    justifyContent: z
      .enum(["start", "center", "end", "space-between", "space-around"])
      .optional(),
    wrap: z.enum(["nowrap", "wrap"]).optional(),
  })
  .strict();

const DesignLayoutOverrideV1Schema = z
  .object({
    self: z
      .object({
        rect: DesignAbsoluteRectV1Schema.partial().optional(),
        constraints: DesignConstraintsV1Schema.partial().optional(),
        alignX: DesignAlignV1Schema.optional(),
        alignY: DesignAlignV1Schema.optional(),
      })
      .strict()
      .optional(),
    children: DesignChildrenLayoutOverrideV1Schema.optional(),
  })
  .strict();

const DesignStyleOverrideV1Schema = z
  .object({
    color: z.string().optional(),
    backgroundColor: z.string().optional(),
    borderColor: z.string().optional(),
    borderStyle: z.enum(["solid", "dashed", "dotted"]).optional(),
    borderWidth: z.union([z.number(), z.string()]).optional(),
    borderRadius: z.union([z.number(), z.string()]).optional(),
    boxShadow: z.string().optional(),
    opacity: z.number().optional(),
    typography: DesignTypographyV1Schema.partial().optional(),
  })
  .strict();

const DesignTransformOverrideV1Schema = DesignTransformV1Schema.partial();

export const DesignNodeResponsiveOverrideV1Schema = z
  .object({
    layout: DesignLayoutOverrideV1Schema.optional(),
    style: DesignStyleOverrideV1Schema.optional(),
    transform: DesignTransformOverrideV1Schema.optional(),
    motionRefs: z.array(DesignMotionRefV1Schema).optional(),
  })
  .strict();

const BaseNodeFields = {
  id: z.string().min(1),
  name: z.string().optional(),
  locked: z.boolean().optional(),
  hidden: z.boolean().optional(),
  layout: DesignLayoutV1Schema.optional(),
  style: DesignStyleV1Schema.optional(),
  transform: DesignTransformV1Schema.optional(),
  motionRefs: z.array(DesignMotionRefV1Schema).optional(),
  responsive: z.record(z.string(), DesignNodeResponsiveOverrideV1Schema).optional(),
};

export const DesignPageRootSeoV1Schema = z
  .object({
    title: z.union([LocalizedStringSchema, DesignBindingExprV1Schema]).optional(),
    description: z.union([LocalizedStringSchema, DesignBindingExprV1Schema]).optional(),
  })
  .strict();

export const DesignPageRootDataSourcesV1Schema = z
  .object({
    primaryEntryId: z.string().optional(),
    named: z
      .record(z.string(), z.object({ entryId: z.string(), typeHint: z.string().optional() }).strict())
      .optional(),
  })
  .strict();

export const DesignPageRootNodeV1Schema = z
  .object({
    ...BaseNodeFields,
    type: z.literal("page_root"),
    children: z.array(z.string()),
    seo: DesignPageRootSeoV1Schema.optional(),
    dataSources: DesignPageRootDataSourcesV1Schema.optional(),
  })
  .strict();

export const DesignFrameNodeV1Schema = z
  .object({
    ...BaseNodeFields,
    type: z.literal("frame"),
    children: z.array(z.string()),
  })
  .strict();

export const DesignGroupNodeV1Schema = z
  .object({
    ...BaseNodeFields,
    type: z.literal("group"),
    children: z.array(z.string()),
  })
  .strict();

export const DesignRectNodeV1Schema = z
  .object({
    ...BaseNodeFields,
    type: z.literal("rect"),
  })
  .strict();

export const DesignTextNodeV1Schema = z
  .object({
    ...BaseNodeFields,
    type: z.literal("text"),
    text: z.union([LocalizedStringSchema, DesignBindingExprV1Schema]),
    tag: z.enum(["p", "span", "h1", "h2", "h3"]).optional(),
    align: z.enum(["left", "center", "right"]).optional(),
  })
  .strict();

export const DesignImageNodeV1Schema = z
  .object({
    ...BaseNodeFields,
    type: z.literal("image"),
    src: z.union([z.string(), DesignBindingExprV1Schema]),
    alt: z.union([LocalizedStringSchema, DesignBindingExprV1Schema]).optional(),
    objectFit: z.enum(["cover", "contain", "fill", "none"]).optional(),
  })
  .strict();

export const DesignEmbedNodeV1Schema = z
  .object({
    ...BaseNodeFields,
    type: z.literal("embed"),
    url: z.union([z.string(), DesignBindingExprV1Schema]),
  })
  .strict();

export const PrefabSlotChildrenV1Schema = z.record(z.string(), z.array(z.string()));
export const PrefabInstancePropsV1Schema = z.record(z.string(), DesignValueV1Schema);

export const DesignPrefabInstanceNodeV1Schema = z
  .object({
    ...BaseNodeFields,
    type: z.literal("prefab_instance"),
    prefabId: z.string().min(1),
    props: PrefabInstancePropsV1Schema,
    slotChildren: PrefabSlotChildrenV1Schema.optional(),
  })
  .strict();

export const DesignNodeV1Schema = z.discriminatedUnion("type", [
  DesignPageRootNodeV1Schema,
  DesignFrameNodeV1Schema,
  DesignGroupNodeV1Schema,
  DesignRectNodeV1Schema,
  DesignTextNodeV1Schema,
  DesignImageNodeV1Schema,
  DesignEmbedNodeV1Schema,
  DesignPrefabInstanceNodeV1Schema,
]);

export const DesignDocumentV1Schema = z
  .object({
    version: z.literal(1),
    rootId: z.string().min(1),
    nodesById: z.record(z.string().min(1), DesignNodeV1Schema),
  })
  .strict()
  .superRefine((doc, ctx) => {
    const root = doc.nodesById[doc.rootId];
    if (!root) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `rootId "${doc.rootId}" not found in nodesById`,
        path: ["rootId"],
      });
      return;
    }
    if (root.type !== "page_root") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `root node must be type "page_root"`,
        path: ["rootId"],
      });
    }

    // Basic referential integrity checks for children/slotChildren.
    for (const node of Object.values(doc.nodesById)) {
      const children = (node as { children?: unknown }).children;
      if (Array.isArray(children)) {
        for (const id of children) {
          if (typeof id !== "string") continue;
          if (!doc.nodesById[id]) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `missing child node "${id}"`,
              path: ["nodesById", node.id, "children"],
            });
          }
        }
      }

      if (node.type === "prefab_instance") {
        const slotChildren = node.slotChildren ?? {};
        for (const ids of Object.values(slotChildren)) {
          if (!Array.isArray(ids)) continue;
          for (const id of ids) {
            if (typeof id !== "string") continue;
            if (!doc.nodesById[id]) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `missing slot child node "${id}"`,
                path: ["nodesById", node.id, "slotChildren"],
              });
            }
          }
        }
      }
    }
  });

export function isDesignDocumentV1(input: unknown): input is z.infer<typeof DesignDocumentV1Schema> {
  return DesignDocumentV1Schema.safeParse(input).success;
}

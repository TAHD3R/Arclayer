import { z } from "zod";

import { LocalizedStringSchema } from "./design-document.zod";

export const BlockCategorySchema = z.enum([
  "layout",
  "text",
  "media",
  "data",
  "navigation",
  "interactive",
  "custom",
]);

export const BlockSupportsSchema = z
  .object({
    children: z.boolean().optional(),
    childTypes: z.array(z.string()).optional(),
    layout: z.boolean().optional(),
    design: z.boolean().optional(),
    animation: z.boolean().optional(),
    responsive: z.boolean().optional(),
    reusable: z.boolean().optional(),
  })
  .strict();

export const PrefabSlotManifestSchema = z
  .object({
    name: z.string().min(1),
    label: LocalizedStringSchema,
    allowedNodeTypes: z.array(z.string().min(1)).optional(),
    required: z.boolean().optional(),
    minChildren: z.number().int().nonnegative().optional(),
    maxChildren: z.number().int().nonnegative().optional(),
  })
  .strict();

// FieldDefinition 在协议层较大，本阶段仅做最小结构校验（避免 slots/whitelist 漂移）。
export const FieldDefinitionSchema = z
  .object({
    key: z.string().min(1),
    kind: z.string().min(1),
  })
  .passthrough();

export const BlockManifestSchema = z
  .object({
    type: z.string().min(1),
    label: LocalizedStringSchema,
    icon: z.string().optional(),
    category: BlockCategorySchema,
    kind: z.enum(["block", "prefab"]).optional(),
    supports: BlockSupportsSchema,
    attributes: z.array(FieldDefinitionSchema),
    slots: z.array(PrefabSlotManifestSchema).optional(),
    styleOverrideWhitelist: z.array(z.string().min(1)).optional(),
  })
  .strict();

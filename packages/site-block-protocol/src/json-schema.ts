/**
 * JSON Schema exports for protocol validation.
 *
 * 说明：
 * - 本仓库当前没有引入第三方 zod->json schema 转换器（避免新增外部依赖）。
 * - 因此这里提供“手写但稳定”的 JSON Schema（配合测试快照锁定结构）。
 * - 后续如需要完全自动化导出，可替换为基于 Zod AST 的生成器或引入转换依赖。
 */

export function exportPageBlueprintJsonSchema(): Record<string, unknown> {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "celestial://page-blueprint-v1.json",
    title: "PageBlueprint",
    type: "object",
    additionalProperties: false,
    required: ["version", "rootId", "nodesById"],
    properties: {
      version: { const: 1 },
      rootId: { type: "string", minLength: 1 },
      nodesById: {
        type: "object",
        additionalProperties: { $ref: "#/$defs/DesignNodeV1" },
      },
    },
    $defs: {
      DesignBindingExprV1: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "source", "path"],
        properties: {
          kind: { const: "binding" },
          source: {
            enum: ["primaryEntry", "prefabProps", "routeParams", "site", "viewer"],
          },
          path: { type: "string", minLength: 1 },
        },
      },
      LocalizedString: {
        type: "object",
        additionalProperties: { type: "string" },
      },
      DesignValueV1: {
        oneOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["kind", "value"],
            properties: {
              kind: { const: "literal" },
              value: {},
            },
          },
          { $ref: "#/$defs/DesignBindingExprV1" },
        ],
      },
      DesignConstraintsV1: {
        type: "object",
        additionalProperties: false,
        required: ["horizontal", "vertical"],
        properties: {
          horizontal: { enum: ["left", "right", "leftRight", "center", "scale"] },
          vertical: { enum: ["top", "bottom", "topBottom", "center", "scale"] },
        },
      },
      DesignLayoutV1: {
        type: "object",
        additionalProperties: false,
        required: ["children"],
        properties: {
          self: {
            type: "object",
            additionalProperties: false,
            required: ["rect"],
            properties: {
              rect: {
                type: "object",
                additionalProperties: false,
                required: ["x", "y", "width", "height"],
                properties: {
                  x: { type: "number" },
                  y: { type: "number" },
                  width: { type: "number" },
                  height: { type: "number" },
                },
              },
              constraints: {
                type: "object",
                additionalProperties: false,
                properties: {
                  horizontal: { enum: ["left", "right", "leftRight", "center", "scale"] },
                  vertical: { enum: ["top", "bottom", "topBottom", "center", "scale"] },
                },
              },
              alignX: { enum: ["start", "center", "end"] },
              alignY: { enum: ["start", "center", "end"] },
            },
          },
          children: {
            oneOf: [
              {
                type: "object",
                additionalProperties: false,
                required: ["mode"],
                properties: { mode: { const: "absolute" } },
              },
              {
                type: "object",
                additionalProperties: false,
                required: ["mode", "direction"],
                properties: {
                  mode: { const: "auto" },
                  direction: { enum: ["row", "column"] },
                  gap: { type: "number" },
                  padding: { type: "number" },
                  alignItems: { enum: ["start", "center", "end", "stretch"] },
                  justifyContent: {
                    enum: ["start", "center", "end", "space-between", "space-around"],
                  },
                  wrap: { enum: ["nowrap", "wrap"] },
                },
              },
            ],
          },
        },
      },
      DesignNodeV1: {
        oneOf: [
          { $ref: "#/$defs/DesignPageRootNodeV1" },
          { $ref: "#/$defs/DesignFrameNodeV1" },
          { $ref: "#/$defs/DesignGroupNodeV1" },
          { $ref: "#/$defs/DesignRectNodeV1" },
          { $ref: "#/$defs/DesignTextNodeV1" },
          { $ref: "#/$defs/DesignImageNodeV1" },
          { $ref: "#/$defs/DesignEmbedNodeV1" },
          { $ref: "#/$defs/DesignPrefabInstanceNodeV1" },
        ],
        discriminator: { propertyName: "type" },
      },
      BaseNodeFields: {
        type: "object",
        properties: {
          id: { type: "string", minLength: 1 },
          name: { type: "string" },
          locked: { type: "boolean" },
          hidden: { type: "boolean" },
          layout: { $ref: "#/$defs/DesignLayoutV1" },
          style: { type: "object" },
          transform: { type: "object" },
          motionRefs: { type: "array" },
          responsive: { type: "object" },
        },
      },
      DesignPageRootNodeV1: {
        type: "object",
        additionalProperties: false,
        required: ["id", "type", "children"],
        properties: {
          ...baseProps(),
          type: { const: "page_root" },
          children: { type: "array", items: { type: "string" } },
          seo: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { oneOf: [{ $ref: "#/$defs/LocalizedString" }, { $ref: "#/$defs/DesignBindingExprV1" }] },
              description: { oneOf: [{ $ref: "#/$defs/LocalizedString" }, { $ref: "#/$defs/DesignBindingExprV1" }] },
            },
          },
        },
      },
      DesignFrameNodeV1: {
        type: "object",
        additionalProperties: false,
        required: ["id", "type", "children"],
        properties: {
          ...baseProps(),
          type: { const: "frame" },
          children: { type: "array", items: { type: "string" } },
        },
      },
      DesignGroupNodeV1: {
        type: "object",
        additionalProperties: false,
        required: ["id", "type", "children"],
        properties: {
          ...baseProps(),
          type: { const: "group" },
          children: { type: "array", items: { type: "string" } },
        },
      },
      DesignRectNodeV1: {
        type: "object",
        additionalProperties: false,
        required: ["id", "type"],
        properties: { ...baseProps(), type: { const: "rect" } },
      },
      DesignTextNodeV1: {
        type: "object",
        additionalProperties: false,
        required: ["id", "type", "text"],
        properties: {
          ...baseProps(),
          type: { const: "text" },
          text: { oneOf: [{ $ref: "#/$defs/LocalizedString" }, { $ref: "#/$defs/DesignBindingExprV1" }] },
          tag: { enum: ["p", "span", "h1", "h2", "h3"] },
          align: { enum: ["left", "center", "right"] },
        },
      },
      DesignImageNodeV1: {
        type: "object",
        additionalProperties: false,
        required: ["id", "type", "src"],
        properties: {
          ...baseProps(),
          type: { const: "image" },
          src: { oneOf: [{ type: "string" }, { $ref: "#/$defs/DesignBindingExprV1" }] },
          alt: { oneOf: [{ $ref: "#/$defs/LocalizedString" }, { $ref: "#/$defs/DesignBindingExprV1" }] },
          objectFit: { enum: ["cover", "contain", "fill", "none"] },
        },
      },
      DesignEmbedNodeV1: {
        type: "object",
        additionalProperties: false,
        required: ["id", "type", "url"],
        properties: {
          ...baseProps(),
          type: { const: "embed" },
          url: { oneOf: [{ type: "string" }, { $ref: "#/$defs/DesignBindingExprV1" }] },
        },
      },
      DesignPrefabInstanceNodeV1: {
        type: "object",
        additionalProperties: false,
        required: ["id", "type", "prefabId", "props"],
        properties: {
          ...baseProps(),
          type: { const: "prefab_instance" },
          prefabId: { type: "string", minLength: 1 },
          props: {
            type: "object",
            additionalProperties: { $ref: "#/$defs/DesignValueV1" },
          },
          slotChildren: {
            type: "object",
            additionalProperties: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
  };
}

export function exportBlockManifestJsonSchema(): Record<string, unknown> {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "celestial://block-manifest-v1.json",
    title: "BlockManifest",
    type: "object",
    additionalProperties: false,
    required: ["type", "label", "category", "supports", "attributes"],
    properties: {
      type: { type: "string", minLength: 1 },
      label: { $ref: "#/$defs/LocalizedString" },
      icon: { type: "string" },
      category: {
        enum: ["layout", "text", "media", "data", "navigation", "interactive", "custom"],
      },
      kind: { enum: ["block", "prefab"] },
      supports: { $ref: "#/$defs/BlockSupports" },
      attributes: { type: "array", items: { type: "object" } },
      slots: { type: "array", items: { $ref: "#/$defs/PrefabSlotManifest" } },
      styleOverrideWhitelist: { type: "array", items: { type: "string", minLength: 1 } },
    },
    $defs: {
      LocalizedString: {
        type: "object",
        additionalProperties: { type: "string" },
      },
      BlockSupports: {
        type: "object",
        additionalProperties: false,
        properties: {
          children: { type: "boolean" },
          childTypes: { type: "array", items: { type: "string" } },
          layout: { type: "boolean" },
          design: { type: "boolean" },
          animation: { type: "boolean" },
          responsive: { type: "boolean" },
          reusable: { type: "boolean" },
        },
      },
      PrefabSlotManifest: {
        type: "object",
        additionalProperties: false,
        required: ["name", "label"],
        properties: {
          name: { type: "string", minLength: 1 },
          label: { $ref: "#/$defs/LocalizedString" },
          allowedNodeTypes: { type: "array", items: { type: "string", minLength: 1 } },
          required: { type: "boolean" },
          minChildren: { type: "integer", minimum: 0 },
          maxChildren: { type: "integer", minimum: 0 },
        },
      },
    },
  };
}

function baseProps(): Record<string, unknown> {
  return {
    id: { type: "string", minLength: 1 },
    name: { type: "string" },
    locked: { type: "boolean" },
    hidden: { type: "boolean" },
    layout: { $ref: "#/$defs/DesignLayoutV1" },
    style: { type: "object" },
    transform: { type: "object" },
    motionRefs: { type: "array" },
    responsive: { type: "object" },
  };
}

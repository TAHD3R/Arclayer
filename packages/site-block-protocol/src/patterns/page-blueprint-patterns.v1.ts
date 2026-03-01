import type { DesignLayoutV1, DesignNodeV1 } from "../design-document";
import type { PageBlueprintPatternV1 } from "../page-blueprint-fragment";

function defaultRectLayout(x: number, y: number, width: number, height: number): DesignLayoutV1 {
  return {
    self: {
      rect: { x, y, width, height },
      constraints: { horizontal: "left", vertical: "top" },
      alignX: "start",
      alignY: "start",
    },
    children: { mode: "absolute" },
  };
}

export const CORE_PAGE_BLUEPRINT_PATTERNS_V1: PageBlueprintPatternV1[] = [
  {
    code: "prefab_card",
    label: { "zh-CN": "卡片", "en-US": "Card" },
    category: "prefab",
    rootIds: ["p_card"],
    nodesById: {
      p_card: {
        id: "p_card",
        type: "prefab_instance",
        prefabId: "card",
        props: {
          title: { kind: "literal", value: "Card title" },
          description: { kind: "literal", value: "Card description" },
          imageSrc: { kind: "literal", value: "" },
          href: { kind: "literal", value: "" },
        },
        slotChildren: { default: [] },
        layout: defaultRectLayout(0, 0, 360, 240),
        style: {},
      } satisfies DesignNodeV1,
    },
  },
];

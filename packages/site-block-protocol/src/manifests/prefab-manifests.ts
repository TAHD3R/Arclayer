import type { BlockManifest } from "../block-registry";

/**
 * Prefab manifests（插入入口 + Inspector schema）。
 *
 * 注意：
 * - 这些 manifest.type 不是 DesignDocument 中真实节点的 type；它们是“插入指令 / Inspector blockType”。
 * - Portal 会把 `prefab:<code>` 映射为真实的 `prefab_instance` 节点，并写入 prefabId = <code>。
 *
 * 这样做的好处是：
 * - 既能让 UI 以 registry/manifest 驱动（可搜索、可分组）
 * - 又能保持 DesignDocument 的 PrefabInstance 节点类型稳定（`prefab_instance`）
 */
export const PREFAB_BLOCK_MANIFESTS: BlockManifest[] = [
  {
    type: "prefab:section",
    kind: "prefab",
    label: { "zh-CN": "区块（Section）", "en-US": "Section" },
    icon: "section",
    category: "layout",
    supports: { children: true, layout: true, design: true, animation: true, responsive: true },
    attributes: [
      {
        key: "columns",
        kind: "number",
        label: { "zh-CN": "列数", "en-US": "Columns" },
        default: 12,
      },
      {
        key: "columnGap",
        kind: "number",
        label: { "zh-CN": "列间距", "en-US": "Column Gap" },
        default: 24,
      },
      {
        key: "paddingX",
        kind: "number",
        label: { "zh-CN": "左右内边距", "en-US": "Padding X" },
        default: 24,
      },
      {
        key: "paddingY",
        kind: "number",
        label: { "zh-CN": "上下内边距", "en-US": "Padding Y" },
        default: 24,
      },
      {
        key: "rowHeight",
        kind: "number",
        label: { "zh-CN": "行高", "en-US": "Row Height" },
        default: 8,
      },
      {
        key: "rowGap",
        kind: "number",
        label: { "zh-CN": "行间距", "en-US": "Row Gap" },
        default: 8,
      },
      {
        key: "showGrid",
        kind: "boolean",
        label: { "zh-CN": "显示网格参考线", "en-US": "Show Grid" },
        default: true,
      },
    ],
    slots: [
      {
        name: "default",
        label: { "zh-CN": "内容", "en-US": "Content" },
        allowedNodeTypes: [
          "frame",
          "group",
          "rect",
          "text",
          "image",
          "embed",
          "prefab_instance",
          "content_ref",
        ],
        required: false,
        minChildren: 0,
        maxChildren: 200,
      },
    ],
    styleOverrideWhitelist: [
      "backgroundColor",
      "borderColor",
      "borderRadius",
      "boxShadow",
      "opacity",
    ],
  },
  {
    type: "prefab:card",
    kind: "prefab",
    label: { "zh-CN": "卡片", "en-US": "Card" },
    icon: "card",
    category: "custom",
    supports: { children: true, layout: true, design: true, animation: true, responsive: true },
    // Prefab props（存储在 PrefabInstance.props.props 内）
    attributes: [
      { key: "title", kind: "text", label: { "zh-CN": "标题", "en-US": "Title" } },
      { key: "description", kind: "text", label: { "zh-CN": "描述", "en-US": "Description" } },
      { key: "imageSrc", kind: "url", label: { "zh-CN": "图片地址", "en-US": "Image URL" } },
      { key: "href", kind: "url", label: { "zh-CN": "链接", "en-US": "Link" } },
    ],
    slots: [
      {
        name: "default",
        label: { "zh-CN": "内容", "en-US": "Content" },
        allowedNodeTypes: ["frame", "group", "rect", "text", "image", "embed", "prefab_instance"],
        required: false,
        minChildren: 0,
        maxChildren: 12,
      },
    ],
    // 仅允许覆写外观相关的少量字段（避免 prefab 内部样式边界被破坏）
    styleOverrideWhitelist: [
      "backgroundColor",
      "borderColor",
      "borderRadius",
      "boxShadow",
      "opacity",
    ],
  },
];

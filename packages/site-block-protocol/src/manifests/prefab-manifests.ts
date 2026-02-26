import type { BlockManifest } from "../block-registry";

/**
 * Prefab manifests（插入入口 + Inspector schema）。
 *
 * 注意：
 * - 这些 manifest.type 不是 DocumentIR 中真实节点的 type；它们是“插入指令 / Inspector blockType”。
 * - Portal 会把 `prefab:<code>` 映射为真实的 `__prefab__` 节点，并写入 props.prefab = <code>。
 *
 * 这样做的好处是：
 * - 既能让 UI 以 registry/manifest 驱动（可搜索、可分组）
 * - 又能保持 DocumentIR 的 PrefabInstance 节点类型稳定（`__prefab__`）
 */
export const PREFAB_BLOCK_MANIFESTS: BlockManifest[] = [
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
    // 仅允许覆写外观相关的少量字段（避免 prefab 内部样式边界被破坏）
    styleOverrideWhitelist: ["backgroundColor", "borderColor", "borderRadius", "boxShadow", "opacity"],
  },
];

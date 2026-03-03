import type { BlockManifest } from "../block-registry";

/**
 * Internal "virtual" manifests used by the editor inspector.
 *
 * These manifests do NOT represent insertable nodes in PageBlueprint.
 * They exist to reuse the schema-driven inspector UI for non-block entities
 * (e.g. the page/document root).
 */
export const EDITOR_INTERNAL_BLOCK_MANIFESTS: BlockManifest[] = [
  {
    type: "page",
    label: { "zh-CN": "页面", "en-US": "Page" },
    icon: "page",
    category: "custom",
    supports: { layout: true, design: true, animation: true },
    attributes: [
      {
        key: "title",
        kind: "text",
        label: { "zh-CN": "页面标题", "en-US": "Title" },
        ui: { group: "seo" },
      },
      {
        key: "description",
        kind: "text",
        label: { "zh-CN": "页面描述", "en-US": "Description" },
        ui: { group: "seo" },
      },
    ],
  },
];

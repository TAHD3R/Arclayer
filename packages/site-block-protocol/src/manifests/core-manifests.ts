import type { BlockManifest } from "../block-registry";

/**
 * Core insertable nodes for DesignDocument v1.
 *
 * Note: These manifests drive the editor insertion panel and inspector UI.
 */
export const CORE_BLOCK_MANIFESTS: BlockManifest[] = [
  // --- layout ---
  {
    type: "frame",
    label: { "zh-CN": "画框", "en-US": "Frame" },
    category: "layout",
    supports: { children: true, layout: true, design: true, responsive: true },
    attributes: [],
  },
  {
    type: "group",
    label: { "zh-CN": "分组", "en-US": "Group" },
    category: "layout",
    supports: { children: true, layout: true, responsive: true },
    attributes: [],
  },
  {
    type: "rect",
    label: { "zh-CN": "矩形", "en-US": "Rectangle" },
    category: "layout",
    supports: { layout: true, design: true, responsive: true },
    attributes: [],
  },

  // --- text ---
  {
    type: "text",
    label: { "zh-CN": "文本", "en-US": "Text" },
    category: "text",
    supports: { layout: true, design: true, responsive: true },
    attributes: [
      { key: "text", kind: "text", label: { "zh-CN": "内容", "en-US": "Content" }, required: true },
      {
        key: "tag",
        kind: "select",
        label: { "zh-CN": "标签", "en-US": "Tag" },
        validation: {
          options: [
            { value: "p", label: { "en-US": "Paragraph", "zh-CN": "段落" } },
            { value: "h1", label: { "en-US": "H1", "zh-CN": "H1" } },
            { value: "h2", label: { "en-US": "H2", "zh-CN": "H2" } },
            { value: "h3", label: { "en-US": "H3", "zh-CN": "H3" } },
            { value: "span", label: { "en-US": "Span", "zh-CN": "Span" } },
          ],
        },
      },
      {
        key: "align",
        kind: "select",
        label: { "zh-CN": "对齐", "en-US": "Align" },
        validation: {
          options: [
            { value: "left", label: { "en-US": "Left", "zh-CN": "左" } },
            { value: "center", label: { "en-US": "Center", "zh-CN": "居中" } },
            { value: "right", label: { "en-US": "Right", "zh-CN": "右" } },
          ],
        },
      },
    ],
  },

  // --- media ---
  {
    type: "image",
    label: { "zh-CN": "图片", "en-US": "Image" },
    category: "media",
    supports: { layout: true, design: true, responsive: true },
    attributes: [
      {
        key: "src",
        kind: "url",
        label: { "zh-CN": "图片地址", "en-US": "Source URL" },
        required: true,
      },
      { key: "alt", kind: "text", label: { "zh-CN": "替代文本", "en-US": "Alt Text" } },
      {
        key: "objectFit",
        kind: "select",
        label: { "zh-CN": "填充方式", "en-US": "Object Fit" },
        validation: {
          options: [
            { value: "cover", label: { "en-US": "Cover", "zh-CN": "覆盖" } },
            { value: "contain", label: { "en-US": "Contain", "zh-CN": "包含" } },
            { value: "fill", label: { "en-US": "Fill", "zh-CN": "拉伸" } },
            { value: "none", label: { "en-US": "None", "zh-CN": "原始" } },
          ],
        },
      },
    ],
  },
  {
    type: "embed",
    label: { "zh-CN": "嵌入", "en-US": "Embed" },
    category: "media",
    supports: { layout: true, responsive: true },
    attributes: [
      { key: "url", kind: "url", label: { "zh-CN": "地址", "en-US": "URL" }, required: true },
    ],
  },
];

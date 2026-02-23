import type { BlockManifest } from "../block-registry";

/**
 * All 12 core block manifests.
 * Categories: layout / text / media / interactive
 */
export const CORE_BLOCK_MANIFESTS: BlockManifest[] = [
  // --- layout ---
  {
    type: "container",
    label: { "zh-CN": "容器", "en-US": "Container" },
    category: "layout",
    supports: { children: true, layout: true, design: true, animation: true, responsive: true },
    attributes: [
      { key: "as", kind: "select", label: { "zh-CN": "语义标签", "en-US": "Semantic Tag" }, validation: { options: [{ value: "div", label: { "en-US": "div" } }, { value: "section", label: { "en-US": "section" } }, { value: "article", label: { "en-US": "article" } }] } },
    ],
  },
  {
    type: "grid",
    label: { "zh-CN": "网格", "en-US": "Grid" },
    category: "layout",
    supports: { children: true, layout: true, design: true, responsive: true },
    attributes: [
      { key: "columns", kind: "number", label: { "zh-CN": "列数", "en-US": "Columns" }, default: 2, validation: { min: 1, max: 12 } },
      { key: "columnGap", kind: "text", label: { "zh-CN": "列间距", "en-US": "Column Gap" } },
      { key: "rowGap", kind: "text", label: { "zh-CN": "行间距", "en-US": "Row Gap" } },
    ],
  },
  {
    type: "spacer",
    label: { "zh-CN": "间距", "en-US": "Spacer" },
    category: "layout",
    supports: { responsive: true },
    attributes: [
      { key: "height", kind: "text", label: { "zh-CN": "高度", "en-US": "Height" }, default: "24px" },
    ],
  },
  {
    type: "divider",
    label: { "zh-CN": "分割线", "en-US": "Divider" },
    category: "layout",
    supports: { design: true, responsive: true },
    attributes: [
      { key: "variant", kind: "select", label: { "zh-CN": "样式", "en-US": "Variant" }, validation: { options: [{ value: "default", label: { "en-US": "Default", "zh-CN": "默认" } }, { value: "subtle", label: { "en-US": "Subtle", "zh-CN": "淡色" } }] } },
    ],
  },
  // --- text ---
  {
    type: "heading",
    label: { "zh-CN": "标题", "en-US": "Heading" },
    category: "text",
    supports: { layout: true, design: true, animation: true, responsive: true },
    attributes: [
      { key: "level", kind: "number", label: { "zh-CN": "级别", "en-US": "Level" }, required: true, validation: { min: 1, max: 6 } },
      { key: "text", kind: "text", label: { "zh-CN": "文本", "en-US": "Text" }, required: true },
      { key: "align", kind: "select", label: { "zh-CN": "对齐", "en-US": "Align" }, validation: { options: [{ value: "left", label: { "en-US": "Left", "zh-CN": "左" } }, { value: "center", label: { "en-US": "Center", "zh-CN": "居中" } }, { value: "right", label: { "en-US": "Right", "zh-CN": "右" } }] } },
    ],
  },
  {
    type: "paragraph",
    label: { "zh-CN": "段落", "en-US": "Paragraph" },
    category: "text",
    supports: { layout: true, design: true, animation: true, responsive: true },
    attributes: [
      { key: "text", kind: "text", label: { "zh-CN": "文本", "en-US": "Text" }, required: true },
      { key: "align", kind: "select", label: { "zh-CN": "对齐", "en-US": "Align" }, validation: { options: [{ value: "left", label: { "en-US": "Left", "zh-CN": "左" } }, { value: "center", label: { "en-US": "Center", "zh-CN": "居中" } }, { value: "right", label: { "en-US": "Right", "zh-CN": "右" } }] } },
    ],
  },
  {
    type: "list",
    label: { "zh-CN": "列表", "en-US": "List" },
    category: "text",
    supports: { layout: true, design: true, responsive: true },
    attributes: [
      { key: "ordered", kind: "boolean", label: { "zh-CN": "有序列表", "en-US": "Ordered" } },
      { key: "items", kind: "array", label: { "zh-CN": "列表项", "en-US": "Items" }, required: true, validation: { of: { key: "item", kind: "text", label: { "zh-CN": "项", "en-US": "Item" } } } },
    ],
  },
  {
    type: "quote",
    label: { "zh-CN": "引用", "en-US": "Quote" },
    category: "text",
    supports: { layout: true, design: true, animation: true, responsive: true },
    attributes: [
      { key: "text", kind: "text", label: { "zh-CN": "引用文本", "en-US": "Text" }, required: true },
      { key: "citation", kind: "text", label: { "zh-CN": "来源", "en-US": "Citation" } },
    ],
  },
  // --- media ---
  {
    type: "image",
    label: { "zh-CN": "图片", "en-US": "Image" },
    category: "media",
    supports: { layout: true, design: true, animation: true, responsive: true },
    attributes: [
      { key: "src", kind: "url", label: { "zh-CN": "图片地址", "en-US": "Source URL" }, required: true },
      { key: "alt", kind: "text", label: { "zh-CN": "替代文本", "en-US": "Alt Text" } },
      { key: "objectFit", kind: "select", label: { "zh-CN": "填充方式", "en-US": "Object Fit" }, validation: { options: [{ value: "cover", label: { "en-US": "Cover" } }, { value: "contain", label: { "en-US": "Contain" } }, { value: "fill", label: { "en-US": "Fill" } }, { value: "none", label: { "en-US": "None" } }] } },
    ],
  },
  {
    type: "video",
    label: { "zh-CN": "视频", "en-US": "Video" },
    category: "media",
    supports: { layout: true, design: true, responsive: true },
    attributes: [
      { key: "src", kind: "url", label: { "zh-CN": "视频地址", "en-US": "Source URL" }, required: true },
      { key: "poster", kind: "url", label: { "zh-CN": "封面图", "en-US": "Poster" } },
      { key: "autoplay", kind: "boolean", label: { "zh-CN": "自动播放", "en-US": "Autoplay" } },
      { key: "loop", kind: "boolean", label: { "zh-CN": "循环播放", "en-US": "Loop" } },
      { key: "muted", kind: "boolean", label: { "zh-CN": "静音", "en-US": "Muted" } },
    ],
  },
  {
    type: "icon",
    label: { "zh-CN": "图标", "en-US": "Icon" },
    category: "media",
    supports: { design: true, responsive: true },
    attributes: [
      { key: "name", kind: "text", label: { "zh-CN": "图标名称", "en-US": "Icon Name" }, required: true },
      { key: "size", kind: "text", label: { "zh-CN": "尺寸", "en-US": "Size" } },
    ],
  },
  // --- interactive ---
  {
    type: "button",
    label: { "zh-CN": "按钮", "en-US": "Button" },
    category: "interactive",
    supports: { design: true, animation: true, responsive: true },
    attributes: [
      { key: "text", kind: "text", label: { "zh-CN": "按钮文本", "en-US": "Text" }, required: true },
      { key: "href", kind: "url", label: { "zh-CN": "链接地址", "en-US": "Link URL" } },
      { key: "variant", kind: "select", label: { "zh-CN": "样式", "en-US": "Variant" }, validation: { options: [{ value: "primary", label: { "en-US": "Primary", "zh-CN": "主要" } }, { value: "secondary", label: { "en-US": "Secondary", "zh-CN": "次要" } }, { value: "outline", label: { "en-US": "Outline", "zh-CN": "描边" } }] } },
      { key: "size", kind: "select", label: { "zh-CN": "尺寸", "en-US": "Size" }, validation: { options: [{ value: "sm", label: { "en-US": "Small", "zh-CN": "小" } }, { value: "md", label: { "en-US": "Medium", "zh-CN": "中" } }, { value: "lg", label: { "en-US": "Large", "zh-CN": "大" } }] } },
    ],
  },
];

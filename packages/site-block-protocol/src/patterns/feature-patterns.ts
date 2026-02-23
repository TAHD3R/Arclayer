import type { BlockPattern } from "../block-registry";

export const FEATURE_PATTERNS: BlockPattern[] = [
  {
    code: "features-three-col",
    label: { "zh-CN": "三列特性展示", "en-US": "Three-Column Features" },
    category: "features",
    blocks: [
      {
        id: "feat-container",
        type: "container",
        props: { as: "section" },
        children: [
          {
            id: "feat-title",
            type: "heading",
            props: {
              level: 2,
              text: { "zh-CN": "核心特性", "en-US": "Core Features" },
              align: "center",
            },
          },
          {
            id: "feat-grid",
            type: "grid",
            props: { columns: 3 },
            children: [
              {
                id: "feat-col-1",
                type: "container",
                props: { as: "div" },
                children: [
                  { id: "feat-h-1", type: "heading", props: { level: 3, text: { "zh-CN": "快速部署", "en-US": "Fast Deployment" } } },
                  { id: "feat-p-1", type: "paragraph", props: { text: { "zh-CN": "一键部署，分钟级上线。", "en-US": "One-click deploy, live in minutes." } } },
                ],
              },
              {
                id: "feat-col-2",
                type: "container",
                props: { as: "div" },
                children: [
                  { id: "feat-h-2", type: "heading", props: { level: 3, text: { "zh-CN": "安全可靠", "en-US": "Secure & Reliable" } } },
                  { id: "feat-p-2", type: "paragraph", props: { text: { "zh-CN": "企业级安全保障。", "en-US": "Enterprise-grade security." } } },
                ],
              },
              {
                id: "feat-col-3",
                type: "container",
                props: { as: "div" },
                children: [
                  { id: "feat-h-3", type: "heading", props: { level: 3, text: { "zh-CN": "灵活扩展", "en-US": "Flexible Scaling" } } },
                  { id: "feat-p-3", type: "paragraph", props: { text: { "zh-CN": "按需扩展，弹性伸缩。", "en-US": "Scale on demand, elastic growth." } } },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    code: "features-two-col",
    label: { "zh-CN": "两列特性展示", "en-US": "Two-Column Features" },
    category: "features",
    blocks: [
      {
        id: "feat2-grid",
        type: "grid",
        props: { columns: 2 },
        children: [
          {
            id: "feat2-col-1",
            type: "container",
            props: { as: "div" },
            children: [
              { id: "feat2-h-1", type: "heading", props: { level: 3, text: { "zh-CN": "直观设计", "en-US": "Intuitive Design" } } },
              { id: "feat2-p-1", type: "paragraph", props: { text: { "zh-CN": "所见即所得的可视化编辑体验。", "en-US": "WYSIWYG visual editing experience." } } },
            ],
          },
          {
            id: "feat2-col-2",
            type: "container",
            props: { as: "div" },
            children: [
              { id: "feat2-h-2", type: "heading", props: { level: 3, text: { "zh-CN": "插件生态", "en-US": "Plugin Ecosystem" } } },
              { id: "feat2-p-2", type: "paragraph", props: { text: { "zh-CN": "丰富的插件市场，一键安装扩展功能。", "en-US": "Rich plugin marketplace, extend with one click." } } },
            ],
          },
        ],
      },
    ],
  },
];

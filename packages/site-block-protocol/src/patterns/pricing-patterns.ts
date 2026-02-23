import type { BlockPattern } from "../block-registry";

export const PRICING_PATTERNS: BlockPattern[] = [
  {
    code: "pricing-three-tier",
    label: { "zh-CN": "三档定价", "en-US": "Three-Tier Pricing" },
    category: "pricing",
    blocks: [
      {
        id: "pricing-container",
        type: "container",
        props: { as: "section" },
        children: [
          {
            id: "pricing-title",
            type: "heading",
            props: {
              level: 2,
              text: { "zh-CN": "选择您的方案", "en-US": "Choose Your Plan" },
              align: "center",
            },
          },
          {
            id: "pricing-subtitle",
            type: "paragraph",
            props: {
              text: { "zh-CN": "灵活的定价方案，满足不同规模需求。", "en-US": "Flexible plans for every scale." },
              align: "center",
            },
          },
          {
            id: "pricing-grid",
            type: "grid",
            props: { columns: 3 },
            children: [
              {
                id: "pricing-col-1",
                type: "container",
                props: { as: "div" },
                children: [
                  { id: "pricing-h-1", type: "heading", props: { level: 3, text: { "zh-CN": "免费版", "en-US": "Free" } } },
                  { id: "pricing-p-1", type: "paragraph", props: { text: { "zh-CN": "适合个人项目和小型站点。", "en-US": "For personal projects and small sites." } } },
                  { id: "pricing-btn-1", type: "button", props: { text: { "zh-CN": "免费开始", "en-US": "Start Free" }, href: "#", variant: "outline", size: "md" } },
                ],
              },
              {
                id: "pricing-col-2",
                type: "container",
                props: { as: "div" },
                children: [
                  { id: "pricing-h-2", type: "heading", props: { level: 3, text: { "zh-CN": "专业版", "en-US": "Pro" } } },
                  { id: "pricing-p-2", type: "paragraph", props: { text: { "zh-CN": "适合成长中的团队和企业。", "en-US": "For growing teams and businesses." } } },
                  { id: "pricing-btn-2", type: "button", props: { text: { "zh-CN": "升级专业版", "en-US": "Upgrade to Pro" }, href: "#", variant: "primary", size: "md" } },
                ],
              },
              {
                id: "pricing-col-3",
                type: "container",
                props: { as: "div" },
                children: [
                  { id: "pricing-h-3", type: "heading", props: { level: 3, text: { "zh-CN": "企业版", "en-US": "Enterprise" } } },
                  { id: "pricing-p-3", type: "paragraph", props: { text: { "zh-CN": "定制化方案，专属支持。", "en-US": "Custom solutions with dedicated support." } } },
                  { id: "pricing-btn-3", type: "button", props: { text: { "zh-CN": "联系我们", "en-US": "Contact Us" }, href: "#", variant: "secondary", size: "md" } },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
];

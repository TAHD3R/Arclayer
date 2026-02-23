import type { BlockPattern } from "../block-registry";

export const HERO_PATTERNS: BlockPattern[] = [
  {
    code: "hero-centered",
    label: { "zh-CN": "居中 Hero", "en-US": "Centered Hero" },
    category: "hero",
    blocks: [
      {
        id: "hero-container",
        type: "container",
        props: { as: "section" },
        children: [
          {
            id: "hero-h1",
            type: "heading",
            props: {
              level: 1,
              text: { "zh-CN": "欢迎来到我们的网站", "en-US": "Welcome to Our Website" },
              align: "center",
            },
          },
          {
            id: "hero-p1",
            type: "paragraph",
            props: {
              text: {
                "zh-CN": "我们提供卓越的产品和服务，助力您的业务增长。",
                "en-US": "We provide exceptional products and services to help grow your business.",
              },
              align: "center",
            },
          },
          {
            id: "hero-btn1",
            type: "button",
            props: {
              text: { "zh-CN": "立即开始", "en-US": "Get Started" },
              href: "#",
              variant: "primary",
              size: "lg",
            },
          },
        ],
      },
    ],
  },
  {
    code: "hero-split",
    label: { "zh-CN": "左右分栏 Hero", "en-US": "Split Hero" },
    category: "hero",
    blocks: [
      {
        id: "hero-split-grid",
        type: "grid",
        props: { columns: 2 },
        children: [
          {
            id: "hero-split-left",
            type: "container",
            props: { as: "div" },
            children: [
              {
                id: "hero-split-h1",
                type: "heading",
                props: {
                  level: 1,
                  text: { "zh-CN": "打造您的数字未来", "en-US": "Build Your Digital Future" },
                },
              },
              {
                id: "hero-split-p1",
                type: "paragraph",
                props: {
                  text: {
                    "zh-CN": "用现代化工具和平台加速您的创新之旅。",
                    "en-US": "Accelerate your innovation journey with modern tools and platforms.",
                  },
                },
              },
              {
                id: "hero-split-btn1",
                type: "button",
                props: {
                  text: { "zh-CN": "了解更多", "en-US": "Learn More" },
                  href: "#",
                  variant: "primary",
                  size: "md",
                },
              },
            ],
          },
          {
            id: "hero-split-right",
            type: "container",
            props: { as: "div" },
            children: [
              {
                id: "hero-split-img",
                type: "image",
                props: {
                  src: "https://placehold.co/600x400",
                  alt: { "zh-CN": "Hero 插图", "en-US": "Hero illustration" },
                  objectFit: "cover",
                },
              },
            ],
          },
        ],
      },
    ],
  },
];

import type { CoreDocumentIR } from "@celestial/site-renderer-core";

/**
 * Sprint 1 acceptance:
 * - This hardcoded JSON should be rendered by SSR and hydrated on client.
 * - Editing this file should reflect on the next request during dev.
 */
export function getHardcodedDocument(): CoreDocumentIR {
  return {
    version: 1,
    meta: {
      title: { "zh-CN": "Celestial Portal", "en-US": "Celestial Portal" },
    },
    blocks: [
      {
        id: "b1",
        type: "container",
        props: { as: "section" },
        children: [
          {
            id: "b1-h1",
            type: "heading",
            props: {
              level: 1,
              text: { "zh-CN": "Portal SSR（Sprint 1）", "en-US": "Portal SSR (Sprint 1)" },
            },
          },
          {
            id: "b1-p1",
            type: "paragraph",
            props: {
              text: {
                "zh-CN":
                  "这是一个硬编码的 DocumentIR，用来验证：vike SSR + TanStack Router + hydration + head CSS variables 注入。",
                "en-US":
                  "This is a hardcoded DocumentIR to validate: vike SSR + TanStack Router + hydration + head CSS variables injection.",
              },
            },
          },
          {
            id: "b1-div",
            type: "divider",
            props: { variant: "subtle" },
          },
          {
            id: "b1-p2",
            type: "paragraph",
            props: {
              text: {
                "zh-CN": "访问 /debug/403 与 /debug/500 可以看到最小错误页骨架。",
                "en-US": "Visit /debug/403 and /debug/500 to see minimal error pages.",
              },
            },
          },
        ],
      },
    ],
  };
}

export const AI_PROMPT_STARTER_CATEGORIES = [
  {
    id: "website",
    labelKey: "AI_CHAT_HOME_STARTER_WEBSITE",
    promptKeys: [
      "AI_CHAT_HOME_STARTER_WEBSITE_PROMPT_1",
      "AI_CHAT_HOME_STARTER_WEBSITE_PROMPT_2",
      "AI_CHAT_HOME_STARTER_WEBSITE_PROMPT_3",
    ],
  },
  {
    id: "content",
    labelKey: "AI_CHAT_HOME_STARTER_CONTENT",
    promptKeys: [
      "AI_CHAT_HOME_STARTER_CONTENT_PROMPT_1",
      "AI_CHAT_HOME_STARTER_CONTENT_PROMPT_2",
      "AI_CHAT_HOME_STARTER_CONTENT_PROMPT_3",
    ],
  },
  {
    id: "brand",
    labelKey: "AI_CHAT_HOME_STARTER_BRAND",
    promptKeys: [
      "AI_CHAT_HOME_STARTER_BRAND_PROMPT_1",
      "AI_CHAT_HOME_STARTER_BRAND_PROMPT_2",
      "AI_CHAT_HOME_STARTER_BRAND_PROMPT_3",
    ],
  },
  {
    id: "commerce",
    labelKey: "AI_CHAT_HOME_STARTER_COMMERCE",
    promptKeys: [
      "AI_CHAT_HOME_STARTER_COMMERCE_PROMPT_1",
      "AI_CHAT_HOME_STARTER_COMMERCE_PROMPT_2",
      "AI_CHAT_HOME_STARTER_COMMERCE_PROMPT_3",
    ],
  },
] as const;

export type AIPromptStarterCategory = (typeof AI_PROMPT_STARTER_CATEGORIES)[number];
export type AIPromptStarterCategoryId = AIPromptStarterCategory["id"];

import type { ActivityBarMenuId } from "@/pages/workspaces/editor/stores/editor-store";

export const EDITOR_MENU_TITLE_KEYS: Record<ActivityBarMenuId, string> = {
  "add-elements": "content_pages:EDITOR_V2_LEFT_ELEMENTS",
  navigator: "content_pages:EDITOR_V2_MENU_NAVIGATOR",
  pages: "content_pages:EDITOR_V2_MENU_PAGES",
  assets: "content_pages:EDITOR_V2_MENU_ASSETS",
  blocks: "content_pages:EDITOR_V2_MENU_BLOCKS",
  plugins: "content_pages:EDITOR_V2_MENU_PLUGINS",
  search: "content_pages:EDITOR_V2_MENU_SEARCH",
  settings: "content_pages:EDITOR_V2_MENU_SETTINGS",
} as const;

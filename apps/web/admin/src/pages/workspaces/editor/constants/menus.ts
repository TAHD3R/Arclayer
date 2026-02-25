import type { ActivityBarMenuId } from "@/pages/workspaces/editor/stores/editor-store";

export const EDITOR_MENU_TITLE_KEYS: Record<ActivityBarMenuId, string> = {
  "add-elements": "content_pages:EDITOR_LEFT_ELEMENTS",
  navigator: "content_pages:EDITOR_MENU_NAVIGATOR",
  pages: "content_pages:EDITOR_MENU_PAGES",
  assets: "content_pages:EDITOR_MENU_ASSETS",
  blocks: "content_pages:EDITOR_MENU_BLOCKS",
  plugins: "content_pages:EDITOR_MENU_PLUGINS",
  search: "content_pages:EDITOR_MENU_SEARCH",
  settings: "content_pages:EDITOR_MENU_SETTINGS",
} as const;

export const EDITOR_MENU_DESC_KEYS: Record<ActivityBarMenuId, string> = {
  "add-elements": "content_pages:EDITOR_SIDEBAR_DESC_ADD_ELEMENTS",
  navigator: "content_pages:EDITOR_SIDEBAR_DESC_NAVIGATOR",
  pages: "content_pages:EDITOR_SIDEBAR_DESC_PAGES",
  assets: "content_pages:EDITOR_SIDEBAR_DESC_ASSETS",
  blocks: "content_pages:EDITOR_SIDEBAR_DESC_BLOCKS",
  plugins: "content_pages:EDITOR_SIDEBAR_DESC_PLUGINS",
  search: "content_pages:EDITOR_SIDEBAR_DESC_SEARCH",
  settings: "content_pages:EDITOR_SIDEBAR_DESC_SETTINGS",
} as const;

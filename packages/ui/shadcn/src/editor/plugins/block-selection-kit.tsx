"use client";

import { BlockMenuPlugin, BlockSelectionPlugin } from "@platejs/selection/react";

import { BlockContextMenu } from "../block-context-menu";
import { isArticleEditorBlockSelectable } from "../block-menu-helpers";

export const ARTICLE_EDITOR_BLOCK_SELECTION_SCROLL_ROOT_SELECTOR =
  '[data-article-editor-scroll-root="true"]';

export const ArticleEditorBlockSelectionPlugin = BlockSelectionPlugin.configure({
  inject: {
    nodeProps: {
      transformProps: () => ({
        "data-plate-selectable": "true",
      }),
    },
  },
  options: {
    areaOptions: {
      boundaries: ARTICLE_EDITOR_BLOCK_SELECTION_SCROLL_ROOT_SELECTOR,
      container: ARTICLE_EDITOR_BLOCK_SELECTION_SCROLL_ROOT_SELECTOR,
      startAreas: ARTICLE_EDITOR_BLOCK_SELECTION_SCROLL_ROOT_SELECTOR,
    },
    enableContextMenu: true,
    isSelectable: isArticleEditorBlockSelectable,
  },
});

export const ArticleEditorBlockMenuPlugin = BlockMenuPlugin.configure({
  render: {
    aboveEditable: BlockContextMenu,
  },
});

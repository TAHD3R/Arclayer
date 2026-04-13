"use client";

import { BlockMenuPlugin, BlockSelectionPlugin } from "@platejs/selection/react";

import { BlockContextMenu } from "../block-context-menu";
import { isArticleEditorBlockSelectableAtPath } from "../block-menu-helpers";

export const ARTICLE_EDITOR_BLOCK_SELECTION_SCROLL_ROOT_SELECTOR =
  '[data-article-editor-scroll-root="true"]';
export const ARTICLE_EDITOR_BLOCK_SELECTION_START_AREA_SELECTOR =
  '[data-article-editor-selection-surface="true"]';

export const ArticleEditorBlockSelectionPlugin = BlockSelectionPlugin.configure(({ editor }) => ({
  options: {
    areaOptions: {
      behaviour: {
        startThreshold: 4,
      },
      boundaries: ARTICLE_EDITOR_BLOCK_SELECTION_SCROLL_ROOT_SELECTOR,
      container: ARTICLE_EDITOR_BLOCK_SELECTION_SCROLL_ROOT_SELECTOR,
      features: {
        singleTap: {
          allow: false,
        },
      },
      startAreas: ARTICLE_EDITOR_BLOCK_SELECTION_START_AREA_SELECTOR,
    },
    enableContextMenu: true,
    isSelectable: (element, path) => isArticleEditorBlockSelectableAtPath(editor, element, path),
  },
}));

export const ArticleEditorBlockMenuPlugin = BlockMenuPlugin.configure({
  render: {
    aboveEditable: BlockContextMenu,
  },
});

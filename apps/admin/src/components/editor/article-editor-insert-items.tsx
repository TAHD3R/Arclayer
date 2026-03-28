import {
  Code2Icon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ImageIcon,
  ListIcon,
  ListCollapseIcon,
  ListOrderedIcon,
  ListTodoIcon,
  type LucideIcon,
  PilcrowIcon,
  QuoteIcon,
  Table2Icon,
  TextSearchIcon,
} from "lucide-react";
import { insertEmptyCodeBlock } from "@platejs/code-block";
import { insertToc } from "@platejs/toc";
import { toggleList } from "@platejs/list";
import { insertTable } from "@platejs/table";
import { KEYS } from "platejs";
import type { PlateEditor } from "platejs/react";

import { insertBlock } from "@/components/editor/transforms";

type Translate = (key: string) => string;

export const ARTICLE_EDITOR_INSERT_IMAGE = "article-image";
export const ARTICLE_EDITOR_INSERT_TABLE = "article-table";
export const ARTICLE_EDITOR_INSERT_TOC = "article-toc";

export type ArticleEditorInsertItem = {
  value: string;
  label: string;
  description: string;
  keywords?: string[];
  icon: LucideIcon;
};

export type ArticleEditorInsertGroup = {
  id: string;
  label: string;
  items: ArticleEditorInsertItem[];
};

export function getArticleEditorInsertGroups(t: Translate): ArticleEditorInsertGroup[] {
  return [
    {
      id: "basic",
      label: t("CONTENT_LIBRARY_EDITOR_INSERT_GROUP_BASIC"),
      items: [
        {
          value: KEYS.p,
          label: t("CONTENT_LIBRARY_EDITOR_INSERT_TEXT"),
          description: t("CONTENT_LIBRARY_EDITOR_INSERT_TEXT_DESC"),
          keywords: ["paragraph", "text", "body"],
          icon: PilcrowIcon,
        },
        {
          value: KEYS.h1,
          label: t("CONTENT_LIBRARY_EDITOR_INSERT_HEADING_1"),
          description: t("CONTENT_LIBRARY_EDITOR_INSERT_HEADING_1_DESC"),
          keywords: ["title", "h1", "#"],
          icon: Heading1Icon,
        },
        {
          value: KEYS.h2,
          label: t("CONTENT_LIBRARY_EDITOR_INSERT_HEADING_2"),
          description: t("CONTENT_LIBRARY_EDITOR_INSERT_HEADING_2_DESC"),
          keywords: ["subtitle", "h2", "##", "2"],
          icon: Heading2Icon,
        },
        {
          value: KEYS.h3,
          label: t("CONTENT_LIBRARY_EDITOR_INSERT_HEADING_3"),
          description: t("CONTENT_LIBRARY_EDITOR_INSERT_HEADING_3_DESC"),
          keywords: ["section", "h3", "###", "3"],
          icon: Heading3Icon,
        },
        {
          value: KEYS.blockquote,
          label: t("CONTENT_LIBRARY_EDITOR_INSERT_QUOTE"),
          description: t("CONTENT_LIBRARY_EDITOR_INSERT_QUOTE_DESC"),
          keywords: ["blockquote", "quote", ">"],
          icon: QuoteIcon,
        },
        {
          value: KEYS.ul,
          label: t("CONTENT_LIBRARY_EDITOR_INSERT_BULLETED_LIST"),
          description: t("CONTENT_LIBRARY_EDITOR_INSERT_BULLETED_LIST_DESC"),
          keywords: ["list", "unordered", "bullets", "*", "-"],
          icon: ListIcon,
        },
        {
          value: KEYS.ol,
          label: t("CONTENT_LIBRARY_EDITOR_INSERT_NUMBERED_LIST"),
          description: t("CONTENT_LIBRARY_EDITOR_INSERT_NUMBERED_LIST_DESC"),
          keywords: ["list", "ordered", "numbered", "1."],
          icon: ListOrderedIcon,
        },
        {
          value: KEYS.listTodo,
          label: t("CONTENT_LIBRARY_EDITOR_INSERT_TODO_LIST"),
          description: t("CONTENT_LIBRARY_EDITOR_INSERT_TODO_LIST_DESC"),
          keywords: ["checklist", "todo", "tasks", "[]"],
          icon: ListTodoIcon,
        },
        {
          value: KEYS.hr,
          label: t("CONTENT_LIBRARY_EDITOR_INSERT_DIVIDER"),
          description: t("CONTENT_LIBRARY_EDITOR_INSERT_DIVIDER_DESC"),
          keywords: ["divider", "separator", "---"],
          icon: ListCollapseIcon,
        },
      ],
    },
    {
      id: "rich-content",
      label: t("CONTENT_LIBRARY_EDITOR_INSERT_GROUP_RICH"),
      items: [
        {
          value: KEYS.codeBlock,
          label: t("CONTENT_LIBRARY_EDITOR_INSERT_CODE_BLOCK"),
          description: t("CONTENT_LIBRARY_EDITOR_INSERT_CODE_BLOCK_DESC"),
          keywords: ["code", "```", "snippet"],
          icon: Code2Icon,
        },
        {
          value: ARTICLE_EDITOR_INSERT_IMAGE,
          label: t("CONTENT_LIBRARY_EDITOR_INSERT_IMAGE"),
          description: t("CONTENT_LIBRARY_EDITOR_INSERT_IMAGE_DESC"),
          keywords: ["image", "photo", "media", "asset"],
          icon: ImageIcon,
        },
        {
          value: ARTICLE_EDITOR_INSERT_TABLE,
          label: t("CONTENT_LIBRARY_EDITOR_INSERT_TABLE"),
          description: t("CONTENT_LIBRARY_EDITOR_INSERT_TABLE_DESC"),
          keywords: ["table", "grid", "rows", "columns"],
          icon: Table2Icon,
        },
        {
          value: ARTICLE_EDITOR_INSERT_TOC,
          label: t("CONTENT_LIBRARY_EDITOR_INSERT_TOC"),
          description: t("CONTENT_LIBRARY_EDITOR_INSERT_TOC_DESC"),
          keywords: ["toc", "outline", "headings", "contents"],
          icon: TextSearchIcon,
        },
      ],
    },
  ];
}

export function applyArticleEditorInsertItem(editor: PlateEditor, value: string) {
  if (value === KEYS.ul || value === KEYS.ol || value === KEYS.listTodo) {
    toggleList(editor, { listStyleType: value });
    return;
  }

  if (value === KEYS.codeBlock) {
    insertEmptyCodeBlock(editor, {
      defaultType: KEYS.p,
      insertNodesOptions: { select: true },
    });
    return;
  }

  if (value === ARTICLE_EDITOR_INSERT_TABLE) {
    insertTable(editor, { colCount: 3, header: true, rowCount: 3 });
    return;
  }

  if (value === ARTICLE_EDITOR_INSERT_TOC) {
    insertToc(editor);
    return;
  }

  insertBlock(editor, value, { upsert: true });
}

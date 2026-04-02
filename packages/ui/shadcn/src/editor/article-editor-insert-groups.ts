import {
  AudioLinesIcon,
  CalendarIcon,
  ChevronRightIcon,
  Code2Icon,
  Columns3Icon,
  FileUpIcon,
  FilmIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ImageIcon,
  LightbulbIcon,
  Link2Icon,
  ListIcon,
  ListCollapseIcon,
  ListOrderedIcon,
  ListTodoIcon,
  type LucideIcon,
  PilcrowIcon,
  QuoteIcon,
  RadicalIcon,
  Table2Icon,
  TextSearchIcon,
} from "lucide-react";
import { KEYS } from "platejs";

type Translate = (key: string) => string;

export const ARTICLE_EDITOR_INSERT_IMAGE = "article-image";
export const ARTICLE_EDITOR_INSERT_VIDEO = "article-video";
export const ARTICLE_EDITOR_INSERT_AUDIO = "article-audio";
export const ARTICLE_EDITOR_INSERT_FILE = "article-file";
export const ARTICLE_EDITOR_INSERT_TABLE = "article-table";
export const ARTICLE_EDITOR_INSERT_TOC = "article-toc";
export const ARTICLE_EDITOR_INSERT_CALLOUT = "callout";
export const ARTICLE_EDITOR_INSERT_TOGGLE = "toggle";
export const ARTICLE_EDITOR_INSERT_DATE = "date";
export const ARTICLE_EDITOR_INSERT_EQUATION = "equation";
export const ARTICLE_EDITOR_INSERT_INLINE_EQUATION = "inline_equation";
export const ARTICLE_EDITOR_INSERT_LINK = "article-link";
export const ARTICLE_EDITOR_INSERT_THREE_COLUMNS = "action_three_columns";

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
          value: KEYS.hr,
          label: t("CONTENT_LIBRARY_EDITOR_INSERT_DIVIDER"),
          description: t("CONTENT_LIBRARY_EDITOR_INSERT_DIVIDER_DESC"),
          keywords: ["divider", "separator", "---"],
          icon: ListCollapseIcon,
        },
      ],
    },
    {
      id: "lists",
      label: t("CONTENT_LIBRARY_EDITOR_INSERT_GROUP_LISTS"),
      items: [
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
          value: ARTICLE_EDITOR_INSERT_TOGGLE,
          label: t("CONTENT_LIBRARY_EDITOR_INSERT_TOGGLE"),
          description: t("CONTENT_LIBRARY_EDITOR_INSERT_TOGGLE_DESC"),
          keywords: ["toggle", "collapse", "collapsible"],
          icon: ChevronRightIcon,
        },
      ],
    },
    {
      id: "media",
      label: t("CONTENT_LIBRARY_EDITOR_INSERT_GROUP_MEDIA"),
      items: [
        {
          value: ARTICLE_EDITOR_INSERT_IMAGE,
          label: t("CONTENT_LIBRARY_EDITOR_INSERT_IMAGE"),
          description: t("CONTENT_LIBRARY_EDITOR_INSERT_IMAGE_DESC"),
          keywords: ["image", "photo", "media", "asset"],
          icon: ImageIcon,
        },
        {
          value: ARTICLE_EDITOR_INSERT_VIDEO,
          label: t("CONTENT_LIBRARY_EDITOR_INSERT_VIDEO"),
          description: t("CONTENT_LIBRARY_EDITOR_INSERT_VIDEO_DESC"),
          keywords: ["video", "movie", "embed", "media"],
          icon: FilmIcon,
        },
        {
          value: ARTICLE_EDITOR_INSERT_AUDIO,
          label: t("CONTENT_LIBRARY_EDITOR_INSERT_AUDIO"),
          description: t("CONTENT_LIBRARY_EDITOR_INSERT_AUDIO_DESC"),
          keywords: ["audio", "sound", "podcast", "voice"],
          icon: AudioLinesIcon,
        },
        {
          value: ARTICLE_EDITOR_INSERT_FILE,
          label: t("CONTENT_LIBRARY_EDITOR_INSERT_FILE"),
          description: t("CONTENT_LIBRARY_EDITOR_INSERT_FILE_DESC"),
          keywords: ["file", "attachment", "document"],
          icon: FileUpIcon,
        },
      ],
    },
    {
      id: "advanced",
      label: t("CONTENT_LIBRARY_EDITOR_INSERT_GROUP_ADVANCED"),
      items: [
        {
          value: KEYS.codeBlock,
          label: t("CONTENT_LIBRARY_EDITOR_INSERT_CODE_BLOCK"),
          description: t("CONTENT_LIBRARY_EDITOR_INSERT_CODE_BLOCK_DESC"),
          keywords: ["code", "```", "snippet"],
          icon: Code2Icon,
        },
        {
          value: ARTICLE_EDITOR_INSERT_TABLE,
          label: t("CONTENT_LIBRARY_EDITOR_INSERT_TABLE"),
          description: t("CONTENT_LIBRARY_EDITOR_INSERT_TABLE_DESC"),
          keywords: ["table", "grid", "rows", "columns"],
          icon: Table2Icon,
        },
        {
          value: ARTICLE_EDITOR_INSERT_CALLOUT,
          label: t("CONTENT_LIBRARY_EDITOR_INSERT_CALLOUT"),
          description: t("CONTENT_LIBRARY_EDITOR_INSERT_CALLOUT_DESC"),
          keywords: ["callout", "note", "tip", "highlight"],
          icon: LightbulbIcon,
        },
        {
          value: ARTICLE_EDITOR_INSERT_TOC,
          label: t("CONTENT_LIBRARY_EDITOR_INSERT_TOC"),
          description: t("CONTENT_LIBRARY_EDITOR_INSERT_TOC_DESC"),
          keywords: ["toc", "outline", "headings", "contents"],
          icon: TextSearchIcon,
        },
        {
          value: ARTICLE_EDITOR_INSERT_EQUATION,
          label: t("CONTENT_LIBRARY_EDITOR_INSERT_EQUATION"),
          description: t("CONTENT_LIBRARY_EDITOR_INSERT_EQUATION_DESC"),
          keywords: ["equation", "math", "latex", "formula"],
          icon: RadicalIcon,
        },
        {
          value: ARTICLE_EDITOR_INSERT_THREE_COLUMNS,
          label: t("CONTENT_LIBRARY_EDITOR_INSERT_THREE_COLUMNS"),
          description: t("CONTENT_LIBRARY_EDITOR_INSERT_THREE_COLUMNS_DESC"),
          keywords: ["columns", "layout", "grid", "3 columns"],
          icon: Columns3Icon,
        },
      ],
    },
    {
      id: "inline",
      label: t("CONTENT_LIBRARY_EDITOR_INSERT_GROUP_INLINE"),
      items: [
        {
          value: ARTICLE_EDITOR_INSERT_DATE,
          label: t("CONTENT_LIBRARY_EDITOR_INSERT_DATE"),
          description: t("CONTENT_LIBRARY_EDITOR_INSERT_DATE_DESC"),
          keywords: ["date", "time", "today", "calendar"],
          icon: CalendarIcon,
        },
        {
          value: ARTICLE_EDITOR_INSERT_LINK,
          label: t("CONTENT_LIBRARY_EDITOR_INSERT_LINK"),
          description: t("CONTENT_LIBRARY_EDITOR_INSERT_LINK_DESC"),
          keywords: ["link", "url", "hyperlink"],
          icon: Link2Icon,
        },
        {
          value: ARTICLE_EDITOR_INSERT_INLINE_EQUATION,
          label: t("CONTENT_LIBRARY_EDITOR_INSERT_INLINE_EQUATION"),
          description: t("CONTENT_LIBRARY_EDITOR_INSERT_INLINE_EQUATION_DESC"),
          keywords: ["inline", "equation", "math", "latex"],
          icon: RadicalIcon,
        },
      ],
    },
  ];
}

export function filterArticleEditorInsertGroups(
  groups: ArticleEditorInsertGroup[],
  query: string,
): ArticleEditorInsertGroup[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return groups;

  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        const haystack = [item.label, item.description, ...(item.keywords ?? [])]
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalizedQuery);
      }),
    }))
    .filter((group) => group.items.length > 0);
}

import {
  ChevronRightIcon,
  Code2Icon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ListIcon,
  ListOrderedIcon,
  ListTodoIcon,
  PilcrowIcon,
  QuoteIcon,
  type LucideIcon,
} from "lucide-react";
import { KEYS } from "platejs";

export const TURN_INTO_MENU_ITEMS = [
  { icon: PilcrowIcon, value: KEYS.p, labelKey: "CONTENT_LIBRARY_EDITOR_INSERT_TEXT" },
  { icon: Heading1Icon, value: KEYS.h1, labelKey: "CONTENT_LIBRARY_EDITOR_INSERT_HEADING_1" },
  { icon: Heading2Icon, value: KEYS.h2, labelKey: "CONTENT_LIBRARY_EDITOR_INSERT_HEADING_2" },
  { icon: Heading3Icon, value: KEYS.h3, labelKey: "CONTENT_LIBRARY_EDITOR_INSERT_HEADING_3" },
  {
    icon: ListIcon,
    value: KEYS.ul,
    labelKey: "CONTENT_LIBRARY_EDITOR_INSERT_BULLETED_LIST",
  },
  {
    icon: ListOrderedIcon,
    value: KEYS.ol,
    labelKey: "CONTENT_LIBRARY_EDITOR_INSERT_NUMBERED_LIST",
  },
  {
    icon: ListTodoIcon,
    value: KEYS.listTodo,
    labelKey: "CONTENT_LIBRARY_EDITOR_INSERT_TODO_LIST",
  },
  {
    icon: ChevronRightIcon,
    value: KEYS.toggle,
    labelKey: "CONTENT_LIBRARY_EDITOR_INSERT_TOGGLE",
  },
  {
    icon: Code2Icon,
    value: KEYS.codeBlock,
    labelKey: "CONTENT_LIBRARY_EDITOR_INSERT_CODE_BLOCK",
  },
  {
    icon: QuoteIcon,
    value: KEYS.blockquote,
    labelKey: "CONTENT_LIBRARY_EDITOR_INSERT_QUOTE",
  },
] satisfies readonly { icon: LucideIcon; value: string; labelKey: string }[];

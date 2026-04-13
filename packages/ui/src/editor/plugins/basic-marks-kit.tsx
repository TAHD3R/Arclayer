"use client";

import {
  FontBackgroundColorPlugin,
  FontColorPlugin,
  FontSizePlugin,
  LineHeightPlugin,
  TextAlignPlugin,
} from "@platejs/basic-styles/react";
import {
  BoldPlugin,
  CodePlugin,
  HighlightPlugin,
  ItalicPlugin,
  KbdPlugin,
  StrikethroughPlugin,
  SubscriptPlugin,
  SuperscriptPlugin,
  UnderlinePlugin,
} from "@platejs/basic-nodes/react";

import { CodeLeaf } from "../ui/code-node";
import { HighlightLeaf } from "../ui/highlight-node";
import { KbdLeaf } from "../ui/kbd-node";

export const BasicMarksKit = [
  BoldPlugin.configure({
    shortcuts: { toggle: { keys: "mod+b" } },
  }),
  ItalicPlugin.configure({
    shortcuts: { toggle: { keys: "mod+i" } },
  }),
  UnderlinePlugin.configure({
    shortcuts: { toggle: { keys: "mod+u" } },
  }),
  CodePlugin.configure({
    node: { component: CodeLeaf },
    shortcuts: { toggle: { keys: "mod+e" } },
  }),
  StrikethroughPlugin.configure({
    shortcuts: { toggle: { keys: "mod+shift+x" } },
  }),
  SubscriptPlugin.configure({
    shortcuts: { toggle: { keys: "mod+comma" } },
  }),
  SuperscriptPlugin.configure({
    shortcuts: { toggle: { keys: "mod+period" } },
  }),
  HighlightPlugin.configure({
    node: { component: HighlightLeaf },
    shortcuts: { toggle: { keys: "mod+shift+h" } },
  }),
  FontSizePlugin,
  FontColorPlugin,
  FontBackgroundColorPlugin,
  TextAlignPlugin,
  LineHeightPlugin,
  KbdPlugin.withComponent(KbdLeaf),
];

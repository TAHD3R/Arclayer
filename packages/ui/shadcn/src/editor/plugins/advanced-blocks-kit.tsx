"use client";

import emojiData from "@emoji-mart/data";
import type { EmojiMartData } from "@emoji-mart/data";
import { CalloutPlugin } from "@platejs/callout/react";
import { CodeBlockPlugin, CodeLinePlugin, CodeSyntaxPlugin } from "@platejs/code-block/react";
import { DatePlugin } from "@platejs/date/react";
import { EmojiInputPlugin, EmojiPlugin } from "@platejs/emoji/react";
import { ColumnItemPlugin, ColumnPlugin } from "@platejs/layout/react";
import { LinkPlugin } from "@platejs/link/react";
import { ListPlugin } from "@platejs/list/react";
import { EquationPlugin, InlineEquationPlugin } from "@platejs/math/react";
import {
  AudioPlugin,
  FilePlugin,
  ImagePlugin,
  PlaceholderPlugin,
  VideoPlugin,
} from "@platejs/media/react";
import { TogglePlugin } from "@platejs/toggle/react";
import {
  TableCellHeaderPlugin,
  TableCellPlugin,
  TablePlugin,
  TableRowPlugin,
} from "@platejs/table/react";
import { TocPlugin } from "@platejs/toc/react";

import { CalloutElement } from "../ui/callout-node";
import { CodeBlockElement, CodeLineElement, CodeSyntaxLeaf } from "../ui/code-block-node";
import { ColumnElement, ColumnGroupElement } from "../ui/column-node";
import { DateElement } from "../ui/date-node";
import { EmojiInputElement } from "../ui/emoji-input-node";
import { EquationElement, InlineEquationElement } from "../ui/equation-node";
import { LinkElement } from "../ui/link-node";
import { BlockList } from "../ui/list-node";
import { AudioElement } from "../ui/media-audio-node";
import { FileElement } from "../ui/media-file-node";
import { MediaImageElement } from "../ui/media-image-node";
import { MediaPlaceholderElement } from "../ui/media-placeholder-node";
import { VideoElement } from "../ui/media-video-node";
import { MediaUploadToast } from "../ui/media-upload-toast";
import {
  TableCellElement,
  TableElement,
  TableHeaderCellElement,
  TableRowElement,
} from "../ui/table-node";
import { ToggleElement } from "../ui/toggle-node";
import { TocElement } from "../ui/toc-node";
import { exitEmptyToggle } from "../toggle-plugin-helpers";
import { articleEditorCodeBlockLowlight } from "../code-block-highlighting";

export const AdvancedBlocksKit = [
  LinkPlugin.configure({
    node: { component: LinkElement },
  }),
  ListPlugin.configure({
    render: {
      belowNodes: ({ element }) => {
        if (!element.listStyleType) return;

        return (props) => <BlockList {...props} />;
      },
    },
  }),
  TogglePlugin.configure({
    node: { component: ToggleElement },
  }).overrideEditor(({ editor, tf: { insertBreak } }) => ({
    transforms: {
      insertBreak() {
        if (exitEmptyToggle(editor)) return;
        insertBreak();
      },
    },
  })),
  CodeBlockPlugin.configure({
    node: { component: CodeBlockElement },
    options: {
      lowlight: articleEditorCodeBlockLowlight,
    },
  }),
  CodeLinePlugin.configure({
    node: { component: CodeLineElement },
  }),
  CodeSyntaxPlugin.configure({
    node: { component: CodeSyntaxLeaf },
  }),
  CalloutPlugin.configure({
    node: { component: CalloutElement },
  }),
  DatePlugin.configure({
    node: { component: DateElement },
  }),
  EmojiPlugin.configure({
    options: { data: emojiData as unknown as EmojiMartData },
  }),
  EmojiInputPlugin.configure({
    node: { component: EmojiInputElement },
  }),
  EquationPlugin.configure({
    node: { component: EquationElement },
  }),
  InlineEquationPlugin.configure({
    node: { component: InlineEquationElement },
  }),
  ColumnPlugin.configure({
    node: { component: ColumnGroupElement },
  }),
  ColumnItemPlugin.configure({
    node: { component: ColumnElement },
  }),
  AudioPlugin.configure({
    node: { component: AudioElement },
  }),
  PlaceholderPlugin.configure({
    options: {
      disableEmptyPlaceholder: true,
    },
    render: {
      afterEditable: MediaUploadToast,
      node: MediaPlaceholderElement,
    },
  }),
  ImagePlugin.configure({
    node: { component: MediaImageElement },
  }),
  FilePlugin.configure({
    node: { component: FileElement },
  }),
  VideoPlugin.configure({
    node: { component: VideoElement },
  }),
  TablePlugin.configure({
    node: { component: TableElement },
  }),
  TableRowPlugin.configure({
    node: { component: TableRowElement },
  }),
  TableCellPlugin.configure({
    node: { component: TableCellElement },
  }),
  TableCellHeaderPlugin.configure({
    node: { component: TableHeaderCellElement },
  }),
  TocPlugin.configure({
    node: { component: TocElement },
  }),
];

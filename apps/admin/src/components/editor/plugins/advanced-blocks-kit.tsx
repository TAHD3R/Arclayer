"use client";

import { CalloutPlugin } from "@platejs/callout/react";
import { CodeBlockPlugin, CodeLinePlugin } from "@platejs/code-block/react";
import { DatePlugin } from "@platejs/date/react";
import { ColumnItemPlugin, ColumnPlugin } from "@platejs/layout/react";
import { LinkPlugin } from "@platejs/link/react";
import { ListPlugin } from "@platejs/list/react";
import { EquationPlugin, InlineEquationPlugin } from "@platejs/math/react";
import { AudioPlugin, FilePlugin, ImagePlugin, VideoPlugin } from "@platejs/media/react";
import { TogglePlugin } from "@platejs/toggle/react";
import {
  TableCellHeaderPlugin,
  TableCellPlugin,
  TablePlugin,
  TableRowPlugin,
} from "@platejs/table/react";
import { TocPlugin } from "@platejs/toc/react";

import { CalloutElement } from "@/components/ui/callout-node";
import { CodeBlockElement, CodeLineElement } from "@/components/ui/code-block-node";
import { ColumnElement, ColumnGroupElement } from "@/components/ui/column-node";
import { DateElement } from "@/components/ui/date-node";
import { EquationElement, InlineEquationElement } from "@/components/ui/equation-node";
import { LinkElement } from "@/components/ui/link-node";
import { AudioElement } from "@/components/ui/media-audio-node";
import { FileElement } from "@/components/ui/media-file-node";
import { MediaImageElement } from "@/components/ui/media-image-node";
import { VideoElement } from "@/components/ui/media-video-node";
import {
  TableCellElement,
  TableElement,
  TableHeaderCellElement,
  TableRowElement,
} from "@/components/ui/table-node";
import { ToggleElement } from "@/components/ui/toggle-node";
import { TocElement } from "@/components/ui/toc-node";

export const AdvancedBlocksKit = [
  LinkPlugin.configure({
    node: { component: LinkElement },
  }),
  ListPlugin,
  TogglePlugin.configure({
    node: { component: ToggleElement },
  }),
  CodeBlockPlugin.configure({
    node: { component: CodeBlockElement },
  }),
  CodeLinePlugin.configure({
    node: { component: CodeLineElement },
  }),
  CalloutPlugin.configure({
    node: { component: CalloutElement },
  }),
  DatePlugin.configure({
    node: { component: DateElement },
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
  ImagePlugin.configure({
    node: { component: MediaImageElement },
  }),
  AudioPlugin.configure({
    node: { component: AudioElement },
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

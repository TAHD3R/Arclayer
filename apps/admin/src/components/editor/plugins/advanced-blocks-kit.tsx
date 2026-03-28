"use client";

import { CodeBlockPlugin, CodeLinePlugin } from "@platejs/code-block/react";
import { LinkPlugin } from "@platejs/link/react";
import { ListPlugin } from "@platejs/list/react";
import { ImagePlugin } from "@platejs/media/react";
import {
  TableCellHeaderPlugin,
  TableCellPlugin,
  TablePlugin,
  TableRowPlugin,
} from "@platejs/table/react";
import { TocPlugin } from "@platejs/toc/react";

import { LinkElement } from "@/components/ui/link-node";
import { MediaImageElement } from "@/components/ui/media-image-node";
import {
  TableCellElement,
  TableElement,
  TableHeaderCellElement,
  TableRowElement,
} from "@/components/ui/table-node";
import { TocElement } from "@/components/ui/toc-node";

export const AdvancedBlocksKit = [
  LinkPlugin.configure({
    node: { component: LinkElement },
  }),
  ListPlugin,
  CodeBlockPlugin,
  CodeLinePlugin,
  ImagePlugin.configure({
    node: { component: MediaImageElement },
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

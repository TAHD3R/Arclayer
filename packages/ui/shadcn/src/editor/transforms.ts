"use client";

import type { PlateEditor } from "platejs/react";

import { type NodeEntry, type Path, type TElement, KEYS, PathApi } from "platejs";

type InsertBlockOptions = {
  upsert?: boolean;
};

export const insertBlock = (
  editor: PlateEditor,
  type: string,
  options: InsertBlockOptions = {},
) => {
  const { upsert = false } = options;

  editor.tf.withoutNormalizing(() => {
    const block = editor.api.block();
    if (!block) return;

    const [currentNode, path] = block;
    const isCurrentBlockEmpty = editor.api.isEmpty(currentNode);
    const currentBlockType = getBlockType(currentNode);

    if (upsert && isCurrentBlockEmpty) {
      if (type !== currentBlockType) {
        editor.tf.setNodes({ type }, { at: path });
      }
      editor.tf.select(editor.api.end(path) ?? path);
      return;
    }

    editor.tf.insertNodes(editor.api.create.block({ type }), {
      at: PathApi.next(path),
      select: true,
    });
  });
};

export const setBlockType = (editor: PlateEditor, type: string, { at }: { at?: Path } = {}) => {
  editor.tf.withoutNormalizing(() => {
    const setEntry = (entry: NodeEntry<TElement>) => {
      const [node, path] = entry;
      if (node.type !== type) {
        editor.tf.setNodes({ type }, { at: path });
      }
    };

    if (at) {
      const entry = editor.api.node<TElement>(at);
      if (entry) {
        setEntry(entry);
        return;
      }
    }

    editor.api.blocks({ mode: "lowest" }).forEach((entry) => {
      setEntry(entry);
    });
  });
};

export const getBlockType = (block: TElement) => {
  return block.type ?? KEYS.p;
};

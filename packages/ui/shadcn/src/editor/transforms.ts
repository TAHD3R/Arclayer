"use client";

import type { PlateEditor } from "platejs/react";

import { type NodeEntry, type Path, type Range, type TElement, KEYS, PathApi } from "platejs";

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

function cloneSelection(selection: Range | null | undefined) {
  if (!selection) return null;

  return JSON.parse(JSON.stringify(selection)) as Range;
}

export function captureEditorSelection(editor: PlateEditor) {
  return cloneSelection(editor.selection);
}

export function restoreEditorSelection(
  editor: PlateEditor,
  selection: Range | null | undefined,
  options: {
    focus?: boolean;
    restoreSelection?: boolean;
  } = {},
) {
  const { focus = true, restoreSelection = true } = options;
  const nextSelection = cloneSelection(selection);

  if (restoreSelection && nextSelection) {
    editor.tf.select(nextSelection as never);
  }

  if (focus) {
    editor.tf.focus();
  }

  return nextSelection;
}

export function runEditorTransformPreservingSelection(
  editor: PlateEditor,
  transform: (selection: Range | null) => void,
  options: {
    focus?: boolean;
    restoreSelection?: boolean;
    selection?: Range | null;
  } = {},
) {
  const selection = cloneSelection(options.selection ?? captureEditorSelection(editor));

  if (selection) {
    editor.tf.select(selection as never);
  }

  transform(selection);

  return restoreEditorSelection(editor, selection, {
    focus: options.focus,
    restoreSelection: options.restoreSelection,
  });
}

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

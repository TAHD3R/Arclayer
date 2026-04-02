"use client";

import { BlockSelectionPlugin } from "@platejs/selection/react";
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

export type EditorSelectionSnapshot = {
  blockSelectionIds: string[];
  selection: Range | null;
};

function cloneSelectionSnapshot(selection: EditorSelectionSnapshot | null | undefined) {
  if (!selection) return null;

  return {
    blockSelectionIds: [...selection.blockSelectionIds],
    selection: cloneSelection(selection.selection),
  } satisfies EditorSelectionSnapshot;
}

export function captureEditorSelection(editor: PlateEditor) {
  const selectedIds = editor.getOption(BlockSelectionPlugin, "selectedIds") as
    | Set<string>
    | undefined;

  return {
    blockSelectionIds: selectedIds ? Array.from(selectedIds) : [],
    selection: cloneSelection(editor.selection),
  } satisfies EditorSelectionSnapshot;
}

export function restoreEditorSelection(
  editor: PlateEditor,
  selection: EditorSelectionSnapshot | null | undefined,
  options: {
    focus?: boolean;
    restoreSelection?: boolean;
  } = {},
) {
  const { focus = true, restoreSelection = true } = options;
  const nextSelection = cloneSelectionSnapshot(selection);
  const blockSelectionApi = editor.getApi(BlockSelectionPlugin).blockSelection;
  const hasBlockSelection = (nextSelection?.blockSelectionIds.length ?? 0) > 0;

  if (restoreSelection && nextSelection) {
    if (hasBlockSelection) {
      blockSelectionApi.set(nextSelection.blockSelectionIds);
    } else if (nextSelection.selection) {
      editor.tf.select(nextSelection.selection as never);
    }
  }

  if (focus) {
    if (restoreSelection && hasBlockSelection) {
      blockSelectionApi.focus();
    } else {
      editor.tf.focus();
    }
  }

  return nextSelection;
}

export function runEditorTransformPreservingSelection(
  editor: PlateEditor,
  transform: (selection: EditorSelectionSnapshot | null) => void,
  options: {
    focus?: boolean;
    restoreSelection?: boolean;
    selection?: EditorSelectionSnapshot | null;
  } = {},
) {
  const selection = cloneSelectionSnapshot(options.selection ?? captureEditorSelection(editor));

  if (selection?.blockSelectionIds.length) {
    editor.getApi(BlockSelectionPlugin).blockSelection.set(selection.blockSelectionIds);
  } else if (selection?.selection) {
    editor.tf.select(selection.selection as never);
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

"use client";

import { BlockSelectionPlugin } from "@platejs/selection/react";
import { KEYS, type Path, type TElement } from "platejs";
import type { PlateEditor } from "platejs/react";

import {
  captureEditorSelection,
  runEditorTransformPreservingSelection,
  type EditorSelectionSnapshot,
} from "./transforms";

export const MENU_COLORS = [
  "#000000",
  "#666666",
  "#999999",
  "#cc0000",
  "#e69138",
  "#f1c232",
  "#6aa84f",
  "#45818e",
  "#3c78d8",
  "#674ea7",
  "#a64d79",
  "#f4cccc",
  "#fce5cd",
  "#fff2cc",
  "#d9ead3",
  "#d0e0e3",
  "#c9daf8",
  "#ead1dc",
] as const;

export const DEFAULT_COLORS = [
  "#000000",
  "#434343",
  "#666666",
  "#999999",
  "#b7b7b7",
  "#cccccc",
  "#d9d9d9",
  "#efefef",
  "#f3f3f3",
  "#ffffff",
  "#980100",
  "#ff0000",
  "#ff9900",
  "#ffff00",
  "#00ff00",
  "#00ffff",
  "#4a86e8",
  "#1300ff",
  "#9900ff",
  "#ff00ff",
  "#e6b8af",
  "#f4cccc",
  "#fce5cd",
  "#fff2cc",
  "#d9ead3",
  "#d0e0e3",
  "#c9daf8",
  "#cfe2f3",
  "#d9d2e9",
  "#ead1dc",
  "#dd7e6b",
  "#ea9999",
  "#f9cb9c",
  "#ffe599",
  "#b6d7a8",
  "#a2c4c9",
  "#a4c2f4",
  "#9fc5e8",
  "#b4a7d6",
  "#d5a6bd",
  "#cc4125",
  "#e06666",
  "#f6b26b",
  "#ffd966",
  "#93c47d",
  "#76a5af",
  "#6d9eeb",
  "#6fa8dc",
  "#8e7cc3",
  "#c27ba0",
  "#a61c00",
  "#cc0000",
  "#e69138",
  "#f1c232",
  "#6aa84f",
  "#45818e",
  "#3c78d8",
  "#3d85c6",
  "#674ea7",
  "#a64d79",
  "#85200c",
  "#990000",
  "#b45f06",
  "#bf9000",
  "#38761d",
  "#134f5c",
  "#1155cc",
  "#0b5394",
  "#351c75",
  "#741b47",
] as const;

const BACKGROUND_COLOR_ALPHA = 0.24;

type BlockEntry = [TElement, Path];
type TextNodeLike = { text: string; [key: string]: unknown };

function isTextNodeLike(node: unknown): node is TextNodeLike {
  return (
    Boolean(node) &&
    typeof node === "object" &&
    typeof (node as { text?: unknown }).text === "string"
  );
}

function getChildren(node: unknown): unknown[] {
  if (!node || typeof node !== "object") return [];

  const children = (node as { children?: unknown }).children;
  return Array.isArray(children) ? children : [];
}

function normalizeHex(value: string) {
  const normalized = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(normalized)) return normalized;
  if (!/^#[0-9a-f]{3}$/.test(normalized)) return null;

  return `#${normalized
    .slice(1)
    .split("")
    .map((char) => char + char)
    .join("")}`;
}

function parseRgbLike(value: string) {
  const match = value
    .trim()
    .toLowerCase()
    .match(/^rgba?\((\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:[\s,/]+[\d.]+)?\)$/);
  if (!match) return null;

  const rgb = match.slice(1, 4).map((component) => Number.parseInt(component, 10));
  if (rgb.some((component) => Number.isNaN(component) || component < 0 || component > 255)) {
    return null;
  }

  return rgb as [number, number, number];
}

function parseRgb(value: string) {
  const hex = normalizeHex(value);
  if (hex) {
    return [
      Number.parseInt(hex.slice(1, 3), 16),
      Number.parseInt(hex.slice(3, 5), 16),
      Number.parseInt(hex.slice(5, 7), 16),
    ] as [number, number, number];
  }

  return parseRgbLike(value);
}

function visitTextNodes(
  node: unknown,
  path: Path,
  callback: (textNode: TextNodeLike, textPath: Path) => void,
) {
  if (isTextNodeLike(node)) {
    callback(node, path);
    return;
  }

  getChildren(node).forEach((child, index) => {
    visitTextNodes(child, [...path, index], callback);
  });
}

function toRgbaString(color: string, alpha: number) {
  const rgb = parseRgb(color);
  if (!rgb) return color;

  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

function updateBlocksMark(
  editor: PlateEditor,
  nodeType: string,
  value: string | null,
  blocks: BlockEntry[],
) {
  editor.tf.withoutNormalizing(() => {
    blocks.forEach(([block, path]) => {
      visitTextNodes(block, path, (_, textPath) => {
        if (value === null) {
          editor.tf.unsetNodes(nodeType, { at: textPath });
        } else {
          editor.tf.setNodes({ [nodeType]: value }, { at: textPath });
        }
      });
    });
  });
}

export function normalizeColor(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

export function isBrightColor(color: string) {
  const rgb = parseRgb(color);
  if (!rgb) return false;

  return (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 > 130;
}

export function getEditorMarkColorValue(nodeType: string, color: string) {
  if (nodeType !== KEYS.backgroundColor) return color;

  return toRgbaString(color, BACKGROUND_COLOR_ALPHA);
}

export function doesEditorMarkColorMatch(
  nodeType: string,
  selectedColor: string | null | undefined,
  swatchColor: string,
) {
  return (
    normalizeColor(selectedColor) === normalizeColor(getEditorMarkColorValue(nodeType, swatchColor))
  );
}

export function getEditorMarkValueForBlocks(blocks: BlockEntry[], nodeType: string) {
  let sharedValue: string | null | undefined;
  let hasTextLeaf = false;

  for (const [block] of blocks) {
    visitTextNodes(block, [] as Path, (textNode) => {
      hasTextLeaf = true;
      const nextValue =
        typeof textNode[nodeType] === "string" ? (textNode[nodeType] as string) : null;

      if (sharedValue === undefined) {
        sharedValue = nextValue;
        return;
      }

      if (sharedValue !== nextValue) {
        sharedValue = null;
      }
    });

    if (sharedValue === null) {
      return null;
    }
  }

  if (!hasTextLeaf) return null;
  return sharedValue ?? null;
}

export function setEditorMarkColorForBlocks(
  editor: PlateEditor,
  nodeType: string,
  color: string,
  blocks: BlockEntry[],
) {
  updateBlocksMark(editor, nodeType, getEditorMarkColorValue(nodeType, color), blocks);
}

export function clearEditorMarkColorForBlocks(
  editor: PlateEditor,
  nodeType: string,
  blocks: BlockEntry[],
) {
  updateBlocksMark(editor, nodeType, null, blocks);
}

export function applyEditorMarkColor(
  editor: PlateEditor,
  nodeType: string,
  color: string,
  options: { selection?: EditorSelectionSnapshot | null } = {},
) {
  const selection = options.selection ?? captureEditorSelection(editor);

  runEditorTransformPreservingSelection(
    editor,
    (snapshot) => {
      const hasBlockSelection = (snapshot?.blockSelectionIds.length ?? 0) > 0;

      if (hasBlockSelection) {
        const selectedBlocks = editor.getApi(BlockSelectionPlugin).blockSelection.getNodes({
          sort: true,
        }) as BlockEntry[];

        setEditorMarkColorForBlocks(editor, nodeType, color, selectedBlocks);
        return;
      }

      editor.tf.addMarks({ [nodeType]: getEditorMarkColorValue(nodeType, color) });
    },
    { selection },
  );
}

export function clearEditorMarkColor(
  editor: PlateEditor,
  nodeType: string,
  options: { selection?: EditorSelectionSnapshot | null } = {},
) {
  const selection = options.selection ?? captureEditorSelection(editor);

  runEditorTransformPreservingSelection(
    editor,
    (snapshot) => {
      const hasBlockSelection = (snapshot?.blockSelectionIds.length ?? 0) > 0;

      if (hasBlockSelection) {
        const selectedBlocks = editor.getApi(BlockSelectionPlugin).blockSelection.getNodes({
          sort: true,
        }) as BlockEntry[];

        clearEditorMarkColorForBlocks(editor, nodeType, selectedBlocks);
        return;
      }

      editor.tf.removeMarks(nodeType);
    },
    { selection },
  );
}

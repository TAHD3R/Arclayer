"use client";

import { BlockSelectionPlugin } from "@platejs/selection/react";
import { KEYS, type Path, type TElement } from "platejs";
import type { PlateEditor } from "platejs/react";

import {
  captureEditorSelection,
  runEditorTransformPreservingSelection,
  type EditorSelectionSnapshot,
} from "./transforms";

export type EditorColorOption = {
  color: string | null;
  keywords: string[];
  labelKey: string;
  value: string;
};

export const EDITOR_COLOR_OPTIONS = [
  {
    color: null,
    keywords: ["default", "reset", "clear", "remove"],
    labelKey: "CONTENT_LIBRARY_EDITOR_COLOR_NAME_DEFAULT",
    value: "default",
  },
  {
    color: "#5f6368",
    keywords: ["gray", "grey", "neutral", "muted"],
    labelKey: "CONTENT_LIBRARY_EDITOR_COLOR_NAME_GRAY",
    value: "gray",
  },
  {
    color: "#8b5e3c",
    keywords: ["brown", "earth", "warm"],
    labelKey: "CONTENT_LIBRARY_EDITOR_COLOR_NAME_BROWN",
    value: "brown",
  },
  {
    color: "#d9730d",
    keywords: ["orange", "amber", "warm"],
    labelKey: "CONTENT_LIBRARY_EDITOR_COLOR_NAME_ORANGE",
    value: "orange",
  },
  {
    color: "#cb912f",
    keywords: ["yellow", "gold", "highlight"],
    labelKey: "CONTENT_LIBRARY_EDITOR_COLOR_NAME_YELLOW",
    value: "yellow",
  },
  {
    color: "#448361",
    keywords: ["green", "success", "nature"],
    labelKey: "CONTENT_LIBRARY_EDITOR_COLOR_NAME_GREEN",
    value: "green",
  },
  {
    color: "#337ea9",
    keywords: ["blue", "link", "info"],
    labelKey: "CONTENT_LIBRARY_EDITOR_COLOR_NAME_BLUE",
    value: "blue",
  },
  {
    color: "#9065b0",
    keywords: ["purple", "violet", "accent"],
    labelKey: "CONTENT_LIBRARY_EDITOR_COLOR_NAME_PURPLE",
    value: "purple",
  },
  {
    color: "#c14c8a",
    keywords: ["pink", "magenta", "rose"],
    labelKey: "CONTENT_LIBRARY_EDITOR_COLOR_NAME_PINK",
    value: "pink",
  },
  {
    color: "#d44c47",
    keywords: ["red", "danger", "alert"],
    labelKey: "CONTENT_LIBRARY_EDITOR_COLOR_NAME_RED",
    value: "red",
  },
] as const satisfies readonly EditorColorOption[];

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

export function normalizeColorToHex(value?: string | null) {
  if (!value) return null;

  const hex = normalizeHex(value);
  if (hex) return hex;

  const rgb = parseRgbLike(value);
  if (!rgb) return null;

  return `#${rgb.map((component) => component.toString(16).padStart(2, "0")).join("")}`;
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

export function getEditorColorOptions() {
  return EDITOR_COLOR_OPTIONS;
}

export function getEditorColorOptionByValue(value: string) {
  return EDITOR_COLOR_OPTIONS.find((option) => option.value === value) ?? null;
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

"use client";

import * as React from "react";

import { CheckIcon, EraserIcon, PlusIcon } from "lucide-react";
import { useEditorRef, useEditorSelector } from "platejs/react";
import { useTranslation } from "react-i18next";

import { Popover, PopoverContent, PopoverTrigger } from "@arclayer/ui/popover";
import { captureEditorSelection, runEditorTransformPreservingSelection } from "./transforms";
import { ToolbarButton, ToolbarTooltip } from "./ui/toolbar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@arclayer/ui/tooltip";
import { Button } from "@arclayer/ui/button";
import { cn } from "@arclayer/lib/utils";

const STORAGE_KEY = "arclayer:editor:custom-colors";

const CUSTOM_COLOR_PRESETS = ["#a35b00", "#8b8b8b", "#b5b5b5", "#6da7ff", "#6f194c"];

const DEFAULT_COLORS = [
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
];

function normalizeColor(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function isBrightColor(hex: string) {
  const value = hex.replace("#", "");
  if (value.length !== 6) return false;
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 130;
}

function readStoredCustomColors(nodeType: string) {
  if (typeof window === "undefined") return CUSTOM_COLOR_PRESETS;

  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY);
    if (!rawValue) return CUSTOM_COLOR_PRESETS;

    const parsed = JSON.parse(rawValue) as Record<string, string[]>;
    const colors = parsed[nodeType];
    return Array.isArray(colors) && colors.length > 0 ? colors : CUSTOM_COLOR_PRESETS;
  } catch {
    return CUSTOM_COLOR_PRESETS;
  }
}

function writeStoredCustomColors(nodeType: string, colors: string[]) {
  if (typeof window === "undefined") return;

  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY);
    const parsed = rawValue ? (JSON.parse(rawValue) as Record<string, string[]>) : {};
    parsed[nodeType] = colors;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // Ignore storage failures and keep the in-memory palette working.
  }
}

function ColorSwatch(props: { active: boolean; color: string; onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex size-8 items-center justify-center rounded-md border transition-transform hover:scale-105",
            isBrightColor(props.color) ? "border-border/70" : "border-transparent",
          )}
          style={{ backgroundColor: props.color }}
          onClick={props.onClick}
        >
          {props.active ? (
            <CheckIcon
              className={cn("size-3.5", isBrightColor(props.color) ? "text-black" : "text-white")}
            />
          ) : null}
        </button>
      </TooltipTrigger>
      <TooltipContent>{props.color}</TooltipContent>
    </Tooltip>
  );
}

export function FontColorToolbarButton({
  children,
  nodeType,
  tooltip,
}: {
  children: React.ReactNode;
  nodeType: string;
  tooltip: string;
}) {
  const editor = useEditorRef();
  const { t } = useTranslation("content");
  const [open, setOpen] = React.useState(false);
  const selectionRef = React.useRef(captureEditorSelection(editor));
  const colorInputRef = React.useRef<HTMLInputElement | null>(null);
  const [customColors, setCustomColors] = React.useState<string[]>(() =>
    readStoredCustomColors(nodeType),
  );
  const selectedColor = useEditorSelector(
    (currentEditor) => currentEditor.api.mark(nodeType) as string | undefined,
    [nodeType],
  );

  React.useEffect(() => {
    setCustomColors(readStoredCustomColors(nodeType));
  }, [nodeType]);

  const rememberCustomColor = React.useCallback(
    (value: string) => {
      const next = [
        value,
        ...customColors.filter((item) => normalizeColor(item) !== normalizeColor(value)),
      ].slice(0, 8);
      setCustomColors(next);
      writeStoredCustomColors(nodeType, next);
    },
    [customColors, nodeType],
  );

  const applyColor = React.useCallback(
    (value: string, options?: { remember?: boolean }) => {
      runEditorTransformPreservingSelection(
        editor,
        () => {
          editor.tf.addMarks({ [nodeType]: value });
        },
        { selection: selectionRef.current },
      );

      if (options?.remember) {
        rememberCustomColor(value);
      }
    },
    [editor, nodeType, rememberCustomColor],
  );

  const clearColor = React.useCallback(() => {
    runEditorTransformPreservingSelection(
      editor,
      () => {
        editor.tf.removeMarks(nodeType);
      },
      { selection: selectionRef.current },
    );
  }, [editor, nodeType]);

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          selectionRef.current = captureEditorSelection(editor);
        }
        setOpen(nextOpen);
      }}
      modal={false}
    >
      <ToolbarTooltip tooltip={tooltip}>
        <PopoverTrigger asChild>
          <ToolbarButton
            pressed={open}
            tooltip={undefined}
            data-plate-focus
            onMouseDown={(event) => {
              event.preventDefault();
              selectionRef.current = captureEditorSelection(editor);
            }}
          >
            <span className="relative inline-flex items-center justify-center">
              {children}
              <span
                className="absolute inset-x-0 -bottom-0.5 mx-auto h-0.5 w-4 rounded-full"
                style={{ backgroundColor: selectedColor || "currentColor" }}
              />
            </span>
          </ToolbarButton>
        </PopoverTrigger>
      </ToolbarTooltip>
      <PopoverContent
        align="start"
        className="ignore-click-outside/toolbar w-[36rem] rounded-md border border-border/70 bg-card/96 p-0 shadow-xl backdrop-blur"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          runEditorTransformPreservingSelection(editor, () => undefined, {
            selection: selectionRef.current,
          });
        }}
      >
        <TooltipProvider>
          <div className="space-y-0">
            <div className="border-b border-border/70 px-5 py-4">
              <div className="mb-3 text-footnote font-semibold text-label-secondary">
                {t("CONTENT_LIBRARY_EDITOR_COLOR_CUSTOM")}
              </div>
              <div className="flex items-center gap-3">
                {customColors.map((color) => (
                  <ColorSwatch
                    key={color}
                    active={normalizeColor(selectedColor) === normalizeColor(color)}
                    color={color}
                    onClick={() => applyColor(color)}
                  />
                ))}

                <Button
                  type="button"
                  variant="outline"
                  size="icon-lg"
                  className="ml-auto rounded-md text-label-secondary hover:text-label-primary"
                  aria-label={t("CONTENT_LIBRARY_EDITOR_COLOR_CUSTOM_ADD")}
                  onClick={() => colorInputRef.current?.click()}
                >
                  <PlusIcon className="size-5" />
                </Button>
                <input
                  ref={colorInputRef}
                  type="color"
                  className="sr-only"
                  onChange={(event) => applyColor(event.target.value, { remember: true })}
                />
              </div>
            </div>

            <div className="px-5 py-4">
              <div className="mb-3 text-footnote font-semibold text-label-secondary">
                {t("CONTENT_LIBRARY_EDITOR_COLOR_DEFAULT")}
              </div>
              <div className="grid grid-cols-10 gap-3">
                {DEFAULT_COLORS.map((color) => (
                  <ColorSwatch
                    key={color}
                    active={normalizeColor(selectedColor) === normalizeColor(color)}
                    color={color}
                    onClick={() => applyColor(color)}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end border-t border-border/70 px-4 py-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-label-secondary hover:text-label-primary"
                onClick={clearColor}
              >
                <EraserIcon className="size-4" />
                {t("CONTENT_LIBRARY_EDITOR_COLOR_CLEAR")}
              </Button>
            </div>
          </div>
        </TooltipProvider>
      </PopoverContent>
    </Popover>
  );
}

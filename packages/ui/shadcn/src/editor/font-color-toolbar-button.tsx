"use client";

import * as React from "react";

import { CheckIcon, EraserIcon } from "lucide-react";
import { useEditorRef, useEditorSelector } from "platejs/react";
import { useTranslation } from "react-i18next";

import { Popover, PopoverContent, PopoverTrigger } from "@arclayer/ui/popover";
import { captureEditorSelection, runEditorTransformPreservingSelection } from "./transforms";
import { ToolbarButton, ToolbarTooltip } from "./ui/toolbar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@arclayer/ui/tooltip";
import { Button } from "@arclayer/ui/button";
import { cn } from "@arclayer/lib/utils";
import {
  DEFAULT_COLORS,
  applyEditorMarkColor,
  clearEditorMarkColor,
  doesEditorMarkColorMatch,
  isBrightColor,
  normalizeColor,
} from "./mark-color-utils";
import { EditorColorPicker } from "./ui/editor-color-picker";

const STORAGE_KEY = "arclayer:editor:custom-colors";

const CUSTOM_COLOR_PRESETS = ["#a35b00", "#8b8b8b", "#b5b5b5", "#6da7ff", "#6f194c"];

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
      setCustomColors((currentColors) => {
        const next = [
          value,
          ...currentColors.filter((item) => normalizeColor(item) !== normalizeColor(value)),
        ].slice(0, 8);
        writeStoredCustomColors(nodeType, next);
        return next;
      });
    },
    [nodeType],
  );

  const applyColor = React.useCallback(
    (value: string, options?: { remember?: boolean }) => {
      applyEditorMarkColor(editor, nodeType, value, {
        selection: selectionRef.current,
      });

      if (options?.remember) {
        rememberCustomColor(value);
      }
    },
    [editor, nodeType, rememberCustomColor],
  );

  const clearColor = React.useCallback(() => {
    clearEditorMarkColor(editor, nodeType, {
      selection: selectionRef.current,
    });
  }, [editor, nodeType]);

  const pickerValue = selectedColor ?? customColors[0] ?? DEFAULT_COLORS[0] ?? "#000000";

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
        className="ignore-click-outside/toolbar w-[18rem] rounded-md border border-border/70 bg-card/96 p-3 shadow-xl backdrop-blur"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          runEditorTransformPreservingSelection(editor, () => undefined, {
            selection: selectionRef.current,
          });
        }}
      >
        <TooltipProvider>
          <div className="space-y-3">
            <div className="space-y-2">
              <div className="text-footnote font-semibold text-label-secondary">
                {t("CONTENT_LIBRARY_EDITOR_COLOR_CUSTOM")}
              </div>
              <EditorColorPicker
                value={pickerValue}
                onChange={(value) => applyColor(value, { remember: true })}
                customColors={customColors}
                presets={DEFAULT_COLORS}
                inputLabel={t("CONTENT_LIBRARY_EDITOR_COLOR_VALUE")}
              />
            </div>

            <div className="flex items-center justify-between border-t border-border/70 pt-3">
              <div className="flex items-center gap-2">
                {customColors.slice(0, 3).map((color) => (
                  <ColorSwatch
                    key={color}
                    active={doesEditorMarkColorMatch(nodeType, selectedColor, color)}
                    color={color}
                    onClick={() => applyColor(color)}
                  />
                ))}
              </div>
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

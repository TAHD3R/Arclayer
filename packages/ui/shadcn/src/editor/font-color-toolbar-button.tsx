"use client";

import * as React from "react";

import { KEYS } from "platejs";
import { useEditorRef, useEditorSelector } from "platejs/react";
import { useTranslation } from "react-i18next";

import { Popover, PopoverContent, PopoverTrigger } from "@arclayer/ui/popover";
import {
  applyEditorMarkColor,
  clearEditorMarkColor,
  doesEditorMarkColorMatch,
  getEditorColorOptions,
  getEditorMarkColorValue,
} from "./mark-color-utils";
import { captureEditorSelection, runEditorTransformPreservingSelection } from "./transforms";
import { ToolbarButton, ToolbarTooltip } from "./ui/toolbar";
import { EditorColorPicker } from "./ui/editor-color-picker";

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
  const selectedColor = useEditorSelector(
    (currentEditor) => currentEditor.api.mark(nodeType) as string | undefined,
    [nodeType],
  );
  const colorOptions = React.useMemo(
    () =>
      getEditorColorOptions().map((option) => ({
        active:
          option.color === null
            ? !selectedColor
            : doesEditorMarkColorMatch(nodeType, selectedColor, option.color),
        label:
          nodeType === KEYS.backgroundColor && option.color !== null
            ? `${t(option.labelKey)} ${t("CONTENT_LIBRARY_EDITOR_COLOR_BACKGROUND_SUFFIX")}`
            : t(option.labelKey),
        swatchColor:
          option.color === null ? undefined : getEditorMarkColorValue(nodeType, option.color),
        value: option.color,
      })),
    [nodeType, selectedColor, t],
  );

  const applyColor = React.useCallback(
    (value: string) => {
      applyEditorMarkColor(editor, nodeType, value, {
        selection: selectionRef.current,
      });
    },
    [editor, nodeType],
  );

  const clearColor = React.useCallback(() => {
    clearEditorMarkColor(editor, nodeType, {
      selection: selectionRef.current,
    });
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
        className="ignore-click-outside/toolbar w-[14.5rem] rounded-md border border-border/70 bg-card/96 p-2.5 shadow-xl backdrop-blur"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          runEditorTransformPreservingSelection(editor, () => undefined, {
            selection: selectionRef.current,
          });
        }}
      >
        <EditorColorPicker
          clearLabel={t("CONTENT_LIBRARY_EDITOR_COLOR_CLEAR")}
          onClear={clearColor}
          onSelect={applyColor}
          options={colorOptions}
        />
      </PopoverContent>
    </Popover>
  );
}

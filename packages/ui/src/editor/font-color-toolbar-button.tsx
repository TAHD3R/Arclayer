"use client";

import * as React from "react";

import { KEYS } from "platejs";
import { useEditorRef, useEditorSelector } from "platejs/react";
import { useTranslation } from "react-i18next";

import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@arclayer/ui/dropdown-menu";
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
      setOpen(false);
    },
    [editor, nodeType],
  );

  const clearColor = React.useCallback(() => {
    clearEditorMarkColor(editor, nodeType, {
      selection: selectionRef.current,
    });
    setOpen(false);
  }, [editor, nodeType]);

  return (
    <DropdownMenu
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
        <DropdownMenuTrigger asChild>
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
        </DropdownMenuTrigger>
      </ToolbarTooltip>
      <DropdownMenuContent
        align="start"
        className="ignore-click-outside/toolbar min-w-[14rem] p-1"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          runEditorTransformPreservingSelection(editor, () => undefined, {
            selection: selectionRef.current,
          });
        }}
      >
        <EditorColorPicker
          clearLabel={t("CONTENT_LIBRARY_EDITOR_COLOR_CLEAR")}
          customAddLabel={t("CONTENT_LIBRARY_EDITOR_COLOR_CUSTOM_ADD")}
          customLabel={t("CONTENT_LIBRARY_EDITOR_COLOR_CUSTOM")}
          defaultLabel={t("CONTENT_LIBRARY_EDITOR_COLOR_DEFAULT")}
          nodeType={nodeType}
          onClear={clearColor}
          onSelect={applyColor}
          options={colorOptions}
          selectedColor={selectedColor}
          valueLabel={t("CONTENT_LIBRARY_EDITOR_COLOR_VALUE")}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

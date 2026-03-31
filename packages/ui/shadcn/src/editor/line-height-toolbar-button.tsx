"use client";

import * as React from "react";

import { LineHeightPlugin } from "@platejs/basic-styles/react";
import { WrapTextIcon } from "lucide-react";
import { useEditorRef, useSelectionFragmentProp } from "platejs/react";
import { useTranslation } from "react-i18next";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { captureEditorSelection, runEditorTransformPreservingSelection } from "./transforms";
import { ToolbarButton, ToolbarTooltip } from "./ui/toolbar";

const DEFAULT_LINE_HEIGHT = "1.5";
const FALLBACK_LINE_HEIGHT_VALUES = ["1", "1.25", DEFAULT_LINE_HEIGHT, "2"] as const;

export function resolveLineHeightOptions(
  values: string[] | undefined,
  defaultValue = DEFAULT_LINE_HEIGHT,
) {
  const normalizedValues = (values ?? []).map((value) => String(value).trim()).filter(Boolean);
  const dedupedValues = Array.from(new Set(normalizedValues));
  const normalizedDefaultValue = String(defaultValue).trim() || DEFAULT_LINE_HEIGHT;

  if (dedupedValues.length > 0) {
    return dedupedValues;
  }

  if (
    FALLBACK_LINE_HEIGHT_VALUES.includes(
      normalizedDefaultValue as (typeof FALLBACK_LINE_HEIGHT_VALUES)[number],
    )
  ) {
    return [...FALLBACK_LINE_HEIGHT_VALUES];
  }

  return Array.from(new Set([...FALLBACK_LINE_HEIGHT_VALUES, normalizedDefaultValue]));
}

export function LineHeightToolbarButton() {
  const { t } = useTranslation("content");
  const editor = useEditorRef();
  const [open, setOpen] = React.useState(false);
  const selectionRef = React.useRef(captureEditorSelection(editor));
  const { defaultNodeValue = DEFAULT_LINE_HEIGHT } = editor.getInjectProps(LineHeightPlugin) as {
    defaultNodeValue?: string;
  };
  const values = React.useMemo(
    () => resolveLineHeightOptions(undefined, defaultNodeValue),
    [defaultNodeValue],
  );
  const value = useSelectionFragmentProp({
    defaultValue: defaultNodeValue,
    getProp: (node) => node.lineHeight,
  });

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
      <ToolbarTooltip tooltip={t("CONTENT_LIBRARY_EDITOR_MARK_LINE_HEIGHT")}>
        <DropdownMenuTrigger asChild>
          <ToolbarButton
            pressed={open}
            tooltip={undefined}
            isDropdown
            onMouseDown={(event) => {
              event.preventDefault();
              selectionRef.current = captureEditorSelection(editor);
            }}
          >
            <WrapTextIcon />
          </ToolbarButton>
        </DropdownMenuTrigger>
      </ToolbarTooltip>

      <DropdownMenuContent
        align="start"
        className="ignore-click-outside/toolbar min-w-[11rem]"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          runEditorTransformPreservingSelection(editor, () => undefined, {
            selection: selectionRef.current,
          });
        }}
      >
        <DropdownMenuRadioGroup
          value={String(value ?? defaultNodeValue)}
          onValueChange={(nextValue) => {
            runEditorTransformPreservingSelection(
              editor,
              () => {
                editor.getTransforms(LineHeightPlugin).lineHeight.setNodes(Number(nextValue));
              },
              { selection: selectionRef.current },
            );
          }}
        >
          {values.map((itemValue) => (
            <DropdownMenuRadioItem key={itemValue} value={itemValue} className="min-w-[11rem]">
              {itemValue}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

"use client";

import * as React from "react";

import type { Alignment } from "@platejs/basic-styles";

import { TextAlignPlugin } from "@platejs/basic-styles/react";
import { AlignCenterIcon, AlignJustifyIcon, AlignLeftIcon, AlignRightIcon } from "lucide-react";
import { useEditorPlugin, useSelectionFragmentProp } from "platejs/react";
import { useTranslation } from "react-i18next";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItemContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { captureEditorSelection, runEditorTransformPreservingSelection } from "./transforms";
import {
  ToolbarSplitButton,
  ToolbarSplitButtonPrimary,
  ToolbarSplitButtonSecondary,
  ToolbarTooltip,
} from "./ui/toolbar";

const ALIGN_ITEMS = [
  { icon: AlignLeftIcon, labelKey: "CONTENT_LIBRARY_EDITOR_MARK_ALIGN_LEFT", value: "left" },
  { icon: AlignCenterIcon, labelKey: "CONTENT_LIBRARY_EDITOR_MARK_ALIGN_CENTER", value: "center" },
  { icon: AlignRightIcon, labelKey: "CONTENT_LIBRARY_EDITOR_MARK_ALIGN_RIGHT", value: "right" },
  {
    icon: AlignJustifyIcon,
    labelKey: "CONTENT_LIBRARY_EDITOR_MARK_ALIGN_JUSTIFY",
    value: "justify",
  },
] as const;

export function AlignToolbarButton() {
  const { t } = useTranslation("content");
  const { editor, tf } = useEditorPlugin(TextAlignPlugin);
  const [open, setOpen] = React.useState(false);
  const selectionRef = React.useRef(captureEditorSelection(editor));
  const selectionValue =
    useSelectionFragmentProp({
      defaultValue: "left",
      getProp: (node) => node.align,
    }) ?? "left";
  const [menuValue, setMenuValue] = React.useState(selectionValue);
  const value = open ? menuValue : selectionValue;
  const SelectedIcon = ALIGN_ITEMS.find((item) => item.value === value)?.icon ?? AlignLeftIcon;

  React.useEffect(() => {
    if (!open) {
      setMenuValue(selectionValue);
    }
  }, [open, selectionValue]);

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          selectionRef.current = captureEditorSelection(editor);
          setMenuValue(selectionValue);
        }
        setOpen(nextOpen);
      }}
      modal={false}
    >
      <ToolbarTooltip tooltip={t("CONTENT_LIBRARY_EDITOR_MARK_ALIGN")}>
        <ToolbarSplitButton pressed={open}>
          <ToolbarSplitButtonPrimary
            aria-label={t("CONTENT_LIBRARY_EDITOR_MARK_ALIGN")}
            onMouseDown={(event) => {
              event.preventDefault();
              selectionRef.current = captureEditorSelection(editor);
            }}
            onClick={() => setOpen(true)}
          >
            <SelectedIcon />
          </ToolbarSplitButtonPrimary>
          <DropdownMenuTrigger asChild>
            <ToolbarSplitButtonSecondary
              aria-label={t("CONTENT_LIBRARY_EDITOR_MARK_ALIGN")}
              onMouseDown={(event) => {
                event.preventDefault();
                selectionRef.current = captureEditorSelection(editor);
              }}
            />
          </DropdownMenuTrigger>
        </ToolbarSplitButton>
      </ToolbarTooltip>

      <DropdownMenuContent
        align="start"
        className="ignore-click-outside/toolbar min-w-[12rem]"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          runEditorTransformPreservingSelection(editor, () => undefined, {
            selection: selectionRef.current,
          });
        }}
      >
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(nextValue) => {
            setMenuValue(nextValue as (typeof ALIGN_ITEMS)[number]["value"]);
            runEditorTransformPreservingSelection(
              editor,
              () => {
                tf.textAlign.setNodes(nextValue as Alignment);
              },
              { selection: selectionRef.current },
            );
          }}
        >
          {ALIGN_ITEMS.map(({ icon: Icon, labelKey, value: itemValue }) => (
            <DropdownMenuRadioItem key={itemValue} value={itemValue} className="min-w-[12rem]">
              <DropdownMenuItemContent icon={<Icon className="size-4" />}>
                {t(labelKey)}
              </DropdownMenuItemContent>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

"use client";

import * as React from "react";

import {
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@arclayer/ui/dropdown-menu";

import { EditorColorPicker } from "./ui/editor-color-picker";

export function ColorDropdownSubmenu(props: {
  clearLabel: string;
  customAddLabel: string;
  customLabel: string;
  currentColor?: string | null;
  defaultLabel: string;
  icon: React.ReactNode;
  label: string;
  nodeType: string;
  onClear: () => void;
  onSelectColor: (color: string) => void;
  options: readonly {
    active: boolean;
    label: string;
    swatchColor?: string;
    value: string | null;
  }[];
  valueLabel: string;
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="gap-2">
        {props.icon}
        {props.label}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-[14rem] p-1">
        <EditorColorPicker
          clearLabel={props.clearLabel}
          customAddLabel={props.customAddLabel}
          customLabel={props.customLabel}
          defaultLabel={props.defaultLabel}
          nodeType={props.nodeType}
          onClear={props.onClear}
          onSelect={props.onSelectColor}
          options={props.options}
          selectedColor={props.currentColor}
          valueLabel={props.valueLabel}
        />
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

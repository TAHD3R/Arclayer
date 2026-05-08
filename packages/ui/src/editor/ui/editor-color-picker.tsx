"use client";

import * as React from "react";

import { CheckIcon, EraserIcon, PlusIcon } from "lucide-react";

import {
  DropdownMenuIconItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@arclayer/ui/dropdown-menu";
import { cn } from "@arclayer/lib/utils";

import {
  doesEditorMarkColorMatch,
  getEditorMarkColorValue,
  isBrightColor,
  normalizeColorToHex,
} from "../mark-color-utils";
import { useEditorCustomColorsStore } from "../use-editor-custom-colors-store";

export type EditorColorPickerOption = {
  active: boolean;
  label: string;
  swatchColor?: string;
  value: string | null;
};

export function EditorColorPicker(props: {
  clearLabel: string;
  customAddLabel: string;
  customLabel: string;
  defaultLabel: string;
  onClear: () => void;
  onSelect: (color: string) => void;
  options: readonly EditorColorPickerOption[];
  selectedColor?: string | null;
  valueLabel: string;
  nodeType: string;
}) {
  const colorInputRef = React.useRef<HTMLInputElement | null>(null);
  const storedColors = useEditorCustomColorsStore((state) => state.colors);
  const addStoredColor = useEditorCustomColorsStore((state) => state.addColor);
  const [draftColor, setDraftColor] = React.useState("#337ea9");

  const selectedCustomColor = React.useMemo(() => {
    const normalized = normalizeColorToHex(props.selectedColor);
    if (!normalized) return null;

    const matchesDefault = props.options.some(
      (option) =>
        option.value !== null &&
        normalizeColorToHex(getEditorMarkColorValue(props.nodeType, option.value)) === normalized,
    );

    return matchesDefault ? null : normalized;
  }, [props.nodeType, props.options, props.selectedColor]);

  const customColors = React.useMemo(() => {
    const next = [...storedColors];
    if (selectedCustomColor && !next.includes(selectedCustomColor)) {
      next.unshift(selectedCustomColor);
    }
    return next.slice(0, 8);
  }, [selectedCustomColor, storedColors]);

  const normalizedDraftColor = React.useMemo(() => normalizeColorToHex(draftColor), [draftColor]);

  const handleSelectCustomColor = React.useCallback(
    (color: string) => {
      const normalized = addStoredColor(color) ?? normalizeColorToHex(color);
      if (!normalized) return;

      setDraftColor(normalized);
      props.onSelect(normalized);
    },
    [addStoredColor, props],
  );

  const handleAddCustomColor = React.useCallback(() => {
    if (!normalizedDraftColor) return;
    handleSelectCustomColor(normalizedDraftColor);
  }, [handleSelectCustomColor, normalizedDraftColor]);

  return (
    <div className="flex min-w-[14rem] flex-col">
      <DropdownMenuLabel>{props.defaultLabel}</DropdownMenuLabel>
      {props.options
        .filter((option) => option.value !== null)
        .map((option) => {
          const color = String(option.value);
          const swatchColor = option.swatchColor ?? getEditorMarkColorValue(props.nodeType, color);

          return (
            <DropdownMenuItem
              key={option.label}
              onSelect={(event) => {
                event.preventDefault();
                props.onSelect(color);
              }}
            >
              <span
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded-sm border",
                  isBrightColor(swatchColor) ? "border-border/70" : "border-transparent",
                )}
                style={{ backgroundColor: swatchColor }}
              >
                {option.active ? (
                  <CheckIcon
                    className={cn(
                      "size-3",
                      isBrightColor(swatchColor) ? "text-black" : "text-white",
                    )}
                  />
                ) : null}
              </span>
              <span className="truncate">{option.label}</span>
            </DropdownMenuItem>
          );
        })}

      <DropdownMenuSeparator />
      <DropdownMenuLabel>{props.customLabel}</DropdownMenuLabel>

      {customColors.map((color) => {
        const active = doesEditorMarkColorMatch(props.nodeType, props.selectedColor, color);

        return (
          <DropdownMenuItem
            key={color}
            onSelect={(event) => {
              event.preventDefault();
              handleSelectCustomColor(color);
            }}
          >
            <span
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded-sm border",
                isBrightColor(getEditorMarkColorValue(props.nodeType, color))
                  ? "border-border/70"
                  : "border-transparent",
              )}
              style={{ backgroundColor: getEditorMarkColorValue(props.nodeType, color) }}
            >
              {active ? (
                <CheckIcon
                  className={cn(
                    "size-3",
                    isBrightColor(getEditorMarkColorValue(props.nodeType, color))
                      ? "text-black"
                      : "text-white",
                  )}
                />
              ) : null}
            </span>
            <span>{color}</span>
          </DropdownMenuItem>
        );
      })}

      <div className="px-2 py-1.5">
        <div className="flex items-center gap-2 rounded-sm border border-border/70 bg-card px-2 py-1.5">
          <button
            type="button"
            aria-label={props.customAddLabel}
            className="flex size-5 shrink-0 items-center justify-center rounded-sm border border-border/70"
            style={{ backgroundColor: normalizedDraftColor ?? "#ffffff" }}
            onClick={() => colorInputRef.current?.click()}
          >
            <span className="sr-only">{props.customAddLabel}</span>
          </button>
          <input
            ref={colorInputRef}
            type="color"
            tabIndex={-1}
            value={normalizedDraftColor ?? "#337ea9"}
            className="sr-only"
            onChange={(event) => {
              setDraftColor(event.target.value);
            }}
          />
          <input
            type="text"
            value={draftColor}
            aria-label={props.valueLabel}
            placeholder="#337EA9"
            className="h-6 min-w-0 flex-1 bg-transparent text-footnote outline-none placeholder:text-label-secondary"
            onChange={(event) => {
              setDraftColor(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              handleAddCustomColor();
            }}
          />
          <button
            type="button"
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-label-secondary transition-colors hover:bg-accent hover:text-label-primary disabled:pointer-events-none disabled:opacity-40"
            disabled={!normalizedDraftColor}
            onClick={handleAddCustomColor}
          >
            <PlusIcon className="size-4" />
            <span className="sr-only">{props.customAddLabel}</span>
          </button>
        </div>
      </div>

      <DropdownMenuSeparator />
      <DropdownMenuIconItem
        icon={<EraserIcon className="size-4" />}
        onSelect={(event) => {
          event.preventDefault();
          props.onClear();
        }}
      >
        {props.clearLabel}
      </DropdownMenuIconItem>
    </div>
  );
}

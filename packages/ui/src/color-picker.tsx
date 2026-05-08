"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Check, ChevronDown } from "lucide-react";
import { motion } from "motion/react";

import { cn } from "@arclayer/lib/utils";

import { Button } from "./button";
import { Input } from "./input";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

type ColorPickerProps = {
  color: string;
  onChange: (color: string) => void;
  ariaLabel: string;
  className?: string;
  contentClassName?: string;
  presets?: readonly string[];
  textInputLabel?: string;
  variant?: "button" | "swatch";
};

const DEFAULT_PRESETS = [
  "#111827",
  "#475569",
  "#78716c",
  "#b45309",
  "#d97706",
  "#ca8a04",
  "#65a30d",
  "#16a34a",
  "#059669",
  "#0f766e",
  "#0891b2",
  "#2563eb",
  "#4f46e5",
  "#7c3aed",
  "#9333ea",
  "#c026d3",
  "#db2777",
  "#dc2626",
] as const;

function normalizeHexColor(value?: string | null) {
  if (!value) return null;

  const normalized = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(normalized)) return normalized;
  if (!/^#[0-9a-f]{3}$/.test(normalized)) return null;

  return `#${normalized
    .slice(1)
    .split("")
    .map((char) => `${char}${char}`)
    .join("")}`;
}

function hexToHsl(hex: string): [number, number, number] {
  const normalized = normalizeHexColor(hex) ?? "#337ea9";
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(normalized);
  if (!result) return [0, 0, 0];

  const r = Number.parseInt(result[1], 16) / 255;
  const g = Number.parseInt(result[2], 16) / 255;
  const b = Number.parseInt(result[3], 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;

  if (max === min) {
    return [0, 0, Math.round(lightness * 100)];
  }

  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min || 1);

  let hue = 0;
  switch (max) {
    case r:
      hue = (g - b) / delta + (g < b ? 6 : 0);
      break;
    case g:
      hue = (b - r) / delta + 2;
      break;
    default:
      hue = (r - g) / delta + 4;
      break;
  }

  hue /= 6;

  return [Math.round(hue * 360), Math.round(saturation * 100), Math.round(lightness * 100)];
}

function hslToHex(hue: number, saturation: number, lightness: number) {
  const l = lightness / 100;
  const a = (saturation * Math.min(l, 1 - l)) / 100;
  const toHex = (channel: number) => Math.round(channel).toString(16).padStart(2, "0");
  const f = (n: number) => {
    const k = (n + hue / 30) % 12;
    return 255 * (l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1));
  };

  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

export function ColorPicker({
  color,
  onChange,
  ariaLabel,
  className,
  contentClassName,
  presets = DEFAULT_PRESETS,
  textInputLabel,
  variant = "button",
}: ColorPickerProps) {
  const [draftColor, setDraftColor] = useState(normalizeHexColor(color) ?? "#337ea9");
  const [hsl, setHsl] = useState<[number, number, number]>(hexToHsl(draftColor));
  const saturationRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const normalized = normalizeHexColor(color) ?? "#337ea9";
    setDraftColor(normalized);
    setHsl(hexToHsl(normalized));
  }, [color]);

  const normalizedDraftColor = useMemo(
    () => normalizeHexColor(draftColor) ?? "#337ea9",
    [draftColor],
  );

  const commitHex = (nextColor: string) => {
    const normalized = normalizeHexColor(nextColor);
    if (!normalized) return;
    setDraftColor(normalized);
    setHsl(hexToHsl(normalized));
    onChange(normalized);
  };

  const commitHsl = (nextHsl: [number, number, number]) => {
    setHsl(nextHsl);
    const nextHex = hslToHex(nextHsl[0], nextHsl[1], nextHsl[2]);
    setDraftColor(nextHex);
    onChange(nextHex);
  };

  const updateFromPointerEvent = (clientX: number, clientY: number) => {
    const element = saturationRef.current;
    if (!element) return;

    const rect = element.getBoundingClientRect();
    const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
    const y = Math.min(Math.max(clientY - rect.top, 0), rect.height);
    const saturation = Math.round((x / Math.max(rect.width, 1)) * 100);
    const lightness = Math.round(100 - (y / Math.max(rect.height, 1)) * 100);
    commitHsl([hsl[0], saturation, lightness]);
  };

  const trigger =
    variant === "swatch" ? (
      <button
        type="button"
        aria-label={ariaLabel}
        className={cn(
          "flex size-8 items-center justify-center rounded-full border border-border/70 transition-transform hover:scale-105",
          className,
        )}
        style={{ backgroundColor: normalizedDraftColor }}
      />
    ) : (
      <Button
        type="button"
        variant="outline"
        aria-label={ariaLabel}
        className={cn("w-full justify-between gap-3 px-3", className)}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span
            className="size-4 shrink-0 rounded-full border border-black/10 shadow-inner"
            style={{ backgroundColor: normalizedDraftColor }}
          />
          <span className="truncate">{normalizedDraftColor}</span>
        </span>
        <ChevronDown className="size-4 text-label-secondary" />
      </Button>
    );

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn("z-[2400] w-70 rounded-xl border border-border/70 p-3", contentClassName)}
      >
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16 }}
          className="space-y-3"
        >
          <div
            ref={saturationRef}
            className="relative h-38 w-full cursor-crosshair overflow-hidden rounded-lg border border-border/60"
            style={{
              background: `
                linear-gradient(to top, rgba(0, 0, 0, 1), transparent),
                linear-gradient(to right, rgba(255, 255, 255, 1), rgba(255, 255, 255, 0)),
                hsl(${hsl[0]} 100% 50%)
              `,
            }}
            onPointerDown={(event) => {
              updateFromPointerEvent(event.clientX, event.clientY);
              const move = (nextEvent: PointerEvent) =>
                updateFromPointerEvent(nextEvent.clientX, nextEvent.clientY);
              const up = () => {
                window.removeEventListener("pointermove", move);
                window.removeEventListener("pointerup", up);
              };
              window.addEventListener("pointermove", move);
              window.addEventListener("pointerup", up);
            }}
          >
            <motion.div
              className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md"
              style={{
                left: `${hsl[1]}%`,
                top: `${100 - hsl[2]}%`,
                backgroundColor: normalizedDraftColor,
              }}
            />
          </div>

          <input
            type="range"
            min={0}
            max={360}
            value={hsl[0]}
            onChange={(event) => commitHsl([Number(event.target.value), hsl[1], hsl[2]])}
            aria-label={ariaLabel}
            className="h-3 w-full cursor-pointer appearance-none rounded-full"
            style={{
              background:
                "linear-gradient(to right, hsl(0 100% 50%), hsl(60 100% 50%), hsl(120 100% 50%), hsl(180 100% 50%), hsl(240 100% 50%), hsl(300 100% 50%), hsl(360 100% 50%))",
            }}
          />

          <div className="flex items-center gap-2">
            <Input
              value={draftColor}
              aria-label={textInputLabel || ariaLabel}
              placeholder="#337EA9"
              className="h-9 flex-1"
              onChange={(event) => {
                const nextValue = event.target.value;
                setDraftColor(nextValue);
                const normalized = normalizeHexColor(nextValue);
                if (normalized) {
                  setHsl(hexToHsl(normalized));
                  onChange(normalized);
                }
              }}
              onBlur={() => setDraftColor(normalizedDraftColor)}
            />
            <div
              className="size-9 rounded-md border border-border/70 shadow-inner"
              style={{ backgroundColor: normalizedDraftColor }}
            />
          </div>

          <div className="grid grid-cols-6 gap-2">
            {presets.map((preset) => {
              const normalizedPreset = normalizeHexColor(preset) ?? preset;
              const selected = normalizedDraftColor === normalizedPreset;

              return (
                <button
                  key={preset}
                  type="button"
                  aria-label={normalizedPreset}
                  aria-pressed={selected}
                  className="relative size-8 rounded-full border border-border/50 transition-transform hover:scale-105"
                  style={{ backgroundColor: normalizedPreset }}
                  onClick={() => commitHex(normalizedPreset)}
                >
                  {selected ? (
                    <Check className="absolute inset-0 m-auto size-4 text-white" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </motion.div>
      </PopoverContent>
    </Popover>
  );
}

"use client";

import * as React from "react";

import { CheckIcon } from "lucide-react";
import { motion } from "motion/react";

import { Input } from "@arclayer/ui/input";
import { cn } from "@arclayer/lib/utils";

type HslColor = [number, number, number];

const HEX_PATTERN = /^#[0-9a-f]{6}$/i;
const HSL_PATTERN = /^hsl\(\s*\d+(\.\d+)?,\s*\d+(\.\d+)?%,\s*\d+(\.\d+)?%\s*\)$/i;

function hexToHsl(hex: string): HslColor {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return [0, 0, 0];

  const r = parseInt(result[1], 16) / 255;
  const g = parseInt(result[2], 16) / 255;
  const b = parseInt(result[3], 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;

  if (d === 0) {
    return [0, 0, Math.round(l * 100)];
  }

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h = 0;
  switch (max) {
    case r:
      h = (g - b) / d + (g < b ? 6 : 0);
      break;
    case g:
      h = (b - r) / d + 2;
      break;
    default:
      h = (r - g) / d + 4;
      break;
  }

  return [Math.round((h / 6) * 360), Math.round(s * 100), Math.round(l * 100)];
}

function normalizeColor(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "#000000";

  if (HEX_PATTERN.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  if (HSL_PATTERN.test(trimmed)) {
    const [h = 0, s = 0, l = 0] = trimmed.match(/\d+(\.\d+)?/g)?.map(Number) ?? [];
    return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
  }

  return trimmed;
}

function colorToHsl(value: string): HslColor {
  const normalized = normalizeColor(value);
  if (normalized.startsWith("#")) {
    return hexToHsl(normalized);
  }

  const [h = 0, s = 0, l = 0] = normalized.match(/\d+(\.\d+)?/g)?.map(Number) ?? [];
  return [Math.round(h), Math.round(s), Math.round(l)];
}

function formatHsl(value: HslColor) {
  return `hsl(${value[0]}, ${value[1]}%, ${value[2]}%)`;
}

export function EditorColorPicker(props: {
  customColors?: readonly string[];
  inputLabel: string;
  onChange: (color: string) => void;
  presets?: readonly string[];
  value: string;
}) {
  const [hsl, setHsl] = React.useState<HslColor>(() => colorToHsl(props.value));
  const [inputValue, setInputValue] = React.useState(() => normalizeColor(props.value));

  React.useEffect(() => {
    const normalized = normalizeColor(props.value);
    setInputValue(normalized);
    setHsl(colorToHsl(normalized));
  }, [props.value]);

  const commitColor = React.useCallback(
    (nextColor: string) => {
      const normalized = normalizeColor(nextColor);
      const nextHsl = colorToHsl(normalized);
      setInputValue(normalized);
      setHsl(nextHsl);
      props.onChange(formatHsl(nextHsl));
    },
    [props],
  );

  const handleHueChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextHsl: HslColor = [Number(event.target.value), hsl[1], hsl[2]];
      setHsl(nextHsl);
      const normalized = formatHsl(nextHsl);
      setInputValue(normalized);
      props.onChange(normalized);
    },
    [hsl, props],
  );

  const handleSurfacePick = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
      const y = Math.min(Math.max(event.clientY - rect.top, 0), rect.height);
      const nextHsl: HslColor = [
        hsl[0],
        Math.round((x / rect.width) * 100),
        Math.round(100 - (y / rect.height) * 100),
      ];
      setHsl(nextHsl);
      const normalized = formatHsl(nextHsl);
      setInputValue(normalized);
      props.onChange(normalized);
    },
    [hsl, props],
  );

  const handleInputChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextValue = event.target.value;
      setInputValue(nextValue);
      if (HEX_PATTERN.test(nextValue) || HSL_PATTERN.test(nextValue)) {
        commitColor(nextValue);
      }
    },
    [commitColor],
  );

  const previewColor = React.useMemo(() => formatHsl(hsl), [hsl]);
  const presets = props.presets ?? [];
  const customColors = props.customColors ?? [];

  return (
    <div className="space-y-3">
      <motion.div
        className="relative h-32 w-full cursor-crosshair overflow-hidden rounded-lg border border-border/70"
        style={{
          background: `linear-gradient(to top, rgb(0 0 0), transparent), linear-gradient(to right, rgb(255 255 255), transparent), hsl(${hsl[0]} 100% 50%)`,
        }}
        onClick={handleSurfacePick}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.16 }}
      >
        <motion.div
          className="absolute size-4 rounded-full border-2 border-white shadow-sm"
          style={{
            backgroundColor: previewColor,
            left: `${hsl[1]}%`,
            top: `${100 - hsl[2]}%`,
            translateX: "-50%",
            translateY: "-50%",
          }}
        />
      </motion.div>

      <input
        type="range"
        min="0"
        max="360"
        value={hsl[0]}
        onChange={handleHueChange}
        aria-label="Hue"
        className="h-2.5 w-full cursor-pointer appearance-none rounded-full"
        style={{
          background:
            "linear-gradient(to right, hsl(0 100% 50%), hsl(60 100% 50%), hsl(120 100% 50%), hsl(180 100% 50%), hsl(240 100% 50%), hsl(300 100% 50%), hsl(360 100% 50%))",
        }}
      />

      <div className="flex items-center gap-2">
        <Input
          aria-label={props.inputLabel}
          value={inputValue}
          onChange={handleInputChange}
          placeholder="#3B82F6 or hsl(217, 91%, 60%)"
          className="h-9"
        />
        <div
          className="size-9 shrink-0 rounded-md border border-border/70 shadow-sm"
          style={{ backgroundColor: previewColor }}
        />
      </div>

      {customColors.length > 0 ? (
        <div className="grid grid-cols-8 gap-2">
          {customColors.map((color) => {
            const normalized = normalizeColor(color);
            const active = normalizeColor(props.value) === normalized;

            return (
              <button
                key={color}
                type="button"
                className={cn(
                  "relative size-7 rounded-full border border-border/70 shadow-sm transition-transform hover:scale-105",
                  active && "ring-2 ring-primary/60 ring-offset-2 ring-offset-background",
                )}
                style={{ backgroundColor: normalized }}
                onClick={() => commitColor(normalized)}
              >
                {active ? (
                  <CheckIcon className="absolute inset-0 m-auto size-3.5 text-white drop-shadow" />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {presets.length > 0 ? (
        <div className="grid grid-cols-8 gap-2">
          {presets.map((preset) => {
            const active = normalizeColor(props.value) === normalizeColor(preset);

            return (
              <button
                key={preset}
                type="button"
                className={cn(
                  "relative size-7 rounded-full border border-border/70 shadow-sm transition-transform hover:scale-105",
                  active && "ring-2 ring-primary/60 ring-offset-2 ring-offset-background",
                )}
                style={{ backgroundColor: preset }}
                onClick={() => commitColor(preset)}
              >
                {active ? (
                  <CheckIcon className="absolute inset-0 m-auto size-3.5 text-white drop-shadow" />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

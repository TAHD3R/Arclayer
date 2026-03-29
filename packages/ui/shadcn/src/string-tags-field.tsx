"use client";

import * as React from "react";
import { X } from "lucide-react";

import { cn } from "@arclayer/lib/utils";

import { Button } from "./button";

type StringTagsFieldProps = {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  id?: string;
  separators?: RegExp;
  normalizeValue?: (value: string) => string;
};

const DEFAULT_SEPARATORS = /[\s,;，；\t\n]+/g;

function splitTokens(raw: string, separators: RegExp, normalizeValue: (value: string) => string) {
  return raw
    .split(separators)
    .map((item) => normalizeValue(item))
    .filter(Boolean);
}

function mergeValues(current: string[], nextTokens: string[]) {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const value of [...current, ...nextTokens]) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    merged.push(normalized);
  }

  return merged;
}

export function StringTagsField({
  value,
  onChange,
  placeholder,
  disabled = false,
  autoFocus = false,
  id,
  separators = DEFAULT_SEPARATORS,
  normalizeValue = (item) => item.trim(),
}: StringTagsFieldProps) {
  const [draft, setDraft] = React.useState("");

  const commitDraft = React.useCallback(
    (rawValue: string) => {
      const nextTokens = splitTokens(rawValue, separators, normalizeValue);
      if (!nextTokens.length) return false;
      onChange(mergeValues(value, nextTokens));
      setDraft("");
      return true;
    },
    [normalizeValue, onChange, separators, value],
  );

  return (
    <div
      className={cn(
        "flex min-h-10 flex-wrap items-center gap-1 rounded-md border border-input bg-card px-2 py-1.5 transition-[color,box-shadow]",
        "focus-within:border-ring focus-within:ring-ring/20 focus-within:ring-[3px]",
        disabled ? "cursor-not-allowed opacity-60" : undefined,
      )}
    >
      {value.map((item) => (
        <span
          key={item}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-1 text-footnote"
        >
          <span>{item}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="size-4 text-label-secondary hover:text-label-primary"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onChange(value.filter((current) => current !== item));
            }}
            disabled={disabled}
            aria-label={`Remove ${item}`}
          >
            <X className="size-3" />
          </Button>
        </span>
      ))}

      <input
        id={id}
        value={draft}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={value.length ? undefined : placeholder}
        className="min-w-32 flex-1 bg-transparent px-1 py-1 text-footnote outline-none placeholder:text-label-secondary disabled:cursor-not-allowed"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          void commitDraft(draft);
        }}
        onPaste={(event) => {
          const pasted = event.clipboardData.getData("text");
          if (!pasted) return;
          if (!separators.test(pasted)) return;
          separators.lastIndex = 0;
          event.preventDefault();
          void commitDraft(pasted);
        }}
        onKeyDown={(event) => {
          if (disabled) return;

          if (event.key === "Backspace" && !draft && value.length) {
            event.preventDefault();
            onChange(value.slice(0, -1));
            return;
          }

          if (!["Enter", "Tab", ",", ";", " ", "，", "；"].includes(event.key)) return;
          if (!draft.trim()) return;
          event.preventDefault();
          void commitDraft(draft);
        }}
      />
    </div>
  );
}

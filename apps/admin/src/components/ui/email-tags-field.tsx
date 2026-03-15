"use client";

import * as React from "react";

import { cn } from "@celestial/lib/utils";

import { Tooltip, TooltipContent, TooltipTrigger } from "@celestial/ui/tooltip";
import { EmailInputTag } from "@/components/ui/tags";

type EmailTagsFieldProps = {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  id?: string;
  invalidMessageByValue?: Map<string, string>;
};

function splitEmailTokens(input: string): string[] {
  return input
    .split(/[\s,;，；\t\n]+/g)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function mergeEmailValues(current: string[], nextTokens: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const value of [...current, ...nextTokens]) {
    const normalized = value.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    merged.push(normalized);
  }

  return merged;
}

export function EmailTagsField({
  value,
  onChange,
  placeholder,
  disabled = false,
  autoFocus = false,
  id,
  invalidMessageByValue,
}: EmailTagsFieldProps) {
  const [draft, setDraft] = React.useState("");

  const commitDraft = React.useCallback(
    (rawValue: string) => {
      const nextTokens = splitEmailTokens(rawValue);
      if (!nextTokens.length) return false;
      onChange(mergeEmailValues(value, nextTokens));
      setDraft("");
      return true;
    },
    [onChange, value],
  );

  return (
    <div
      className={cn(
        "flex min-h-10 flex-wrap items-center gap-1 rounded-md border border-input bg-background px-2 py-1.5 shadow-xs transition-[color,box-shadow]",
        "focus-within:border-ring focus-within:ring-ring/20 focus-within:ring-[3px]",
        disabled ? "cursor-not-allowed opacity-60" : undefined,
      )}
    >
      {value.map((item) => {
        const message = invalidMessageByValue?.get(item) ?? null;
        const tag = (
          <EmailInputTag
            invalid={Boolean(message)}
            closable={!disabled}
            onClose={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onChange(value.filter((current) => current !== item));
            }}
            className="!mr-0"
            label={item}
          />
        );

        return message ? (
          <Tooltip key={item}>
            <TooltipTrigger asChild>{tag}</TooltipTrigger>
            <TooltipContent>{message}</TooltipContent>
          </Tooltip>
        ) : (
          <React.Fragment key={item}>{tag}</React.Fragment>
        );
      })}

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
          if (!/[\s,;，；\t\n]/.test(pasted)) return;
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

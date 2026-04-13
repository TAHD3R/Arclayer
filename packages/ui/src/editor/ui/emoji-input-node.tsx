"use client";

import * as React from "react";

import emojiData from "@emoji-mart/data";
import type { Emoji } from "@emoji-mart/data";
import { insertEmoji } from "@platejs/emoji";
import type { TComboboxInputElement } from "platejs";
import type { PlateElementProps } from "platejs/react";
import { PlateElement } from "platejs/react";
import { useTranslation } from "react-i18next";

import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxGroup,
  InlineComboboxGroupLabel,
  InlineComboboxInput,
  InlineComboboxItem,
} from "./inline-combobox";

type EmojiOption = {
  emoji: Emoji;
  id: string;
  keywords: string[];
  label: string;
  native: string;
};

const DEFAULT_EMOJI_IDS = [
  "grinning",
  "thinking_face",
  "thumbsup",
  "sparkles",
  "rocket",
  "fire",
  "heart",
  "white_check_mark",
] as const;

const emojiCatalog = emojiData as { emojis: Record<string, Emoji> };

const EMOJI_OPTIONS = Object.values(emojiCatalog.emojis)
  .map((emoji) => ({
    emoji,
    id: emoji.id,
    keywords: [...(emoji.keywords ?? []), ...(emoji.emoticons ?? [])],
    label: emoji.name,
    native: emoji.skins[0]?.native ?? "",
  }))
  .filter((emoji) => emoji.native.length > 0);

const DEFAULT_EMOJI_OPTIONS = DEFAULT_EMOJI_IDS.map((id) =>
  EMOJI_OPTIONS.find((emoji) => emoji.id === id),
).filter((emoji): emoji is EmojiOption => Boolean(emoji));

function filterEmojiOptions(query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return DEFAULT_EMOJI_OPTIONS;

  return EMOJI_OPTIONS.filter((emoji) => {
    const haystack = [emoji.id, emoji.label, ...emoji.keywords].join(" ").toLowerCase();
    return haystack.includes(normalizedQuery);
  }).slice(0, 12);
}

export function EmojiInputElement(props: PlateElementProps<TComboboxInputElement>) {
  const { t } = useTranslation("content");
  const [query, setQuery] = React.useState("");
  const items = React.useMemo(() => filterEmojiOptions(query), [query]);

  return (
    <PlateElement {...props} as="span">
      <InlineCombobox
        element={props.element}
        trigger=":"
        filter={false}
        value={query}
        setValue={setQuery}
      >
        <InlineComboboxInput placeholder={t("CONTENT_LIBRARY_EDITOR_EMOJI_SEARCH_PLACEHOLDER")} />

        <InlineComboboxContent className="w-[20rem] rounded-md border border-border bg-popover p-2">
          <InlineComboboxEmpty className="h-9 rounded-md px-3 text-label-secondary">
            {t("CONTENT_LIBRARY_EDITOR_EMOJI_EMPTY")}
          </InlineComboboxEmpty>

          <InlineComboboxGroup>
            <InlineComboboxGroupLabel className="px-3 pb-1 text-caption font-semibold text-label-secondary">
              {t("CONTENT_LIBRARY_EDITOR_INSERT_EMOJI")}
            </InlineComboboxGroupLabel>

            {items.map((item) => (
              <InlineComboboxItem
                key={item.id}
                value={item.id}
                label={item.label}
                keywords={item.keywords}
                className="h-auto items-start gap-3 rounded-md px-3 py-2.5"
                onClick={() => insertEmoji(props.editor, item.emoji)}
              >
                <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border/70 bg-muted/20 text-lg">
                  {item.native}
                </div>
                <div className="min-w-0 space-y-0.5">
                  <div className="text-footnote font-semibold text-label-primary">{item.label}</div>
                  <div className="text-footnote text-label-secondary">:{item.id}:</div>
                </div>
              </InlineComboboxItem>
            ))}
          </InlineComboboxGroup>
        </InlineComboboxContent>
      </InlineCombobox>

      {props.children}
    </PlateElement>
  );
}

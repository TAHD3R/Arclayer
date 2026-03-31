"use client";

import type { PlateElementProps } from "platejs/react";

import { PlateElement } from "platejs/react";
import { useTranslation } from "react-i18next";
import type { TComboboxInputElement } from "platejs";

import {
  applyArticleEditorInsertItem,
  getArticleEditorInsertGroups,
} from "../article-editor-insert-items";
import { useArticleEditorCommands } from "../article-editor-command-context";

import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxGroup,
  InlineComboboxGroupLabel,
  InlineComboboxInput,
  InlineComboboxItem,
} from "./inline-combobox";

export function SlashInputElement(props: PlateElementProps<TComboboxInputElement>) {
  const { t } = useTranslation("content");
  const commands = useArticleEditorCommands();
  const groups = getArticleEditorInsertGroups(t);

  return (
    <PlateElement {...props} as="span">
      <InlineCombobox element={props.element} trigger="/">
        <InlineComboboxInput placeholder={t("CONTENT_LIBRARY_EDITOR_SLASH_SEARCH_PLACEHOLDER")} />

        <InlineComboboxContent className="w-[22rem] rounded-md border border-border bg-popover p-2">
          <InlineComboboxEmpty className="h-9 rounded-md px-3 text-label-secondary">
            {t("CONTENT_LIBRARY_EDITOR_INSERT_EMPTY")}
          </InlineComboboxEmpty>

          {groups.map((group) => (
            <InlineComboboxGroup key={group.id}>
              <InlineComboboxGroupLabel className="px-3 pb-1 text-caption font-semibold text-label-secondary">
                {group.label}
              </InlineComboboxGroupLabel>

              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <InlineComboboxItem
                    key={item.value}
                    value={item.value}
                    group={group.id}
                    label={item.label}
                    keywords={item.keywords}
                    className="h-auto items-start gap-3 rounded-md px-3 py-2.5"
                    onClick={() =>
                      commands?.insertItem
                        ? commands.insertItem(props.editor, item.value)
                        : applyArticleEditorInsertItem(props.editor, item.value)
                    }
                  >
                    <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-border/70 bg-muted/20 text-label-secondary">
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <div className="text-footnote font-semibold text-label-primary">
                        {item.label}
                      </div>
                      <div className="text-footnote text-label-secondary">{item.description}</div>
                    </div>
                  </InlineComboboxItem>
                );
              })}
            </InlineComboboxGroup>
          ))}
        </InlineComboboxContent>
      </InlineCombobox>

      {props.children}
    </PlateElement>
  );
}

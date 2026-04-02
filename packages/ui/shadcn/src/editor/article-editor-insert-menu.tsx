"use client";

import * as React from "react";

import { SearchIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Input } from "@arclayer/ui/input";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuItemContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  type DropdownMenuContentProps,
} from "@arclayer/ui/dropdown-menu";
import { cn } from "@arclayer/lib/utils";

import {
  filterArticleEditorInsertGroups,
  type ArticleEditorInsertGroup,
} from "./article-editor-insert-groups";

type ArticleEditorInsertMenuContentProps = Omit<DropdownMenuContentProps, "children"> & {
  groups: ArticleEditorInsertGroup[];
  onSelectItem: (value: string) => void;
};

export function ArticleEditorInsertMenuContent({
  className,
  groups,
  onCloseAutoFocus,
  onSelectItem,
  ...props
}: ArticleEditorInsertMenuContentProps) {
  const { t } = useTranslation("content");
  const [query, setQuery] = React.useState("");

  const filteredGroups = React.useMemo(
    () => filterArticleEditorInsertGroups(groups, query),
    [groups, query],
  );

  return (
    <DropdownMenuContent
      className={cn("w-[16rem] rounded-md border border-border/70 p-0", className)}
      onCloseAutoFocus={(event) => {
        setQuery("");
        onCloseAutoFocus?.(event);
      }}
      {...props}
    >
      <div className="border-b border-border/70">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-label-tertiary" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("CONTENT_LIBRARY_EDITOR_SLASH_SEARCH_PLACEHOLDER")}
            className="h-9 border-0 bg-transparent pl-9 pr-3 focus-visible:ring-0"
          />
        </div>
      </div>

      <div className="max-h-[22rem] overflow-y-auto p-1">
        {filteredGroups.length === 0 ? (
          <div className="rounded-md px-3 py-2 text-footnote text-label-secondary">
            {t("CONTENT_LIBRARY_EDITOR_INSERT_EMPTY")}
          </div>
        ) : (
          filteredGroups.map((group, index) => (
            <React.Fragment key={group.id}>
              {index > 0 ? <DropdownMenuSeparator /> : null}
              <DropdownMenuLabel className="text-callout! text-label-secondary">
                {group.label}
              </DropdownMenuLabel>
              {group.items.map((item) => {
                const Icon = item.icon;

                return (
                  <DropdownMenuItem key={item.value} onSelect={() => onSelectItem(item.value)}>
                    <DropdownMenuItemContent icon={<Icon className="size-4" />}>
                      {item.label}
                    </DropdownMenuItemContent>
                  </DropdownMenuItem>
                );
              })}
            </React.Fragment>
          ))
        )}
      </div>
    </DropdownMenuContent>
  );
}

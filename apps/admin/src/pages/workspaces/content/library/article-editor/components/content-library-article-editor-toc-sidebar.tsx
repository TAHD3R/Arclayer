"use client";

import * as React from "react";

import { ListTree } from "lucide-react";
import { useTocSideBar, useTocSideBarState } from "@platejs/toc/react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import { cn } from "@arclayer/lib/utils";

type TocHeading = {
  depth: number;
  id: string;
  path: number[];
  title: string;
  type: string;
};

function getHeadingIndent(depth: number, compact: boolean) {
  if (depth >= 3) return compact ? "pl-4" : "pl-5";
  if (depth === 2) return compact ? "pl-2.5" : "pl-3.5";
  return "pl-0";
}

function TocList(props: {
  activeContentId: string;
  compact?: boolean;
  headingList: TocHeading[];
  onContentClick: (
    event: React.MouseEvent<HTMLElement>,
    item: TocHeading,
    behavior?: ScrollBehavior,
  ) => void;
  variant: "page" | "split";
}) {
  const { t } = useTranslation("content");

  if (props.headingList.length === 0) {
    return (
      <div
        className={cn(
          props.variant === "page"
            ? "py-2 text-footnote text-label-tertiary"
            : "px-2 py-3 text-caption text-label-secondary",
        )}
      >
        {t("CONTENT_LIBRARY_EDITOR_TOC_EMPTY")}
      </div>
    );
  }

  return (
    <div className={cn("space-y-0.5", props.variant === "page" ? "space-y-1" : "space-y-0.5")}>
      {props.headingList.map((item) => {
        const active = props.activeContentId === item.id;

        return (
          <Button
            key={item.id}
            type="button"
            variant="ghost"
            className={cn(
              "h-auto w-full justify-start text-left",
              props.variant === "page"
                ? "rounded-lg px-0 py-1.5 text-footnote font-medium text-label-secondary hover:bg-transparent hover:text-label-primary"
                : "rounded-md px-2 py-1.5 text-caption font-medium text-label-secondary hover:bg-accent/60 hover:text-label-primary",
              getHeadingIndent(item.depth, props.compact ?? false),
            )}
            onClick={(event) => props.onContentClick(event, item, "smooth")}
          >
            <span className="flex min-w-0 items-start gap-2">
              <span
                className={cn(
                  "mt-[0.2rem] h-3.5 w-0.5 shrink-0 rounded-full transition-colors",
                  active
                    ? "bg-primary/80"
                    : props.variant === "page"
                      ? "bg-border/70"
                      : "bg-transparent",
                )}
              />
              <span className={cn("block min-w-0 truncate", active && "text-label-primary")}>
                {item.title}
              </span>
            </span>
          </Button>
        );
      })}
    </div>
  );
}

export function ContentLibraryArticleEditorTocSidebar(props: { mode: "page" | "split" }) {
  const { t } = useTranslation("content");
  const sidebarState = useTocSideBarState({
    open: true,
    rootMargin: props.mode === "page" ? "-132px 0px -65% 0px" : "-88px 0px -65% 0px",
    topOffset: props.mode === "page" ? 28 : 12,
  }) as {
    activeContentId: string;
    headingList: TocHeading[];
    open: boolean;
  };
  const { navProps, onContentClick } = useTocSideBar(sidebarState);

  if (props.mode === "page") {
    return (
      <aside className="sticky top-6 hidden w-58 shrink-0 self-start xl:block">
        <nav {...navProps} className="space-y-3">
          <div className="flex items-center gap-2 text-callout font-semibold">
            <ListTree className="size-4" />
            {t("CONTENT_LIBRARY_EDITOR_INSERT_TOC")}
          </div>
          <TocList
            activeContentId={sidebarState.activeContentId}
            headingList={sidebarState.headingList}
            onContentClick={onContentClick}
            variant="page"
          />
        </nav>
      </aside>
    );
  }

  return (
    <div className="group/toc pointer-events-auto relative flex items-start justify-end">
      <div className="pointer-events-none absolute right-11 top-0 z-20 translate-x-1 opacity-0 transition-all duration-150 group-hover/toc:pointer-events-auto group-hover/toc:translate-x-0 group-hover/toc:opacity-100 group-focus-within/toc:pointer-events-auto group-focus-within/toc:translate-x-0 group-focus-within/toc:opacity-100">
        <nav
          {...navProps}
          className="w-52 rounded-xl border border-border/70 bg-card/96 p-2 shadow-lg backdrop-blur"
        >
          <div className="flex items-center gap-2 text-callout font-semibold">
            <ListTree className="size-4" />
            {t("CONTENT_LIBRARY_EDITOR_INSERT_TOC")}
          </div>
          <TocList
            compact
            activeContentId={sidebarState.activeContentId}
            headingList={sidebarState.headingList}
            onContentClick={onContentClick}
            variant="split"
          />
        </nav>
      </div>

      <Button
        type="button"
        variant="secondary"
        size="icon-sm"
        className="size-8 rounded-full border border-border/70 bg-card/92 shadow-sm backdrop-blur"
      >
        <ListTree className="size-4" />
        <span className="sr-only">{t("CONTENT_LIBRARY_EDITOR_TOC_TOGGLE")}</span>
      </Button>
    </div>
  );
}

"use client";

import * as React from "react";

import { useTocSideBar, useTocSideBarState } from "@platejs/toc/react";
import { useTranslation } from "react-i18next";

import { cn } from "@arclayer/lib/utils";

type TocHeading = {
  depth: number;
  id: string;
  path: number[];
  title: string;
  type: string;
};

function getHeadingIndent(depth: number, variant: "page" | "split") {
  if (depth >= 3) return variant === "page" ? "pl-8" : "pl-6";
  if (depth === 2) return variant === "page" ? "pl-5" : "pl-3";
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
          <button
            key={item.id}
            type="button"
            aria-current={active ? "location" : undefined}
            className={cn(
              "flex h-auto w-full items-start justify-start rounded-lg text-left transition-colors",
              props.variant === "page"
                ? "gap-2 px-2 py-1.5 text-footnote font-medium text-label-secondary hover:bg-accent/50 hover:text-label-primary"
                : "rounded-md px-2 py-1.5 text-caption font-medium text-label-secondary hover:bg-accent/60 hover:text-label-primary",
              active &&
                (props.variant === "page"
                  ? "bg-accent/65 text-label-primary"
                  : "bg-accent/70 text-label-primary"),
              getHeadingIndent(item.depth, props.variant),
            )}
            onClick={(event) => props.onContentClick(event, item, "smooth")}
          >
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full transition-colors",
                  active
                    ? "bg-primary/85"
                    : props.variant === "page"
                      ? "bg-border/80"
                      : "bg-border/60",
                )}
              />
              <span className={cn("block min-w-0 truncate", active && "text-label-primary")}>
                {item.title}
              </span>
            </span>
          </button>
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
          <div className="px-2 text-callout font-semibold text-label-primary">
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
    <aside className="group/toc pointer-events-auto relative z-10 mr-2.5 flex flex-col justify-center pr-2 pb-3">
      <button
        type="button"
        aria-label={t("CONTENT_LIBRARY_EDITOR_INSERT_TOC")}
        className="flex flex-col gap-3 pb-3 pl-5"
      >
        <span className="block">
          <span className="block h-0.5 w-4 rounded-xs bg-primary" />
        </span>
        <span className="block">
          <span className="ml-1 block h-0.5 w-3 rounded-xs bg-primary/20" />
        </span>
        <span className="block">
          <span className="ml-2 block h-0.5 w-2 rounded-xs bg-primary/20" />
        </span>
        <span className="block">
          <span className="ml-1 block h-0.5 w-3 rounded-xs bg-primary/20" />
        </span>
        <span className="sr-only">{t("CONTENT_LIBRARY_EDITOR_INSERT_TOC")}</span>
      </button>

      <nav
        {...navProps}
        className="-top-2.5 pointer-events-none absolute right-0 translate-x-[10px] px-2.5 opacity-0 transition-all duration-300 group-hover/toc:pointer-events-auto group-hover/toc:translate-x-0 group-hover/toc:opacity-100 group-focus-within/toc:pointer-events-auto group-focus-within/toc:translate-x-0 group-focus-within/toc:opacity-100"
      >
        <div className="-mr-2.5 max-h-96 w-[242px] overflow-auto rounded-2xl border border-border/70 bg-card/96 p-3 backdrop-blur">
          <div className="relative z-10 p-1.5">
            <div className="px-1 py-1 text-sm font-semibold text-label-primary">
              {t("CONTENT_LIBRARY_EDITOR_INSERT_TOC")}
            </div>
            <TocList
              compact
              activeContentId={sidebarState.activeContentId}
              headingList={sidebarState.headingList}
              onContentClick={onContentClick}
              variant="split"
            />
          </div>
        </div>
      </nav>
    </aside>
  );
}

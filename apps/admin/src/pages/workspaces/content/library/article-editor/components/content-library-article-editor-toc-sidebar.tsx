"use client";

import * as React from "react";

import { ListTree, PanelRightClose, PanelRightOpen } from "lucide-react";
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

function getHeadingIndent(depth: number) {
  if (depth >= 3) return "pl-5";
  if (depth === 2) return "pl-3";
  return "pl-2";
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
}) {
  const { t } = useTranslation("content");

  if (props.headingList.length === 0) {
    return (
      <div className="px-2 py-3 text-footnote text-label-secondary">
        {t("CONTENT_LIBRARY_EDITOR_TOC_EMPTY")}
      </div>
    );
  }

  return (
    <div className={cn("space-y-1", props.compact && "space-y-0.5")}>
      {props.headingList.map((item) => (
        <Button
          key={item.id}
          type="button"
          variant="ghost"
          className={cn(
            "h-auto w-full justify-start rounded-md px-2 py-1.5 text-left text-footnote font-medium text-label-secondary hover:bg-accent/60 hover:text-label-primary",
            getHeadingIndent(item.depth),
            props.compact && "py-1 text-caption",
            props.activeContentId === item.id &&
              "bg-accent/60 text-label-primary ring-1 ring-border/60",
          )}
          onClick={(event) => props.onContentClick(event, item, "smooth")}
        >
          <span className="block w-full truncate">{item.title}</span>
        </Button>
      ))}
    </div>
  );
}

export function ContentLibraryArticleEditorTocSidebar(props: { mode: "page" | "split" }) {
  const { t } = useTranslation("content");
  const [splitOpen, setSplitOpen] = React.useState(false);
  const open = props.mode === "page" ? true : splitOpen;
  const sidebarState = useTocSideBarState({
    open,
    rootMargin: props.mode === "page" ? "-128px 0px -65% 0px" : "-88px 0px -65% 0px",
    topOffset: props.mode === "page" ? 28 : 12,
  }) as {
    activeContentId: string;
    headingList: TocHeading[];
    open: boolean;
  };
  const { navProps, onContentClick } = useTocSideBar(sidebarState);

  if (props.mode === "page") {
    return (
      <aside className="w-[16rem] shrink-0">
        <nav
          {...navProps}
          className="sticky top-6 rounded-xl border border-border/70 bg-card/92 p-3 shadow-sm backdrop-blur"
        >
          <div className="mb-3 flex items-center gap-2 px-2 text-footnote font-semibold text-label-primary">
            <ListTree className="size-4" />
            {t("CONTENT_LIBRARY_EDITOR_INSERT_TOC")}
          </div>
          <TocList
            activeContentId={sidebarState.activeContentId}
            headingList={sidebarState.headingList}
            onContentClick={onContentClick}
          />
        </nav>
      </aside>
    );
  }

  return (
    <div className="pointer-events-auto flex items-start justify-end">
      <div className="flex items-start gap-2">
        {splitOpen ? (
          <nav
            {...navProps}
            className="w-[13rem] rounded-xl border border-border/70 bg-card/94 p-2.5 shadow-lg backdrop-blur"
          >
            <div className="mb-2 flex items-center justify-between gap-2 px-1.5">
              <div className="flex items-center gap-2 text-caption font-semibold text-label-primary">
                <ListTree className="size-3.5" />
                {t("CONTENT_LIBRARY_EDITOR_INSERT_TOC")}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-7"
                onClick={() => setSplitOpen(false)}
              >
                <PanelRightClose className="size-4" />
                <span className="sr-only">{t("CONTENT_LIBRARY_EDITOR_TOC_TOGGLE")}</span>
              </Button>
            </div>
            <TocList
              compact
              activeContentId={sidebarState.activeContentId}
              headingList={sidebarState.headingList}
              onContentClick={onContentClick}
            />
          </nav>
        ) : null}

        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          className="size-8 rounded-full border border-border/70 bg-card/92 shadow-sm backdrop-blur"
          onClick={() => setSplitOpen((current) => !current)}
        >
          {splitOpen ? (
            <PanelRightClose className="size-4" />
          ) : (
            <PanelRightOpen className="size-4" />
          )}
          <span className="sr-only">{t("CONTENT_LIBRARY_EDITOR_TOC_TOGGLE")}</span>
        </Button>
      </div>
    </div>
  );
}

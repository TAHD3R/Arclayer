import * as React from "react";
import { Maximize2, MoreHorizontal, PanelRightClose } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { Input } from "@arclayer/ui/input";
import { Textarea } from "@arclayer/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@arclayer/ui/tooltip";
import { cn } from "@arclayer/lib/utils";

type ContentLibraryArticleEditorShellProps = {
  mode: "split" | "page";
  title: string;
  summary: string;
  onTitleChange: (value: string) => void;
  onSummaryChange: (value: string) => void;
  onClose?: () => void;
  onOpenPage?: () => void;
  className?: string;
};

function ToolbarIconButton(props: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild focusTrigger={false}>
        <Button type="button" variant="ghost" size="icon-sm" onClick={props.onClick}>
          {props.children}
          <span className="sr-only">{props.label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{props.label}</TooltipContent>
    </Tooltip>
  );
}

export function ContentLibraryArticleEditorShell(props: ContentLibraryArticleEditorShellProps) {
  const { t } = useTranslation(["content", "common"]);

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-background", props.className)}>
      <TooltipProvider>
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/70 bg-background px-3">
          <div className="flex items-center gap-1">
            {props.mode === "split" && props.onClose ? (
              <ToolbarIconButton
                label={t("CONTENT_LIBRARY_ACTION_CLOSE_SIDEBAR_PREVIEW")}
                onClick={props.onClose}
              >
                <PanelRightClose className="size-4" />
              </ToolbarIconButton>
            ) : null}
            {props.mode === "split" && props.onOpenPage ? (
              <ToolbarIconButton
                label={t("CONTENT_LIBRARY_ACTION_OPEN_PAGE_EDITOR")}
                onClick={props.onOpenPage}
              >
                <Maximize2 className="size-4" />
              </ToolbarIconButton>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <div className="text-callout text-label-secondary">
              {t("CONTENT_LIBRARY_EDITOR_SAVE_STATE_IDLE")}
            </div>
            <Button type="button" variant="outline" size="sm" disabled>
              {t("CONTENT_LIBRARY_ACTION_PUBLISH")}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("CONTENT_LIBRARY_EDITOR_DOCUMENT_MENU")}
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>{t("CONTENT_LIBRARY_EDITOR_DOCUMENT_MENU")}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled>
                  {t("CONTENT_LIBRARY_EDITOR_MENU_STATUS")}
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  {t("CONTENT_LIBRARY_EDITOR_MENU_VISIBILITY")}
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  {t("CONTENT_LIBRARY_EDITOR_MENU_SLUG")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled>{t("CONTENT_LIBRARY_EDITOR_MENU_SEO")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </TooltipProvider>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col px-10 py-12">
          <div className="group/header space-y-5">
            <div className="flex h-7 items-center gap-3 text-callout text-label-secondary opacity-0 transition-opacity duration-150 group-hover/header:opacity-100">
              <button type="button" className="hover:text-foreground">
                {t("CONTENT_LIBRARY_EDITOR_ADD_ICON")}
              </button>
              <button type="button" className="hover:text-foreground">
                {t("CONTENT_LIBRARY_EDITOR_ADD_COVER")}
              </button>
            </div>

            <Input
              value={props.title}
              onChange={(event) => props.onTitleChange(event.target.value)}
              placeholder={t("CONTENT_LIBRARY_EDITOR_TITLE_PLACEHOLDER")}
              className="h-auto border-none bg-transparent px-0 text-[3.25rem] font-semibold tracking-[-0.04em] text-foreground shadow-none placeholder:text-label-tertiary focus-visible:ring-0"
            />

            <Textarea
              value={props.summary}
              onChange={(event) => props.onSummaryChange(event.target.value)}
              placeholder={t("CONTENT_LIBRARY_EDITOR_SUMMARY_PLACEHOLDER")}
              className="min-h-0 resize-none border-none bg-transparent px-0 text-lg leading-8 text-label-secondary shadow-none placeholder:text-label-tertiary focus-visible:ring-0"
              rows={2}
            />
          </div>

          <div className="mt-8 flex min-h-0 flex-1 flex-col">
            <div className="rounded-xl border border-transparent px-3 py-2 text-lg text-foreground transition-colors hover:border-border/60 hover:bg-accent/15">
              {t("CONTENT_LIBRARY_EDITOR_BODY_PLACEHOLDER")}
            </div>
            <div className="mt-3 text-callout text-label-secondary">
              {t("CONTENT_LIBRARY_EDITOR_BODY_HINT")}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import * as React from "react";

import {
  flip,
  offset,
  shift,
  useFloatingToolbar,
  useFloatingToolbarState,
} from "@platejs/floating";
import {
  FloatingLinkUrlInput,
  LinkOpenButton,
  useFloatingLinkEdit,
  useFloatingLinkEditState,
  useFloatingLinkInsert,
  useFloatingLinkInsertState,
} from "@platejs/link/react";
import {
  BaselineIcon,
  BoldIcon,
  Code2Icon,
  ItalicIcon,
  Link2,
  PaintBucketIcon,
  StrikethroughIcon,
  UnderlineIcon,
} from "lucide-react";
import { useEditorRef } from "platejs/react";
import { useTranslation } from "react-i18next";

import { FontColorToolbarButton } from "../font-color-toolbar-button";
import { InlineEquationToolbarButton } from "../equation-toolbar-button";
import { LinkToolbarButton } from "../link-toolbar-button";
import { MoreToolbarButton } from "../more-toolbar-button";
import { TurnIntoToolbarButton } from "../turn-into-toolbar-button";
import { MarkToolbarButton } from "../ui/mark-toolbar-button";
import { Toolbar, ToolbarGroup } from "../ui/toolbar";
import { Button } from "@arclayer/ui/button";
import { Separator } from "@arclayer/ui/separator";
import { cn } from "@arclayer/lib/utils";

const MARK_COLOR = "color";
const MARK_BACKGROUND_COLOR = "backgroundColor";

type FloatingToolbarRef =
  | ((node: HTMLDivElement | null) => void)
  | React.MutableRefObject<HTMLDivElement | null>;

function assignFloatingToolbarRef(
  target: FloatingToolbarRef | null | undefined,
  node: HTMLDivElement | null,
) {
  if (!target) return;
  if (typeof target === "function") {
    target(node);
    return;
  }
  target.current = node;
}

function PlateLinkFloatingToolbar() {
  const { t } = useTranslation(["content", "common"]);
  const floatingOptions = React.useMemo(
    () => ({
      middleware: [offset(10), flip({ padding: 12 }), shift({ padding: 12 })],
      placement: "bottom-start" as const,
    }),
    [],
  );
  const insertState = useFloatingLinkInsertState({ floatingOptions });
  const insert = useFloatingLinkInsert(insertState) as {
    hidden?: boolean;
    props: React.HTMLAttributes<HTMLDivElement>;
    ref: React.Ref<HTMLDivElement>;
    textInputProps?: React.InputHTMLAttributes<HTMLInputElement>;
  };
  const editState = useFloatingLinkEditState({ floatingOptions });
  const edit = useFloatingLinkEdit(editState) as {
    editButtonProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
    props: React.HTMLAttributes<HTMLDivElement>;
    ref: React.Ref<HTMLDivElement>;
    unlinkButtonProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
  };

  if (insert.hidden) return null;

  return (
    <>
      <div
        ref={insert.ref}
        {...insert.props}
        className={cn(
          "z-50 w-[22rem] rounded-2xl border border-border/70 bg-card/96 p-2  backdrop-blur",
          insert.props.className,
        )}
      >
        <div className="space-y-2">
          <FloatingLinkUrlInput
            className="h-9 w-full rounded-lg border border-border/70 bg-card px-3 text-footnote outline-none"
            placeholder="https://"
            data-plate-focus
          />
          <input
            className="h-9 w-full rounded-lg border border-border/70 bg-card px-3 text-footnote outline-none"
            placeholder={t("CONTENT_LIBRARY_EDITOR_LINK_TEXT")}
            data-plate-focus
            {...insert.textInputProps}
          />
        </div>
      </div>

      <div
        ref={edit.ref}
        {...edit.props}
        className={cn(
          "z-50 flex items-center rounded-2xl border border-border/70 bg-card/96 p-1  backdrop-blur",
          edit.props.className,
        )}
      >
        {editState.isEditing ? (
          <div className="w-[22rem] space-y-2 p-1">
            <FloatingLinkUrlInput
              className="h-9 w-full rounded-lg border border-border/70 bg-card px-3 text-footnote outline-none"
              placeholder="https://"
              data-plate-focus
            />
          </div>
        ) : (
          <>
            <button
              type="button"
              className="inline-flex h-8 items-center rounded-lg px-3 text-footnote transition-colors hover:bg-accent"
              {...edit.editButtonProps}
            >
              {t("CONTENT_LIBRARY_EDITOR_MARK_LINK")}
            </button>
            <Separator orientation="vertical" className="mx-0.5 h-6" />
            <LinkOpenButton asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t("CONTENT_LIBRARY_EDITOR_LINK_OPEN")}
              >
                <Link2 className="size-4" />
              </Button>
            </LinkOpenButton>
            <Separator orientation="vertical" className="mx-0.5 h-6" />
            <button
              type="button"
              className="inline-flex h-8 items-center rounded-lg px-3 text-footnote transition-colors hover:bg-accent"
              {...edit.unlinkButtonProps}
            >
              {t("CONTENT_LIBRARY_EDITOR_LINK_REMOVE")}
            </button>
          </>
        )}
      </div>
    </>
  );
}

export function PlateFloatingToolbar() {
  const { t } = useTranslation("content");
  const editor = useEditorRef();
  const state = useFloatingToolbarState({
    editorId: editor.id,
    floatingOptions: {
      middleware: [offset(10), flip(), shift({ padding: 12 })],
      placement: "top",
    },
    focusedEditorId: editor.id,
  });
  const { clickOutsideRef, hidden, props, ref } = useFloatingToolbar(state);

  const setRefs = React.useCallback(
    (node: HTMLDivElement | null) => {
      assignFloatingToolbarRef(ref, node);
      assignFloatingToolbarRef(clickOutsideRef as FloatingToolbarRef, node);
    },
    [clickOutsideRef, ref],
  );

  if (hidden) return null;

  return (
    <>
      <div
        ref={setRefs}
        style={props.style}
        className="ignore-click-outside/toolbar z-50"
        onMouseDown={(event) => event.preventDefault()}
      >
        <Toolbar className="rounded-2xl border border-border/70 bg-card/95 p-1  backdrop-blur supports-[backdrop-filter]:bg-card/88">
          <ToolbarGroup>
            <TurnIntoToolbarButton />
          </ToolbarGroup>

          <ToolbarGroup>
            <MarkToolbarButton nodeType="bold" tooltip={t("CONTENT_LIBRARY_EDITOR_MARK_BOLD")}>
              <BoldIcon />
            </MarkToolbarButton>
            <MarkToolbarButton nodeType="italic" tooltip={t("CONTENT_LIBRARY_EDITOR_MARK_ITALIC")}>
              <ItalicIcon />
            </MarkToolbarButton>
            <MarkToolbarButton
              nodeType="underline"
              tooltip={t("CONTENT_LIBRARY_EDITOR_MARK_UNDERLINE")}
            >
              <UnderlineIcon />
            </MarkToolbarButton>
            <MarkToolbarButton
              nodeType="strikethrough"
              tooltip={t("CONTENT_LIBRARY_EDITOR_MARK_STRIKETHROUGH")}
            >
              <StrikethroughIcon />
            </MarkToolbarButton>
            <MarkToolbarButton nodeType="code" tooltip={t("CONTENT_LIBRARY_EDITOR_MARK_CODE")}>
              <Code2Icon />
            </MarkToolbarButton>
            <InlineEquationToolbarButton />
            <LinkToolbarButton />
            <FontColorToolbarButton
              nodeType={MARK_COLOR}
              tooltip={t("CONTENT_LIBRARY_EDITOR_MARK_TEXT_COLOR")}
            >
              <BaselineIcon />
            </FontColorToolbarButton>
            <FontColorToolbarButton
              nodeType={MARK_BACKGROUND_COLOR}
              tooltip={t("CONTENT_LIBRARY_EDITOR_MARK_BACKGROUND_COLOR")}
            >
              <PaintBucketIcon />
            </FontColorToolbarButton>
          </ToolbarGroup>

          <ToolbarGroup>
            <MoreToolbarButton />
          </ToolbarGroup>
        </Toolbar>
      </div>
      <PlateLinkFloatingToolbar />
    </>
  );
}

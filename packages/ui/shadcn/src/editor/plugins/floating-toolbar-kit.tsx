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
  LinkPlugin,
  submitFloatingLink,
  useFloatingLinkEdit,
  useFloatingLinkEditState,
  useFloatingLinkInsert,
  useFloatingLinkInsertState,
} from "@platejs/link/react";
import {
  BaselineIcon,
  BoldIcon,
  Code2Icon,
  ExternalLink,
  ItalicIcon,
  Link2,
  Link2Off,
  PaintBucketIcon,
  Rows3,
  StrikethroughIcon,
  UnderlineIcon,
} from "lucide-react";
import { useEditorPlugin, useEditorRef, usePluginOption } from "platejs/react";
import { useTranslation } from "react-i18next";

import { FontColorToolbarButton } from "../font-color-toolbar-button";
import { InlineEquationToolbarButton } from "../equation-toolbar-button";
import { LinkToolbarButton } from "../link-toolbar-button";
import { MoreToolbarButton } from "../more-toolbar-button";
import { TurnIntoToolbarButton } from "../turn-into-toolbar-button";
import { MarkToolbarButton } from "../ui/mark-toolbar-button";
import { Toolbar, ToolbarGroup, ToolbarTooltip } from "../ui/toolbar";
import { captureEditorSelection } from "../transforms";
import { Button } from "@arclayer/ui/button";
import { cn } from "@arclayer/lib/utils";

const MARK_COLOR = "color";
const MARK_BACKGROUND_COLOR = "backgroundColor";
let floatingLinkDraftTextCache = "";

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

function LinkFormRow(props: {
  icon: React.ReactNode;
  children: React.ReactNode;
  bordered?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2.5",
        props.bordered && "border-t border-border/70",
      )}
    >
      <span className="flex size-5 shrink-0 items-center justify-center text-label-secondary">
        {props.icon}
      </span>
      <div className="min-w-0 flex-1">{props.children}</div>
    </div>
  );
}

const LinkFormInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { onSubmit?: () => void }
>(function LinkFormInput(props, ref) {
  return (
    <input
      ref={ref}
      {...props}
      className={cn(
        "h-8 w-full bg-transparent text-footnote outline-none placeholder:text-label-tertiary",
        props.className,
      )}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          props.onSubmit?.();
          return;
        }
        props.onKeyDown?.(event);
      }}
    />
  );
});

function PlateLinkFloatingToolbar() {
  const { t } = useTranslation(["content", "common"]);
  const editor = useEditorRef();
  const { setOption, type } = useEditorPlugin(LinkPlugin);
  const selectionRef = React.useRef(captureEditorSelection(editor));
  const linkUrl = usePluginOption(LinkPlugin, "url") ?? "";
  const editTextInputRef = React.useRef<HTMLInputElement | null>(null);
  const [editTextValue, setEditTextValue] = React.useState(floatingLinkDraftTextCache);
  const wasEditingRef = React.useRef(false);
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

  const submitLink = React.useCallback(() => {
    setOption("text", floatingLinkDraftTextCache);
    submitFloatingLink(editor);
  }, [editor, setOption]);

  const readCurrentLinkText = React.useCallback(() => {
    const entry = editor.api.above({ match: { type } });
    if (!entry) return "";

    return editor.api.string(entry[1]);
  }, [editor, type]);

  const readCurrentLinkUrl = React.useCallback(() => {
    const entry = editor.api.above({ match: { type } });
    if (!entry) return "";

    const linkNode = entry[0] as { url?: unknown };
    return typeof linkNode.url === "string" ? linkNode.url : "";
  }, [editor, type]);

  const currentLinkUrl = readCurrentLinkUrl() || linkUrl;

  React.useEffect(() => {
    if (editState.isEditing && !wasEditingRef.current) {
      const nextText = readCurrentLinkText();
      floatingLinkDraftTextCache = nextText;
      setEditTextValue(nextText);
      setOption("text", nextText);
    }
    if (!editState.isEditing && wasEditingRef.current) {
      const nextText = readCurrentLinkText();
      floatingLinkDraftTextCache = nextText;
      setEditTextValue(nextText);
    }
    wasEditingRef.current = editState.isEditing;
  }, [editState.isEditing, readCurrentLinkText, setOption]);

  const handleEditTextChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextValue = event.target.value;
      const input = event.currentTarget;
      const selectionStart = input.selectionStart ?? nextValue.length;
      const selectionEnd = input.selectionEnd ?? selectionStart;
      floatingLinkDraftTextCache = nextValue;
      setEditTextValue(nextValue);
      setOption("text", nextValue);
      window.setTimeout(() => {
        const nextInput = editTextInputRef.current ?? input;
        nextInput.focus();
        nextInput.setSelectionRange(selectionStart, selectionEnd);
      }, 0);
    },
    [setOption],
  );

  return (
    <>
      {!insert.hidden ? (
        <div
          ref={insert.ref}
          {...insert.props}
          className={cn(
            "z-50 w-[24rem] overflow-hidden rounded-md border border-border/70 bg-card/96 p-0 shadow-xl backdrop-blur",
            insert.props.className,
          )}
        >
          <LinkFormRow icon={<Link2 className="size-4" />}>
            <FloatingLinkUrlInput
              className="h-8 w-full bg-transparent text-footnote outline-none placeholder:text-label-tertiary"
              placeholder="https://"
              data-plate-focus
            />
          </LinkFormRow>
          <LinkFormRow icon={<Rows3 className="size-4" />} bordered>
            <LinkFormInput
              placeholder={t("CONTENT_LIBRARY_EDITOR_LINK_TEXT")}
              data-plate-focus
              {...insert.textInputProps}
              onSubmit={submitLink}
            />
          </LinkFormRow>
        </div>
      ) : null}

      <div
        ref={edit.ref}
        {...edit.props}
        className={cn(
          "z-50 overflow-hidden rounded-md border border-border/70 bg-card/96 p-0 shadow-xl backdrop-blur",
          edit.props.className,
        )}
      >
        {editState.isEditing ? (
          <div className="w-[24rem]">
            <LinkFormRow icon={<Link2 className="size-4" />}>
              <FloatingLinkUrlInput
                className="h-8 w-full bg-transparent text-footnote outline-none placeholder:text-label-tertiary"
                placeholder="https://"
                data-plate-focus
              />
            </LinkFormRow>
            <LinkFormRow icon={<Rows3 className="size-4" />} bordered>
              <LinkFormInput
                ref={editTextInputRef}
                value={editTextValue}
                onChange={handleEditTextChange}
                placeholder={t("CONTENT_LIBRARY_EDITOR_LINK_TEXT")}
                data-plate-focus
                onSubmit={submitLink}
              />
            </LinkFormRow>
          </div>
        ) : (
          <div className="flex items-center gap-1 p-1">
            <ToolbarTooltip tooltip={t("CONTENT_LIBRARY_EDITOR_LINK_EDIT")}>
              <Button asChild variant="ghost" size="sm" className="h-8 px-3">
                <button
                  type="button"
                  {...edit.editButtonProps}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    selectionRef.current = captureEditorSelection(editor);
                  }}
                >
                  {t("CONTENT_LIBRARY_EDITOR_LINK_EDIT")}
                </button>
              </Button>
            </ToolbarTooltip>
            <ToolbarTooltip tooltip={t("CONTENT_LIBRARY_EDITOR_LINK_OPEN")}>
              {currentLinkUrl ? (
                <Button
                  asChild
                  variant="ghost"
                  size="icon-sm"
                  className="size-8"
                  aria-label={t("CONTENT_LIBRARY_EDITOR_LINK_OPEN")}
                >
                  <a
                    href={currentLinkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      selectionRef.current = captureEditorSelection(editor);
                    }}
                  >
                    <ExternalLink className="size-4" />
                  </a>
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-8"
                  aria-label={t("CONTENT_LIBRARY_EDITOR_LINK_OPEN")}
                  disabled
                  onMouseDown={(event) => {
                    event.preventDefault();
                    selectionRef.current = captureEditorSelection(editor);
                  }}
                >
                  <ExternalLink className="size-4" />
                </Button>
              )}
            </ToolbarTooltip>
            <ToolbarTooltip tooltip={t("CONTENT_LIBRARY_EDITOR_LINK_REMOVE")}>
              <Button
                asChild
                variant="ghost"
                size="icon-sm"
                className="size-8 text-label-secondary hover:text-label-primary"
              >
                <button
                  type="button"
                  aria-label={t("CONTENT_LIBRARY_EDITOR_LINK_REMOVE")}
                  {...edit.unlinkButtonProps}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    selectionRef.current = captureEditorSelection(editor);
                  }}
                >
                  <Link2Off className="size-4" />
                </button>
              </Button>
            </ToolbarTooltip>
          </div>
        )}
      </div>
    </>
  );
}

export function PlateFloatingToolbar() {
  const { t } = useTranslation("content");
  const editor = useEditorRef();
  const linkFloatingOpen = usePluginOption(LinkPlugin, "isOpen", editor.id);
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

  return (
    <>
      {!hidden && !linkFloatingOpen ? (
        <div
          ref={setRefs}
          style={props.style}
          className="ignore-click-outside/toolbar z-50"
          onMouseDown={(event) => event.preventDefault()}
        >
          <Toolbar className="rounded-md border border-border/70 bg-card/95 p-1 backdrop-blur supports-[backdrop-filter]:bg-card/88">
            <ToolbarGroup>
              <TurnIntoToolbarButton />
            </ToolbarGroup>

            <ToolbarGroup>
              <MarkToolbarButton nodeType="bold" tooltip={t("CONTENT_LIBRARY_EDITOR_MARK_BOLD")}>
                <BoldIcon />
              </MarkToolbarButton>
              <MarkToolbarButton
                nodeType="italic"
                tooltip={t("CONTENT_LIBRARY_EDITOR_MARK_ITALIC")}
              >
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
      ) : null}
      <PlateLinkFloatingToolbar />
    </>
  );
}

"use client";

import * as React from "react";
import {
  Bold,
  Download,
  Italic,
  List,
  ListOrdered,
  Strikethrough,
  Underline,
  Upload,
} from "lucide-react";
import {
  BlockquotePlugin,
  BoldPlugin,
  H1Plugin,
  H2Plugin,
  H3Plugin,
  HorizontalRulePlugin,
  ItalicPlugin,
  StrikethroughPlugin,
  UnderlinePlugin,
} from "@platejs/basic-nodes/react";
import { LinkPlugin } from "@platejs/link/react";
import { MarkdownPlugin } from "@platejs/markdown";
import { toggleList } from "@platejs/list";
import { ListPlugin } from "@platejs/list/react";
import { SlashInputPlugin, SlashPlugin } from "@platejs/slash-command/react";
import {
  TableCellHeaderPlugin,
  TableCellPlugin,
  TablePlugin,
  TableRowPlugin,
} from "@platejs/table/react";
import { KEYS, normalizeNodeId, type Value } from "platejs";
import {
  ParagraphPlugin,
  Plate,
  useEditorRef,
  useEditorSelector,
  usePlateEditor,
} from "platejs/react";
import { useTranslation } from "react-i18next";

import { BlockquoteElement } from "@arclayer/ui/editor/ui/blockquote-node";
import { Editor, EditorContainer } from "@arclayer/ui/editor/ui/editor";
import { H1Element, H2Element, H3Element } from "@arclayer/ui/editor/ui/heading-node";
import { HrElement } from "@arclayer/ui/editor/ui/hr-node";
import { MarkToolbarButton } from "@arclayer/ui/editor/ui/mark-toolbar-button";
import { ParagraphElement } from "@arclayer/ui/editor/ui/paragraph-node";
import {
  Toolbar,
  ToolbarButton,
  ToolbarSeparator,
  ToolbarTooltip,
} from "@arclayer/ui/editor/ui/toolbar";
import { LinkToolbarButton } from "@arclayer/ui/editor/link-toolbar-button";
import {
  ARTICLE_EDITOR_INSERT_TABLE,
  BlockList,
  LinkElement,
  TableCellElement,
  TableElement,
  TableHeaderCellElement,
  TableRowElement,
  createSlashInputElement,
} from "@arclayer/ui/editor";
import { TableToolbarButton } from "@arclayer/ui/editor/table-toolbar-button";
import { TurnIntoToolbarButton } from "@arclayer/ui/editor/turn-into-toolbar-button";
import { TooltipProvider } from "@arclayer/ui/tooltip";
import { cn } from "@arclayer/lib/utils";

const EMPTY_VALUE: Value = [{ type: "p", children: [{ text: "" }] }];
const WORKSPACE_TURN_INTO_VALUES = [
  KEYS.p,
  KEYS.h1,
  KEYS.h2,
  KEYS.h3,
  KEYS.ul,
  KEYS.ol,
  KEYS.blockquote,
] as const;
const WORKSPACE_SLASH_COMMAND_VALUES = [
  ...WORKSPACE_TURN_INTO_VALUES,
  KEYS.hr,
  ARTICLE_EDITOR_INSERT_TABLE,
] as const;
const WorkspaceSlashInputElement = createSlashInputElement(WORKSPACE_SLASH_COMMAND_VALUES);

const WORKSPACE_BASIC_BLOCKS_KIT = [
  ParagraphPlugin.configure({ node: { component: ParagraphElement } }),
  H1Plugin.configure({ node: { component: H1Element } }),
  H2Plugin.configure({ node: { component: H2Element } }),
  H3Plugin.configure({ node: { component: H3Element } }),
  BlockquotePlugin.configure({ node: { component: BlockquoteElement } }),
  HorizontalRulePlugin.configure({ node: { component: HrElement } }),
];

const WORKSPACE_BASIC_MARKS_KIT = [
  BoldPlugin.configure({ shortcuts: { toggle: { keys: "mod+b" } } }),
  ItalicPlugin.configure({ shortcuts: { toggle: { keys: "mod+i" } } }),
  UnderlinePlugin.configure({ shortcuts: { toggle: { keys: "mod+u" } } }),
  StrikethroughPlugin.configure({ shortcuts: { toggle: { keys: "mod+shift+x" } } }),
];

const WORKSPACE_STRUCTURED_CONTENT_KIT = [
  LinkPlugin.configure({ node: { component: LinkElement } }),
  ListPlugin.configure({
    render: {
      belowNodes: ({ element }) => {
        if (!element.listStyleType) return;
        return (props) => <BlockList {...props} />;
      },
    },
  }),
  TablePlugin.configure({ node: { component: TableElement } }),
  TableRowPlugin.configure({ node: { component: TableRowElement } }),
  TableCellPlugin.configure({ node: { component: TableCellElement } }),
  TableCellHeaderPlugin.configure({ node: { component: TableHeaderCellElement } }),
];

const WORKSPACE_SLASH_COMMAND_PLUGIN = [
  SlashPlugin.configure({
    options: {
      triggerQuery: () => true,
    },
  }),
  SlashInputPlugin.withComponent(WorkspaceSlashInputElement),
];

type MarkdownEditor = NonNullable<ReturnType<typeof usePlateEditor>>;

function toInitialValue(text: string): Value {
  return normalizeNodeId([{ type: "p", children: [{ text }] }]);
}

function getMarkdownApi(editor: MarkdownEditor) {
  const markdown = (
    editor.api as
      | { markdown?: { deserialize: (source: string) => Value; serialize: () => string } }
      | undefined
  )?.markdown;
  if (!markdown) throw new Error("WORKSPACE_GUIDANCE_MARKDOWN_API_UNAVAILABLE");
  return markdown;
}

function resetEditorHistory(editor: MarkdownEditor) {
  editor.history.redos = [];
  editor.history.undos = [];
}

function ListToolbarButton(props: {
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  listType: string;
}) {
  const editor = useEditorRef();
  const pressed = useEditorSelector(
    (currentEditor) =>
      Boolean(currentEditor.selection) &&
      currentEditor.api.some({
        at: currentEditor.selection ?? undefined,
        match: { type: props.listType },
      }),
    [props.listType],
  );

  return (
    <ToolbarTooltip tooltip={props.label}>
      <ToolbarButton
        aria-label={props.label}
        disabled={props.disabled}
        pressed={pressed}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          toggleList(editor, { listStyleType: props.listType });
          editor.tf.focus();
        }}
      >
        {props.icon}
      </ToolbarButton>
    </ToolbarTooltip>
  );
}

export function WorkspaceGuidancePlateEditor(props: {
  ariaLabel: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  const { t } = useTranslation("knowledge");
  const plugins = React.useMemo(
    () => [
      MarkdownPlugin,
      ...WORKSPACE_SLASH_COMMAND_PLUGIN,
      ...WORKSPACE_BASIC_BLOCKS_KIT,
      ...WORKSPACE_BASIC_MARKS_KIT,
      ...WORKSPACE_STRUCTURED_CONTENT_KIT,
    ],
    [],
  );
  const editor = usePlateEditor(
    {
      plugins,
      value: toInitialValue(props.value),
    },
    [],
  );
  const appliedExternalValueRef = React.useRef<string | null>(null);
  const applyingExternalValueRef = React.useRef(false);
  const importInputRef = React.useRef<HTMLInputElement>(null);

  const importMarkdown = React.useCallback(
    async (file: File) => {
      const source = await file.text();
      applyingExternalValueRef.current = true;
      editor.tf.setValue(
        source.trim() ? normalizeNodeId(getMarkdownApi(editor).deserialize(source)) : EMPTY_VALUE,
      );
      resetEditorHistory(editor);
      const nextValue = getMarkdownApi(editor).serialize();
      appliedExternalValueRef.current = nextValue;
      applyingExternalValueRef.current = false;
      props.onChange(nextValue);
    },
    [editor, props.onChange],
  );

  const exportMarkdown = React.useCallback(() => {
    const url = URL.createObjectURL(
      new Blob([getMarkdownApi(editor).serialize()], { type: "text/markdown;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "workspace-knowledge.md";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [editor]);

  React.useEffect(() => {
    if (!editor || appliedExternalValueRef.current === props.value) return;
    applyingExternalValueRef.current = true;
    editor.tf.setValue(
      props.value.trim()
        ? normalizeNodeId(getMarkdownApi(editor).deserialize(props.value))
        : EMPTY_VALUE,
    );
    resetEditorHistory(editor);
    appliedExternalValueRef.current = getMarkdownApi(editor).serialize();
    applyingExternalValueRef.current = false;
  }, [editor, props.value]);

  return (
    <TooltipProvider>
      <Plate
        editor={editor}
        onChange={() => {
          if (applyingExternalValueRef.current) return;
          const nextValue = getMarkdownApi(editor).serialize();
          if (appliedExternalValueRef.current === nextValue) return;
          appliedExternalValueRef.current = nextValue;
          props.onChange(nextValue);
        }}
      >
        <EditorContainer
          className={cn(
            "min-h-[24rem] w-full overflow-hidden rounded-md border border-input bg-card focus-within:border-border focus-within:ring-1 focus-within:ring-border/50 focus-within:ring-offset-0",
            props.disabled && "cursor-not-allowed opacity-50",
          )}
        >
          <Toolbar
            aria-label={t("EDITOR_TOOLBAR_LABEL")}
            className="border-b border-input px-2 py-1 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150 motion-reduce:animate-none"
          >
            <TurnIntoToolbarButton allowedValues={WORKSPACE_TURN_INTO_VALUES} />
            <ToolbarSeparator />
            <MarkToolbarButton
              nodeType="bold"
              tooltip={t("EDITOR_TOOLBAR_BOLD")}
              aria-label={t("EDITOR_TOOLBAR_BOLD")}
              disabled={props.disabled}
            >
              <Bold />
            </MarkToolbarButton>
            <MarkToolbarButton
              nodeType="italic"
              tooltip={t("EDITOR_TOOLBAR_ITALIC")}
              aria-label={t("EDITOR_TOOLBAR_ITALIC")}
              disabled={props.disabled}
            >
              <Italic />
            </MarkToolbarButton>
            <ToolbarSeparator />
            <MarkToolbarButton
              nodeType="underline"
              tooltip={t("EDITOR_TOOLBAR_UNDERLINE")}
              aria-label={t("EDITOR_TOOLBAR_UNDERLINE")}
              disabled={props.disabled}
            >
              <Underline />
            </MarkToolbarButton>
            <MarkToolbarButton
              nodeType="strikethrough"
              tooltip={t("EDITOR_TOOLBAR_STRIKETHROUGH")}
              aria-label={t("EDITOR_TOOLBAR_STRIKETHROUGH")}
              disabled={props.disabled}
            >
              <Strikethrough />
            </MarkToolbarButton>
            <ToolbarSeparator />
            <ListToolbarButton
              disabled={props.disabled}
              icon={<List />}
              label={t("EDITOR_TOOLBAR_BULLETED_LIST")}
              listType={KEYS.ul}
            />
            <ListToolbarButton
              disabled={props.disabled}
              icon={<ListOrdered />}
              label={t("EDITOR_TOOLBAR_NUMBERED_LIST")}
              listType={KEYS.ol}
            />
            <TableToolbarButton />
            <ToolbarSeparator />
            <LinkToolbarButton
              aria-label={t("EDITOR_TOOLBAR_LINK")}
              tooltip={t("EDITOR_TOOLBAR_LINK")}
              disabled={props.disabled}
            />
            <ToolbarTooltip tooltip={t("EDITOR_TOOLBAR_IMPORT")}>
              <ToolbarButton
                aria-label={t("EDITOR_TOOLBAR_IMPORT")}
                disabled={props.disabled}
                onClick={() => importInputRef.current?.click()}
              >
                <Upload />
              </ToolbarButton>
            </ToolbarTooltip>
            <ToolbarTooltip tooltip={t("EDITOR_TOOLBAR_EXPORT")}>
              <ToolbarButton
                aria-label={t("EDITOR_TOOLBAR_EXPORT")}
                disabled={props.disabled}
                onClick={exportMarkdown}
              >
                <Download />
              </ToolbarButton>
            </ToolbarTooltip>
            <input
              ref={importInputRef}
              type="file"
              accept=".md,.markdown,.txt,text/markdown,text/plain"
              className="sr-only"
              tabIndex={-1}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void importMarkdown(file);
                event.currentTarget.value = "";
              }}
            />
          </Toolbar>
          <Editor
            aria-label={props.ariaLabel}
            disabled={props.disabled}
            placeholder={props.placeholder}
            variant="none"
            className="min-h-[calc(24rem-3rem)] w-full rounded-none px-4 py-3 text-body leading-7"
          />
        </EditorContainer>
      </Plate>
    </TooltipProvider>
  );
}

"use client";

import * as React from "react";

import { Code2, ImagePlus, Table2, TextSearch } from "lucide-react";
import { DndPlugin } from "@platejs/dnd";
import { BlockSelectionPlugin } from "@platejs/selection/react";
import { insertImage } from "@platejs/media";
import { normalizeNodeId, type Value } from "platejs";
import { Plate, usePlateEditor } from "platejs/react";
import { useTranslation } from "react-i18next";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import { ArticleEditorCommandProvider } from "@/components/editor/article-editor-command-context";
import {
  ARTICLE_EDITOR_INSERT_IMAGE,
  ARTICLE_EDITOR_INSERT_TABLE,
  ARTICLE_EDITOR_INSERT_TOC,
  applyArticleEditorInsertItem,
} from "@/components/editor/article-editor-insert-items";
import { LinkToolbarButton } from "@/components/editor/link-toolbar-button";
import { AdvancedBlocksKit } from "@/components/editor/plugins/advanced-blocks-kit";
import { AutoformatKit } from "@/components/editor/plugins/autoformat-kit";
import { BasicNodesKit } from "@/components/editor/plugins/basic-nodes-kit";
import { PlateFloatingToolbar } from "@/components/editor/plugins/floating-toolbar-kit";
import { SlashKit } from "@/components/editor/plugins/slash-kit";
import { Editor, EditorContainer } from "@/components/ui/editor";
import { MarkToolbarButton } from "@/components/ui/mark-toolbar-button";
import { Toolbar, ToolbarButton, ToolbarGroup, ToolbarSeparator } from "@/components/ui/toolbar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { resolveAssetRefToPublicUrlPath } from "@/lib/assets/asset-urls";
import { AssetPickerDialog } from "@/pages/workspaces/assets/components/asset-picker-dialog";
import { cn } from "@arclayer/lib/utils";

const DEFAULT_PLATE_VALUE: Value = normalizeNodeId([{ type: "p", children: [{ text: "" }] }]);

function normalizeDocument(document: Record<string, unknown> | undefined): Record<string, unknown> {
  if (document && typeof document === "object" && Array.isArray(document.content)) {
    return document;
  }

  return {
    type: "doc",
    content: DEFAULT_PLATE_VALUE,
  };
}

function toPlateValue(document: Record<string, unknown> | undefined): Value {
  const normalizedDocument = normalizeDocument(document);
  const content = normalizedDocument.content;
  return Array.isArray(content) && content.length > 0
    ? normalizeNodeId(content as Value)
    : DEFAULT_PLATE_VALUE;
}

function toStoredDocument(value: Value): Record<string, unknown> {
  return {
    type: "doc",
    content: value,
  };
}

function cloneSelection(selection: unknown) {
  return selection ? JSON.parse(JSON.stringify(selection)) : null;
}

function InsertToolbarButton(props: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <ToolbarButton
      aria-label={props.label}
      tooltip={props.label}
      variant="outline"
      onClick={props.onClick}
    >
      {props.icon}
    </ToolbarButton>
  );
}

function ContentLibraryArticleEditorBodySurface(props: {
  workspaceId: string;
  editorIdentity: string;
  externalDocument: Record<string, unknown>;
  placeholder: string;
  mode: "split" | "page";
  onChange?: (value: Record<string, unknown>) => void;
}) {
  const { t } = useTranslation(["content", "common"]);
  const externalSerialized = React.useMemo(
    () => JSON.stringify(props.externalDocument),
    [props.externalDocument],
  );
  const externalValue = React.useMemo(
    () => toPlateValue(props.externalDocument),
    [props.externalDocument],
  );
  const lastSyncedDocumentRef = React.useRef(externalSerialized);
  const pendingInsertSelectionRef = React.useRef<unknown>(null);
  const [imagePickerOpen, setImagePickerOpen] = React.useState(false);
  const plugins = React.useMemo(
    () => [
      BlockSelectionPlugin,
      DndPlugin,
      ...AdvancedBlocksKit,
      ...SlashKit,
      ...AutoformatKit,
      ...BasicNodesKit,
    ],
    [],
  );

  const editor = usePlateEditor(
    {
      plugins,
      value: externalValue,
    },
    [props.editorIdentity],
  );

  React.useEffect(() => {
    if (!editor) return;
    if (lastSyncedDocumentRef.current === externalSerialized) return;
    editor.tf.setValue(externalValue);
    lastSyncedDocumentRef.current = externalSerialized;
  }, [editor, externalSerialized, externalValue]);

  const handleInsertItem = React.useCallback((activeEditor: typeof editor | any, value: string) => {
    if (value === ARTICLE_EDITOR_INSERT_IMAGE) {
      pendingInsertSelectionRef.current = cloneSelection(activeEditor.selection);
      setImagePickerOpen(true);
      return;
    }

    applyArticleEditorInsertItem(activeEditor, value);
  }, []);

  const handleConfirmImage = React.useCallback(
    (next: { assetIds: string[] }) => {
      const assetId = next.assetIds[0];
      if (!assetId) {
        setImagePickerOpen(false);
        return;
      }

      const nextUrl = resolveAssetRefToPublicUrlPath(assetId);
      const selection = pendingInsertSelectionRef.current;

      if (selection) {
        editor.tf.select(selection as never);
      }

      if (!nextUrl) return;
      editor.tf.focus();
      insertImage(editor, nextUrl);
      pendingInsertSelectionRef.current = null;
      setImagePickerOpen(false);
    },
    [editor],
  );

  const contentLaneClass =
    props.mode === "page"
      ? "mx-auto flex h-full min-h-0 w-full max-w-[76rem] flex-1 flex-col px-10 pl-24"
      : "flex h-full min-h-0 w-full flex-1 flex-col px-6 pl-24";

  return (
    <TooltipProvider>
      <DndProvider backend={HTML5Backend}>
        <Plate
          editor={editor}
          onChange={({ value }) => {
            const nextDocument = toStoredDocument(value);
            const nextSerialized = JSON.stringify(nextDocument);
            if (nextSerialized === lastSyncedDocumentRef.current) return;
            lastSyncedDocumentRef.current = nextSerialized;
            props.onChange?.(nextDocument);
          }}
        >
          <ArticleEditorCommandProvider value={{ insertItem: handleInsertItem }}>
            <EditorContainer className="flex min-h-0 flex-1 flex-col overflow-visible bg-transparent">
              <PlateFloatingToolbar />
              {props.mode === "page" ? (
                <Toolbar className="sticky top-0 z-10 mb-5 gap-1 border-b border-border/50 bg-background/90 px-0 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/78">
                  <ToolbarGroup>
                    <MarkToolbarButton
                      aria-label={t("CONTENT_LIBRARY_EDITOR_MARK_BOLD")}
                      nodeType="bold"
                      tooltip={t("CONTENT_LIBRARY_EDITOR_MARK_BOLD")}
                    >
                      B
                    </MarkToolbarButton>
                    <MarkToolbarButton
                      aria-label={t("CONTENT_LIBRARY_EDITOR_MARK_ITALIC")}
                      nodeType="italic"
                      tooltip={t("CONTENT_LIBRARY_EDITOR_MARK_ITALIC")}
                    >
                      <span className="italic">I</span>
                    </MarkToolbarButton>
                    <MarkToolbarButton
                      aria-label={t("CONTENT_LIBRARY_EDITOR_MARK_UNDERLINE")}
                      nodeType="underline"
                      tooltip={t("CONTENT_LIBRARY_EDITOR_MARK_UNDERLINE")}
                    >
                      <span className="underline underline-offset-2">U</span>
                    </MarkToolbarButton>
                    <MarkToolbarButton
                      aria-label={t("CONTENT_LIBRARY_EDITOR_MARK_STRIKETHROUGH")}
                      nodeType="strikethrough"
                      tooltip={t("CONTENT_LIBRARY_EDITOR_MARK_STRIKETHROUGH")}
                    >
                      <span className="line-through">S</span>
                    </MarkToolbarButton>
                    <ToolbarSeparator />
                    <LinkToolbarButton />
                    <MarkToolbarButton
                      aria-label={t("CONTENT_LIBRARY_EDITOR_MARK_CODE")}
                      nodeType="code"
                      tooltip={t("CONTENT_LIBRARY_EDITOR_MARK_CODE")}
                    >
                      <Code2 />
                    </MarkToolbarButton>
                    <MarkToolbarButton
                      aria-label={t("CONTENT_LIBRARY_EDITOR_MARK_HIGHLIGHT")}
                      nodeType="highlight"
                      tooltip={t("CONTENT_LIBRARY_EDITOR_MARK_HIGHLIGHT")}
                    >
                      <span className="rounded bg-warning/20 px-1 text-[0.82rem]">H</span>
                    </MarkToolbarButton>
                    <ToolbarSeparator />
                    <InsertToolbarButton
                      icon={<ImagePlus />}
                      label={t("CONTENT_LIBRARY_EDITOR_INSERT_IMAGE")}
                      onClick={() => handleInsertItem(editor, ARTICLE_EDITOR_INSERT_IMAGE)}
                    />
                    <InsertToolbarButton
                      icon={<Table2 />}
                      label={t("CONTENT_LIBRARY_EDITOR_INSERT_TABLE")}
                      onClick={() => handleInsertItem(editor, ARTICLE_EDITOR_INSERT_TABLE)}
                    />
                    <InsertToolbarButton
                      icon={<TextSearch />}
                      label={t("CONTENT_LIBRARY_EDITOR_INSERT_TOC")}
                      onClick={() => handleInsertItem(editor, ARTICLE_EDITOR_INSERT_TOC)}
                    />
                  </ToolbarGroup>
                </Toolbar>
              ) : null}

              <div className={contentLaneClass}>
                <Editor
                  aria-label="Article body"
                  className={cn(
                    "min-h-full flex-1 overflow-visible text-foreground placeholder:text-label-tertiary **:data-slate-placeholder:!top-1 **:data-slate-placeholder:!left-0 **:data-slate-placeholder:!translate-y-0 [&_.slate-blockWrapper]:overflow-visible",
                    props.mode === "page"
                      ? "h-full pb-28 pt-4 text-[1.06rem] leading-8"
                      : "h-full pb-10 pt-0 text-base leading-7",
                  )}
                  placeholder={props.placeholder}
                  variant="none"
                />
              </div>
            </EditorContainer>

            <AssetPickerDialog
              open={imagePickerOpen}
              onOpenChange={setImagePickerOpen}
              scope={{ id: props.workspaceId, type: "workspace" }}
              mode="single"
              allowClear={false}
              allowUpload
              uploadPurpose="content_image"
              mimePrefix="image/"
              title={t("CONTENT_LIBRARY_EDITOR_INSERT_IMAGE")}
              description={t("CONTENT_LIBRARY_EDITOR_INSERT_IMAGE_DESC")}
              onConfirm={handleConfirmImage}
            />
          </ArticleEditorCommandProvider>
        </Plate>
      </DndProvider>
    </TooltipProvider>
  );
}

export function ContentLibraryArticleEditorBody(props: {
  workspaceId: string;
  editorIdentity: string;
  document?: Record<string, unknown>;
  placeholder: string;
  mode: "split" | "page";
  onChange?: (value: Record<string, unknown>) => void;
  className?: string;
}) {
  const externalDocument = React.useMemo(() => normalizeDocument(props.document), [props.document]);

  return (
    <div
      data-testid="content-library-article-editor-body"
      className={cn("flex min-h-0 w-full flex-1 flex-col", props.className)}
    >
      <ContentLibraryArticleEditorBodySurface
        workspaceId={props.workspaceId}
        editorIdentity={props.editorIdentity}
        externalDocument={externalDocument}
        placeholder={props.placeholder}
        mode={props.mode}
        onChange={props.onChange}
      />
    </div>
  );
}

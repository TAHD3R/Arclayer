"use client";

import * as React from "react";

import { DndPlugin } from "@platejs/dnd";
import { insertImage } from "@platejs/media";
import { BlockSelectionPlugin } from "@platejs/selection/react";
import { normalizeNodeId, type Value } from "platejs";
import { Plate, usePlateEditor } from "platejs/react";
import { useTranslation } from "react-i18next";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import { ArticleEditorCommandProvider } from "@/components/editor/article-editor-command-context";
import {
  ARTICLE_EDITOR_INSERT_AUDIO,
  ARTICLE_EDITOR_INSERT_FILE,
  ARTICLE_EDITOR_INSERT_IMAGE,
  ARTICLE_EDITOR_INSERT_VIDEO,
  applyArticleEditorInsertItem,
} from "@/components/editor/article-editor-insert-items";
import { AdvancedBlocksKit } from "@/components/editor/plugins/advanced-blocks-kit";
import { AutoformatKit } from "@/components/editor/plugins/autoformat-kit";
import { BasicNodesKit } from "@/components/editor/plugins/basic-nodes-kit";
import { SlashKit } from "@/components/editor/plugins/slash-kit";
import { resolveAssetRefToPublicUrlPath } from "@/lib/assets/asset-urls";
import { AssetPickerDialog } from "@/pages/workspaces/assets/components/asset-picker-dialog";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { TooltipProvider } from "@arclayer/ui/tooltip";

const DEFAULT_PLATE_VALUE: Value = normalizeNodeId([{ type: "p", children: [{ text: "" }] }]);

type MediaUrlInsertKind = "audio" | "file" | "video";

type ContentLibraryArticleEditorDocumentProviderProps = {
  children: React.ReactNode;
  document?: Record<string, unknown>;
  editorIdentity: string;
  onChange?: (value: Record<string, unknown>) => void;
  workspaceId: string;
};

type ContentLibraryArticleEditorDocumentState = {
  isHydrated: boolean;
};

const ContentLibraryArticleEditorDocumentStateContext =
  React.createContext<ContentLibraryArticleEditorDocumentState>({
    isHydrated: true,
  });

export function useContentLibraryArticleEditorDocumentState() {
  return React.useContext(ContentLibraryArticleEditorDocumentStateContext);
}

function normalizeDocument(document: Record<string, unknown> | undefined): Record<string, unknown> {
  if (document && typeof document === "object" && Array.isArray(document.content)) {
    return {
      type: typeof document.type === "string" ? document.type : "doc",
      content: document.content,
    };
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

function resetEditorHistory(editor: NonNullable<ReturnType<typeof usePlateEditor>>) {
  editor.history.redos = [];
  editor.history.undos = [];
}

function getMediaUrlInsertConfig(kind: MediaUrlInsertKind, t: (key: string) => string) {
  if (kind === "audio") {
    return {
      description: t("CONTENT_LIBRARY_EDITOR_INSERT_AUDIO_DESC"),
      nodeType: "audio",
      title: t("CONTENT_LIBRARY_EDITOR_INSERT_AUDIO"),
    };
  }
  if (kind === "file") {
    return {
      description: t("CONTENT_LIBRARY_EDITOR_INSERT_FILE_DESC"),
      nodeType: "file",
      title: t("CONTENT_LIBRARY_EDITOR_INSERT_FILE"),
    };
  }
  return {
    description: t("CONTENT_LIBRARY_EDITOR_INSERT_VIDEO_DESC"),
    nodeType: "video",
    title: t("CONTENT_LIBRARY_EDITOR_INSERT_VIDEO"),
  };
}

function deriveFileNameFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    const lastSegment = parsed.pathname.split("/").pop();
    return lastSegment ? decodeURIComponent(lastSegment) : url;
  } catch {
    const lastSegment = url.split("/").pop();
    return lastSegment || url;
  }
}

function isHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function ContentLibraryArticleEditorDocumentProvider(
  props: ContentLibraryArticleEditorDocumentProviderProps,
) {
  const { t } = useTranslation(["content", "common"]);
  const externalDocument = React.useMemo(() => normalizeDocument(props.document), [props.document]);
  const externalSerialized = React.useMemo(
    () => JSON.stringify(externalDocument),
    [externalDocument],
  );
  const externalValue = React.useMemo(() => toPlateValue(externalDocument), [externalDocument]);
  const lastSyncedDocumentRef = React.useRef(externalSerialized);
  const [appliedDocumentKey, setAppliedDocumentKey] = React.useState(externalSerialized);
  const pendingInsertSelectionRef = React.useRef<unknown>(null);
  const [imagePickerOpen, setImagePickerOpen] = React.useState(false);
  const [mediaUrlDialog, setMediaUrlDialog] = React.useState<{
    kind: MediaUrlInsertKind;
    open: boolean;
    url: string;
  }>({ kind: "video", open: false, url: "" });
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
    if (appliedDocumentKey === externalSerialized) return;
    editor.tf.setValue(externalValue);
    resetEditorHistory(editor);
    lastSyncedDocumentRef.current = externalSerialized;
    setAppliedDocumentKey(externalSerialized);
  }, [appliedDocumentKey, editor, externalSerialized, externalValue]);

  React.useEffect(() => {
    lastSyncedDocumentRef.current = externalSerialized;
    setAppliedDocumentKey(externalSerialized);
  }, [props.editorIdentity]);

  const handleInsertItem = React.useCallback((activeEditor: typeof editor, value: string) => {
    if (value === ARTICLE_EDITOR_INSERT_IMAGE) {
      pendingInsertSelectionRef.current = cloneSelection(activeEditor.selection);
      setImagePickerOpen(true);
      return;
    }

    if (
      value === ARTICLE_EDITOR_INSERT_VIDEO ||
      value === ARTICLE_EDITOR_INSERT_AUDIO ||
      value === ARTICLE_EDITOR_INSERT_FILE
    ) {
      pendingInsertSelectionRef.current = cloneSelection(activeEditor.selection);
      setMediaUrlDialog({
        kind:
          value === ARTICLE_EDITOR_INSERT_VIDEO
            ? "video"
            : value === ARTICLE_EDITOR_INSERT_AUDIO
              ? "audio"
              : "file",
        open: true,
        url: "",
      });
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

  const handleConfirmMediaUrl = React.useCallback(() => {
    const nextUrl = mediaUrlDialog.url.trim();
    if (!isHttpUrl(nextUrl)) return;

    const selection = pendingInsertSelectionRef.current;
    if (selection) {
      editor.tf.select(selection as never);
    }

    editor.tf.focus();
    editor.tf.insertNodes({
      children: [{ text: "" }],
      name: mediaUrlDialog.kind === "file" ? deriveFileNameFromUrl(nextUrl) : undefined,
      type: getMediaUrlInsertConfig(mediaUrlDialog.kind, t).nodeType,
      url: nextUrl,
    });

    pendingInsertSelectionRef.current = null;
    setMediaUrlDialog((current) => ({ ...current, open: false, url: "" }));
  }, [editor, mediaUrlDialog.kind, mediaUrlDialog.url, t]);

  return (
    <ContentLibraryArticleEditorDocumentStateContext.Provider
      value={{ isHydrated: appliedDocumentKey === externalSerialized }}
    >
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
            <ArticleEditorCommandProvider
              value={{ insertItem: handleInsertItem as (editor: unknown, value: string) => void }}
            >
              {props.children}

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

              <SettingDialog
                open={mediaUrlDialog.open}
                onOpenChange={(open) =>
                  setMediaUrlDialog((current) => ({
                    ...current,
                    open,
                    url: open ? current.url : "",
                  }))
                }
                title={getMediaUrlInsertConfig(mediaUrlDialog.kind, t).title}
                description={getMediaUrlInsertConfig(mediaUrlDialog.kind, t).description}
                contentClassName="sm:max-w-xl"
              >
                <div className="space-y-3">
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-label-primary">
                      {t("CONTENT_LIBRARY_EDITOR_INSERT_URL_LABEL")}
                    </div>
                    <div className="text-footnote text-label-secondary">
                      {t("CONTENT_LIBRARY_EDITOR_INSERT_URL_HINT")}
                    </div>
                  </div>
                  <Input
                    autoFocus
                    type="url"
                    value={mediaUrlDialog.url}
                    onChange={(event) =>
                      setMediaUrlDialog((current) => ({ ...current, url: event.target.value }))
                    }
                    placeholder="https://"
                    className="h-10"
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && isHttpUrl(mediaUrlDialog.url.trim())) {
                        event.preventDefault();
                        handleConfirmMediaUrl();
                      }
                    }}
                  />
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        setMediaUrlDialog((current) => ({ ...current, open: false, url: "" }))
                      }
                    >
                      {t("common:CANCEL")}
                    </Button>
                    <Button
                      type="button"
                      disabled={!isHttpUrl(mediaUrlDialog.url.trim())}
                      onClick={handleConfirmMediaUrl}
                    >
                      {t("common:CONFIRM")}
                    </Button>
                  </div>
                </div>
              </SettingDialog>
            </ArticleEditorCommandProvider>
          </Plate>
        </DndProvider>
      </TooltipProvider>
    </ContentLibraryArticleEditorDocumentStateContext.Provider>
  );
}

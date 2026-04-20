"use client";

import * as React from "react";

import { CsvPlugin } from "@platejs/csv";
import { DndPlugin } from "@platejs/dnd";
import { LinkPlugin, triggerFloatingLinkInsert } from "@platejs/link/react";
import { MarkdownPlugin } from "@platejs/markdown";
import { insertPlaceholder } from "@platejs/media";
import { normalizeNodeId, type Value } from "platejs";
import { Plate, usePlateEditor } from "platejs/react";
import { useTranslation } from "react-i18next";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import { resolveAssetRefToPublicUrlPath } from "@/lib/assets/asset-urls";
import { uploadSingleAssetFromFile } from "@/lib/assets/scoped-uploads";
import { AssetPickerDialog } from "@/pages/workspaces/assets/components/asset-picker-dialog";
import { SlashKit } from "@/components/editor/plugins/slash-kit";
import { Button } from "@arclayer/ui/button";
import {
  ArticleEditorBlockMenuPlugin,
  AdvancedBlocksKit,
  applyArticleEditorInsertItem,
  ArticleEditorBlockSelectionPlugin,
  ARTICLE_EDITOR_INSERT_AUDIO,
  ARTICLE_EDITOR_INSERT_FILE,
  ARTICLE_EDITOR_INSERT_IMAGE,
  ARTICLE_EDITOR_INSERT_LINK,
  ARTICLE_EDITOR_INSERT_VIDEO,
  ArticleEditorCommandProvider,
  AutoformatKit,
  BasicNodesKit,
  MediaUploadProvider,
} from "@arclayer/ui/editor";
import { Input } from "@arclayer/ui/input";
import { SettingDialogField } from "@arclayer/ui/setting-dialog-field";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { TooltipProvider } from "@arclayer/ui/tooltip";
import {
  isEditorDocumentHydrated,
  shouldApplyExternalDocumentSync,
} from "./content-library-article-editor-document-sync";

const DEFAULT_PLATE_VALUE: Value = normalizeNodeId([{ type: "p", children: [{ text: "" }] }]);
const TERMINAL_BLOCKS_REQUIRING_TRAILING_PARAGRAPH = new Set(["hr", "table"]);

type MediaInsertKind = "audio" | "file" | "image" | "video";
type MediaInsertDialogState = {
  kind: MediaInsertKind;
  open: boolean;
  replacePath?: number[];
};
type MediaUrlDialogState = MediaInsertDialogState & {
  url: string;
};

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
  if (!Array.isArray(content) || content.length === 0) {
    return DEFAULT_PLATE_VALUE;
  }

  const normalizedValue = normalizeNodeId(content as Value);
  const lastBlock = normalizedValue.at(-1) as { type?: string } | undefined;

  if (!lastBlock?.type || !TERMINAL_BLOCKS_REQUIRING_TRAILING_PARAGRAPH.has(lastBlock.type)) {
    return normalizedValue;
  }

  return normalizeNodeId([...normalizedValue, { type: "p", children: [{ text: "" }] }]);
}

function toStoredDocument(value: Value): Record<string, unknown> {
  return {
    type: "doc",
    content: value,
  };
}

function resetEditorHistory(editor: NonNullable<ReturnType<typeof usePlateEditor>>) {
  editor.history.redos = [];
  editor.history.undos = [];
}

function getMediaInsertConfig(kind: MediaInsertKind, t: (key: string) => string) {
  if (kind === "image") {
    return {
      description: t("CONTENT_LIBRARY_EDITOR_INSERT_IMAGE_DESC"),
      mimePrefix: "image/" as const,
      nodeType: "img",
      title: t("CONTENT_LIBRARY_EDITOR_INSERT_IMAGE"),
    };
  }
  if (kind === "audio") {
    return {
      description: t("CONTENT_LIBRARY_EDITOR_INSERT_AUDIO_DESC"),
      mimePrefix: "audio/" as const,
      nodeType: "audio",
      title: t("CONTENT_LIBRARY_EDITOR_INSERT_AUDIO"),
    };
  }
  if (kind === "file") {
    return {
      description: t("CONTENT_LIBRARY_EDITOR_INSERT_FILE_DESC"),
      mimePrefix: undefined,
      nodeType: "file",
      title: t("CONTENT_LIBRARY_EDITOR_INSERT_FILE"),
    };
  }
  return {
    description: t("CONTENT_LIBRARY_EDITOR_INSERT_VIDEO_DESC"),
    mimePrefix: "video/" as const,
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

function buildMediaNode(params: { name?: string; type: string; url: string }) {
  return {
    align: "center" as const,
    children: [{ text: "" }],
    name: params.name,
    type: params.type,
    url: params.url,
  };
}

function insertOrReplaceMediaNode(params: {
  editor: NonNullable<ReturnType<typeof usePlateEditor>>;
  node: ReturnType<typeof buildMediaNode>;
  replacePath?: number[];
}) {
  params.editor.tf.focus();

  if (!params.replacePath) {
    params.editor.tf.insertNodes(params.node);
    return;
  }

  params.editor.tf.withoutSaving(() => {
    params.editor.tf.removeNodes({ at: params.replacePath });
    params.editor.tf.insertNodes(params.node, { at: params.replacePath });
  });
}

function getMediaTypeKey(kind: MediaInsertKind) {
  if (kind === "image") return "img";
  if (kind === "audio") return "audio";
  if (kind === "file") return "file";
  return "video";
}

function getMediaUploadPurpose(kind: MediaInsertKind) {
  return kind === "image" ? "content_image" : "library";
}

function getAssetPickerMimePrefix(kind: MediaInsertKind) {
  if (kind === "image") return "image/";
  if (kind === "video") return "video/";
  if (kind === "audio") return "audio/";
  return "";
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
  const [mediaUrlDialog, setMediaUrlDialog] = React.useState<MediaUrlDialogState>({
    kind: "image",
    open: false,
    replacePath: undefined,
    url: "",
  });
  const [mediaLibraryDialog, setMediaLibraryDialog] = React.useState<MediaInsertDialogState>({
    kind: "image",
    open: false,
    replacePath: undefined,
  });
  const mediaUrlInputId = React.useId();
  const plugins = React.useMemo(
    () => [
      ArticleEditorBlockSelectionPlugin,
      ArticleEditorBlockMenuPlugin,
      DndPlugin,
      CsvPlugin,
      MarkdownPlugin,
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
    if (
      !shouldApplyExternalDocumentSync({
        appliedDocumentKey,
        externalSerialized,
        lastSyncedDocumentKey: lastSyncedDocumentRef.current,
      })
    ) {
      setAppliedDocumentKey(externalSerialized);
      return;
    }
    editor.tf.setValue(externalValue);
    resetEditorHistory(editor);
    lastSyncedDocumentRef.current = externalSerialized;
    setAppliedDocumentKey(externalSerialized);
  }, [appliedDocumentKey, editor, externalSerialized, externalValue]);

  React.useEffect(() => {
    lastSyncedDocumentRef.current = externalSerialized;
    setAppliedDocumentKey(externalSerialized);
  }, [props.editorIdentity]);

  const insertMediaPlaceholder = React.useCallback(
    (activeEditor: typeof editor, kind: MediaInsertKind, options: { autoOpen?: boolean } = {}) => {
      insertPlaceholder(activeEditor, activeEditor.getType(getMediaTypeKey(kind)), {
        select: true,
      });

      const placeholderEntry = activeEditor.api.block();
      if (!options.autoOpen || !placeholderEntry) return;

      activeEditor.tf.setNodes({ autoOpen: true }, { at: placeholderEntry[1] });
      activeEditor.tf.focus();
    },
    [],
  );

  const handleInsertItem = React.useCallback(
    (activeEditor: typeof editor, value: string) => {
      if (value === ARTICLE_EDITOR_INSERT_IMAGE) {
        insertMediaPlaceholder(activeEditor, "image", { autoOpen: true });
        return;
      }

      if (
        value === ARTICLE_EDITOR_INSERT_VIDEO ||
        value === ARTICLE_EDITOR_INSERT_AUDIO ||
        value === ARTICLE_EDITOR_INSERT_FILE
      ) {
        insertMediaPlaceholder(
          activeEditor,
          value === ARTICLE_EDITOR_INSERT_VIDEO
            ? "video"
            : value === ARTICLE_EDITOR_INSERT_AUDIO
              ? "audio"
              : "file",
          { autoOpen: true },
        );
        return;
      }

      if (value === ARTICLE_EDITOR_INSERT_LINK) {
        activeEditor.tf.focus();
        window.requestAnimationFrame(() => {
          activeEditor.getApi(LinkPlugin).floatingLink.show("insert", activeEditor.id);
          triggerFloatingLinkInsert(activeEditor, { focused: true });
        });
        return;
      }

      applyArticleEditorInsertItem(activeEditor, value);
    },
    [insertMediaPlaceholder],
  );

  const handleOpenMediaInsert = React.useCallback(
    (
      activeEditor: typeof editor,
      params: {
        kind: MediaInsertKind;
        source: "upload" | "url" | "library";
        replacePath?: number[];
      },
    ) => {
      if (params.source === "upload") {
        insertMediaPlaceholder(activeEditor, params.kind, { autoOpen: true });
        return;
      }

      if (params.source === "library") {
        setMediaLibraryDialog({
          kind: params.kind,
          open: true,
          replacePath: params.replacePath,
        });
        return;
      }

      setMediaUrlDialog({
        kind: params.kind,
        open: true,
        replacePath: params.replacePath,
        url: "",
      });
    },
    [insertMediaPlaceholder],
  );

  const handleConfirmMediaUrl = React.useCallback(() => {
    const nextUrl = mediaUrlDialog.url.trim();
    if (!isHttpUrl(nextUrl)) return;

    insertOrReplaceMediaNode({
      editor,
      node: buildMediaNode({
        name: mediaUrlDialog.kind === "file" ? deriveFileNameFromUrl(nextUrl) : undefined,
        type: editor.getType(getMediaInsertConfig(mediaUrlDialog.kind, t).nodeType),
        url: nextUrl,
      }),
      replacePath: mediaUrlDialog.replacePath,
    });

    setMediaUrlDialog((current) => ({
      ...current,
      open: false,
      replacePath: undefined,
      url: "",
    }));
  }, [editor, mediaUrlDialog.kind, mediaUrlDialog.replacePath, mediaUrlDialog.url, t]);

  const mediaUploadValue = React.useMemo(
    () => ({
      async uploadFile(params: {
        file: File;
        mediaType: string;
        onProgress?: (payload: {
          progress: number;
          totalBytes: number;
          uploadedBytes: number;
        }) => void;
        signal?: AbortSignal;
      }) {
        const kind = ((): MediaInsertKind => {
          if (params.mediaType === editor.getType("img")) return "image";
          if (params.mediaType === editor.getType("audio")) return "audio";
          if (params.mediaType === editor.getType("file")) return "file";
          return "video";
        })();

        const assetId = await uploadSingleAssetFromFile({
          scope: { id: props.workspaceId, type: "workspace" },
          purpose: getMediaUploadPurpose(kind),
          file: params.file,
          t,
          onProgress: params.onProgress,
          signal: params.signal,
        });

        const url = resolveAssetRefToPublicUrlPath(assetId);
        if (!url) {
          throw new Error(`Failed to resolve uploaded asset URL for ${assetId}`);
        }

        return {
          isUpload: true,
          name: params.file.name,
          url,
        };
      },
    }),
    [editor, props.workspaceId, t],
  );

  return (
    <ContentLibraryArticleEditorDocumentStateContext.Provider
      value={{
        isHydrated: isEditorDocumentHydrated({
          appliedDocumentKey,
          externalSerialized,
          lastSyncedDocumentKey: lastSyncedDocumentRef.current,
        }),
      }}
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
              value={{
                insertItem: handleInsertItem as (editor: unknown, value: string) => void,
                openMediaInsert: handleOpenMediaInsert as (
                  editor: unknown,
                  params: {
                    kind: "image" | "video" | "audio" | "file";
                    source: "upload" | "url" | "library";
                    replacePath?: number[];
                  },
                ) => void,
              }}
            >
              <MediaUploadProvider value={mediaUploadValue}>
                {props.children}

                <SettingDialog
                  open={mediaUrlDialog.open}
                  onOpenChange={(open) =>
                    setMediaUrlDialog((current) => ({
                      ...current,
                      open,
                      replacePath: open ? current.replacePath : undefined,
                      url: open ? current.url : "",
                    }))
                  }
                  title={getMediaInsertConfig(mediaUrlDialog.kind, t).title}
                  description={getMediaInsertConfig(mediaUrlDialog.kind, t).description}
                  footer={
                    <>
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
                    </>
                  }
                >
                  <form
                    className="grid gap-4 py-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!isHttpUrl(mediaUrlDialog.url.trim())) return;
                      handleConfirmMediaUrl();
                    }}
                  >
                    <SettingDialogField
                      title={
                        <label htmlFor={mediaUrlInputId}>
                          {t("CONTENT_LIBRARY_EDITOR_INSERT_URL_LABEL")}
                        </label>
                      }
                      description={t("CONTENT_LIBRARY_EDITOR_INSERT_URL_HINT")}
                    >
                      <Input
                        id={mediaUrlInputId}
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
                    </SettingDialogField>
                  </form>
                </SettingDialog>
                <AssetPickerDialog
                  open={mediaLibraryDialog.open}
                  onOpenChange={(open) =>
                    setMediaLibraryDialog((current) => ({
                      ...current,
                      open,
                      replacePath: open ? current.replacePath : undefined,
                    }))
                  }
                  scope={{ id: props.workspaceId, type: "workspace" }}
                  mode="single"
                  mimePrefix={getAssetPickerMimePrefix(mediaLibraryDialog.kind)}
                  uploadPurpose={getMediaUploadPurpose(mediaLibraryDialog.kind)}
                  title={t("CONTENT_LIBRARY_EDITOR_SELECT_FROM_LIBRARY")}
                  onConfirm={({ assetIds }) => {
                    const assetId = assetIds[0];
                    if (!assetId) return;

                    const url = resolveAssetRefToPublicUrlPath(assetId);
                    if (!url) {
                      throw new Error(`Failed to resolve library asset URL for ${assetId}`);
                    }

                    insertOrReplaceMediaNode({
                      editor,
                      node: buildMediaNode({
                        name:
                          mediaLibraryDialog.kind === "file"
                            ? deriveFileNameFromUrl(url)
                            : undefined,
                        type: editor.getType(
                          getMediaInsertConfig(mediaLibraryDialog.kind, t).nodeType,
                        ),
                        url,
                      }),
                      replacePath: mediaLibraryDialog.replacePath,
                    });

                    setMediaLibraryDialog((current) => ({
                      ...current,
                      open: false,
                      replacePath: undefined,
                    }));
                  }}
                />
              </MediaUploadProvider>
            </ArticleEditorCommandProvider>
          </Plate>
        </DndProvider>
      </TooltipProvider>
    </ContentLibraryArticleEditorDocumentStateContext.Provider>
  );
}

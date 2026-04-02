"use client";

import * as React from "react";

import { DndPlugin } from "@platejs/dnd";
import { LinkPlugin, triggerFloatingLinkInsert } from "@platejs/link/react";
import { BlockSelectionPlugin } from "@platejs/selection/react";
import { normalizeNodeId, type Value } from "platejs";
import { Plate, usePlateEditor } from "platejs/react";
import { useTranslation } from "react-i18next";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import { resolveAssetRefToPublicUrlPath } from "@/lib/assets/asset-urls";
import { AssetPickerDialog } from "@/pages/workspaces/assets/components/asset-picker-dialog";
import { SlashKit } from "@/components/editor/plugins/slash-kit";
import { Button } from "@arclayer/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@arclayer/ui/field";
import {
  AdvancedBlocksKit,
  applyArticleEditorInsertItem,
  ARTICLE_EDITOR_INSERT_AUDIO,
  ARTICLE_EDITOR_INSERT_FILE,
  ARTICLE_EDITOR_INSERT_IMAGE,
  ARTICLE_EDITOR_INSERT_LINK,
  ARTICLE_EDITOR_INSERT_VIDEO,
  ArticleEditorCommandProvider,
  AutoformatKit,
  BasicNodesKit,
} from "@arclayer/ui/editor";
import { Input } from "@arclayer/ui/input";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { TooltipProvider } from "@arclayer/ui/tooltip";
import {
  isEditorDocumentHydrated,
  shouldApplyExternalDocumentSync,
} from "./content-library-article-editor-document-sync";

const DEFAULT_PLATE_VALUE: Value = normalizeNodeId([{ type: "p", children: [{ text: "" }] }]);
const DEFAULT_MEDIA_WIDTH = 720;

type MediaInsertKind = "audio" | "file" | "image" | "video";

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
    width: DEFAULT_MEDIA_WIDTH,
  };
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
  const [assetPickerState, setAssetPickerState] = React.useState<{
    kind: MediaInsertKind;
    open: boolean;
  }>({ kind: "image", open: false });
  const [mediaUrlDialog, setMediaUrlDialog] = React.useState<{
    kind: MediaInsertKind;
    open: boolean;
    url: string;
  }>({ kind: "image", open: false, url: "" });
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

  const handleInsertItem = React.useCallback((activeEditor: typeof editor, value: string) => {
    if (value === ARTICLE_EDITOR_INSERT_IMAGE) {
      pendingInsertSelectionRef.current = cloneSelection(activeEditor.selection);
      setAssetPickerState({ kind: "image", open: true });
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

    if (value === ARTICLE_EDITOR_INSERT_LINK) {
      activeEditor.tf.focus();
      window.requestAnimationFrame(() => {
        activeEditor.getApi(LinkPlugin).floatingLink.show("insert", activeEditor.id);
        triggerFloatingLinkInsert(activeEditor, { focused: true });
      });
      return;
    }

    applyArticleEditorInsertItem(activeEditor, value);
  }, []);

  const handleOpenMediaInsert = React.useCallback(
    (activeEditor: typeof editor, params: { kind: MediaInsertKind; source: "upload" | "url" }) => {
      pendingInsertSelectionRef.current = cloneSelection(activeEditor.selection);

      if (params.source === "upload") {
        setAssetPickerState({ kind: params.kind, open: true });
        return;
      }

      setMediaUrlDialog({ kind: params.kind, open: true, url: "" });
    },
    [],
  );

  const handleConfirmImage = React.useCallback(
    (next: { assetIds: string[] }) => {
      const assetId = next.assetIds[0];
      if (!assetId) {
        setAssetPickerState((current) => ({ ...current, open: false }));
        return;
      }

      const nextUrl = resolveAssetRefToPublicUrlPath(assetId);
      const selection = pendingInsertSelectionRef.current;

      if (selection) {
        editor.tf.select(selection as never);
      }

      if (!nextUrl) return;
      editor.tf.focus();
      editor.tf.insertNodes(
        buildMediaNode({
          type: editor.getType(getMediaInsertConfig(assetPickerState.kind, t).nodeType),
          url: nextUrl,
        }),
      );
      pendingInsertSelectionRef.current = null;
      setAssetPickerState((current) => ({ ...current, open: false }));
    },
    [assetPickerState.kind, editor, t],
  );

  const handleConfirmMediaUrl = React.useCallback(() => {
    const nextUrl = mediaUrlDialog.url.trim();
    if (!isHttpUrl(nextUrl)) return;

    const selection = pendingInsertSelectionRef.current;
    if (selection) {
      editor.tf.select(selection as never);
    }

    editor.tf.focus();
    editor.tf.insertNodes(
      buildMediaNode({
        name: mediaUrlDialog.kind === "file" ? deriveFileNameFromUrl(nextUrl) : undefined,
        type: editor.getType(getMediaInsertConfig(mediaUrlDialog.kind, t).nodeType),
        url: nextUrl,
      }),
    );

    pendingInsertSelectionRef.current = null;
    setMediaUrlDialog((current) => ({ ...current, open: false, url: "" }));
  }, [editor, mediaUrlDialog.kind, mediaUrlDialog.url, t]);

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
                    source: "upload" | "url";
                  },
                ) => void,
              }}
            >
              {props.children}

              <AssetPickerDialog
                open={assetPickerState.open}
                onOpenChange={(open) => setAssetPickerState((current) => ({ ...current, open }))}
                scope={{ id: props.workspaceId, type: "workspace" }}
                mode="single"
                allowClear={false}
                allowUpload
                uploadPurpose="content_image"
                mimePrefix={getMediaInsertConfig(assetPickerState.kind, t).mimePrefix}
                title={getMediaInsertConfig(assetPickerState.kind, t).title}
                description={getMediaInsertConfig(assetPickerState.kind, t).description}
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
                title={getMediaInsertConfig(mediaUrlDialog.kind, t).title}
                description={getMediaInsertConfig(mediaUrlDialog.kind, t).description}
                contentClassName="sm:max-w-xl"
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
                <FieldGroup className="gap-5">
                  <Field>
                    <FieldLabel>{t("CONTENT_LIBRARY_EDITOR_INSERT_URL_LABEL")}</FieldLabel>
                    <FieldDescription>
                      {t("CONTENT_LIBRARY_EDITOR_INSERT_URL_HINT")}
                    </FieldDescription>
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
                  </Field>
                </FieldGroup>
              </SettingDialog>
            </ArticleEditorCommandProvider>
          </Plate>
        </DndProvider>
      </TooltipProvider>
    </ContentLibraryArticleEditorDocumentStateContext.Provider>
  );
}

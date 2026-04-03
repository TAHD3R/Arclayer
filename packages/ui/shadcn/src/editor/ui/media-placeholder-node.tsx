"use client";

import * as React from "react";

import { PlaceholderProvider, updateUploadHistory } from "@platejs/media/react";
import { AudioLinesIcon, FileUpIcon, FilmIcon, ImageIcon, Loader2Icon } from "lucide-react";
import type { PlateElementProps } from "platejs/react";
import { PlateElement, withHOC } from "platejs/react";
import { useTranslation } from "react-i18next";

import { message } from "@arclayer/ui/admin-toast";
import { Button } from "@arclayer/ui/button";
import { cn } from "@arclayer/lib/utils";

import { useArticleEditorCommands } from "../article-editor-command-context";
import { useMediaUploadContext } from "../media-upload-context";

const DEFAULT_MEDIA_WIDTH = 720;

type PlaceholderMediaType = "audio" | "file" | "img" | "video";

type MediaPlaceholderNodeElement = {
  autoOpen?: boolean;
  children: { text: string }[];
  id?: string;
  mediaType: PlaceholderMediaType;
  type: string;
};

type MediaPlaceholderConfig = {
  accept: string;
  icon: React.ComponentType<{ className?: string }>;
  labelKey: string;
  kind: "audio" | "file" | "image" | "video";
};

const MEDIA_PLACEHOLDER_CONFIG: Record<PlaceholderMediaType, MediaPlaceholderConfig> = {
  audio: {
    accept: "audio/*",
    icon: AudioLinesIcon,
    kind: "audio",
    labelKey: "CONTENT_LIBRARY_EDITOR_INSERT_AUDIO",
  },
  file: {
    accept: "*",
    icon: FileUpIcon,
    kind: "file",
    labelKey: "CONTENT_LIBRARY_EDITOR_INSERT_FILE",
  },
  img: {
    accept: "image/*",
    icon: ImageIcon,
    kind: "image",
    labelKey: "CONTENT_LIBRARY_EDITOR_INSERT_IMAGE",
  },
  video: {
    accept: "video/*",
    icon: FilmIcon,
    kind: "video",
    labelKey: "CONTENT_LIBRARY_EDITOR_INSERT_VIDEO",
  },
};

function createMediaNode(params: {
  file: File;
  mediaType: string;
  placeholderId?: string;
  url: string;
}) {
  return {
    align: "center" as const,
    children: [{ text: "" }],
    isUpload: true,
    name: params.mediaType === "file" ? params.file.name : undefined,
    placeholderId: params.placeholderId,
    type: params.mediaType,
    url: params.url,
    width: DEFAULT_MEDIA_WIDTH,
  };
}

export const MediaPlaceholderElement = withHOC(
  PlaceholderProvider,
  function MediaPlaceholderElement(props: PlateElementProps<MediaPlaceholderNodeElement>) {
    const { editor } = props;
    const { t } = useTranslation("content");
    const commands = useArticleEditorCommands();
    const upload = useMediaUploadContext();
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const autoOpenHandledRef = React.useRef(false);
    const objectUrlRef = React.useRef<string | null>(null);
    const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
    const [isUploading, setIsUploading] = React.useState(false);
    const [progress, setProgress] = React.useState(0);
    const [activeFileName, setActiveFileName] = React.useState("");
    const element = props.element as MediaPlaceholderNodeElement;
    const config = MEDIA_PLACEHOLDER_CONFIG[element.mediaType];

    React.useEffect(() => {
      return () => {
        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current);
        }
      };
    }, []);

    const openFilePicker = React.useCallback(() => {
      inputRef.current?.click();
    }, []);

    const openLibraryPicker = React.useCallback(() => {
      const replacePath = editor.api.findPath(element) ?? undefined;
      commands?.openMediaInsert?.(editor, {
        kind: config.kind,
        replacePath,
        source: "library",
      });
    }, [commands, config.kind, editor, element]);

    const clearPreviewUrl = React.useCallback(() => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      setPreviewUrl(null);
    }, []);

    const replacePlaceholder = React.useCallback(
      (file: File, url: string) => {
        const path = editor.api.findPath(element);
        if (!path) return;

        const node = createMediaNode({
          file,
          mediaType: element.mediaType,
          placeholderId: String(element.id ?? ""),
          url,
        });

        editor.tf.withoutSaving(() => {
          editor.tf.removeNodes({ at: path });
          editor.tf.insertNodes(node, { at: path });
          updateUploadHistory(editor, node);
        });
      },
      [editor, element],
    );

    const handleFile = React.useCallback(
      async (file: File | undefined) => {
        if (!file || isUploading) return;

        setActiveFileName(file.name);
        setIsUploading(true);
        setProgress(0);

        if (element.mediaType === "img") {
          clearPreviewUrl();
          const nextObjectUrl = URL.createObjectURL(file);
          objectUrlRef.current = nextObjectUrl;
          setPreviewUrl(nextObjectUrl);
        }

        try {
          const uploaded = await upload.uploadFile({
            file,
            mediaType: element.mediaType,
            onProgress: ({ progress: nextProgress }) => setProgress(nextProgress),
          });

          replacePlaceholder(file, uploaded.url);
        } catch {
          clearPreviewUrl();
          message.error(
            t("CONTENT_LIBRARY_EDITOR_MEDIA_UPLOAD_FAILED", {
              name: file.name,
            }),
          );
        } finally {
          setIsUploading(false);
          setProgress(0);
          setActiveFileName("");
        }
      },
      [clearPreviewUrl, element.mediaType, isUploading, replacePlaceholder, t, upload],
    );

    React.useEffect(() => {
      if (!element.autoOpen || autoOpenHandledRef.current || isUploading) return;

      autoOpenHandledRef.current = true;
      const path = editor.api.findPath(element);
      if (path) {
        editor.tf.withoutSaving(() => {
          editor.tf.setNodes({ autoOpen: undefined }, { at: path });
        });
      }

      window.setTimeout(() => {
        openFilePicker();
      }, 0);
    }, [editor, element, isUploading, openFilePicker]);

    if (!config) {
      throw new Error(`Unsupported media placeholder type: ${String(element.mediaType)}`);
    }

    const Icon = config.icon;
    const placeholderLabel = t(config.labelKey);
    const showImagePreview = element.mediaType === "img" && Boolean(previewUrl);

    return (
      <PlateElement {...props} as="div" className="my-3">
        <div className="group/media relative" contentEditable={false}>
          <input
            ref={inputRef}
            hidden
            type="file"
            accept={config.accept}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.currentTarget.value = "";
              void handleFile(file);
            }}
          />

          {showImagePreview ? (
            <div className="relative overflow-hidden rounded-lg border border-border/70 bg-muted/20">
              <div className="relative aspect-[16/9]">
                <img
                  className="absolute inset-0 h-full w-full object-cover"
                  src={previewUrl ?? undefined}
                  alt={activeFileName}
                  draggable={false}
                />
              </div>
              <div className="absolute inset-x-3 bottom-3 flex items-center justify-between rounded-full bg-black/60 px-3 py-1.5 text-footnote text-white">
                <span className="truncate">{activeFileName}</span>
                <span className="ml-3 inline-flex items-center gap-1.5">
                  <Loader2Icon className="size-3.5 animate-spin" />
                  {progress}%
                </span>
              </div>
            </div>
          ) : (
            <div
              className={cn(
                "flex items-center gap-3 rounded-lg border border-dashed border-border/80 bg-muted/20 px-4 py-4 transition-colors",
                !isUploading && "hover:border-primary/40 hover:bg-accent/40",
              )}
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-card text-label-secondary shadow-sm">
                {isUploading ? (
                  <Loader2Icon className="size-5 animate-spin" />
                ) : (
                  <Icon className="size-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-footnote font-semibold text-label-primary">
                  {placeholderLabel}
                </div>
                <div className="truncate text-footnote text-label-secondary">
                  {isUploading
                    ? t("CONTENT_LIBRARY_EDITOR_MEDIA_PLACEHOLDER_UPLOADING", {
                        name: activeFileName,
                        progress,
                      })
                    : t("CONTENT_LIBRARY_EDITOR_MEDIA_PLACEHOLDER_ADD", {
                        media: placeholderLabel.toLowerCase(),
                      })}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={isUploading}
                  onClick={openFilePicker}
                >
                  {t("CONTENT_LIBRARY_EDITOR_UPLOAD_FROM_COMPUTER")}
                </Button>
                {commands?.openMediaInsert ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={isUploading}
                    onClick={openLibraryPicker}
                  >
                    {t("CONTENT_LIBRARY_EDITOR_SELECT_FROM_LIBRARY")}
                  </Button>
                ) : null}
              </div>
            </div>
          )}
        </div>
        {props.children}
      </PlateElement>
    );
  },
);

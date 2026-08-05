"use client";

import { type PropsWithChildren, useEffect, useState, type FC } from "react";
import { DownloadIcon, PlusIcon, Trash2Icon } from "lucide-react";
import {
  AttachmentPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  useAuiState,
  useAui,
} from "@assistant-ui/react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/shallow";
import { Dialog, DialogTitle, DialogContent, DialogTrigger } from "@arclayer/ui/dialog";
import { FileTypeIcon } from "@arclayer/ui/icons/file-type-icon";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { Toolbar, ToolbarGroup } from "@/components/common/toolbar";
import { cn } from "@arclayer/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@arclayer/ui/tooltip";

const useFileSrc = (file: File | undefined) => {
  const [src, setSrc] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!file) {
      setSrc(undefined);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setSrc(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  return src;
};

const useAttachmentSrc = () => {
  const { file, src } = useAuiState(
    useShallow((s): { file?: File; src?: string } => {
      if (s.attachment.type !== "image") return {};
      if (s.attachment.file) return { file: s.attachment.file };
      const src = s.attachment.content?.find((c) => c.type === "image")?.image;
      if (!src) return {};
      return { src };
    }),
  );

  return useFileSrc(file) ?? src;
};

type AttachmentPreviewProps = {
  alt: string;
  src: string;
};

const AttachmentPreview: FC<AttachmentPreviewProps> = ({ alt, src }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  return (
    <img
      src={src}
      alt={alt}
      className={cn(
        "block h-auto max-h-[80vh] w-auto max-w-full object-contain",
        isLoaded
          ? "aui-attachment-preview-image-loaded"
          : "aui-attachment-preview-image-loading invisible",
      )}
      onLoad={() => setIsLoaded(true)}
    />
  );
};

function downloadAttachment(src: string, name: string) {
  const anchor = document.createElement("a");
  anchor.href = src;
  anchor.download = name;
  anchor.rel = "noopener noreferrer";
  anchor.target = "_blank";
  anchor.click();
}

function AttachmentPreviewToolbar(props: { name: string; src: string }) {
  const { t } = useTranslation("ai");
  const aui = useAui();
  const canDelete = aui.attachment.source !== "message";

  return (
    <div
      data-slot="attachment-preview-toolbar"
      className="pointer-events-none fixed inset-x-0 bottom-[max(2rem,env(safe-area-inset-bottom))] z-20 flex justify-center px-4"
    >
      <Toolbar className="pointer-events-auto">
        <ToolbarGroup>
          {canDelete ? (
            <AttachmentPrimitive.Remove asChild>
              <TooltipIconButton
                tooltip={t("AI_CHAT_DELETE_ATTACHMENT")}
                aria-label={t("AI_CHAT_DELETE_ATTACHMENT")}
                focusTrigger={false}
                className="size-9 text-label-secondary hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2Icon className="size-4" aria-hidden="true" />
              </TooltipIconButton>
            </AttachmentPrimitive.Remove>
          ) : null}
          <TooltipIconButton
            tooltip={t("AI_CHAT_DOWNLOAD_ATTACHMENT")}
            aria-label={t("AI_CHAT_DOWNLOAD_ATTACHMENT")}
            focusTrigger={false}
            className="size-9 text-label-secondary hover:bg-accent hover:text-label-primary"
            onClick={() => downloadAttachment(props.src, props.name)}
          >
            <DownloadIcon className="size-4" aria-hidden="true" />
          </TooltipIconButton>
        </ToolbarGroup>
      </Toolbar>
    </div>
  );
}

export const AttachmentPreviewDialog: FC<PropsWithChildren> = ({ children }) => {
  const src = useAttachmentSrc();
  const { t } = useTranslation("ai");
  const name = useAuiState((state) => state.attachment.name);

  if (!src) return children;

  return (
    <Dialog>
      <DialogTrigger
        className="aui-attachment-preview-trigger hover:bg-accent/50 cursor-pointer transition-colors"
        asChild
      >
        {children}
      </DialogTrigger>
      <DialogContent
        className="aui-attachment-preview-dialog-content w-fit max-w-[calc(100vw-2rem)] transform-none! filter-none! gap-0 overflow-visible rounded-none border-0 bg-transparent p-0 shadow-none sm:max-w-3xl"
        overlayClassName="backdrop-blur-xs"
        closeButtonClassName="fixed right-4 top-4 z-20 size-9 rounded-full border border-border/70 bg-card/90 text-card-foreground opacity-100 shadow-sm backdrop-blur-sm hover:bg-accent hover:text-accent-foreground"
        closeButtonLabel={t("AI_CHAT_CLOSE_ATTACHMENT_PREVIEW")}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogTitle className="aui-sr-only sr-only">
          {t("AI_CHAT_ATTACHMENT_PREVIEW_TITLE", { name })}
        </DialogTitle>
        <div className="aui-attachment-preview relative mx-auto flex max-h-[80dvh] max-w-full items-center justify-center overflow-hidden">
          <AttachmentPreview alt={t("AI_CHAT_ATTACHMENT_PREVIEW_ALT", { name })} src={src} />
        </div>
        <AttachmentPreviewToolbar name={name} src={src} />
      </DialogContent>
    </Dialog>
  );
};

const AttachmentThumb: FC = () => {
  const src = useAttachmentSrc();
  const [failedSrc, setFailedSrc] = useState<string | undefined>();
  const { name, contentType } = useAuiState(
    useShallow((s) => ({
      name: s.attachment.name,
      contentType: s.attachment.contentType,
    })),
  );
  const showPreview = Boolean(src && failedSrc !== src);

  return (
    <span className="aui-attachment-tile-avatar flex h-full w-full shrink-0 items-center justify-center overflow-hidden rounded-none">
      {showPreview ? (
        <img
          src={src}
          alt=""
          className="aui-attachment-tile-image size-full object-cover"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <FileTypeIcon
          filename={name}
          mimeType={contentType}
          size={32}
          className="aui-attachment-file-type-icon shrink-0"
        />
      )}
    </span>
  );
};

const AttachmentUI: FC = () => {
  const { t } = useTranslation("ai");
  const { isImage, name } = useAuiState(
    useShallow((s) => ({
      isImage: s.attachment.type === "image",
      name: s.attachment.name,
    })),
  );
  const previewLabel = t("AI_CHAT_PREVIEW_ATTACHMENT", { name });

  return (
    <Tooltip side="top">
      <AttachmentPrimitive.Root
        className={cn(
          "aui-attachment-root relative",
          isImage && "aui-attachment-root-message only:*:first:size-24",
        )}
      >
        <AttachmentPreviewDialog>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="aui-attachment-tile bg-muted size-14 cursor-pointer overflow-hidden rounded-[calc(var(--composer-radius)-var(--composer-padding))] border transition-opacity hover:opacity-75"
              aria-label={previewLabel}
            >
              <AttachmentThumb />
            </button>
          </TooltipTrigger>
        </AttachmentPreviewDialog>
      </AttachmentPrimitive.Root>
      <TooltipContent>
        <AttachmentPrimitive.Name />
      </TooltipContent>
    </Tooltip>
  );
};

export const UserMessageAttachments: FC = () => {
  return (
    <div className="aui-user-message-attachments-end col-span-full col-start-1 row-start-1 flex w-full flex-row justify-end gap-2">
      <MessagePrimitive.Attachments>{() => <AttachmentUI />}</MessagePrimitive.Attachments>
    </div>
  );
};

export const ComposerAddAttachment: FC = () => {
  const { t } = useTranslation(["ai", "common"]);

  return (
    <ComposerPrimitive.AddAttachment asChild>
      <TooltipIconButton
        tooltip={t("ai:AI_CHAT_ADD_ATTACHMENT")}
        side="bottom"
        variant="ghost"
        size="icon"
        className="aui-composer-add-attachment hover:bg-muted-foreground/15 dark:border-muted-foreground/15 dark:hover:bg-muted-foreground/30 size-7 !rounded-full p-1 text-xs font-semibold"
        aria-label={t("ai:AI_CHAT_ADD_ATTACHMENT")}
      >
        <PlusIcon className="aui-attachment-add-icon size-4.5 stroke-[1.5px]" />
      </TooltipIconButton>
    </ComposerPrimitive.AddAttachment>
  );
};

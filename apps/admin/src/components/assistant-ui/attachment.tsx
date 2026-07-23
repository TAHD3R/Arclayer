"use client";

import { type PropsWithChildren, useEffect, useState, type FC } from "react";
import { XIcon, PlusIcon, FileText, ImageIcon } from "lucide-react";
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
import { Avatar, AvatarImage, AvatarFallback } from "@arclayer/ui/avatar";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
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
  src: string;
};

const AttachmentPreview: FC<AttachmentPreviewProps> = ({ src }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  return (
    <img
      src={src}
      alt="Attachment preview"
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

const AttachmentPreviewDialog: FC<PropsWithChildren> = ({ children }) => {
  const src = useAttachmentSrc();

  if (!src) return children;

  return (
    <Dialog>
      <DialogTrigger
        className="aui-attachment-preview-trigger hover:bg-accent/50 cursor-pointer transition-colors"
        asChild
      >
        {children}
      </DialogTrigger>
      <DialogContent className="aui-attachment-preview-dialog-content [&>button]:bg-foreground/60 [&_svg]:text-background [&>button]:hover:[&_svg]:text-destructive p-2 sm:max-w-3xl [&>button]:rounded-full [&>button]:p-1 [&>button]:opacity-100 [&>button]:ring-0!">
        <DialogTitle className="aui-sr-only sr-only">Image Attachment Preview</DialogTitle>
        <div className="aui-attachment-preview bg-background relative mx-auto flex max-h-[80dvh] w-full items-center justify-center overflow-hidden">
          <AttachmentPreview src={src} />
        </div>
      </DialogContent>
    </Dialog>
  );
};

const AttachmentThumb: FC = () => {
  const src = useAttachmentSrc();

  return (
    <Avatar className="aui-attachment-tile-avatar h-full w-full rounded-none">
      <AvatarImage
        src={src}
        alt="Attachment preview"
        className="aui-attachment-tile-image object-cover"
      />
      <AvatarFallback>
        <FileText className="aui-attachment-tile-fallback-icon text-muted-foreground size-8" />
      </AvatarFallback>
    </Avatar>
  );
};

const AttachmentUI: FC = () => {
  const aui = useAui();
  const isComposer = aui.attachment.source !== "message";

  const isImage = useAuiState((s) => s.attachment.type === "image");
  const typeLabel = useAuiState((s) => {
    const type = s.attachment.type;
    switch (type) {
      case "image":
        return "Image";
      case "document":
        return "Document";
      case "file":
        return "File";
      default:
        return type;
    }
  });

  if (isComposer) return <ComposerAttachmentTag isImage={isImage} typeLabel={typeLabel} />;

  return (
    <Tooltip side="top">
      <AttachmentPrimitive.Root
        className={cn(
          "aui-attachment-root relative",
          isImage && !isComposer && "aui-attachment-root-message only:*:first:size-24",
        )}
      >
        <AttachmentPreviewDialog>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="aui-attachment-tile bg-muted size-14 cursor-pointer overflow-hidden rounded-[calc(var(--composer-radius)-var(--composer-padding))] border transition-opacity hover:opacity-75"
              aria-label={`${typeLabel} attachment`}
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

const ComposerAttachmentTag: FC<{ isImage: boolean; typeLabel: string }> = ({
  isImage,
  typeLabel,
}) => {
  const Icon = isImage ? ImageIcon : FileText;
  const name = (
    <span className="flex min-w-0 items-center gap-1.5">
      <Icon className="size-3.5 shrink-0 text-label-secondary" aria-hidden="true" />
      <span className="max-w-40 truncate text-caption font-semibold text-label-primary">
        <AttachmentPrimitive.Name />
      </span>
    </span>
  );

  return (
    <AttachmentPrimitive.Root className="group/tag inline-flex max-w-full items-center gap-1 rounded-full border border-border/70 bg-background/70 py-1 pr-1.5 pl-2">
      {isImage ? (
        <AttachmentPreviewDialog>
          <button
            type="button"
            className="min-w-0 cursor-zoom-in rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`${typeLabel} attachment`}
          >
            {name}
          </button>
        </AttachmentPreviewDialog>
      ) : (
        name
      )}
      <AttachmentRemove variant="tag" />
    </AttachmentPrimitive.Root>
  );
};

const AttachmentRemove: FC<{ variant?: "tile" | "tag" }> = ({ variant = "tile" }) => {
  const { t } = useTranslation(["ai", "common"]);

  return (
    <AttachmentPrimitive.Remove asChild>
      <TooltipIconButton
        tooltip={t("ai:AI_CHAT_REMOVE_ATTACHMENT")}
        className={cn(
          "aui-attachment-tile-remove !rounded-full",
          variant === "tag"
            ? "size-5 text-label-tertiary opacity-0 transition-opacity group-hover/tag:opacity-100 focus-visible:opacity-100 hover:bg-muted hover:text-label-primary"
            : "absolute end-1.5 top-1.5 size-3.5 bg-white text-muted-foreground opacity-100 shadow-sm hover:bg-white! hover:[&_svg]:text-destructive [&_svg]:text-black",
        )}
        side="top"
      >
        <XIcon className="aui-attachment-remove-icon size-3 dark:stroke-[2.5px]" />
      </TooltipIconButton>
    </AttachmentPrimitive.Remove>
  );
};

export const UserMessageAttachments: FC = () => {
  return (
    <div className="aui-user-message-attachments-end col-span-full col-start-1 row-start-1 flex w-full flex-row justify-end gap-2">
      <MessagePrimitive.Attachments>{() => <AttachmentUI />}</MessagePrimitive.Attachments>
    </div>
  );
};

export const ComposerAttachments: FC = () => {
  return (
    <div className="aui-composer-attachments flex w-full flex-row items-center gap-2 overflow-x-auto empty:hidden">
      <ComposerPrimitive.Attachments>{() => <AttachmentUI />}</ComposerPrimitive.Attachments>
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

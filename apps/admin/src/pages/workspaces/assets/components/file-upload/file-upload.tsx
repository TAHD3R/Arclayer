import { Button, Progress } from "antd";
import {
  CheckCircle2,
  CircleHelp,
  CloudUpload,
  FileWarning,
  RotateCcw,
  Trash2,
  XCircle,
} from "lucide-react";
import type { ComponentPropsWithRef, ReactNode } from "react";
import { useMemo } from "react";
import { useDropzone, type FileError, type FileRejection } from "react-dropzone";
import { useTranslation } from "react-i18next";

import { Tooltip, TooltipTrigger, TooltipContent } from "@celestial/ui/tooltip";
import { FileTypeIcon } from "@celestial/ui/icon/file-type-icon";
import { cn } from "@celestial/lib/utils";

export type FileUploadItemStatus = "pending" | "uploading" | "success" | "error" | "canceled";

export interface FileUploadPanelItem {
  id: string;
  file: File;
  status: FileUploadItemStatus;
  progress: number; // 0-100
  errorText?: string | null;
}

export interface FileUploadPanelProps {
  items: FileUploadPanelItem[];
  isDisabled?: boolean;
  className?: string;
  onPickFiles: (files: File[]) => void;
  onDeleteItem: (id: string) => void;
  onRetryItem?: (id: string) => void;
  isItemActionDisabled?: (id: string) => boolean;
  dropZoneHintSummary?: ReactNode;
  dropZoneHintDetail?: ReactNode;
}

export interface FileUploadDropZoneProps {
  className?: string;
  isDisabled?: boolean;
  accept?: string;
  allowsMultiple?: boolean;
  maxSizeBytes?: number;
  hintSummary?: ReactNode;
  hintDetail?: ReactNode;
  onPickFiles?: (files: File[]) => void;
  onDropUnacceptedFiles?: (files: File[]) => void;
  onSizeLimitExceed?: (files: File[]) => void;
}

function splitAcceptString(accept: string | undefined): string[] {
  if (!accept) return [];
  return accept
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function isFileTypeAccepted(file: File, accept: string | undefined): boolean {
  if (!accept) return true;
  const acceptedTypes = splitAcceptString(accept);
  return acceptedTypes.some((acceptedType) => {
    if (acceptedType.startsWith(".")) {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (!ext) return false;
      return `.${ext}` === acceptedType.toLowerCase();
    }

    if (acceptedType.endsWith("/*")) {
      const prefix = acceptedType.split("/")[0];
      return file.type.startsWith(`${prefix}/`);
    }

    return file.type === acceptedType;
  });
}

function toFiles(rejections: FileRejection[]): File[] {
  return rejections.map((r) => r.file);
}

function getReadableFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const formatted = unitIndex === 0 ? String(Math.round(value)) : value.toFixed(value < 10 ? 1 : 0);
  return `${formatted} ${units[unitIndex]}`;
}

export interface FileUploadListItemProps {
  name: string;
  sizeBytes: number;
  mimeType?: string | null;
  progress: number; // 0-100
  status: FileUploadItemStatus;
  errorText?: string | null;
  isActionDisabled?: boolean;
  onDelete?: () => void;
  onRetry?: () => void;
  className?: string;
}

export function FileUploadListItemProgressFill(props: FileUploadListItemProps) {
  const { t } = useTranslation();
  const progress = Math.min(100, Math.max(0, Math.round(props.progress)));
  const isComplete = props.status === "success" || progress >= 100;
  const isFailed = props.status === "error";

  const statusLabel = useMemo(() => {
    switch (props.status) {
      case "pending":
        return t("assets:ASSET_UPLOAD_STATUS_PENDING");
      case "uploading":
        return t("assets:ASSET_UPLOAD_STATUS_UPLOADING");
      case "success":
        return t("assets:ASSET_UPLOAD_STATUS_SUCCESS");
      case "canceled":
        return t("assets:ASSET_UPLOAD_STATUS_CANCELED");
      case "error":
        return t("assets:ASSET_UPLOAD_STATUS_ERROR");
    }
  }, [props.status, t]);

  const statusIcon = useMemo(() => {
    if (props.status === "success") return <CheckCircle2 className="size-4 text-primary" />;
    if (props.status === "error") return <XCircle className="size-4 text-error-primary" />;
    if (props.status === "canceled") return <FileWarning className="size-4 text-label-secondary" />;
    if (props.status === "uploading")
      return <CloudUpload className="size-4 text-label-secondary" />;
    return null;
  }, [props.status]);

  return (
    <li
      className={cn(
        "relative flex gap-3 overflow-hidden rounded-xl bg-card p-4",
        "border border-border/60",
        isFailed ? "ring-2 ring-destructive ring-inset" : null,
        props.className,
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          "absolute inset-0 size-full bg-secondary transition duration-100 ease-linear",
          isComplete ? "opacity-0" : null,
        )}
        style={{ transform: `translateX(-${100 - progress}%)` }}
      />

      <div className="relative shrink-0">
        <FileTypeIcon
          filename={props.name}
          mimeType={props.mimeType ?? undefined}
          theme="auto"
          className="size-10"
        />
      </div>

      <div className="relative min-w-0 flex-1">
        <div className="flex min-w-0 items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-headline text-label-primary" title={props.name}>
              {props.name}
            </div>
            <div className="mt-0.5 flex min-w-0 items-center gap-2 text-callout text-label-secondary">
              <span className="truncate">{getReadableFileSize(props.sizeBytes)}</span>
              <span className="h-3 w-px shrink-0 rounded-full bg-border-primary" />
              <span className="inline-flex min-w-0 items-center gap-1">
                {statusIcon}
                <span className="min-w-0 truncate">{statusLabel}</span>
              </span>
              {props.status === "uploading" ? (
                <span className="tabular-nums">{progress}%</span>
              ) : null}
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            {props.status === "error" && props.onRetry ? (
              <Button
                type="text"
                className={cn("px-2")}
                icon={<RotateCcw className="size-4" />}
                disabled={props.isActionDisabled}
                onClick={props.onRetry}
                autoInsertSpace={false}
              >
                {t("assets:ASSET_UPLOAD_ACTION_RETRY")}
              </Button>
            ) : null}

            {props.onDelete ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="text"
                    className={cn("px-2")}
                    icon={<Trash2 className="size-4" />}
                    disabled={props.isActionDisabled}
                    onClick={props.onDelete}
                    autoInsertSpace={false}
                  />
                </TooltipTrigger>
                <TooltipContent>{t("assets:ASSET_UPLOAD_REMOVE")}</TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        </div>

        <div className="mt-2">
          <Progress
            percent={progress}
            showInfo={false}
            status={
              props.status === "error"
                ? "exception"
                : props.status === "success"
                  ? "active"
                  : "active"
            }
          />
          {props.errorText ? (
            <div className="mt-1 text-callout text-error-primary">{props.errorText}</div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function FileUploadDropZone(props: FileUploadDropZoneProps) {
  const { t } = useTranslation();

  const hintSummary = props.hintSummary ?? t("assets:ASSET_UPLOAD_DROP_HINT");
  const hintDetail = props.hintDetail ?? t("assets:ASSET_UPLOAD_DROP_HINT_DETAIL");

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    multiple: props.allowsMultiple ?? true,
    noClick: true,
    disabled: props.isDisabled,
    validator: (file) => {
      const errors: FileError[] = [];

      if (props.maxSizeBytes && file.size > props.maxSizeBytes) {
        errors.push({
          code: "file-too-large",
          message: "File is larger than the allowed maximum size.",
        });
      }
      if (!isFileTypeAccepted(file, props.accept)) {
        errors.push({ code: "file-invalid-type", message: "File type is not allowed." });
      }

      return errors.length ? errors : null;
    },
    onDropAccepted: (files) => props.onPickFiles?.(files),
    onDropRejected: (rejections) => {
      const oversized = rejections.filter((r) => r.errors.some((e) => e.code === "file-too-large"));
      const invalidType = rejections.filter((r) =>
        r.errors.some((e) => e.code === "file-invalid-type"),
      );
      if (oversized.length) props.onSizeLimitExceed?.(toFiles(oversized));
      if (invalidType.length) props.onDropUnacceptedFiles?.(toFiles(invalidType));
    },
  });

  const rootProps = getRootProps({
    role: "button",
    tabIndex: props.isDisabled ? -1 : 0,
    onClick: () => {
      if (props.isDisabled) return;
      open();
    },
    onKeyDown: (event) => {
      if (props.isDisabled) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      open();
    },
  });

  return (
    <div
      {...rootProps}
      className={cn(
        "relative flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center transition",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        props.isDisabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        isDragActive
          ? "border-primary bg-accent/35"
          : "border-border/70 bg-card hover:border-border hover:bg-accent/25",
        props.className,
      )}
    >
      <input {...getInputProps()} />

      <CloudUpload
        className={cn("size-10", isDragActive ? "text-primary" : "text-label-secondary")}
      />

      <div className="flex flex-col items-center gap-1 text-center">
        <div className="flex flex-wrap items-center justify-center gap-x-1 gap-y-0.5">
          <Button
            type="link"
            disabled={props.isDisabled}
            className={cn("h-auto p-0 text-body font-medium")}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (props.isDisabled) return;
              open();
            }}
            autoInsertSpace={false}
          >
            {t("assets:ASSET_UPLOAD_DROP_TITLE")}
          </Button>
          <span className="text-body text-label-secondary">
            {t("assets:ASSET_UPLOAD_DROP_DESC")}
          </span>
          <span className="text-body text-label-secondary">{hintSummary}</span>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={cn(
                  "inline-flex size-6 items-center justify-center rounded-md text-label-secondary transition-colors",
                  "hover:bg-accent/35 hover:text-label-primary",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                )}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
              >
                <CircleHelp className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <div className="max-w-xs whitespace-pre-line text-callout">{hintDetail}</div>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

export interface FileUploadRootProps extends ComponentPropsWithRef<"div"> {}

export function FileUploadRoot(props: FileUploadRootProps) {
  return <div {...props} className={cn("flex flex-col gap-4", props.className)} />;
}

export interface FileUploadListProps extends ComponentPropsWithRef<"ul"> {}

export function FileUploadList(props: FileUploadListProps) {
  return <ul {...props} className={cn("flex flex-col gap-3", props.className)} />;
}

export function FileUploadPanel(props: FileUploadPanelProps) {
  return (
    <div className={cn("flex flex-col", props.className)}>
      <div className="px-5 pt-4">
        <FileUploadDropZone
          isDisabled={props.isDisabled}
          hintSummary={props.dropZoneHintSummary}
          hintDetail={props.dropZoneHintDetail}
          onPickFiles={props.onPickFiles}
        />
      </div>

      {props.items.length ? (
        <div className="px-5 pt-4 pb-5">
          <div className={cn("mt-3 max-h-80 overflow-x-hidden overflow-y-auto bg-background")}>
            <FileUploadList className="pr-1">
              {props.items.map((it) => (
                <FileUploadListItemProgressFill
                  key={it.id}
                  name={it.file.name}
                  sizeBytes={it.file.size}
                  mimeType={it.file.type || null}
                  progress={it.progress}
                  status={it.status}
                  errorText={it.errorText ?? null}
                  isActionDisabled={props.isItemActionDisabled?.(it.id)}
                  onDelete={() => props.onDeleteItem(it.id)}
                  onRetry={
                    it.status === "error" && props.onRetryItem
                      ? () => props.onRetryItem?.(it.id)
                      : undefined
                  }
                />
              ))}
            </FileUploadList>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export const FileUpload = {
  Root: FileUploadRoot,
  DropZone: FileUploadDropZone,
  List: FileUploadList,
  ListItemProgressFill: FileUploadListItemProgressFill,
  Panel: FileUploadPanel,
  getReadableFileSize,
};

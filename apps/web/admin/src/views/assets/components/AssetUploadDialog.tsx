import { Button, Tooltip } from "antd";
import {
  CheckCircle2,
  CloudUpload,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  File as FileIcon,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import {
  abortUpload,
  commitUploadPart,
  completeUpload,
  initUpload,
  presignUploadPart,
  uploadPart,
} from "@/api/uploads";
import { notifyError, notifySuccessText } from "@/utils/notifications";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/animate-ui/components/radix/dialog";

type UploadItemStatus = "pending" | "uploading" | "success" | "error" | "canceled";

type UploadItem = {
  id: string;
  file: File;
  status: UploadItemStatus;
  progress: number; // 0-100
  uploadedBytes: number;
  errorText?: string;
  uploadId?: string;
  assetId?: string;
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "-";
  const units = ["B", "KB", "MB", "GB"] as const;
  let v = bytes;
  let idx = 0;
  while (v >= 1024 && idx < units.length - 1) {
    v /= 1024;
    idx += 1;
  }
  const n = idx === 0 ? String(Math.round(v)) : v.toFixed(v < 10 ? 1 : 0);
  return `${n} ${units[idx]}`;
}

function getFileTypeIcon(file: File) {
  const mime = (file.type || "").toLowerCase();
  if (mime.startsWith("image/")) return <FileImage className="size-5 text-sky-500" />;
  if (mime.startsWith("video/")) return <FileVideo className="size-5 text-purple-500" />;
  if (mime.startsWith("audio/")) return <FileAudio className="size-5 text-amber-500" />;
  if (mime.startsWith("text/")) return <FileText className="size-5 text-emerald-500" />;
  return <FileIcon className="size-5 text-muted-foreground" />;
}

function nextLocalId() {
  // 足够作为前端列表 key；不需要引入 uuid 依赖。
  return `upload-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function AssetUploadDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultFolderId?: string;
  onUploaded?: (assetIds: string[]) => void;
}) {
  const { t } = useTranslation();
  const controllersRef = useRef(new Map<string, AbortController>());
  const [items, setItems] = useState<UploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const folderId = props.defaultFolderId;
  const visibility = "public";

  const resetState = useCallback(() => {
    controllersRef.current.forEach((c) => c.abort());
    controllersRef.current.clear();
    setItems([]);
    setIsUploading(false);
  }, []);

  const closeDialog = useCallback(() => {
    props.onOpenChange(false);
  }, [props]);

  const onDrop = useCallback((files: File[]) => {
    if (!files.length) return;
    setItems((prev) => [
      ...prev,
      ...files.map((f) => ({
        id: nextLocalId(),
        file: f,
        status: "pending" as const,
        progress: 0,
        uploadedBytes: 0,
      })),
    ]);
  }, []);

  const {
    getRootProps,
    getInputProps,
    isDragActive,
    open: openFileDialog,
  } = useDropzone({
    multiple: true,
    noClick: true,
    onDrop,
  });

  const canStart = items.some((it) => it.status === "pending" || it.status === "error");
  const hasUploading = items.some((it) => it.status === "uploading");

  const abortItem = useCallback(async (item: UploadItem) => {
    const controller = controllersRef.current.get(item.id);
    controller?.abort();
    controllersRef.current.delete(item.id);
    if (item.uploadId) {
      try {
        await abortUpload(item.uploadId);
      } catch {
        // abort 本身失败不影响前端收敛；避免二次报错打扰用户。
      }
    }
  }, []);

  const removeItem = useCallback(
    async (id: string) => {
      const target = items.find((x) => x.id === id);
      if (!target) return;
      if (target.status === "uploading") {
        await abortItem(target);
      }
      setItems((prev) => prev.filter((x) => x.id !== id));
    },
    [abortItem, items],
  );

  const updateItem = useCallback((id: string, patch: Partial<UploadItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const uploadSingle = useCallback(
    async (item: UploadItem) => {
      const controller = new AbortController();
      controllersRef.current.set(item.id, controller);
      updateItem(item.id, {
        status: "uploading",
        progress: 0,
        uploadedBytes: 0,
        errorText: undefined,
      });

      try {
        const init = await initUpload({
          purpose: "library",
          filename: item.file.name,
          mime: item.file.type || null,
          sizeBytes: item.file.size,
          expectedSha256: null,
          // 为了降低心智负担，这里使用系统默认上传策略：library 默认 public。
          // 用户如果需要调整可见性/目录，后续可以在资源详情里进行管理（待实现）。
          visibility,
          indexable: false,
          folderId: folderId || null,
        });

        updateItem(item.id, { uploadId: init.uploadId });

        const chunkSize = Math.max(1, Number(init.chunkSize || 0));
        const totalParts = Math.max(1, Number(init.totalParts || 1));
        const method = String(init.method || "local");

        const uploadChunkLocal = async (partNumber: number, chunk: Blob) => {
          await uploadPart({
            uploadId: init.uploadId,
            partNumber,
            chunk,
            signal: controller.signal,
          });
        };

        const uploadChunkS3 = async (partNumber: number, chunk: Blob) => {
          const presign = await presignUploadPart({ uploadId: init.uploadId, partNumber });
          const res = await fetch(presign.url, {
            method: presign.method || "PUT",
            headers: presign.headers || {},
            body: chunk,
            signal: controller.signal,
          });
          if (!res.ok) {
            throw new Error(t("assets:ASSET_UPLOAD_S3_PUT_FAILED"));
          }
          const etag = res.headers.get("etag") || res.headers.get("ETag");
          if (!etag) {
            throw new Error(t("assets:ASSET_UPLOAD_S3_ETAG_MISSING"));
          }
          await commitUploadPart({
            uploadId: init.uploadId,
            partNumber,
            payload: {
              etag,
              sizeBytes: chunk.size,
            },
          });
        };

        let uploadedBytes = 0;
        for (let part = 1; part <= totalParts; part += 1) {
          const start = (part - 1) * chunkSize;
          const end = Math.min(item.file.size, start + chunkSize);
          const chunk = item.file.slice(start, end);

          if (method === "s3_multipart") {
            await uploadChunkS3(part, chunk);
          } else {
            await uploadChunkLocal(part, chunk);
          }

          uploadedBytes += chunk.size;
          const pct = item.file.size > 0 ? Math.round((uploadedBytes / item.file.size) * 100) : 100;
          updateItem(item.id, {
            uploadedBytes,
            progress: Math.min(100, Math.max(0, pct)),
          });
        }

        const done = await completeUpload(init.uploadId);
        updateItem(item.id, { status: "success", progress: 100, assetId: done.assetId });
        controllersRef.current.delete(item.id);
        return done.assetId;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          updateItem(item.id, { status: "canceled", errorText: t("assets:ASSET_UPLOAD_CANCELED") });
          return null;
        }
        updateItem(item.id, {
          status: "error",
          errorText: err instanceof Error ? err.message : t("assets:ASSET_UPLOAD_FAILED_GENERIC"),
        });
        notifyError(err);
        return null;
      } finally {
        controllersRef.current.delete(item.id);
      }
    },
    [folderId, t, updateItem],
  );

  const startUpload = useCallback(async () => {
    if (isUploading) return;
    setIsUploading(true);
    try {
      const assetIds: string[] = [];
      // 顺序上传：更稳，且避免同时占用过多带宽/内存。
      for (const it of items) {
        if (it.status !== "pending" && it.status !== "error") continue;
        const id = await uploadSingle(it);
        if (id) assetIds.push(id);
      }
      if (assetIds.length) {
        notifySuccessText(t("assets:ASSET_UPLOAD_SUCCESS"));
        props.onUploaded?.(assetIds);
      }
    } finally {
      setIsUploading(false);
    }
  }, [isUploading, items, props, t, uploadSingle]);

  const abortAllAndClose = useCallback(async () => {
    // 关闭时：尽量收敛在进行中的上传，避免“后台还在传但用户以为取消了”。
    const uploading = items.filter((x) => x.status === "uploading");
    for (const it of uploading) {
      await abortItem(it);
    }
    resetState();
    closeDialog();
  }, [abortItem, closeDialog, items, resetState]);

  const onDialogOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        if (hasUploading) {
          void abortAllAndClose();
          return;
        }
        closeDialog();
        resetState();
        return;
      }
      props.onOpenChange(true);
    },
    [abortAllAndClose, closeDialog, hasUploading, props, resetState],
  );

  return (
    <Dialog open={props.open} onOpenChange={onDialogOpenChange}>
      <DialogContent
        showCloseButton
        className={cn(
          "p-0",
          // DialogContent 基类在 sm+ 会附带 `sm:max-w-lg`，当上传多个文件时内容更拥挤，
          // 容易出现“内容宽度 > dialog，导致被裁切”的观感；这里显式覆盖为更宽的响应式宽度。
          "max-w-[min(920px,calc(100vw-2rem))] sm:max-w-[min(920px,calc(100vw-2rem))]",
        )}
      >
        <DialogHeader className="px-5 pt-4 pb-2 border-b">
          <DialogTitle className="font-bold!">{t("assets:ASSET_UPLOAD_DIALOG_TITLE")}</DialogTitle>
        </DialogHeader>

        <div className="px-5 pt-4">
          <div
            {...getRootProps()}
            className={cn(
              "relative rounded-xl border border-dashed",
              "p-8 sm:p-10",
              "transition",
              isDragActive ? "border-primary bg-primary/5" : "border-border/70 hover:border-border",
            )}
          >
            <input {...getInputProps()} />

            <div className="flex flex-col items-center text-center">
              <CloudUpload
                className={cn("size-10", isDragActive ? "text-primary" : "text-muted-foreground")}
              />
              <div className="mt-3 text-base font-medium">
                {t("assets:ASSET_UPLOAD_DROP_TITLE")}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {t("assets:ASSET_UPLOAD_DROP_DESC")}
              </div>

              <div className="mt-4">
                <Button type="primary" disabled={hasUploading} onClick={() => openFileDialog()}>
                  {t("assets:ASSET_UPLOAD_PICK_FILES")}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="px-5 pt-4 pb-5">
          <div className="font-semibold">{t("assets:ASSET_UPLOAD_LIST_TITLE")}</div>

          <div
            className={cn("max-h-80 overflow-auto", items.length ? "bg-background" : "bg-muted/20")}
          >
            {items.length ? (
              <div className="divide-y">
                {items.map((it) => (
                  <div
                    key={it.id}
                    className={cn("px-4 py-3", it.status === "error" ? "bg-destructive/5" : "")}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">{getFileTypeIcon(it.file)}</div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-bold" title={it.file.name}>
                              {it.file.name}
                            </div>
                            <div className="mt-0.5 text-sm text-muted-foreground">
                              {formatBytes(it.file.size)}
                            </div>
                          </div>

                          <div className="shrink-0 flex items-center gap-2">
                            {it.status === "success" ? (
                              <CheckCircle2 className="size-5 text-emerald-600" />
                            ) : null}

                            <Tooltip title={t("assets:ASSET_UPLOAD_REMOVE")}>
                              <Button
                                size="small"
                                type="text"
                                icon={
                                  it.status === "uploading" ? (
                                    <X className="size-4" />
                                  ) : (
                                    <Trash2 className="size-4" />
                                  )
                                }
                                disabled={isUploading && it.status !== "uploading"}
                                onClick={() => void removeItem(it.id)}
                              />
                            </Tooltip>
                          </div>
                        </div>

                        <div className="mt-2">
                          <div className="h-1.5 w-full rounded-full bg-muted">
                            <div
                              className={cn(
                                "h-1.5 rounded-full transition-[width] duration-200",
                                it.status === "error"
                                  ? "bg-destructive"
                                  : it.status === "success"
                                    ? "bg-emerald-600"
                                    : "bg-primary",
                              )}
                              style={{ width: `${Math.min(100, Math.max(0, it.progress))}%` }}
                            />
                          </div>
                          <div className="mt-1 flex items-center justify-between text-sm text-muted-foreground">
                            <span>
                              {it.status === "pending"
                                ? t("assets:ASSET_UPLOAD_STATUS_PENDING")
                                : it.status === "uploading"
                                  ? t("assets:ASSET_UPLOAD_STATUS_UPLOADING")
                                  : it.status === "success"
                                    ? t("assets:ASSET_UPLOAD_STATUS_SUCCESS")
                                    : it.status === "canceled"
                                      ? t("assets:ASSET_UPLOAD_STATUS_CANCELED")
                                      : t("assets:ASSET_UPLOAD_STATUS_ERROR")}
                            </span>
                            <span>{it.progress}%</span>
                          </div>

                          {it.errorText ? (
                            <div className="mt-1 text-xs text-destructive">{it.errorText}</div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-6 text-sm text-muted-foreground">
                {t("assets:ASSET_UPLOAD_LIST_EMPTY")}
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <Button onClick={() => void abortAllAndClose()} disabled={isUploading && !hasUploading}>
              {t("assets:ASSET_UPLOAD_ACTION_CANCEL")}
            </Button>
            <Button
              type="primary"
              disabled={!canStart || isUploading}
              onClick={() => void startUpload()}
            >
              {isUploading
                ? t("assets:ASSET_UPLOAD_ACTION_UPLOADING")
                : t("assets:ASSET_UPLOAD_ACTION_START")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

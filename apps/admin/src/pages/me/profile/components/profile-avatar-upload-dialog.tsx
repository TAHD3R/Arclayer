import { Button } from "antd";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  abortAvatarUpload,
  commitAvatarUploadPart,
  completeAvatarUpload,
  initAvatarUpload,
  presignAvatarUploadPart,
  uploadAvatarPart,
} from "@/api/uploads";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { cn } from "@celestial/lib/utils";
import { SettingDialog } from "@celestial/ui/setting-dialog";
import {
  FileUpload,
  type FileUploadItemStatus,
  type FileUploadPanelItem,
} from "@/pages/workspaces/assets/components/file-upload/file-upload";

type UploadItem = {
  id: string;
  file: File;
  status: FileUploadItemStatus;
  progress: number; // 0-100
  uploadedBytes: number;
  errorText?: string;
  uploadId?: string;
  assetId?: string;
};

function nextLocalId(): string {
  return `avatar-upload-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function runSequentially<T>(
  items: T[],
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  return items.reduce<Promise<void>>(
    (p, item, index) => p.then(() => fn(item, index)),
    Promise.resolve(),
  );
}

export function MeAvatarUploadDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded?: (assetIds: string[]) => void;
}) {
  const { t } = useTranslation(["assets", "common"]);
  const controllersRef = useRef(new Map<string, AbortController>());

  const [items, setItems] = useState<UploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const canStart = useMemo(
    () => items.some((it) => it.status === "pending" || it.status === "error"),
    [items],
  );
  const uploadingItemIds = useMemo(
    () => new Set(items.filter((it) => it.status === "uploading").map((it) => it.id)),
    [items],
  );
  const hasUploading = uploadingItemIds.size > 0;
  const fileUploadPanelItems = useMemo<FileUploadPanelItem[]>(() => items, [items]);

  const resetState = useCallback(() => {
    controllersRef.current.forEach((c) => c.abort());
    controllersRef.current.clear();
    setItems([]);
    setIsUploading(false);
  }, []);

  const closeDialog = useCallback(() => {
    props.onOpenChange(false);
  }, [props]);

  const updateItem = useCallback((id: string, patch: Partial<UploadItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const abortItem = useCallback(async (item: UploadItem) => {
    const controller = controllersRef.current.get(item.id);
    controller?.abort();
    controllersRef.current.delete(item.id);

    if (!item.uploadId) return;
    try {
      await abortAvatarUpload(item.uploadId);
    } catch {
      // Abort failure should not block UI cleanup.
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

  const pickFiles = useCallback((files: File[]) => {
    if (!files.length) return;
    setItems((prev) => [
      ...prev,
      ...files.map((file) => ({
        id: nextLocalId(),
        file,
        status: "pending" as const,
        progress: 0,
        uploadedBytes: 0,
      })),
    ]);
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
        const init = await initAvatarUpload({
          filename: item.file.name,
          mime: item.file.type || null,
          sizeBytes: item.file.size,
          expectedSha256: null,
        });

        updateItem(item.id, { uploadId: init.uploadId });

        const chunkSize = Math.max(1, Number(init.chunkSize || 0));
        const totalParts = Math.max(1, Number(init.totalParts || 1));
        const method = String(init.method || "local");

        const uploadChunkLocal = async (partNumber: number, chunk: Blob) => {
          await uploadAvatarPart({
            uploadId: init.uploadId,
            partNumber,
            chunk,
            signal: controller.signal,
          });
        };

        const uploadChunkS3 = async (partNumber: number, chunk: Blob) => {
          const presign = await presignAvatarUploadPart({
            uploadId: init.uploadId,
            partNumber,
          });
          const res = await fetch(presign.url, {
            method: presign.method || "PUT",
            headers: presign.headers || {},
            body: chunk,
            signal: controller.signal,
          });
          if (!res.ok) throw new Error(t("assets:ASSET_UPLOAD_S3_PUT_FAILED"));
          const etag = res.headers.get("etag") || res.headers.get("ETag");
          if (!etag) throw new Error(t("assets:ASSET_UPLOAD_S3_ETAG_MISSING"));

          await commitAvatarUploadPart({
            uploadId: init.uploadId,
            partNumber,
            payload: { etag, sizeBytes: chunk.size },
          });
        };

        let uploadedBytes = 0;
        const parts = Array.from({ length: totalParts }, (_, i) => i + 1);
        await runSequentially(parts, async (part) => {
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
          updateItem(item.id, { uploadedBytes, progress: Math.min(100, Math.max(0, pct)) });
        });

        const done = await completeAvatarUpload(init.uploadId);
        updateItem(item.id, { status: "success", progress: 100, assetId: done.assetId });
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
    [t, updateItem],
  );

  const startUpload = useCallback(async () => {
    if (isUploading) return;
    setIsUploading(true);
    try {
      const assetIds: string[] = [];
      const queue = items.filter((it) => it.status === "pending" || it.status === "error");
      await runSequentially(queue, async (it) => {
        const id = await uploadSingle(it);
        if (id) assetIds.push(id);
      });

      if (assetIds.length) {
        notifySuccessText(t("assets:ASSET_UPLOAD_SUCCESS"));
        props.onUploaded?.(assetIds);
      }
    } finally {
      setIsUploading(false);
    }
  }, [isUploading, items, props, t, uploadSingle]);

  const abortAllAndClose = useCallback(async () => {
    const uploading = items.filter((x) => x.status === "uploading");
    await runSequentially(uploading, async (it) => {
      await abortItem(it);
    });
    resetState();
    closeDialog();
  }, [abortItem, closeDialog, items, resetState]);

  const onDialogOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        props.onOpenChange(true);
        return;
      }
      if (hasUploading) {
        void abortAllAndClose();
        return;
      }
      closeDialog();
      resetState();
    },
    [abortAllAndClose, closeDialog, hasUploading, props, resetState],
  );

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={onDialogOpenChange}
      title={t("assets:ASSET_UPLOAD_DIALOG_TITLE")}
      description={t("assets:ASSET_UPLOAD_DIALOG_DESC")}
      contentClassName={cn("p-0 sm:max-w-2xl")}
      bodyClassName="p-0"
      footer={
        <>
          <Button
            type="text"
            onClick={() => void abortAllAndClose()}
            disabled={isUploading && !hasUploading}
            autoInsertSpace={false}
          >
            {t("common:CANCEL")}
          </Button>
          <Button
            type="primary"
            disabled={!canStart || isUploading}
            onClick={() => void startUpload()}
            autoInsertSpace={false}
          >
            {isUploading ? t("common:LOADING") : t("assets:ASSET_UPLOAD_ACTION_START")}
          </Button>
        </>
      }
    >
      <FileUpload.Panel
        items={fileUploadPanelItems}
        isDisabled={hasUploading}
        dropZoneHintSummary={t("assets:ASSET_UPLOAD_DROP_HINT_IMAGE_ONLY")}
        dropZoneHintDetail={t("assets:ASSET_UPLOAD_DROP_HINT_IMAGE_ONLY_DETAIL")}
        onPickFiles={pickFiles}
        onDeleteItem={(id) => void removeItem(id)}
        onRetryItem={(id) => {
          updateItem(id, {
            status: "pending",
            progress: 0,
            uploadedBytes: 0,
            errorText: undefined,
          });
        }}
        isItemActionDisabled={(id) => isUploading && !uploadingItemIds.has(id)}
      />
    </SettingDialog>
  );
}

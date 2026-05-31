import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";

import {
  abortUpload,
  commitUploadPart,
  completeUpload,
  getUploadPolicy,
  initUpload,
  presignUploadPart,
  uploadPart,
} from "@/api/uploads";
import { Button } from "@arclayer/ui/button";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import {
  FileUpload,
  type FileUploadItemStatus,
  type FileUploadPanelItem,
} from "@/pages/workspaces/assets/components/file-upload/file-upload";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { cn } from "@arclayer/lib/utils";
import type { AssetScopeRef } from "@/lib/assets/asset-scope";
import { uploadPresignedPart } from "@/lib/assets/storage-transfer";

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
  return `upload-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

type ScopedUploadsApi = {
  init: (payload: Parameters<typeof initUpload>[1]) => ReturnType<typeof initUpload>;
  abort: (uploadId: string) => Promise<void>;
  uploadPart: (params: Omit<Parameters<typeof uploadPart>[0], "projectId">) => Promise<void>;
  presignPart: (
    params: Omit<Parameters<typeof presignUploadPart>[0], "projectId">,
  ) => ReturnType<typeof presignUploadPart>;
  commitPart: (params: Omit<Parameters<typeof commitUploadPart>[0], "projectId">) => Promise<void>;
  complete: (uploadId: string) => ReturnType<typeof completeUpload>;
};

function getScopedUploadsApi(scope: AssetScopeRef): ScopedUploadsApi {
  const rawId = String(scope.id || "").trim();
  if (!rawId) throw new Error("ASSET_SCOPE_NOT_SELECTED");

  if (scope.type === "project") {
    return {
      init: (payload) => initUpload(rawId, payload),
      abort: async (uploadId) => {
        await abortUpload(rawId, uploadId);
      },
      uploadPart: async (params) => {
        await uploadPart({ ...params, projectId: rawId });
      },
      presignPart: (params) => presignUploadPart({ ...params, projectId: rawId }),
      commitPart: async (params) => {
        await commitUploadPart({ ...params, projectId: rawId });
      },
      complete: (uploadId) => completeUpload(rawId, uploadId),
    };
  }

  throw new Error("ASSET_SCOPE_UNSUPPORTED");
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

export function AssetUploadDialog(props: {
  scope: AssetScopeRef;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultFolderId?: string;
  purpose?: string;
  onUploaded?: (assetIds: string[]) => void;
}) {
  const { t } = useTranslation();
  const controllersRef = useRef(new Map<string, AbortController>());

  const [items, setItems] = useState<UploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const folderId = props.defaultFolderId;
  const purpose = (props.purpose || "library").trim() || "library";
  const scopeId = String(props.scope.id || "").trim();
  const uploadPolicyQuery = useQuery({
    queryKey: ["assets", "upload-policy", props.scope.type, scopeId, purpose],
    queryFn: () => getUploadPolicy(scopeId, purpose),
    enabled: props.open && props.scope.type === "project" && Boolean(scopeId),
    staleTime: 60_000,
  });
  const uploadPolicy = uploadPolicyQuery.data ?? null;
  const dropZoneHintSummary = useMemo(() => {
    const p = purpose.toLowerCase();
    if (p === "favicon") {
      return t("assets:ASSET_UPLOAD_DROP_HINT_FAVICON");
    }
    if (p === "avatar" || p === "site_logo" || p === "workspace_icon") {
      return t("assets:ASSET_UPLOAD_DROP_HINT_IMAGE_ONLY");
    }
    return t("assets:ASSET_UPLOAD_DROP_HINT");
  }, [purpose, t]);
  const dropZoneHintDetail = useMemo(() => {
    const p = purpose.toLowerCase();
    if (p === "favicon") {
      return t("assets:ASSET_UPLOAD_DROP_HINT_FAVICON_DETAIL");
    }
    if (p === "avatar" || p === "site_logo" || p === "workspace_icon") {
      return t("assets:ASSET_UPLOAD_DROP_HINT_IMAGE_ONLY_DETAIL");
    }
    return t("assets:ASSET_UPLOAD_DROP_HINT_DETAIL");
  }, [purpose, t]);
  const visibility = "public";

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

  const abortItem = useCallback(
    async (item: UploadItem) => {
      const controller = controllersRef.current.get(item.id);
      controller?.abort();
      controllersRef.current.delete(item.id);

      if (!item.uploadId) return;
      try {
        const api = getScopedUploadsApi(props.scope);
        await api.abort(item.uploadId);
      } catch {
        // Abort failure should not block UI cleanup.
      }
    },
    [props.scope],
  );

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
        const api = getScopedUploadsApi(props.scope);
        const init = await api.init({
          purpose,
          filename: item.file.name,
          mime: item.file.type || null,
          sizeBytes: item.file.size,
          expectedSha256: null,
          visibility,
          indexable: false,
          folderId: folderId || null,
        });

        updateItem(item.id, { uploadId: init.uploadId });

        const chunkSize = Math.max(1, Number(init.chunkSize || 0));
        const totalParts = Math.max(1, Number(init.totalParts || 1));
        const method = String(init.method || "local");

        const uploadChunkLocal = async (partNumber: number, chunk: Blob) => {
          await api.uploadPart({
            uploadId: init.uploadId,
            partNumber,
            chunk,
            signal: controller.signal,
          });
        };

        const uploadChunkS3 = async (partNumber: number, chunk: Blob) => {
          const presign = await api.presignPart({
            uploadId: init.uploadId,
            partNumber,
          });
          const etag = await uploadPresignedPart({
            presign,
            chunk,
            signal: controller.signal,
            errorMessage: t("assets:ASSET_UPLOAD_S3_PUT_FAILED"),
            missingEtagMessage: t("assets:ASSET_UPLOAD_S3_ETAG_MISSING"),
          });

          await api.commitPart({
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

        const done = await api.complete(init.uploadId);
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
    [folderId, props.scope, purpose, t, updateItem],
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
            variant="ghost"
            onClick={() => void abortAllAndClose()}
            disabled={isUploading && !hasUploading}
          >
            {t("assets:ASSET_UPLOAD_ACTION_CANCEL")}
          </Button>
          <Button disabled={!canStart || isUploading} onClick={() => void startUpload()}>
            {isUploading
              ? t("assets:ASSET_UPLOAD_ACTION_UPLOADING")
              : t("assets:ASSET_UPLOAD_ACTION_START")}
          </Button>
        </>
      }
    >
      <FileUpload.Panel
        items={fileUploadPanelItems}
        isDisabled={hasUploading}
        accept={uploadPolicy?.accept || undefined}
        maxSizeBytes={uploadPolicy?.maxSizeBytes ?? undefined}
        dropZoneHintSummary={dropZoneHintSummary}
        dropZoneHintDetail={dropZoneHintDetail}
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

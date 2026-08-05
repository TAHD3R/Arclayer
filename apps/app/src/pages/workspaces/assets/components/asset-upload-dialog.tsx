import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";

import { getUploadPolicy } from "@/api/uploads";
import { Button } from "@arclayer/ui/button";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import {
  abortAssetUploadSession,
  completeAssetUploadSession,
  transferAssetUpload,
  type AssetUploadCheckpoint,
} from "@/pages/workspaces/assets/components/asset-upload-session";
import {
  FileUpload,
  type FileUploadItemStatus,
  type FileUploadPanelItem,
} from "@/pages/workspaces/assets/components/file-upload/file-upload";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { cn } from "@arclayer/lib/utils";
import type { AssetScopeRef } from "@/lib/assets/asset-scope";

type UploadItem = {
  id: string;
  file: File;
  status: FileUploadItemStatus;
  progress: number; // 0-100
  uploadedBytes: number;
  errorText?: string;
  checkpoint?: AssetUploadCheckpoint;
  assetId?: string;
};

function nextLocalId(): string {
  return `upload-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isRecoverableItem(item: UploadItem): boolean {
  return item.status === "pending" || item.status === "error" || item.status === "finalize_error";
}

function hasFinalizationStarted(item: UploadItem): boolean {
  return item.status === "finalizing" || item.status === "finalize_error";
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
  const stopRequestedRef = useRef(false);

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

  const canStart = useMemo(() => items.some(isRecoverableItem), [items]);
  const activeItemIds = useMemo(
    () =>
      new Set(
        items
          .filter((it) => it.status === "uploading" || it.status === "finalizing")
          .map((it) => it.id),
      ),
    [items],
  );
  const hasActiveWork = activeItemIds.size > 0;
  const hasFinalizing = items.some((item) => item.status === "finalizing");
  const hasCompletionPending = items.some((item) => item.status === "finalize_error");
  const fileUploadPanelItems = useMemo<FileUploadPanelItem[]>(() => items, [items]);

  const resetState = useCallback(() => {
    stopRequestedRef.current = true;
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

      if (!item.checkpoint) return;
      if (hasFinalizationStarted(item) || item.status === "success") {
        throw new Error("ASSET_UPLOAD_FINALIZATION_CANNOT_ABORT");
      }
      await abortAssetUploadSession(props.scope, item.checkpoint.uploadId);
    },
    [props.scope],
  );

  const removeItem = useCallback(
    async (id: string) => {
      const target = items.find((x) => x.id === id);
      if (!target) return;
      if (hasFinalizationStarted(target)) return;

      if (target.status === "uploading" || (target.status === "error" && target.checkpoint)) {
        try {
          await abortItem(target);
        } catch (error) {
          updateItem(target.id, {
            status: "error",
            errorText: t("assets:ASSET_UPLOAD_ABORT_FAILED"),
          });
          notifyError(error);
          return;
        }
      }
      setItems((prev) => prev.filter((x) => x.id !== id));
    },
    [abortItem, items, t, updateItem],
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

  const completeSingle = useCallback(
    async (itemId: string, fileSize: number, checkpoint: AssetUploadCheckpoint) => {
      updateItem(itemId, {
        status: "finalizing",
        progress: 100,
        uploadedBytes: fileSize,
        checkpoint,
        errorText: undefined,
      });
      try {
        const assetId = await completeAssetUploadSession(props.scope, checkpoint.uploadId);
        updateItem(itemId, { status: "success", assetId });
        return assetId;
      } catch (error) {
        updateItem(itemId, {
          status: "finalize_error",
          errorText: t("assets:ASSET_UPLOAD_FINALIZE_FAILED"),
        });
        notifyError(error);
        return null;
      }
    },
    [props.scope, t, updateItem],
  );

  const uploadSingle = useCallback(
    async (item: UploadItem) => {
      if (item.status === "finalize_error") {
        if (!item.checkpoint) {
          const error = new Error("ASSET_UPLOAD_COMPLETION_CHECKPOINT_MISSING");
          updateItem(item.id, { errorText: t("assets:ASSET_UPLOAD_FINALIZE_FAILED") });
          notifyError(error);
          return null;
        }
        return completeSingle(item.id, item.file.size, item.checkpoint);
      }

      const controller = new AbortController();
      controllersRef.current.set(item.id, controller);
      updateItem(item.id, {
        status: "uploading",
        progress: 0,
        uploadedBytes: 0,
        errorText: undefined,
      });

      try {
        const checkpoint = await transferAssetUpload({
          scope: props.scope,
          file: item.file,
          checkpoint: item.checkpoint,
          signal: controller.signal,
          initPayload: {
            purpose,
            filename: item.file.name,
            mime: item.file.type || null,
            sizeBytes: item.file.size,
            expectedSha256: null,
            visibility,
            indexable: false,
            folderId: folderId || null,
          },
          messages: {
            s3PutFailed: t("assets:ASSET_UPLOAD_S3_PUT_FAILED"),
            s3EtagMissing: t("assets:ASSET_UPLOAD_S3_ETAG_MISSING"),
          },
          onCheckpoint: (nextCheckpoint) => {
            updateItem(item.id, { checkpoint: nextCheckpoint });
          },
          onProgress: (uploadedBytes, progress) => {
            updateItem(item.id, { uploadedBytes, progress });
          },
        });
        return await completeSingle(item.id, item.file.size, checkpoint);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          updateItem(item.id, {
            status: "canceled",
            errorText: t("assets:ASSET_UPLOAD_CANCELED"),
          });
          return null;
        }
        updateItem(item.id, {
          status: "error",
          errorText: t("assets:ASSET_UPLOAD_FAILED_GENERIC"),
        });
        notifyError(error);
        return null;
      } finally {
        controllersRef.current.delete(item.id);
      }
    },
    [completeSingle, folderId, props.scope, purpose, t, updateItem],
  );

  const startUpload = useCallback(
    async (itemId?: string) => {
      if (isUploading) return;
      const queue = items.filter(
        (item) => isRecoverableItem(item) && (!itemId || item.id === itemId),
      );
      if (!queue.length) return;

      stopRequestedRef.current = false;
      setIsUploading(true);
      try {
        const queueIds = new Set(queue.map((item) => item.id));
        const assetIds = items
          .filter((item) => item.status === "success" && item.assetId)
          .map((item) => item.assetId as string);
        let hasFailure = false;

        await runSequentially(queue, async (item) => {
          if (stopRequestedRef.current) return;
          const assetId = await uploadSingle(item);
          if (assetId) {
            assetIds.push(assetId);
            return;
          }
          hasFailure = true;
        });
        if (stopRequestedRef.current) return;

        const hasUnresolvedOutsideQueue = items.some(
          (item) => !queueIds.has(item.id) && isRecoverableItem(item),
        );
        if (!hasFailure && !hasUnresolvedOutsideQueue && assetIds.length) {
          const completedAssetIds = Array.from(new Set(assetIds));
          notifySuccessText(t("assets:ASSET_UPLOAD_SUCCESS"));
          props.onUploaded?.(completedAssetIds);
          resetState();
        }
      } finally {
        setIsUploading(false);
      }
    },
    [isUploading, items, props, resetState, t, uploadSingle],
  );

  const abortAllAndClose = useCallback(async () => {
    stopRequestedRef.current = true;
    const abortable = items.filter(
      (item) => item.status === "uploading" || (item.status === "error" && item.checkpoint),
    );
    const abortableIds = new Set(abortable.map((item) => item.id));
    const failedAborts = new Map<string, unknown>();
    await runSequentially(abortable, async (item) => {
      try {
        await abortItem(item);
      } catch (error) {
        failedAborts.set(item.id, error);
      }
    });
    if (failedAborts.size) {
      stopRequestedRef.current = false;
      setItems((current) =>
        current.map((item) =>
          failedAborts.has(item.id)
            ? {
                ...item,
                status: "error",
                errorText: t("assets:ASSET_UPLOAD_ABORT_FAILED"),
              }
            : abortableIds.has(item.id)
              ? {
                  ...item,
                  status: "canceled",
                  errorText: t("assets:ASSET_UPLOAD_CANCELED"),
                }
              : item,
        ),
      );
      const errors = Array.from(failedAborts.values());
      notifyError(
        errors.length === 1
          ? errors[0]
          : new AggregateError(errors, "Multiple upload sessions could not be aborted."),
      );
      return;
    }
    resetState();
    closeDialog();
  }, [abortItem, closeDialog, items, resetState, t]);

  const requestClose = useCallback(() => {
    if (hasFinalizing || (isUploading && hasCompletionPending)) return;
    if (hasCompletionPending) {
      closeDialog();
      return;
    }
    void abortAllAndClose();
  }, [abortAllAndClose, closeDialog, hasCompletionPending, hasFinalizing, isUploading]);

  const onDialogOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        props.onOpenChange(true);
        return;
      }
      requestClose();
    },
    [props, requestClose],
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
            onClick={requestClose}
            disabled={hasFinalizing || (isUploading && hasCompletionPending)}
          >
            {hasCompletionPending ? t("common:CLOSE") : t("assets:ASSET_UPLOAD_ACTION_CANCEL")}
          </Button>
          <Button disabled={!canStart || isUploading} onClick={() => void startUpload()}>
            {isUploading
              ? hasFinalizing
                ? t("assets:ASSET_UPLOAD_ACTION_FINISHING")
                : t("assets:ASSET_UPLOAD_ACTION_UPLOADING")
              : hasCompletionPending
                ? t("assets:ASSET_UPLOAD_ACTION_FINISH")
                : t("assets:ASSET_UPLOAD_ACTION_START")}
          </Button>
        </>
      }
    >
      <FileUpload.Panel
        items={fileUploadPanelItems}
        isDisabled={hasActiveWork}
        accept={uploadPolicy?.accept || undefined}
        maxSizeBytes={uploadPolicy?.maxSizeBytes ?? undefined}
        dropZoneHintSummary={dropZoneHintSummary}
        dropZoneHintDetail={dropZoneHintDetail}
        onPickFiles={pickFiles}
        onDeleteItem={(id) => void removeItem(id)}
        onRetryItem={(id) => void startUpload(id)}
        isItemActionDisabled={(id) => isUploading && !activeItemIds.has(id)}
        isItemRemovable={(id) => {
          const item = items.find((candidate) => candidate.id === id);
          return item ? !hasFinalizationStarted(item) : false;
        }}
      />
    </SettingDialog>
  );
}

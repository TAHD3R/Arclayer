import * as React from "react";

import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  abortOrganizationUpload,
  abortUpload,
  commitOrganizationUploadPart,
  commitUploadPart,
  completeOrganizationUpload,
  completeUpload,
  initOrganizationUpload,
  initUpload,
  presignOrganizationUploadPart,
  presignUploadPart,
  uploadOrganizationPart,
  uploadPart,
} from "@/api/uploads";
import { notifyError } from "@/lib/notifications";
import type { AssetScopeRef } from "@/lib/assets/asset-scope";
import { resolveAssetRefToPublicUrlPath } from "@/lib/assets/asset-urls";
import { useAssetsExplorerController } from "@/pages/workspaces/assets/components/explorer/use-assets-explorer-controller";
import { FileUploadDropZone } from "@/pages/workspaces/assets/components/file-upload/file-upload";
import { LazyAssetImage } from "@/pages/workspaces/assets/components/lazy-asset-image";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@arclayer/ui/popover";
import { Spinner } from "@arclayer/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@arclayer/ui/tabs";
import { cn } from "@arclayer/lib/utils";

type ScopedUploadsApi = {
  init: (payload: Parameters<typeof initUpload>[1]) => ReturnType<typeof initUpload>;
  abort: (uploadId: string) => Promise<void>;
  uploadPart: (params: Omit<Parameters<typeof uploadPart>[0], "workspaceId">) => Promise<void>;
  presignPart: (
    params: Omit<Parameters<typeof presignUploadPart>[0], "workspaceId">,
  ) => ReturnType<typeof presignUploadPart>;
  commitPart: (
    params: Omit<Parameters<typeof commitUploadPart>[0], "workspaceId">,
  ) => Promise<void>;
  complete: (uploadId: string) => ReturnType<typeof completeUpload>;
};

function getScopedUploadsApi(scope: AssetScopeRef): ScopedUploadsApi {
  const rawId = String(scope.id || "").trim();
  if (!rawId) throw new Error("ASSET_SCOPE_NOT_SELECTED");

  if (scope.type === "workspace") {
    return {
      init: (payload) => initUpload(rawId, payload),
      abort: async (uploadId) => {
        await abortUpload(rawId, uploadId);
      },
      uploadPart: async (params) => {
        await uploadPart({ ...params, workspaceId: rawId });
      },
      presignPart: (params) => presignUploadPart({ ...params, workspaceId: rawId }),
      commitPart: async (params) => {
        await commitUploadPart({ ...params, workspaceId: rawId });
      },
      complete: (uploadId) => completeUpload(rawId, uploadId),
    };
  }

  return {
    init: (payload) => initOrganizationUpload(rawId, payload),
    abort: async (uploadId) => {
      await abortOrganizationUpload(rawId, uploadId);
    },
    uploadPart: async (params) => {
      await uploadOrganizationPart({ ...params, organizationId: rawId });
    },
    presignPart: (params) => presignOrganizationUploadPart({ ...params, organizationId: rawId }),
    commitPart: async (params) => {
      await commitOrganizationUploadPart({ ...params, organizationId: rawId });
    },
    complete: (uploadId) => completeOrganizationUpload(rawId, uploadId),
  };
}

async function uploadCoverAsset(params: { file: File; scope: AssetScopeRef; signal: AbortSignal }) {
  const api = getScopedUploadsApi(params.scope);
  const init = await api.init({
    purpose: "article_cover",
    filename: params.file.name,
    mime: params.file.type || null,
    sizeBytes: params.file.size,
    expectedSha256: null,
    visibility: "public",
    indexable: false,
    folderId: null,
  });

  const chunkSize = Math.max(1, Number(init.chunkSize || 0));
  const totalParts = Math.max(1, Number(init.totalParts || 1));
  const method = String(init.method || "local");

  // Upload APIs expect ordered multipart commits, so this loop is intentionally sequential.
  // eslint-disable-next-line no-await-in-loop
  for (let part = 1; part <= totalParts; part += 1) {
    const start = (part - 1) * chunkSize;
    const end = Math.min(params.file.size, start + chunkSize);
    const chunk = params.file.slice(start, end);

    if (method === "s3_multipart") {
      // eslint-disable-next-line no-await-in-loop
      const presign = await api.presignPart({
        uploadId: init.uploadId,
        partNumber: part,
      });
      // eslint-disable-next-line no-await-in-loop
      const res = await fetch(presign.url, {
        method: presign.method || "PUT",
        headers: presign.headers || {},
        body: chunk,
        signal: params.signal,
      });
      if (!res.ok) {
        throw new Error(`UPLOAD_PART_FAILED:${res.status}`);
      }
      // eslint-disable-next-line no-await-in-loop
      await api.commitPart({
        uploadId: init.uploadId,
        partNumber: part,
        payload: {
          etag: res.headers.get("etag") || "",
          sizeBytes: chunk.size,
        },
      });
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    await api.uploadPart({
      uploadId: init.uploadId,
      partNumber: part,
      chunk,
      signal: params.signal,
    });
  }

  const done = await api.complete(init.uploadId);
  return done.assetId;
}

function resolveAssetPreviewUrl(asset: {
  id: string;
  previewUrl?: string;
  contentUrl?: string;
  publicUrl?: string;
}) {
  return (
    asset.previewUrl ??
    asset.contentUrl ??
    asset.publicUrl ??
    resolveAssetRefToPublicUrlPath(asset.id)
  );
}

export function ContentLibraryCoverPickerPopover(props: {
  workspaceId: string;
  value: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <Popover open={props.open} onOpenChange={props.onOpenChange}>
      <PopoverTrigger asChild>{props.children}</PopoverTrigger>
      {props.open ? <ContentLibraryCoverPickerPopoverContent {...props} /> : null}
    </Popover>
  );
}

function ContentLibraryCoverPickerPopoverContent(props: {
  workspaceId: string;
  value: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation(["content", "assets", "common"]);
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = React.useState("library");
  const [uploading, setUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);

  const scope = React.useMemo<AssetScopeRef>(
    () => ({ type: "workspace", id: String(props.workspaceId) }),
    [props.workspaceId],
  );

  const explorer = useAssetsExplorerController({
    scope,
    pagination: "paged",
    purpose: "article_cover",
    defaultVisibility: "public",
    defaultOrdering: "-created_at",
    initialPageSize: 9,
    initialFilters: { mimePrefix: "image/" },
  });

  const handleSelectAsset = React.useCallback(
    (assetId: string) => {
      props.onChange(assetId);
      props.onOpenChange(false);
    },
    [props],
  );

  const handlePickUpload = React.useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;

      const controller = new AbortController();
      setUploadError(null);
      setUploading(true);
      try {
        const assetId = await uploadCoverAsset({
          file,
          scope,
          signal: controller.signal,
        });
        await queryClient.invalidateQueries({ queryKey: ["assets"] });
        handleSelectAsset(assetId);
      } catch (error) {
        notifyError(error);
        setUploadError(
          error instanceof Error ? error.message : t("assets:ASSET_UPLOAD_FAILED_GENERIC"),
        );
      } finally {
        setUploading(false);
      }
    },
    [handleSelectAsset, queryClient, scope, t],
  );

  const items = explorer.items.slice(0, 9);
  const isLoading = explorer.pagedAssetsQuery.isLoading && items.length === 0;

  return (
    <PopoverContent
      align="end"
      side="bottom"
      sideOffset={10}
      className="w-[30rem] border border-border/70 p-0"
    >
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between border-b border-border/70 px-4 pt-4">
          <TabsList className="h-9 rounded-md bg-muted/40 p-1">
            <TabsTrigger value="library" className="rounded-md px-3">
              {t("CONTENT_LIBRARY_EDITOR_COVER_TAB_LIBRARY")}
            </TabsTrigger>
            <TabsTrigger value="upload" className="rounded-md px-3">
              {t("CONTENT_LIBRARY_EDITOR_COVER_TAB_UPLOAD")}
            </TabsTrigger>
          </TabsList>
          {props.value ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-label-secondary"
              onClick={() => {
                props.onChange("");
                props.onOpenChange(false);
              }}
            >
              <X className="size-4" />
              {t("common:DELETE")}
            </Button>
          ) : null}
        </div>

        <TabsContent value="library" className="mt-0 space-y-4 p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-label-tertiary" />
            <Input
              value={explorer.searchInput}
              onChange={(event) => explorer.setSearchInput(event.target.value)}
              placeholder={t("CONTENT_LIBRARY_EDITOR_COVER_LIBRARY_SEARCH")}
              className="h-9 pl-9"
            />
          </div>

          {isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Spinner className="size-5" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex h-48 items-center justify-center rounded-md border border-dashed border-border/70 bg-muted/20 px-6 text-center text-footnote text-label-secondary">
              {t("CONTENT_LIBRARY_EDITOR_COVER_LIBRARY_EMPTY")}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {items.map((asset) => {
                const src = resolveAssetPreviewUrl(asset);
                return (
                  <button
                    key={asset.id}
                    type="button"
                    className={cn(
                      "group overflow-hidden rounded-md border border-border/70 bg-card text-left transition-colors hover:border-border hover:bg-accent/20",
                      props.value === asset.id ? "ring-2 ring-primary/45" : undefined,
                    )}
                    onClick={() => handleSelectAsset(asset.id)}
                  >
                    <div className="relative aspect-[1.45/1] overflow-hidden bg-muted/30">
                      {src ? (
                        <LazyAssetImage
                          eager
                          src={src}
                          alt={asset.altName || asset.name}
                          rootClassName="absolute inset-0"
                          className="transition-transform duration-200 group-hover:scale-[1.03]"
                          showErrorOverlay
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-footnote text-label-secondary">
                          {t("assets:ASSET_PREVIEW_LOAD_FAILED")}
                        </div>
                      )}
                    </div>
                    <div className="px-3 py-2">
                      <div className="truncate text-footnote font-semibold text-label-primary">
                        {asset.altName || asset.name}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="upload" className="mt-0 space-y-3 p-4">
          <FileUploadDropZone
            allowsMultiple={false}
            accept="image/*"
            isDisabled={uploading}
            hintSummary={t("CONTENT_LIBRARY_EDITOR_COVER_UPLOAD_HINT")}
            hintDetail={t("CONTENT_LIBRARY_EDITOR_COVER_UPLOAD_DETAIL")}
            onPickFiles={handlePickUpload}
          />
          <div className="min-h-5 text-footnote">
            {uploading ? (
              <div className="inline-flex items-center gap-2 text-label-secondary">
                <Loader2 className="size-4 animate-spin" />
                {t("assets:ASSET_UPLOAD_STATUS_UPLOADING")}
              </div>
            ) : uploadError ? (
              <div className="text-error-primary">{uploadError}</div>
            ) : (
              <span className="text-label-secondary">
                {t("CONTENT_LIBRARY_EDITOR_COVER_UPLOAD_HELP")}
              </span>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </PopoverContent>
  );
}

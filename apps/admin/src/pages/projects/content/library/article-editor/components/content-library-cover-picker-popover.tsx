import * as React from "react";

import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { notifyError } from "@/lib/notifications";
import type { AssetScopeRef } from "@/lib/assets/asset-scope";
import { resolveAssetRefToPublicUrlPath } from "@/lib/assets/asset-urls";
import { uploadSingleAssetFromFile } from "@/lib/assets/scoped-uploads";
import {
  AssetsFilterPopover,
  type AssetsFilters,
} from "@/pages/workspaces/assets/components/assets-filter-popover";
import { useAssetsExplorerController } from "@/pages/workspaces/assets/components/explorer/use-assets-explorer-controller";
import { FileUploadDropZone } from "@/pages/workspaces/assets/components/file-upload/file-upload";
import { LazyAssetImage } from "@/pages/workspaces/assets/components/lazy-asset-image";
import { Button } from "@arclayer/ui/button";
import {
  ChromeTabs,
  ChromeTabsContent,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@arclayer/ui/chrome-tabs";
import { Input } from "@arclayer/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@arclayer/ui/popover";
import { Spinner } from "@arclayer/ui/spinner";
import { cn } from "@arclayer/lib/utils";

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
  assetProjectId: string | null;
  value: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <Popover open={props.open} onOpenChange={props.onOpenChange}>
      <PopoverTrigger asChild>{props.children}</PopoverTrigger>
      {props.open && props.assetProjectId ? (
        <ContentLibraryCoverPickerPopoverContent {...props} />
      ) : null}
    </Popover>
  );
}

function ContentLibraryCoverPickerPopoverContent(props: {
  assetProjectId: string | null;
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
  const libraryViewportRef = React.useRef<HTMLDivElement | null>(null);
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);

  const scope = React.useMemo<AssetScopeRef>(
    () => ({ type: "project", id: props.assetProjectId ?? "" }),
    [props.assetProjectId],
  );

  const explorer = useAssetsExplorerController({
    scope,
    pagination: "infinite",
    defaultVisibility: "public",
    defaultOrdering: "-created_at",
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
        const assetId = await uploadSingleAssetFromFile({
          file,
          scope,
          purpose: "article_cover",
          t,
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

  React.useEffect(() => {
    const node = sentinelRef.current;
    const root = libraryViewportRef.current;
    if (!node || !root || activeTab !== "library" || typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (
          explorer.infiniteAssetsQuery.isFetchingNextPage ||
          !explorer.infiniteAssetsQuery.hasNextPage
        ) {
          return;
        }
        explorer.infiniteAssetsQuery.fetchNextPage().catch(() => undefined);
      },
      { root, rootMargin: "120px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [activeTab, explorer.infiniteAssetsQuery]);

  const items = explorer.items;
  const isLoading = explorer.infiniteAssetsQuery.isLoading && items.length === 0;

  return (
    <PopoverContent
      align="end"
      side="bottom"
      sideOffset={10}
      className="w-[32rem] border border-border/70 p-0"
    >
      <ChromeTabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-col">
        <div className="flex items-center justify-between border-b border-border/70 px-4 py-4">
          <ChromeTabsList className="w-auto">
            <ChromeTabsTrigger value="library">
              {t("CONTENT_LIBRARY_EDITOR_COVER_TAB_LIBRARY")}
            </ChromeTabsTrigger>
            <ChromeTabsTrigger value="upload">
              {t("CONTENT_LIBRARY_EDITOR_COVER_TAB_UPLOAD")}
            </ChromeTabsTrigger>
          </ChromeTabsList>
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

        <ChromeTabsContent value="library" className="mt-0 flex min-h-0 flex-col">
          <div className="border-b border-border/70 px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[14rem] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-label-tertiary" />
                <Input
                  value={explorer.searchInput}
                  onChange={(event) => explorer.setSearchInput(event.target.value)}
                  placeholder={t("CONTENT_LIBRARY_EDITOR_COVER_LIBRARY_SEARCH")}
                  className="h-9 pl-9"
                />
              </div>
              <AssetsFilterPopover
                value={explorer.filters}
                onChange={(next: AssetsFilters) => {
                  explorer.setFilters(next);
                }}
                ordering={explorer.ordering}
                onOrderingChange={(next) => explorer.setOrdering(next)}
                defaultOrdering="-created_at"
                tags={explorer.tagsQuery.data?.items ?? []}
                tagsLoading={explorer.tagsQuery.isLoading}
              />
            </div>
          </div>

          <div ref={libraryViewportRef} className="max-h-[26rem] overflow-auto px-4 py-4">
            {isLoading ? (
              <div className="flex h-48 items-center justify-center">
                <Spinner className="size-5" />
              </div>
            ) : items.length === 0 ? (
              <div className="flex h-48 items-center justify-center rounded-md border border-dashed border-border/70 bg-muted/20 px-6 text-center text-footnote text-label-secondary">
                {t("CONTENT_LIBRARY_EDITOR_COVER_LIBRARY_EMPTY")}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  {items.map((asset) => {
                    const src = resolveAssetPreviewUrl(asset);
                    return (
                      <button
                        key={asset.id}
                        type="button"
                        className={cn(
                          "group overflow-hidden rounded-xl border border-border/70 bg-card text-left transition-colors hover:border-border hover:bg-accent/20",
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
                <div ref={sentinelRef} className="flex h-12 items-center justify-center">
                  {explorer.infiniteAssetsQuery.isFetchingNextPage ? (
                    <Spinner className="size-4 text-label-secondary" />
                  ) : null}
                </div>
              </>
            )}
          </div>
        </ChromeTabsContent>

        <ChromeTabsContent value="upload" className="mt-0 space-y-3 p-4">
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
        </ChromeTabsContent>
      </ChromeTabs>
    </PopoverContent>
  );
}

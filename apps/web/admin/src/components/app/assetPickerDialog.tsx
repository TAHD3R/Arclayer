import { Button, Input, Pagination, Select } from "antd";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ImageOff, Search, UploadCloud } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  listAdminAssetFolders,
  listAdminAssets,
  type AdminAssetFolder,
  type AdminAssetSummary,
} from "@/api/assets";
import { LoaderOne } from "@/components/ui/loader";
import { cn } from "@/lib/utils";
import { resolvePublicAssetUrlPath } from "@/views/assets/utils/assetUrls";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/animate-ui/components/radix/dialog";

import { AssetUploadDialog } from "@/views/assets/components/AssetUploadDialog";

type PickerAsset = {
  id: string;
  name: string;
  thumbUrl?: string;
};

function toPickerAsset(row: AdminAssetSummary): PickerAsset {
  const name = row.originalFilename?.trim() || row.title?.trim() || row.slug || row.id;
  // 统一使用 canonical 链接：/assets/<id>/thumb，不依赖后端返回的绝对 URL。
  const thumb = resolvePublicAssetUrlPath(`/assets/${row.id}/thumb`);
  const thumbUrl = thumb ? `${thumb}?w=400` : undefined;
  return { id: row.id, name, thumbUrl };
}

export type AssetPickerDialogValue = {
  assetId: string | null;
};

export function AssetPickerDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * 当前值（受控）。弹窗内部会维护一份草稿选择，仅在“确认”时提交。
   */
  value?: AssetPickerDialogValue;
  /**
   * 用户点击确认后的提交回调。
   */
  onConfirm: (next: AssetPickerDialogValue) => void;
  /**
   * 是否允许清空选择（在 footer 中提供“清除”按钮）。
   */
  allowClear?: boolean;
  /**
   * 上传用途：用于从该入口上传时套用后端策略（例如 favicon/site_logo 强制 public/noindex）。
   */
  uploadPurpose?: string;
  /**
   * 仅展示某类资源（默认 image/）。
   */
  mimePrefix?: string;
  /**
   * 是否展示“文件夹”筛选。
   * - 对资源量较大的站点有用
   * - 对初次用户保持无感，可由调用方按场景关闭
   */
  showFolderFilter?: boolean;
  /**
   * 默认页大小。
   */
  pageSize?: number;
  title?: string;
  description?: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [draftPickedId, setDraftPickedId] = useState<string | null>(props.value?.assetId ?? null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(props.pageSize ?? 24);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [ordering, setOrdering] = useState<string>("-created_at");

  useEffect(() => {
    if (!props.open) return;
    // 打开时重置草稿选择与分页，避免“上一次 picker 状态”污染新会话。
    setDraftPickedId(props.value?.assetId ?? null);
    setPage(1);
    setSearchInput("");
    setSearchQuery("");
  }, [props.open, props.value?.assetId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const foldersQuery = useQuery({
    queryKey: ["assets", "folders"],
    queryFn: async () => listAdminAssetFolders(),
    enabled: props.open && props.showFolderFilter !== false,
    staleTime: 60 * 1000,
    retry: 1,
  });

  const assetsQuery = useQuery({
    queryKey: [
      "assets",
      "picker",
      props.mimePrefix || "image/",
      searchQuery,
      page,
      pageSize,
      folderId,
      ordering,
    ],
    queryFn: async () =>
      listAdminAssets({
        page,
        size: pageSize,
        q: searchQuery || undefined,
        mimePrefix: props.mimePrefix || "image/",
        folderId: folderId || null,
        ordering,
      }),
    enabled: props.open,
    staleTime: 10 * 1000,
    retry: 1,
    placeholderData: (prev) => prev,
  });

  const items = useMemo<PickerAsset[]>(() => {
    const rows = assetsQuery.data?.items || [];
    return rows.map(toPickerAsset);
  }, [assetsQuery.data]);

  const total = assetsQuery.data?.total ?? 0;

  const folderOptions = useMemo(() => {
    const rows = (foldersQuery.data || []) as AdminAssetFolder[];
    return [
      { value: "__all__", label: t("assets:ASSET_FILTER_FOLDER_ALL") },
      ...rows.map((f) => ({ value: f.id, label: f.name })),
    ];
  }, [foldersQuery.data, t]);

  return (
    <>
      <Dialog open={props.open} onOpenChange={props.onOpenChange}>
        <DialogContent
          showCloseButton
          className={cn(
            // Dialog 形式：header + toolbar + grid + pagination + footer
            "!p-0 !flex !flex-col overflow-hidden",
            "max-h-[calc(100vh-2rem)]",
            "w-[min(980px,calc(100vw-2rem))] sm:w-[min(980px,calc(100vw-2rem))] sm:max-w-none",
          )}
        >
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="font-bold!">
              {props.title || t("settings:SETTINGS_ASSET_PICKER_TITLE")}
            </DialogTitle>
            {props.description ? (
              <div className="mt-1 text-sm text-muted-foreground">{props.description}</div>
            ) : null}
          </DialogHeader>

          <div className="flex-1 min-h-0 flex flex-col">
            {/* Toolbar：搜索 + 筛选器（左） / 上传按钮（右） */}
            <div className="px-6 py-4 border-b flex flex-wrap items-center justify-between gap-3">
              <Input
                allowClear
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t("settings:SETTINGS_ASSET_PICKER_SEARCH_PLACEHOLDER")}
                prefix={<Search size={16} className="text-muted-foreground" />}
                style={{ width: 320, maxWidth: "100%" }}
              />

              <div className="flex items-center gap-2">
                {props.showFolderFilter !== false ? (
                  <Select
                    value={folderId || "__all__"}
                    style={{ width: 220 }}
                    options={folderOptions}
                    loading={foldersQuery.isLoading}
                    onChange={(v) => {
                      setFolderId(v === "__all__" ? null : String(v));
                      setPage(1);
                    }}
                  />
                ) : null}

                <Select
                  value={ordering}
                  style={{ width: 160 }}
                  options={[
                    { value: "-created_at", label: t("assets:ASSET_SORT_NEWEST") },
                    { value: "created_at", label: t("assets:ASSET_SORT_OLDEST") },
                    { value: "-size_bytes", label: t("assets:ASSET_SORT_SIZE_LARGE") },
                    { value: "size_bytes", label: t("assets:ASSET_SORT_SIZE_SMALL") },
                  ]}
                  onChange={(v) => {
                    setOrdering(String(v));
                    setPage(1);
                  }}
                />
              </div>

              <div className="flex items-center gap-2">
                <Button
                  icon={<UploadCloud size={16} />}
                  onClick={() => setUploadOpen(true)}
                  disabled={assetsQuery.isFetching}
                >
                  {t("assets:ASSET_ACTION_UPLOAD")}
                </Button>
              </div>
            </div>

            {/* Grid：中间图片区，独立滚动 */}
            <div className="flex-1 min-h-0 overflow-auto px-6 py-5">
              {assetsQuery.isLoading && !assetsQuery.data ? (
                <div className="py-10 flex justify-center">
                  <LoaderOne />
                </div>
              ) : items.length === 0 ? (
                <div className="py-10 text-sm text-muted-foreground">{t("assets:ASSET_EMPTY")}</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {items.map((it) => {
                    const selected = it.id === draftPickedId;
                    return (
                      <button
                        key={it.id}
                        type="button"
                        className={cn(
                          "group relative w-full rounded-xl overflow-hidden border bg-card",
                          "shadow-sm transition hover:shadow-md",
                          selected
                            ? "border-primary ring-2 ring-primary/30"
                            : "border-border/60 hover:border-border",
                          "text-left",
                        )}
                        onClick={() => setDraftPickedId(it.id)}
                      >
                        <div className="relative w-full aspect-square bg-muted/20">
                          {it.thumbUrl ? (
                            <img
                              src={it.thumbUrl}
                              alt={it.name}
                              draggable={false}
                              className={cn(
                                "absolute inset-0 h-full w-full object-cover",
                                "transition-transform duration-200 will-change-transform",
                                "group-hover:scale-[1.02]",
                              )}
                            />
                          ) : (
                            <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">
                              <div className="flex flex-col items-center gap-2">
                                <div className="rounded-full bg-background/70 p-2 shadow-sm">
                                  <ImageOff className="size-4" />
                                </div>
                                {t("assets:ASSET_PREVIEW_UNAVAILABLE")}
                              </div>
                            </div>
                          )}

                          {selected ? (
                            <div className="absolute right-2 top-2 rounded-full bg-primary text-primary-foreground p-1.5 shadow-sm">
                              <Check size={14} />
                            </div>
                          ) : null}
                        </div>

                        <div className="px-3 py-2">
                          <div className="text-sm font-medium truncate" title={it.name}>
                            {it.name}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Pagination：固定在内容底部（不随 grid 滚动） */}
            <div className="px-6 py-3 border-t flex items-center justify-between gap-3">
              <div className="text-xs text-muted-foreground">
                {assetsQuery.isFetching ? t("common:LOADING") : null}
              </div>
              <Pagination
                size="small"
                showSizeChanger
                current={page}
                pageSize={pageSize}
                total={total}
                onChange={(nextPage, nextSize) => {
                  if (typeof nextSize === "number" && nextSize !== pageSize) {
                    setPageSize(nextSize);
                    setPage(1);
                    return;
                  }
                  setPage(nextPage);
                }}
              />
            </div>
          </div>

          <DialogFooter className={cn("px-6 py-4 border-t", "!flex !flex-row !justify-end !gap-2")}>
            {props.allowClear ? (
              <Button
                danger
                onClick={() => {
                  props.onConfirm({ assetId: null });
                  props.onOpenChange(false);
                }}
              >
                {t("settings:SETTINGS_ASSET_PICKER_CLEAR")}
              </Button>
            ) : null}
            <Button onClick={() => props.onOpenChange(false)}>{t("common:CANCEL")}</Button>
            <Button
              type="primary"
              disabled={!draftPickedId}
              onClick={() => {
                props.onConfirm({ assetId: draftPickedId });
                props.onOpenChange(false);
              }}
            >
              {t("common:CONFIRM")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AssetUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        purpose={props.uploadPurpose}
        onUploaded={() => {
          // 上传完成后刷新 picker 列表
          void queryClient.invalidateQueries({ queryKey: ["assets", "picker"] });
          setUploadOpen(false);
        }}
      />
    </>
  );
}

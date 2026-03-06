import { Avatar, Button, Descriptions, Flex, Input, Tooltip } from "antd";
import { EllipsisVertical, Plus } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@celestial/ui/accordion";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@celestial/ui/sheet";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@celestial/ui/alert-dialog";
import {
  AlertDialogAction as AlertDialogActionPrimitive,
  AlertDialogCancel as AlertDialogCancelPrimitive,
} from "@celestial/ui/radix-primitives/radix-alert-dialog";
import { SettingActionItem } from "@celestial/ui/setting-action-item";
import { UpdateAssetsAccessDialog } from "./update-assets-access-dialog";
import { copyToClipboard } from "@/lib/clipboard";
import { cn } from "@celestial/lib/utils";
import { notifyErrorText, notifySuccessText } from "@/lib/notifications";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@celestial/ui/dropdown-menu";
import type { AssetMasonryItem } from "@/types/assets-masonry";
import {
  downloadWithAuth,
  formatCreatedAt,
  getIndexableLabel,
  getMimeLabel,
  getPurposeLabel,
  getSafeAspectRatio,
  getVisibilityLabel,
  initialsFromName,
  LazyAssetImage,
  tagInputStyle,
} from "./asset-masonry-tile";
import {
  AssetAddTagActionTag,
  AssetIndexableTag,
  AssetMimeTag,
  AssetPurposeTag,
  AssetUserTagChip,
  AssetVisibilityTag,
} from "@/components/ui/tags";
import {
  useAssetPreviewSheetController,
  type AssetMoreMenuItem,
} from "./asset-preview-sheet-controller";
export function AssetPreviewSheet(props: { active: AssetMasonryItem | null; onClose: () => void }) {
  const {
    t,
    token,
    active,
    activeAspectRatio,
    previewAspectRatio,
    setPreviewAspectRatio,
    previewSrc,
    setPreviewSrc,
    failedPreviewRef,
    uploaderName,
    uploaderAndTimeText,
    displayVisibility,
    displayPurpose,
    dateTime,
    publicAbsoluteUrl,
    linkSnippets,
    moreMenuItems,
    previewCandidates,
    dirtyRef,
    descriptionDraft,
    setDescriptionDraft,
    inputVisible,
    setInputVisible,
    inputValue,
    setInputValue,
    editInputIndex,
    setEditInputIndex,
    editInputValue,
    setEditInputValue,
    inputRef,
    editInputRef,
    saveState,
    deleteOpen,
    setDeleteOpen,
    editAccessOpen,
    setEditAccessOpen,
    patchAccessMutation,
    deleteMutation,
    selectedTags,
    removeTag,
    confirmAddTag,
    confirmEditTag,
  } = useAssetPreviewSheetController(props);

  type AssetMoreActionKey = Extract<AssetMoreMenuItem, { type: "item" }>["key"];

  const handleMoreAction = (key: AssetMoreActionKey) => {
    if (!active) return;
    if (key === "download") {
      const publicDownload = active.downloadUrl;
      if (publicDownload) {
        window.open(publicDownload, "_blank", "noopener,noreferrer");
        return;
      }
      const contentUrl = active.contentUrl;
      if (!contentUrl) return;
      downloadWithAuth({ url: contentUrl, filename: active.name })
        .then(() => notifySuccessText(t("assets:ASSET_DOWNLOAD_STARTED")))
        .catch(() => notifyErrorText(t("assets:ASSET_DOWNLOAD_FAILED")));
      return;
    }
    if (key === "copy_link") {
      const url = publicAbsoluteUrl;
      if (!url) {
        notifyErrorText(t("assets:ASSET_SHARE_REQUIRES_PUBLIC"));
        return;
      }
      copyToClipboard(url)
        .then(() => notifySuccessText(t("assets:ASSET_LINK_COPIED")))
        .catch(() => notifyErrorText(t("assets:ASSET_COPY_LINK_FAILED")));
      return;
    }
    if (key === "open_new_tab") {
      if (!publicAbsoluteUrl) return;
      window.open(publicAbsoluteUrl, "_blank", "noopener,noreferrer");
      return;
    }
    if (key === "edit_access") {
      setEditAccessOpen(true);
      return;
    }
    if (key === "delete") {
      setDeleteOpen(true);
    }
  };
  return (
    <Sheet
      open={Boolean(active)}
      onOpenChange={(isOpen: boolean) => {
        if (!isOpen) props.onClose();
      }}
    >
      <SheetContent
        side="right"
        showCloseButton={false}
        className={cn(
          // Width: default sheet is 350px; asset detail usually needs more space.
          "w-full sm:w-105 md:w-120",
          "p-0 gap-0 overflow-hidden",
        )}
      >
        {active ? (
          <>
            <SheetHeader className="border-b border-border/60 pb-4">
              <div className="flex items-start gap-3">
                <Avatar
                  size={40}
                  style={{
                    flexShrink: 0,
                  }}
                >
                  {initialsFromName(uploaderName)}
                </Avatar>
                <div className="min-w-0 flex-1">
                  <SheetTitle className="truncate" title={active.name}>
                    {active.name}
                  </SheetTitle>
                  <SheetDescription
                    className="mt-1 text-footnote truncate"
                    title={uploaderAndTimeText}
                  >
                    {uploaderAndTimeText}
                  </SheetDescription>
                </div>
                <div className="shrink-0 flex items-center gap-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="text"
                        icon={<EllipsisVertical size={18} />}
                        style={{ width: 36, height: 36, paddingInline: 0 }}
                        autoInsertSpace={false}
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {moreMenuItems.map((item, idx) => {
                        if (item.type === "separator") {
                          return <DropdownMenuSeparator key={`sep:${idx}`} />;
                        }
                        return (
                          <DropdownMenuIconItem
                            key={item.key}
                            icon={item.icon}
                            disabled={item.disabled}
                            variant={item.variant === "destructive" ? "destructive" : "default"}
                            onSelect={() => handleMoreAction(item.key)}
                          >
                            {item.label}
                          </DropdownMenuIconItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </SheetHeader>
            <UpdateAssetsAccessDialog
              open={editAccessOpen}
              onOpenChange={setEditAccessOpen}
              mode="single"
              currentVisibility={displayVisibility}
              currentPurpose={displayPurpose}
              currentIndexable={Boolean(active?.indexable)}
              confirmLoading={patchAccessMutation.isPending}
              onConfirm={async (value) => {
                await patchAccessMutation.mutateAsync(value);
              }}
            />
            <div className="flex-1 overflow-auto">
              <div className="p-4">
                <div className="relative mx-auto overflow-hidden rounded-lg border border-border/60 bg-black/2">
                  <div
                    className="relative w-full"
                    style={{
                      // Keep preview reasonably sized but preserve aspect ratio.
                      aspectRatio: previewAspectRatio
                        ? getSafeAspectRatio(previewAspectRatio)
                        : activeAspectRatio,
                    }}
                  >
                    {previewSrc ? (
                      <LazyAssetImage
                        eager
                        src={previewSrc}
                        alt={active.name}
                        fit="contain"
                        showErrorOverlay
                        errorText={t("assets:ASSET_PREVIEW_LOAD_FAILED")}
                        retryText={t("common:RETRY")}
                        onLoaded={(info) => {
                          setPreviewAspectRatio(info.aspectRatio);
                        }}
                        onError={() => {
                          if (!previewSrc) return;
                          failedPreviewRef.current.add(previewSrc);
                          const next = previewCandidates.find(
                            (u) => !failedPreviewRef.current.has(u),
                          );
                          if (next && next !== previewSrc) {
                            setPreviewSrc(next);
                          } else {
                            notifyErrorText(t("assets:ASSET_PREVIEW_LOAD_FAILED"));
                          }
                        }}
                      />
                    ) : (
                      <div className="absolute inset-0 grid place-items-center bg-muted/20">
                        <div className="text-footnote text-label-secondary">
                          {t("assets:ASSET_PREVIEW_UNAVAILABLE")}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-5 rounded-lg">
                  <Accordion
                    type="multiple"
                    defaultValue={["meta"]}
                    className="border-t border-border/60"
                  >
                    <AccordionItem value="meta">
                      <AccordionTrigger className="py-3">
                        {t("assets:ASSET_META_TITLE")}
                      </AccordionTrigger>
                      <AccordionContent className="px-2">
                        <Descriptions
                          size="small"
                          layout="vertical"
                          column={2}
                          items={[
                            {
                              key: "mime",
                              label: t("assets:ASSET_META_MIME"),
                              children: (
                                <AssetMimeTag
                                  title={active.mimeType || undefined}
                                  label={getMimeLabel(active.mimeType, t)}
                                />
                              ),
                            },
                            {
                              key: "size",
                              label: t("assets:ASSET_META_SIZE"),
                              children: active.sizeText || "-",
                            },
                            {
                              key: "createdAt",
                              label: t("assets:ASSET_META_CREATED_AT"),
                              children: formatCreatedAt(
                                active.createdAt,
                                active.createdAtText,
                                dateTime,
                              ),
                            },
                            {
                              key: "visibility",
                              label: t("assets:ASSET_META_VISIBILITY"),
                              children: (
                                <AssetVisibilityTag
                                  visibility={displayVisibility}
                                  label={getVisibilityLabel(displayVisibility, t)}
                                />
                              ),
                            },
                          ]}
                        />
                        <div className="mt-4">
                          <div className="mb-2 grid gap-1.5">
                            <div className="font-semibold text-foreground">
                              {t("assets:ASSET_META_DESCRIPTION")}
                            </div>
                          </div>
                          <textarea
                            className={cn(
                              "w-full resize-none rounded-md border border-border/60 bg-background/60 px-3 py-2",
                              "text-callout text-foreground outline-none",
                              "focus-visible:ring-2 focus-visible:ring-ring",
                            )}
                            rows={4}
                            placeholder={t("assets:ASSET_META_DESCRIPTION_PLACEHOLDER")}
                            value={descriptionDraft}
                            onChange={(e) => {
                              dirtyRef.current.description = true;
                              setDescriptionDraft(e.target.value);
                            }}
                          />
                        </div>
                        <div className="mt-5">
                          <div className="mb-2 grid gap-1.5">
                            <div className="font-semibold text-foreground">
                              {t("assets:ASSET_TAG_FIELD_TITLE")}
                            </div>
                          </div>
                          <Flex gap="small" align="center" wrap>
                            {selectedTags.map((tag, index) => {
                              if (editInputIndex === index) {
                                return (
                                  <Input
                                    ref={editInputRef}
                                    key={`${tag.id}:edit`}
                                    size="small"
                                    style={tagInputStyle}
                                    value={editInputValue}
                                    onChange={(e) => setEditInputValue(e.target.value)}
                                    onBlur={confirmEditTag}
                                    onPressEnter={confirmEditTag}
                                  />
                                );
                              }
                              const isLongTag = tag.name.length > 20;
                              const tagElem = (
                                <AssetUserTagChip
                                  key={tag.id}
                                  label={tag.name}
                                  closable={true}
                                  style={{ userSelect: "none" }}
                                  onClose={(e) => {
                                    e.preventDefault();
                                    removeTag(tag.id);
                                  }}
                                >
                                  <span
                                    onDoubleClick={(e) => {
                                      setEditInputIndex(index);
                                      setEditInputValue(tag.name);
                                      e.preventDefault();
                                    }}
                                  >
                                    {isLongTag ? `${tag.name.slice(0, 20)}...` : tag.name}
                                  </span>
                                </AssetUserTagChip>
                              );
                              return isLongTag ? (
                                <Tooltip title={tag.name} key={tag.id}>
                                  {tagElem}
                                </Tooltip>
                              ) : (
                                tagElem
                              );
                            })}
                            {inputVisible ? (
                              <Input
                                ref={inputRef}
                                type="text"
                                size="small"
                                style={tagInputStyle}
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onBlur={confirmAddTag}
                                onPressEnter={confirmAddTag}
                              />
                            ) : (
                              <AssetAddTagActionTag
                                label={
                                  <span className="inline-flex items-center gap-1 whitespace-nowrap">
                                    <Plus size={14} />
                                    <span>{t("assets:ASSET_TAG_NEW")}</span>
                                  </span>
                                }
                                style={{
                                  height: 22,
                                  background: token.colorBgContainer,
                                  cursor: "pointer",
                                }}
                                onClick={() => setInputVisible(true)}
                              />
                            )}
                          </Flex>
                          {saveState !== "idle" ? (
                            <div className="mt-1 text-caption text-label-secondary">
                              {saveState === "saving"
                                ? t("assets:ASSET_SAVE_SAVING")
                                : saveState === "saved"
                                  ? t("assets:ASSET_SAVE_SAVED")
                                  : saveState === "error"
                                    ? t("assets:ASSET_SAVE_FAILED")
                                    : null}
                            </div>
                          ) : null}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="links">
                      <AccordionTrigger className="py-3">
                        {t("assets:ASSET_LINKS_TITLE")}
                      </AccordionTrigger>
                      <AccordionContent className="px-2">
                        {linkSnippets ? (
                          <>
                            <div className="mb-2 text-label-secondary">
                              {t("assets:ASSET_LINKS_DESC")}
                            </div>
                            <div className="rounded-md border border-border/60 overflow-hidden">
                              {(
                                [
                                  {
                                    key: "url",
                                    label: t("assets:ASSET_LINKS_FORMAT_URL"),
                                    value: linkSnippets.url,
                                  },
                                  {
                                    key: "html",
                                    label: t("assets:ASSET_LINKS_FORMAT_HTML"),
                                    value: linkSnippets.html,
                                  },
                                  {
                                    key: "md",
                                    label: t("assets:ASSET_LINKS_FORMAT_MARKDOWN"),
                                    value: linkSnippets.markdown,
                                  },
                                ] as const
                              ).map((row, idx, arr) => (
                                <SettingActionItem
                                  key={row.key}
                                  title={row.label}
                                  titleColumnWidth={110}
                                  titleClassName="text-footnote"
                                  showChevron={false}
                                  summary={row.value}
                                  summaryClassName="text-caption font-mono font-normal break-all line-clamp-2"
                                  className={cn(
                                    idx !== arr.length - 1
                                      ? "border-b border-border/60"
                                      : undefined,
                                  )}
                                  onTrigger={() => {
                                    copyToClipboard(row.value)
                                      .then(() => notifySuccessText(t("assets:ASSET_LINK_COPIED")))
                                      .catch(() =>
                                        notifyErrorText(t("assets:ASSET_COPY_LINK_FAILED")),
                                      );
                                  }}
                                />
                              ))}
                            </div>
                          </>
                        ) : (
                          <div className="text-footnote text-label-secondary">
                            {t("assets:ASSET_LINKS_REQUIRES_PUBLIC")}
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="advanced">
                      <AccordionTrigger className="py-3">
                        {t("assets:ASSET_META_ADVANCED_TITLE")}
                      </AccordionTrigger>
                      <AccordionContent className="px-2">
                        <Descriptions
                          size="small"
                          layout="vertical"
                          column={2}
                          items={[
                            {
                              key: "purpose",
                              label: t("assets:ASSET_META_PURPOSE"),
                              children: (
                                <AssetPurposeTag
                                  purpose={displayPurpose}
                                  label={getPurposeLabel(displayPurpose, t)}
                                />
                              ),
                            },
                            {
                              key: "indexable",
                              label: t("assets:ASSET_META_INDEXABLE"),
                              children: (
                                <AssetIndexableTag
                                  indexable={active.indexable}
                                  label={getIndexableLabel(active.indexable, t)}
                                />
                              ),
                            },
                            {
                              key: "id",
                              label: t("assets:ASSET_META_ID"),
                              children: (
                                <span className="font-mono text-caption break-all">
                                  {active.id}
                                </span>
                              ),
                            },
                            {
                              key: "sha256",
                              label: t("assets:ASSET_META_SHA256"),
                              children: (
                                <span className="font-mono text-caption break-all">
                                  {active.checksumSha256 || "-"}
                                </span>
                              ),
                            },
                          ]}
                        />
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </SheetContent>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("assets:ASSET_DELETE_CONFIRM_TITLE")}</AlertDialogTitle>
            <AlertDialogDescription>{t("assets:ASSET_DELETE_CONFIRM_DESC")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancelPrimitive asChild>
              <Button type="text" disabled={deleteMutation.isPending} autoInsertSpace={false}>
                {t("assets:ASSET_DELETE_CANCEL")}
              </Button>
            </AlertDialogCancelPrimitive>
            <AlertDialogActionPrimitive asChild>
              <Button
                type="primary"
                danger
                loading={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate()}
                autoInsertSpace={false}
              >
                {deleteMutation.isPending
                  ? t("assets:ASSET_DELETE_DELETING")
                  : t("assets:ASSET_DELETE_CONFIRM")}
              </Button>
            </AlertDialogActionPrimitive>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { WorkspaceAvatar } from "@/components/common/entity-avatar";
import { useImageFallback } from "@/components/common/use-image-fallback";
import { WORKSPACE_ICON_GLYPH_IDS } from "@/components/common/workspace-icon-glyphs";
import { uploadSingleAssetFromFile } from "@/lib/assets/scoped-uploads";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { Button } from "@arclayer/ui/button";
import { ColorPicker } from "@arclayer/ui/color-picker";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@arclayer/ui/tooltip";

import type { WorkspaceIconDialogValues } from "../hooks/use-workspace-menu-actions";
import type { UserCenterWorkspacesTranslateFn, UserCenterWorkspaceListItem } from "../types";

const WORKSPACE_ICON_COLOR_PRESETS = [
  "#111827",
  "#475569",
  "#78716c",
  "#b45309",
  "#d97706",
  "#ca8a04",
  "#65a30d",
  "#16a34a",
  "#059669",
  "#0f766e",
  "#0891b2",
  "#2563eb",
  "#4f46e5",
  "#7c3aed",
  "#9333ea",
  "#c026d3",
  "#db2777",
  "#dc2626",
] as const;

const WORKSPACE_ICON_EMOJIS = [
  "🚀",
  "⚡️",
  "🧠",
  "💬",
  "🛠️",
  "👑",
  "💎",
  "💼",
  "🏁",
  "🔥",
  "📁",
  "🌍",
  "❤️",
  "🏠",
  "👤",
  "✅",
  "☀️",
  "🧩",
  "🌱",
] as const;

type WorkspaceIconDialogProps = {
  t: UserCenterWorkspacesTranslateFn;
  dialog: {
    workspace: UserCenterWorkspaceListItem | null;
    setWorkspace: Dispatch<SetStateAction<UserCenterWorkspaceListItem | null>>;
    values: WorkspaceIconDialogValues;
    setValues: Dispatch<SetStateAction<WorkspaceIconDialogValues>>;
    pending: boolean;
    onConfirm: () => Promise<void>;
    onClose: () => void;
  };
};

type IconGalleryTile = {
  key: string;
  label: string;
  iconMode: "initials" | "glyph" | "emoji";
  iconGlyph: string | null;
  iconEmoji: string | null;
};

function resolveNonImagePreviewMode(
  values: WorkspaceIconDialogValues,
): "initials" | "glyph" | "emoji" {
  if (values.iconMode === "glyph" && values.iconGlyph) return "glyph";
  if (values.iconMode === "emoji" && values.iconEmoji) return "emoji";
  if (values.iconGlyph) return "glyph";
  if (values.iconEmoji) return "emoji";
  return "initials";
}

function normalizeHexColor(value?: string | null) {
  if (!value) return null;

  const normalized = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(normalized)) return normalized;
  if (!/^#[0-9a-f]{3}$/.test(normalized)) return null;

  return `#${normalized
    .slice(1)
    .split("")
    .map((char) => `${char}${char}`)
    .join("")}`;
}

function WorkspaceIconTile(props: {
  selected: boolean;
  ariaLabel: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={props.ariaLabel}
      aria-pressed={props.selected}
      onClick={props.onClick}
      className={[
        "flex size-14 cursor-pointer items-center justify-center rounded-md p-1.5 outline-none transition-colors",
        props.selected
          ? "bg-accent/35 shadow-[0_0_0_2px_rgba(96,165,250,0.52)]"
          : "hover:bg-accent/20",
      ].join(" ")}
    >
      {props.children}
    </button>
  );
}

function WorkspaceColorSwatch(props: {
  color: string;
  selected: boolean;
  ariaLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={props.ariaLabel}
      aria-pressed={props.selected}
      onClick={props.onClick}
      className={[
        "flex size-8 items-center justify-center rounded-full border transition-transform hover:scale-105",
        props.selected ? "border-primary" : "border-border/70",
      ].join(" ")}
      style={{ backgroundColor: props.color }}
    />
  );
}

export function WorkspaceIconDialog(props: WorkspaceIconDialogProps) {
  const { t, dialog } = props;
  const { t: tGlobal } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryViewportRef = useRef<HTMLDivElement>(null);
  const [iconPage, setIconPage] = useState<0 | 1>(0);
  const [isUploading, setIsUploading] = useState(false);
  const previewMode =
    dialog.values.iconMode === "image" && dialog.values.iconUrl
      ? "image"
      : resolveNonImagePreviewMode(dialog.values);
  const previewImageSrc = previewMode === "image" ? dialog.values.iconUrl : undefined;
  const { canRenderImage: canRenderPreviewImage, markImageFailed: markPreviewImageFailed } =
    useImageFallback(previewImageSrc);

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const clearUploadedImage = () => {
    dialog.setValues((prev) => ({
      ...prev,
      iconUrl: null,
      iconMode: prev.iconMode === "image" ? resolveNonImagePreviewMode(prev) : prev.iconMode,
    }));
  };

  const handleImageUpload = (file: File | null) => {
    if (!file || !dialog.workspace) return;
    if (!file.type?.startsWith("image/")) {
      notifyError(new Error(tGlobal("assets:ASSET_UPLOAD_IMAGE_ONLY_REQUIRED")));
      return;
    }

    setIsUploading(true);
    uploadSingleAssetFromFile({
      scope: { type: "workspace", id: dialog.workspace.workspaceId },
      purpose: "workspace_icon",
      file,
      t: tGlobal,
    })
      .then((assetId) => {
        dialog.setValues((prev) => ({
          ...prev,
          iconMode: "image",
          iconUrl: `/assets/${assetId}`,
        }));
        notifySuccessText(tGlobal("assets:ASSET_UPLOAD_SUCCESS"));
      })
      .catch((error) => notifyError(error))
      .finally(() => setIsUploading(false));
  };

  useEffect(() => {
    if (!dialog.workspace) return;

    setIconPage(0);
    window.requestAnimationFrame(() => {
      const element = galleryViewportRef.current;
      if (!element) return;
      if (typeof element.scrollTo === "function") {
        element.scrollTo({ left: 0 });
        return;
      }
      element.scrollLeft = 0;
    });
  }, [dialog.workspace]);

  const normalizedColor = normalizeHexColor(dialog.values.iconColor) ?? "#337ea9";
  const canSave =
    !dialog.pending &&
    !isUploading &&
    Boolean(
      normalizedColor &&
      (dialog.values.iconMode !== "glyph" || dialog.values.iconGlyph) &&
      (dialog.values.iconMode !== "emoji" || dialog.values.iconEmoji) &&
      (dialog.values.iconMode !== "image" || dialog.values.iconUrl),
    );

  const iconPages = useMemo<[IconGalleryTile[], IconGalleryTile[]]>(
    () => [
      [
        {
          key: "initials",
          label: t("common:ORG_WORKSPACES_ICON_INITIALS"),
          iconMode: "initials",
          iconGlyph: null,
          iconEmoji: null,
        },
        ...WORKSPACE_ICON_GLYPH_IDS.map((glyph) => ({
          key: glyph,
          label: glyph,
          iconMode: "glyph" as const,
          iconGlyph: glyph,
          iconEmoji: null,
        })),
      ],
      WORKSPACE_ICON_EMOJIS.map((emoji, index) => ({
        key: `emoji-${index}`,
        label: emoji,
        iconMode: "emoji" as const,
        iconGlyph: null,
        iconEmoji: emoji,
      })),
    ],
    [t],
  );

  const scrollToPage = (pageIndex: 0 | 1) => {
    const element = galleryViewportRef.current;
    if (!element) return;
    const left = element.clientWidth * pageIndex;
    if (typeof element.scrollTo === "function") {
      element.scrollTo({
        left,
        behavior: "smooth",
      });
      return;
    }
    element.scrollLeft = left;
  };

  return (
    <SettingDialog
      open={Boolean(dialog.workspace)}
      onOpenChange={(open) => {
        if (!open && !dialog.pending && !isUploading) {
          dialog.onClose();
        }
      }}
      title={t("common:ORG_WORKSPACES_ACTION_CHANGE_ICON")}
      description={t("common:ORG_WORKSPACES_ICON_DIALOG_DESC", {
        name: dialog.workspace?.name || "",
      })}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button
            variant="outline"
            disabled={dialog.pending || isUploading}
            onClick={() => dialog.onClose()}
          >
            {t("common:CANCEL")}
          </Button>
          <Button
            variant="default"
            loading={dialog.pending}
            disabled={!canSave}
            onClick={async () => {
              await dialog.onConfirm();
            }}
          >
            {t("common:CONFIRM")}
          </Button>
        </div>
      }
    >
      <SettingDialogFields>
        <SettingDialogField title={t("common:ORG_WORKSPACES_ICON_UPLOAD_TITLE")}>
          <TooltipProvider>
            <div className="flex min-w-0">
              <div className="relative">
                <Tooltip>
                  <TooltipTrigger asChild focusTrigger={false}>
                    <button
                      type="button"
                      aria-label={
                        dialog.values.iconUrl
                          ? t("common:ORG_WORKSPACES_ICON_REPLACE_PHOTO_TOOLTIP")
                          : t("common:ORG_WORKSPACES_ICON_UPLOAD_PHOTO_TOOLTIP")
                      }
                      disabled={dialog.pending || isUploading}
                      onClick={() => {
                        if (dialog.values.iconUrl) {
                          dialog.setValues((prev) => ({
                            ...prev,
                            iconMode: "image",
                          }));
                        }
                        openFilePicker();
                      }}
                      className={[
                        "group/image-slot relative flex size-24 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-border/70 bg-muted transition-colors",
                        dialog.values.iconUrl ? "hover:border-border/80" : "hover:bg-accent/55",
                        dialog.pending || isUploading ? "pointer-events-none opacity-70" : "",
                      ].join(" ")}
                    >
                      {previewMode === "image" && previewImageSrc && canRenderPreviewImage ? (
                        <>
                          <img
                            src={previewImageSrc}
                            alt={
                              dialog.workspace?.name || t("common:ORG_WORKSPACES_ICON_UPLOAD_TITLE")
                            }
                            className="size-full object-cover"
                            onError={markPreviewImageFailed}
                          />
                          <span className="pointer-events-none absolute inset-0 bg-black/0 transition-colors group-hover/image-slot:bg-black/10" />
                        </>
                      ) : (
                        <WorkspaceAvatar
                          name={dialog.workspace?.name}
                          size={96}
                          iconMode={previewMode}
                          iconColor={normalizedColor}
                          iconGlyph={dialog.values.iconGlyph}
                          iconEmoji={dialog.values.iconEmoji}
                          className={
                            previewMode === "emoji" ? "rounded-full text-[2.2rem]" : "rounded-full"
                          }
                        />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {dialog.values.iconUrl
                      ? t("common:ORG_WORKSPACES_ICON_REPLACE_PHOTO_TOOLTIP")
                      : t("common:ORG_WORKSPACES_ICON_UPLOAD_PHOTO_TOOLTIP")}
                  </TooltipContent>
                </Tooltip>

                {dialog.values.iconUrl ? (
                  <button
                    type="button"
                    aria-label={t("common:ORG_WORKSPACES_ICON_REMOVE_PHOTO_LABEL")}
                    disabled={dialog.pending || isUploading}
                    onClick={(event) => {
                      event.stopPropagation();
                      clearUploadedImage();
                    }}
                    className="absolute -right-1 -top-1 inline-flex size-7 cursor-pointer items-center justify-center rounded-full border border-border/70 bg-background text-label-secondary shadow-sm transition-colors hover:bg-accent hover:text-label-primary"
                  >
                    <X className="size-4" />
                  </button>
                ) : null}
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                event.target.value = "";
                handleImageUpload(file);
              }}
            />
          </TooltipProvider>
        </SettingDialogField>

        <SettingDialogField title={t("common:ORG_WORKSPACES_ICON_GALLERY_TITLE")}>
          <div className="flex flex-col gap-4">
            <div
              ref={galleryViewportRef}
              className="flex snap-x snap-mandatory gap-5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              onScroll={(event) => {
                const element = event.currentTarget;
                const nextPage = Math.round(element.scrollLeft / Math.max(element.clientWidth, 1));
                setIconPage(nextPage === 0 ? 0 : 1);
              }}
            >
              {iconPages.map((page, pageIndex) => (
                <div
                  key={pageIndex}
                  className="grid min-w-full snap-center grid-cols-5 gap-3 px-1.5 py-1.5"
                  aria-label={t("common:ORG_WORKSPACES_ICON_PAGE_LABEL", {
                    page: pageIndex + 1,
                  })}
                >
                  {page.map((item) => {
                    const selected =
                      dialog.values.iconMode === item.iconMode &&
                      dialog.values.iconGlyph === item.iconGlyph &&
                      dialog.values.iconEmoji === item.iconEmoji;

                    return (
                      <WorkspaceIconTile
                        key={item.key}
                        selected={selected}
                        ariaLabel={item.label}
                        onClick={() =>
                          dialog.setValues((prev) => ({
                            ...prev,
                            iconMode: item.iconMode,
                            iconGlyph: item.iconGlyph,
                            iconEmoji: item.iconEmoji,
                          }))
                        }
                      >
                        <WorkspaceAvatar
                          name={dialog.workspace?.name}
                          size={46}
                          iconMode={item.iconMode}
                          iconColor={normalizedColor}
                          iconGlyph={item.iconGlyph}
                          iconEmoji={item.iconEmoji}
                          className={
                            item.iconMode === "emoji" ? "rounded-md text-[1.45rem]" : "rounded-md"
                          }
                        />
                      </WorkspaceIconTile>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-center gap-2">
              {[0, 1].map((pageIndex) => (
                <button
                  key={pageIndex}
                  type="button"
                  aria-label={t("common:ORG_WORKSPACES_ICON_PAGE_LABEL", {
                    page: pageIndex + 1,
                  })}
                  aria-pressed={iconPage === pageIndex}
                  onClick={() => scrollToPage(pageIndex as 0 | 1)}
                  className={[
                    "h-1.5 w-10 rounded-full transition-colors",
                    iconPage === pageIndex
                      ? "bg-label-primary"
                      : "bg-border hover:bg-label-secondary",
                  ].join(" ")}
                />
              ))}
            </div>
          </div>
        </SettingDialogField>

        <SettingDialogField title={t("common:ORG_WORKSPACES_ICON_COLOR_TITLE")}>
          <div className="flex flex-wrap items-center gap-3">
            <ColorPicker
              color={normalizedColor}
              onChange={(nextColor) =>
                dialog.setValues((prev) => ({
                  ...prev,
                  iconMode:
                    prev.iconMode === "image" ? resolveNonImagePreviewMode(prev) : prev.iconMode,
                  iconColor: nextColor,
                }))
              }
              ariaLabel={t("common:ORG_WORKSPACES_ICON_COLOR_CUSTOM")}
              textInputLabel={t("common:ORG_WORKSPACES_ICON_COLOR_CUSTOM")}
              variant="swatch"
            />
            {WORKSPACE_ICON_COLOR_PRESETS.map((color) => (
              <WorkspaceColorSwatch
                key={color}
                color={color}
                selected={normalizedColor === color}
                ariaLabel={color}
                onClick={() =>
                  dialog.setValues((prev) => ({
                    ...prev,
                    iconMode:
                      prev.iconMode === "image" ? resolveNonImagePreviewMode(prev) : prev.iconMode,
                    iconColor: color,
                  }))
                }
              />
            ))}
          </div>
        </SettingDialogField>
      </SettingDialogFields>
    </SettingDialog>
  );
}

import { useRef, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { cn } from "@arclayer/lib/utils";
import type { JsonValueInput } from "@arclayer/openapi";
import { Button } from "@arclayer/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@arclayer/ui/field";
import { SettingDialog } from "@arclayer/ui/setting-dialog";

import { AvatarUploadSlot } from "@/components/common/avatar-upload-slot";
import { resolvePublicAssetUrlPath } from "@/lib/assets/asset-urls";
import { uploadSingleAssetFromFile } from "@/lib/assets/scoped-uploads";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { SystemSettingRow } from "@/components/settings/setting-item";
import type { GeneralSettingsFormValues, WithSavingKeyFn } from "@/types/settings-general";
import { formatSummaryText, normalizeOptionalString } from "./site-settings-tab-helpers";

type AssetFieldName = "siteLogoAssetId" | "siteFaviconAssetId" | "seoOgImageAssetId";
type UrlFieldName = "siteLogoUrl" | "siteFaviconUrl" | "seoOgImageUrl";
type UploadPurpose = "site_logo" | "favicon";

type SiteBrandAssetSettingRowProps = {
  assetField: AssetFieldName;
  currentAssetId: string;
  currentUrl: string;
  description: string;
  disabled: boolean;
  fieldKey: string;
  form: UseFormReturn<GeneralSettingsFormValues>;
  initialAssetId: string;
  initialUrl: string;
  patch: (patch: Record<string, JsonValueInput>) => Promise<void>;
  patchField: "logo" | "favicon" | "og_image";
  patchSection?: "site" | "seo";
  removeAriaLabel: string;
  resetKey: string;
  saveKey: string;
  savingKey: string | null;
  title: string;
  uploadAriaLabel: string;
  uploadPurpose: UploadPurpose;
  withSavingKey: WithSavingKeyFn;
  assetProjectId: string | null;
  urlField: UrlFieldName;
};

function AssetPreview(props: { previewUrl?: string; fallback: string; compact?: boolean }) {
  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-muted/30",
        props.compact ? "size-10" : "size-20",
      )}
    >
      {props.previewUrl ? (
        <img
          src={props.previewUrl}
          alt=""
          width={props.compact ? 40 : 80}
          height={props.compact ? 40 : 80}
          className="size-full object-cover"
        />
      ) : (
        <span className="px-2 text-center text-caption text-label-secondary">{props.fallback}</span>
      )}
    </div>
  );
}

export function SiteBrandAssetSettingRow(props: SiteBrandAssetSettingRowProps) {
  const { t } = useTranslation(["settings", "assets"]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const previewRef = props.currentAssetId
    ? `/assets/${props.currentAssetId}`
    : normalizeOptionalString(props.currentUrl);
  const previewUrl = previewRef ? (resolvePublicAssetUrlPath(previewRef) ?? previewRef) : undefined;
  const isDirty =
    props.currentAssetId !== props.initialAssetId ||
    props.currentUrl.trim() !== props.initialUrl.trim();
  const controlsDisabled = props.disabled || !props.assetProjectId || isUploading;

  const resetFormValue = () => {
    props.form.setValue(props.assetField, props.initialAssetId, {
      shouldDirty: false,
      shouldValidate: true,
    });
    props.form.setValue(props.urlField, props.initialUrl, {
      shouldDirty: false,
      shouldValidate: true,
    });
  };

  const saveAsset = () =>
    props.withSavingKey(props.saveKey, async () => {
      const nextAssetId = normalizeOptionalString(props.form.getValues(props.assetField));
      const nextUrl = nextAssetId
        ? `/assets/${nextAssetId}`
        : normalizeOptionalString(props.form.getValues(props.urlField));

      await props.patch({
        [props.patchSection ?? "site"]: {
          [`${props.patchField}_asset_id`]: nextAssetId,
          [`${props.patchField}_url`]: nextUrl,
        },
      });
      setOpen(false);
    });

  const resetAsset = () =>
    props.withSavingKey(props.resetKey, async () => {
      resetFormValue();
      await props.patch({
        [props.patchSection ?? "site"]: {
          [`${props.patchField}_asset_id`]: normalizeOptionalString(props.initialAssetId),
          [`${props.patchField}_url`]: normalizeOptionalString(props.initialUrl),
        },
      });
      setOpen(false);
    });

  return (
    <>
      <SystemSettingRow
        title={props.title}
        description={props.description}
        control={
          <div className="flex items-center gap-3">
            <AssetPreview
              compact
              previewUrl={previewUrl}
              fallback={t("settings:SETTINGS_NOT_SET")}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={props.disabled || !props.assetProjectId}
              onClick={() => setOpen(true)}
            >
              {t("settings:SETTINGS_EDIT")}
            </Button>
          </div>
        }
      >
        <div className="truncate text-callout text-label-secondary">
          {formatSummaryText(previewRef) || t("settings:SETTINGS_NOT_SET")}
        </div>
      </SystemSettingRow>

      <SettingDialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen && props.savingKey !== props.saveKey) resetFormValue();
        }}
        title={props.title}
        description={props.description}
        footer={
          <>
            {isDirty ? (
              <Button
                type="button"
                variant="outline"
                loading={props.savingKey === props.resetKey}
                disabled={controlsDisabled}
                onClick={() => void resetAsset()}
              >
                {t("settings:SETTINGS_RESET")}
              </Button>
            ) : null}
            <Button
              type="button"
              loading={props.savingKey === props.saveKey}
              disabled={controlsDisabled}
              onClick={() => void saveAsset()}
            >
              {t("settings:SETTINGS_SAVE")}
            </Button>
          </>
        }
      >
        <FieldGroup>
          <Field>
            <FieldLabel>{props.title}</FieldLabel>
            <FieldDescription>{props.description}</FieldDescription>
            <AvatarUploadSlot
              src={previewUrl}
              fallback={
                <span className="text-caption text-label-secondary">
                  {t("settings:SETTINGS_NOT_SET")}
                </span>
              }
              shape="square"
              size={96}
              disabled={controlsDisabled}
              loading={isUploading}
              uploadAriaLabel={props.uploadAriaLabel}
              removeAriaLabel={props.removeAriaLabel}
              canRemove={Boolean(previewRef)}
              onPick={() => fileInputRef.current?.click()}
              onRemove={() => {
                props.form.setValue(props.assetField, "", {
                  shouldDirty: true,
                  shouldValidate: true,
                });
                props.form.setValue(props.urlField, "", {
                  shouldDirty: true,
                  shouldValidate: true,
                });
              }}
            />
            {!props.assetProjectId ? (
              <FieldError>{t("settings:SETTINGS_SITE_ASSET_PROJECT_REQUIRED")}</FieldError>
            ) : null}
          </Field>
        </FieldGroup>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            event.target.value = "";
            if (!file) return;
            if (!file.type?.startsWith("image/")) {
              notifyError(new Error(t("assets:ASSET_UPLOAD_IMAGE_ONLY_REQUIRED")));
              return;
            }
            if (!props.assetProjectId) {
              notifyError(new Error(t("settings:SETTINGS_SITE_ASSET_PROJECT_REQUIRED")));
              return;
            }

            setIsUploading(true);
            uploadSingleAssetFromFile({
              scope: { type: "project", id: props.assetProjectId },
              purpose: props.uploadPurpose,
              file,
              t,
            })
              .then((assetId) => {
                props.form.setValue(props.assetField, assetId, {
                  shouldDirty: true,
                  shouldValidate: true,
                });
                props.form.setValue(props.urlField, `/assets/${assetId}`, {
                  shouldDirty: true,
                  shouldValidate: true,
                });
                notifySuccessText(t("assets:ASSET_UPLOAD_SUCCESS"));
              })
              .catch((error) => notifyError(error))
              .finally(() => setIsUploading(false));
          }}
        />
      </SettingDialog>
    </>
  );
}

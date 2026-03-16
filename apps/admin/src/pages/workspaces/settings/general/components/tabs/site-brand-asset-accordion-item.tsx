import { useRef, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { SettingAccordionItem } from "@celestial/ui/setting-accordion-item";
import { AvatarUploadSlot } from "@/components/common/avatar-upload-slot";
import { resolvePublicAssetUrlPath } from "@/lib/assets/asset-urls";
import { uploadSingleAssetFromFile } from "@/lib/assets/scoped-uploads";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import type { GeneralSettingsFormValues, WithSavingKeyFn } from "@/types/settings-general";
import { formatSummaryText, normalizeOptionalString } from "./site-settings-tab-helpers";

type AssetFieldName = "siteLogoAssetId" | "siteFaviconAssetId";
type UrlFieldName = "siteLogoUrl" | "siteFaviconUrl";
type UploadPurpose = "site_logo" | "favicon";

type SiteBrandAssetAccordionItemProps = {
  assetField: AssetFieldName;
  currentAssetId: string;
  currentUrl: string;
  description: string;
  disabled: boolean;
  fieldKey: string;
  form: UseFormReturn<GeneralSettingsFormValues>;
  initialAssetId: string;
  initialUrl: string;
  patch: (patch: Record<string, unknown>) => Promise<void>;
  patchField: "logo" | "favicon";
  removeAriaLabel: string;
  resetKey: string;
  saveKey: string;
  savingKey: string | null;
  title: string;
  uploadAriaLabel: string;
  uploadPurpose: UploadPurpose;
  withSavingKey: WithSavingKeyFn;
  workspaceId: string | null;
  urlField: UrlFieldName;
};

export function SiteBrandAssetAccordionItem(props: SiteBrandAssetAccordionItemProps) {
  const { t } = useTranslation();
  const { t: tGlobal } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const previewRef = props.currentAssetId
    ? `/assets/${props.currentAssetId}`
    : normalizeOptionalString(props.currentUrl);
  const previewUrl = previewRef ? (resolvePublicAssetUrlPath(previewRef) ?? previewRef) : undefined;
  const isDirty =
    props.currentAssetId !== props.initialAssetId ||
    props.currentUrl.trim() !== props.initialUrl.trim();

  const saveAsset = () =>
    props.withSavingKey(props.saveKey, async () => {
      const nextAssetId = normalizeOptionalString(props.form.getValues(props.assetField));
      const nextUrl = nextAssetId
        ? `/assets/${nextAssetId}`
        : normalizeOptionalString(props.form.getValues(props.urlField));

      await props.patch({
        site: {
          [`${props.patchField}_asset_id`]: nextAssetId,
          [`${props.patchField}_url`]: nextUrl,
        },
      });
    });

  const resetAsset = () =>
    props.withSavingKey(props.resetKey, async () => {
      props.form.setValue(props.assetField, props.initialAssetId, {
        shouldDirty: false,
        shouldValidate: true,
      });
      props.form.setValue(props.urlField, props.initialUrl, {
        shouldDirty: false,
        shouldValidate: true,
      });
      await props.patch({
        site: {
          [`${props.patchField}_asset_id`]: normalizeOptionalString(props.initialAssetId),
          [`${props.patchField}_url`]: normalizeOptionalString(props.initialUrl),
        },
      });
    });

  return (
    <SettingAccordionItem
      value={props.fieldKey}
      variant="action"
      title={props.title}
      description={props.description}
      showSummary
      summary={formatSummaryText(previewRef)}
      placeholder={t("settings:SETTINGS_NOT_SET")}
      keepRendered
      disabled={props.disabled || !props.workspaceId}
      confirmText={t("settings:SETTINGS_SAVE")}
      confirmLoading={props.savingKey === props.saveKey}
      onConfirm={() => void saveAsset()}
      onReset={isDirty ? () => void resetAsset() : undefined}
      resetText={t("settings:SETTINGS_RESET")}
      resetLoading={props.savingKey === props.resetKey}
    >
      <AvatarUploadSlot
        src={previewUrl}
        fallback={
          <span className="text-caption text-label-secondary">
            {t("settings:SETTINGS_NOT_SET")}
          </span>
        }
        shape="square"
        size={80}
        disabled={props.disabled || !props.workspaceId}
        loading={isUploading}
        uploadAriaLabel={props.uploadAriaLabel}
        removeAriaLabel={props.removeAriaLabel}
        canRemove={Boolean(previewRef)}
        onPick={() => fileInputRef.current?.click()}
        onRemove={() => {
          props.form.setValue(props.assetField, "", { shouldDirty: true, shouldValidate: true });
          props.form.setValue(props.urlField, "", { shouldDirty: true, shouldValidate: true });
        }}
      />

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
            notifyError(new Error(tGlobal("assets:ASSET_UPLOAD_IMAGE_ONLY_REQUIRED")));
            return;
          }
          if (!props.workspaceId) {
            notifyError(new Error("WORKSPACE_NOT_SELECTED"));
            return;
          }

          setIsUploading(true);
          uploadSingleAssetFromFile({
            scope: { type: "workspace", id: props.workspaceId },
            purpose: props.uploadPurpose,
            file,
            t: tGlobal,
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
              notifySuccessText(tGlobal("assets:ASSET_UPLOAD_SUCCESS"));
            })
            .catch((error) => notifyError(error))
            .finally(() => setIsUploading(false));
        }}
      />
    </SettingAccordionItem>
  );
}

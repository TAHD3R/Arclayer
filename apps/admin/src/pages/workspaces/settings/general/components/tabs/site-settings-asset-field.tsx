import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@celestial/ui/button";
import { Input } from "@celestial/ui/input";

import { AssetPickerDialog } from "@/pages/workspaces/assets/components/asset-picker-dialog";
import { formatSummaryText, isValidHttpUrlOrAbsolutePath } from "@/lib/settings/general/utils";
import type { GeneralSettingsFormController } from "@/types/settings-general";
import type { AssetScopeRef } from "@/lib/assets/asset-scope";
import { getFieldErrorMessage } from "../form-helpers";

const SETTINGS_IMAGE_FALLBACK_DATA_URI = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="112" height="112" viewBox="0 0 112 112">
    <rect width="112" height="112" rx="16" fill="#F1F5F9"/>
    <rect x="20" y="26" width="72" height="60" rx="10" fill="#E2E8F0"/>
    <path d="M34 72l14-16 11 12 7-8 12 12H34z" fill="#CBD5E1"/>
    <circle cx="44" cy="44" r="6" fill="#CBD5E1"/>
  </svg>`,
)}`;

interface SiteSettingsAssetFieldProps {
  form: GeneralSettingsFormController;
  scope: AssetScopeRef | null;
  assetFieldName: "siteLogoAssetId" | "siteFaviconAssetId";
  urlFieldName: "siteLogoUrl" | "siteFaviconUrl";
  previewUrl?: string;
  assetId?: string;
  url?: string;
  pickerOpen: boolean;
  onPickerOpenChange: (open: boolean) => void;
  uploadPurpose: "site_logo" | "favicon";
  pickerTitle: string;
  pickerDescription: string;
  inputPlaceholder: string;
}

function PreviewImage(props: { src: string }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [props.src]);

  return (
    <img
      src={failed ? SETTINGS_IMAGE_FALLBACK_DATA_URI : props.src}
      alt=""
      className="h-14 w-14 rounded-md border border-border/60 bg-muted/20 object-cover"
      onError={() => setFailed(true)}
    />
  );
}

export function SiteSettingsAssetField({
  form,
  scope,
  assetFieldName,
  urlFieldName,
  previewUrl,
  assetId,
  url,
  pickerOpen,
  onPickerOpenChange,
  uploadPurpose,
  pickerTitle,
  pickerDescription,
  inputPlaceholder,
}: SiteSettingsAssetFieldProps) {
  const { t } = useTranslation();
  const errorMessage = getFieldErrorMessage(form, urlFieldName);
  const urlField = form.register(urlFieldName, {
    validate: (value) => {
      const raw = String(value || "").trim();
      if (assetId) return true;
      if (!raw) return true;
      if (isValidHttpUrlOrAbsolutePath(raw)) return true;
      return t("settings:SETTINGS_VALIDATION_URL_OR_PATH_INVALID");
    },
  });

  return (
    <>
      <input type="hidden" {...form.register(assetFieldName)} />

      <div className="flex items-center gap-3">
        <div className="shrink-0">
          {previewUrl ? (
            <PreviewImage src={previewUrl} />
          ) : (
            <div className="grid h-14 w-14 place-items-center rounded-md border border-border/60 bg-muted/20 text-caption text-label-secondary">
              {t("settings:SETTINGS_NOT_SET")}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-footnote font-medium">
            {t("settings:SETTINGS_ASSET_PICKER_CURRENT")}
          </div>
          <div className="mt-1 truncate text-caption text-label-secondary">
            {assetId ? `/assets/${assetId}` : formatSummaryText(url)}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={!assetId && !url}
            onClick={() => {
              form.setValue(assetFieldName, "", { shouldDirty: true, shouldValidate: true });
              form.setValue(urlFieldName, "", { shouldDirty: true, shouldValidate: true });
            }}
          >
            {t("settings:SETTINGS_ASSET_PICKER_CLEAR")}
          </Button>
          <Button type="button" disabled={!scope} onClick={() => onPickerOpenChange(true)}>
            {t("settings:SETTINGS_ASSET_PICKER_SELECT")}
          </Button>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <Input
          {...urlField}
          placeholder={inputPlaceholder}
          aria-invalid={errorMessage ? true : undefined}
        />
        {errorMessage ? <div className="text-footnote text-destructive">{errorMessage}</div> : null}
      </div>

      {scope ? (
        <AssetPickerDialog
          open={pickerOpen}
          onOpenChange={onPickerOpenChange}
          scope={scope}
          mode="single"
          value={{ assetIds: assetId ? [assetId] : [] }}
          uploadPurpose={uploadPurpose}
          title={pickerTitle}
          description={pickerDescription}
          onConfirm={({ assetIds }) => {
            const selectedAssetId = assetIds[0];
            if (!selectedAssetId) return;
            form.setValue(assetFieldName, selectedAssetId, {
              shouldDirty: true,
              shouldValidate: true,
            });
            form.setValue(urlFieldName, `/assets/${selectedAssetId}`, {
              shouldDirty: true,
              shouldValidate: true,
            });
          }}
        />
      ) : null}
    </>
  );
}

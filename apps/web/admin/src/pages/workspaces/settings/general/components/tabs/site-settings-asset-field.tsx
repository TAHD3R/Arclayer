import { Button, Form, Image, Input } from "antd";
import type { FormInstance } from "antd";
import { useTranslation } from "react-i18next";

import { AssetPickerDialog } from "@/pages/workspaces/assets/components/asset-picker-dialog";
import { formatSummaryText, isValidHttpUrlOrAbsolutePath } from "@/lib/settings/general/utils";
import type { GeneralSettingsFormValues } from "@/types/settings-general";

const SETTINGS_IMAGE_FALLBACK_DATA_URI = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="112" height="112" viewBox="0 0 112 112">
    <rect width="112" height="112" rx="16" fill="#F1F5F9"/>
    <rect x="20" y="26" width="72" height="60" rx="10" fill="#E2E8F0"/>
    <path d="M34 72l14-16 11 12 7-8 12 12H34z" fill="#CBD5E1"/>
    <circle cx="44" cy="44" r="6" fill="#CBD5E1"/>
  </svg>`,
)}`;

interface SiteSettingsAssetFieldProps {
  form: FormInstance<GeneralSettingsFormValues>;
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

export function SiteSettingsAssetField({
  form,
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

  return (
    <>
      <Form.Item<GeneralSettingsFormValues> name={assetFieldName} hidden>
        <Input />
      </Form.Item>

      <div className="flex items-center gap-3">
        <div className="shrink-0">
          {previewUrl ? (
            <Image
              width={56}
              height={56}
              src={previewUrl}
              fallback={SETTINGS_IMAGE_FALLBACK_DATA_URI}
              preview={false}
              className="rounded-md border border-border/60 bg-muted/20"
            />
          ) : (
            <div className="h-14 w-14 rounded-md border border-border/60 bg-muted/20 grid place-items-center text-caption text-label-secondary">
              {t("settings:SETTINGS_NOT_SET")}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-footnote font-medium">
            {t("settings:SETTINGS_ASSET_PICKER_CURRENT")}
          </div>
          <div className="mt-1 text-caption text-label-secondary truncate">
            {assetId ? `/assets/${assetId}` : formatSummaryText(url)}
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <Button
            type="text"
            danger
            disabled={!assetId && !url}
            onClick={() => {
              form.setFieldValue(assetFieldName, "");
              form.setFieldValue(urlFieldName, "");
            }}
          >
            {t("settings:SETTINGS_ASSET_PICKER_CLEAR")}
          </Button>
          <Button type="primary" onClick={() => onPickerOpenChange(true)}>
            {t("settings:SETTINGS_ASSET_PICKER_SELECT")}
          </Button>
        </div>
      </div>

      <Form.Item<GeneralSettingsFormValues>
        name={urlFieldName}
        rules={[
          {
            validator: async (_rule, value: string | undefined) => {
              const raw = (value || "").trim();
              if (assetId) return;
              if (!raw) return;
              if (isValidHttpUrlOrAbsolutePath(raw)) return;
              throw new Error(t("settings:SETTINGS_VALIDATION_URL_OR_PATH_INVALID"));
            },
          },
        ]}
        style={{ marginBottom: 0, marginTop: 12 }}
      >
        <Input size="large" placeholder={inputPlaceholder} allowClear />
      </Form.Item>

      <AssetPickerDialog
        open={pickerOpen}
        onOpenChange={onPickerOpenChange}
        mode="single"
        value={{ assetIds: assetId ? [assetId] : [] }}
        uploadPurpose={uploadPurpose}
        title={pickerTitle}
        description={pickerDescription}
        onConfirm={({ assetIds }) => {
          const selectedAssetId = assetIds[0];
          if (!selectedAssetId) return;
          form.setFieldValue(assetFieldName, selectedAssetId);
          form.setFieldValue(urlFieldName, `/assets/${selectedAssetId}`);
        }}
      />
    </>
  );
}
